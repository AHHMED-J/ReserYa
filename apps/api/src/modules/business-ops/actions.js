// Cambios de estado de una reserva que hace el negocio o las tareas periódicas
// (ver "Flujo de una reserva" en el brief): aceptar, rechazar, vencer, completar, no asistió
// y cancelación del dueño. Todo el dinero pasa por lib/payments.js.
import { and, eq, gt, inArray, isNotNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { bookings, payments } from '../../db/schema.js';
import { capture, release, refund } from '../../lib/payments.js';
import { enqueueCalendarSync } from '../../lib/calendarSync.js';
import { conflict, notFound } from '../../lib/errors.js';
import { now, nowDate } from '../../lib/time.js';
import { emailClient } from './emails.js';

/** Solicitud visible para el negocio (contrato): pendiente y con el pago ya autorizado. */
export const isRequest = () => and(eq(bookings.status, 'pending'), isNotNull(bookings.submittedAt));

/** Libera la autorización de una reserva sin cobrar. No lanza error: un fallo de Stripe solo se registra. */
async function releasePayment(bookingId) {
  const [p] = await db.select().from(payments).where(eq(payments.bookingId, bookingId));
  if (!p || !['pending', 'authorized'].includes(p.status)) return;
  try {
    await release(p.stripePaymentIntentId);
  } catch (e) {
    console.error('No se pudo liberar el pago', p.stripePaymentIntentId, e.message);
    return;
  }
  await db
    .update(payments)
    .set({ status: 'released', releasedAt: nowDate() })
    .where(and(eq(payments.id, p.id), inArray(payments.status, ['pending', 'authorized'])));
}

/**
 * Cierra una solicitud sin aceptarla (rechazada o vencida): cambia el estado solo si sigue
 * pendiente (así es seguro llamarla dos veces), libera el pago y avisa al cliente.
 * @returns {Promise<object|null>} la reserva actualizada o null si ya no estaba pendiente
 */
async function closeRequest(bookingId, status, template) {
  const [b] = await db
    .update(bookings)
    .set({ status, decidedAt: nowDate() })
    .where(and(eq(bookings.id, bookingId), isRequest()))
    .returning();
  if (!b) return null;
  await releasePayment(b.id);
  await emailClient(template, b.id);
  return b;
}

async function findOwned(businessId, bookingId) {
  const [b] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.businessId, businessId)));
  if (!b) throw notFound('No encontramos esa reserva');
  return b;
}

/**
 * Acepta una solicitud (RF-29). En una transacción: bloquea la fila, la confirma (la restricción
 * de exclusión impide encimarla con otra confirmada; Postgres responde 23P01 → 409 slot_taken),
 * encola el evento de Google y cobra al final. Si el cobro falla, todo se revierte; si el cobro
 * pasó pero la transacción no se pudo guardar, se reembolsa.
 * Después rechaza las solicitudes del mismo recurso que se enciman y avisa a todos.
 */
export async function acceptRequest(businessId, bookingId) {
  let capturedIntent = null;
  let booking;
  try {
    booking = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ b: bookings, p: payments })
        .from(bookings)
        .innerJoin(payments, eq(payments.bookingId, bookings.id))
        .where(and(eq(bookings.id, bookingId), eq(bookings.businessId, businessId)))
        .for('update');
      if (!row) throw notFound('No encontramos esa solicitud');
      const { b, p } = row;
      if (b.status !== 'pending' || !b.submittedAt) {
        throw conflict('not_pending', 'Esta solicitud ya no está pendiente');
      }
      const t = nowDate();
      if ((b.respondBy && b.respondBy <= t) || b.startsAt <= t) {
        throw conflict('request_expired', 'Esta solicitud ya venció');
      }
      if (p.status !== 'authorized') {
        throw conflict('payment_not_authorized', 'El pago de esta solicitud no está autorizado');
      }
      const [updated] = await tx
        .update(bookings)
        .set({ status: 'confirmed', decidedAt: t })
        .where(eq(bookings.id, b.id))
        .returning();
      await tx
        .update(payments)
        .set({ status: 'captured', capturedAt: t })
        .where(eq(payments.id, p.id));
      await enqueueCalendarSync(b.id, 'create', tx);
      // El cobro va al final: si falla, la transacción se revierte y no queda nada cobrado.
      await capture(p.stripePaymentIntentId);
      capturedIntent = p.stripePaymentIntentId;
      return updated;
    });
  } catch (e) {
    if (capturedIntent) {
      await refund(capturedIntent).catch((err) =>
        console.error('No se pudo reembolsar tras fallar la aceptación', err.message),
      );
    }
    throw e;
  }

  const overlapping = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        isRequest(),
        ne(bookings.id, booking.id),
        eq(bookings.resourceId, booking.resourceId),
        lt(bookings.startsAt, booking.endsAt),
        gt(bookings.endsAt, booking.startsAt),
      ),
    );
  const rejected = [];
  for (const o of overlapping) {
    if (await closeRequest(o.id, 'rejected', 'request_rejected')) rejected.push(o.id);
  }
  await emailClient('request_accepted', booking.id);
  return { booking, rejected };
}

/** Rechaza una solicitud (RF-30). */
export async function rejectRequest(businessId, bookingId) {
  await findOwned(businessId, bookingId);
  const b = await closeRequest(bookingId, 'rejected', 'request_rejected');
  if (!b) throw conflict('not_pending', 'Esta solicitud ya no está pendiente');
  return b;
}

/** Marca "no asistió" (RF-37): confirmada o completada cuya hora ya empezó. Lo cobrado no se reembolsa. */
export async function markNoShow(businessId, bookingId) {
  const existing = await findOwned(businessId, bookingId);
  const t = nowDate();
  const [b] = await db
    .update(bookings)
    .set({ status: 'no_show', completedAt: existing.completedAt ?? t })
    .where(
      and(
        eq(bookings.id, bookingId),
        inArray(bookings.status, ['confirmed', 'completed']),
        lte(bookings.startsAt, t),
      ),
    )
    .returning();
  if (!b) {
    throw conflict(
      'cannot_mark_no_show',
      existing.startsAt > t
        ? 'Solo puedes marcar "no asistió" cuando ya empezó la cita'
        : 'Solo se marca "no asistió" en una cita confirmada o completada',
    );
  }
  return b;
}

/**
 * Cancelación del dueño (RF-36): solo confirmadas. Reembolsa el 100% dentro de la transacción
 * (si el reembolso falla no se cancela), encola el borrado del evento de Google y avisa al cliente.
 */
export async function cancelByBusiness(businessId, bookingId, reason) {
  const booking = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ b: bookings, p: payments })
      .from(bookings)
      .leftJoin(payments, eq(payments.bookingId, bookings.id))
      .where(and(eq(bookings.id, bookingId), eq(bookings.businessId, businessId)))
      .for('update', { of: bookings });
    if (!row) throw notFound('No encontramos esa reserva');
    const { b, p } = row;
    if (b.status !== 'confirmed') {
      throw conflict('not_confirmed', 'Solo se pueden cancelar reservas confirmadas');
    }
    const t = nowDate();
    const [updated] = await tx
      .update(bookings)
      .set({
        status: 'cancelled',
        cancelledBy: 'business',
        cancellationReason: reason,
        cancelledAt: t,
      })
      .where(eq(bookings.id, b.id))
      .returning();
    await enqueueCalendarSync(b.id, 'delete', tx);
    if (p?.status === 'captured') {
      await tx
        .update(payments)
        .set({ status: 'refunded', refundedAt: t })
        .where(eq(payments.id, p.id));
      await refund(p.stripePaymentIntentId);
    } else if (p?.status === 'authorized') {
      await tx
        .update(payments)
        .set({ status: 'released', releasedAt: t })
        .where(eq(payments.id, p.id));
      await release(p.stripePaymentIntentId);
    }
    return updated;
  });
  await emailClient('booking_cancelled_by_business', booking.id);
  return booking;
}

// ---------- tareas periódicas ----------

/**
 * RF-31: vence las solicitudes sin respuesta a las 12 h o 1 h antes de la cita (respondBy ya
 * guarda el menor de los dos; la segunda condición cubre solicitudes sin respondBy).
 * @returns {Promise<number>} cuántas venció
 */
export async function expireRequests() {
  const t = now();
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        isRequest(),
        or(
          lte(bookings.respondBy, t.toJSDate()),
          lte(bookings.startsAt, t.plus({ hours: 1 }).toJSDate()),
        ),
      ),
    );
  let n = 0;
  for (const r of rows) if (await closeRequest(r.id, 'expired', 'request_expired')) n++;
  return n;
}

/** RF-37: las confirmadas cuya hora ya terminó pasan a completadas. */
export async function completePastBookings() {
  const t = nowDate();
  const rows = await db
    .update(bookings)
    .set({ status: 'completed', completedAt: t })
    .where(and(eq(bookings.status, 'confirmed'), lt(bookings.endsAt, t)))
    .returning({ id: bookings.id });
  return rows.length;
}

/**
 * RF-50: recordatorio 24 h antes de una cita confirmada, una sola vez por reserva (email_log).
 * No se manda si la cita se confirmó ya dentro de esas 24 h (el cliente acaba de recibir la
 * confirmación).
 */
export async function sendReminders() {
  const t = now();
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        gt(bookings.startsAt, t.toJSDate()),
        lte(bookings.startsAt, t.plus({ hours: 24 }).toJSDate()),
        sql`(${bookings.decidedAt} is null or ${bookings.decidedAt} < ${bookings.startsAt} - interval '24 hours')`,
        sql`not exists (select 1 from email_log e where e.template = 'booking_reminder' and e.booking_id = ${bookings.id})`,
      ),
    );
  for (const r of rows) await emailClient('booking_reminder', r.id);
  return rows.length;
}
