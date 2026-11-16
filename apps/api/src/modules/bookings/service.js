// Lógica de reservas del cliente: borrador, pago autorizado, cancelación y vencimiento de
// borradores. Ver "Flujo de una reserva" en el README / brief.
import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql, count } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { bookings, payments, services, businesses } from '../../db/schema.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { businessIsListed } from '../../lib/businessReady.js';
import { enqueueCalendarSync } from '../../lib/calendarSync.js';
import { DateTime, now, nowDate, toLocal } from '../../lib/time.js';
import { APP_TZ } from '../../config/env.js';
import * as pay from '../../lib/payments.js';
import { loadContext, daySlots } from '../public/availability.js';
import {
  sendNewRequestEmail,
  sendBookingConfirmedEmail,
  sendCancelledByClientEmail,
} from './emails.js';

/** RF-27: máximo de solicitudes pendientes con cita futura por cliente. */
export const MAX_PENDING_REQUESTS = 3;
/** RF-32: minutos que se aparta el horario mientras el cliente paga. */
export const HOLD_MINUTES = 10;
/** Un borrador sin pagar se descarta después de este tiempo. */
export const DRAFT_MINUTES = 30;

const HOUR = 3600_000;

/** Solicitudes pendientes (ya pagadas) del cliente con cita futura. */
export async function pendingRequestCount(clientId) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, clientId),
        eq(bookings.status, 'pending'),
        isNotNull(bookings.submittedAt),
        gt(bookings.startsAt, nowDate()),
      ),
    );
  return n;
}

/** Condición: borrador o apartado que todavía no se paga. */
const unpaidDraft = sql`(
  (${bookings.status} = 'pending' and ${bookings.submittedAt} is null) or ${bookings.status} = 'hold'
)`;

/**
 * Descarta un borrador (pending sin enviar u hold sin pagar): reserva → expired o cancelled,
 * la autorización se cancela en Stripe para que ya no se pueda cobrar.
 */
async function discardDraft(tx, booking, payment, status) {
  await pay.release(payment.stripePaymentIntentId);
  await tx
    .update(payments)
    .set({ status: 'released', releasedAt: nowDate() })
    .where(eq(payments.id, payment.id));
  await tx
    .update(bookings)
    .set({
      status,
      holdExpiresAt: null,
      ...(status === 'cancelled' ? { cancelledAt: nowDate(), cancelledBy: 'client' } : {}),
    })
    .where(eq(bookings.id, booking.id));
}

/**
 * Crea el borrador de una reserva (RF-25, RF-26, RF-27, RF-32).
 * @returns {{ booking: object, payment: { mode, clientSecret } }}
 */
export async function createDraft(user, { serviceId, resourceId, startsAt, rebookedFromId }) {
  const [row] = await db
    .select({ service: services, business: businesses })
    .from(services)
    .innerJoin(businesses, eq(businesses.id, services.businessId))
    .where(and(eq(services.id, serviceId), eq(services.active, true), businessIsListed()));
  if (!row) throw notFound('Ese servicio no está disponible');
  const { service, business } = row;

  if (rebookedFromId) {
    const [prev] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.id, rebookedFromId), eq(bookings.clientId, user.id)));
    if (!prev) throw badRequest('invalid_rebook', 'No encontramos la cita anterior');
  }

  // Apartados vencidos (de cualquiera) y borradores anteriores de este cliente ya no sirven:
  // se descartan para liberar el horario y la restricción de exclusión.
  await expireAbandonedDrafts();
  await discardClientDrafts(user.id);

  if (!business.autoAccept && (await pendingRequestCount(user.id)) >= MAX_PENDING_REQUESTS) {
    throw conflict(
      'too_many_requests',
      `Ya tienes ${MAX_PENDING_REQUESTS} solicitudes esperando respuesta. Espera a que te respondan o retira alguna.`,
    );
  }

  // Revalida el horario con los mismos datos que vio el cliente (RF-24).
  const start = toLocal(new Date(startsAt));
  const date = start.toISODate();
  const ctx = await loadContext(business.id, date, date);
  const slots = daySlots(ctx, { serviceId, resourceId: resourceId ?? null, date });
  const slot = slots.find((x) => Date.parse(x.startsAt) === start.toMillis());
  if (!slot) throw conflict('slot_taken', 'Ese horario ya no está disponible. Elige otro.');

  const chosen = resourceId ?? (await leastBusyResource(slot.resourceIds, date));
  const createdAt = nowDate();
  const startDate = start.toJSDate();
  const endDate = start.plus({ minutes: service.durationMin }).toJSDate();
  const [booking] = await db
    .insert(bookings)
    .values({
      clientId: user.id,
      businessId: business.id,
      serviceId: service.id,
      resourceId: chosen,
      startsAt: startDate,
      endsAt: endDate,
      status: business.autoAccept ? 'hold' : 'pending',
      holdExpiresAt: business.autoAccept
        ? new Date(createdAt.getTime() + HOLD_MINUTES * 60_000)
        : null,
      priceCents: service.priceCents,
      durationMin: service.durationMin,
      rebookedFromId: rebookedFromId ?? null,
      createdAt,
    })
    .returning();

  let auth;
  try {
    auth = await pay.createAuthorization({
      amountCents: service.priceCents,
      bookingId: booking.id,
      description: `${service.name} · ${business.name}`,
      email: user.email,
    });
  } catch (e) {
    await db.update(bookings).set({ status: 'expired' }).where(eq(bookings.id, booking.id));
    throw e;
  }
  await db.insert(payments).values({
    bookingId: booking.id,
    stripePaymentIntentId: auth.id,
    amountCents: service.priceCents,
    status: 'pending',
  });
  return {
    booking: {
      id: booking.id,
      status: booking.status,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      resourceId: booking.resourceId,
      priceCents: booking.priceCents,
      holdExpiresAt: booking.holdExpiresAt,
    },
    payment: { mode: auth.mode, clientSecret: auth.clientSecret },
  };
}

/** "Cualquiera": el recurso libre con menos citas ese día (empate: el primero). */
async function leastBusyResource(resourceIds, date) {
  if (resourceIds.length === 1) return resourceIds[0];
  const from = DateTime.fromISO(date, { zone: APP_TZ }).startOf('day');
  const rows = await db
    .select({ resourceId: bookings.resourceId, n: count() })
    .from(bookings)
    .where(
      and(
        inArray(bookings.resourceId, resourceIds),
        gte(bookings.startsAt, from.toJSDate()),
        lt(bookings.startsAt, from.plus({ days: 1 }).toJSDate()),
        or(
          inArray(bookings.status, ['confirmed', 'hold', 'completed']),
          and(eq(bookings.status, 'pending'), isNotNull(bookings.submittedAt)),
        ),
      ),
    )
    .groupBy(bookings.resourceId);
  const load = new Map(rows.map((r) => [r.resourceId, r.n]));
  let best = resourceIds[0];
  for (const id of resourceIds) if ((load.get(id) ?? 0) < (load.get(best) ?? 0)) best = id;
  return best;
}

/** Descarta los borradores sin pagar de un cliente (solo puede tener uno en curso). */
async function discardClientDrafts(clientId) {
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(payments, eq(payments.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.clientId, clientId),
        unpaidDraft,
        inArray(payments.status, ['pending', 'failed']),
      ),
    );
  for (const r of rows) await expireOne(r.id);
}

/**
 * Bloquea la reserva y su pago (SELECT ... FOR UPDATE) dentro de una transacción.
 */
async function lockBooking(tx, bookingId) {
  const [row] = await tx
    .select({ booking: bookings, payment: payments })
    .from(bookings)
    .innerJoin(payments, eq(payments.bookingId, bookings.id))
    .where(eq(bookings.id, bookingId))
    .for('update');
  return row;
}

/**
 * "Pago autorizado" del contrato. Idempotente: si ya se aplicó, no hace nada.
 * - pending (borrador): pago → authorized; la reserva se vuelve solicitud (submittedAt, respondBy).
 * - hold: se cobra, pago → captured, reserva → confirmed.
 * - si el borrador ya se había descartado: se libera la autorización.
 * @returns {{ booking: object, outcome: 'submitted'|'confirmed'|'already'|'discarded' }}
 */
export async function applyAuthorized(bookingId) {
  const result = await db.transaction(async (tx) => {
    const row = await lockBooking(tx, bookingId);
    if (!row) throw notFound('Reserva no encontrada');
    const { booking, payment } = row;
    if (!['pending', 'failed'].includes(payment.status)) {
      // Un borrador que ya se descartó (venció o se canceló) no vuelve a la vida.
      const discarded = ['expired', 'cancelled'].includes(booking.status) && !booking.submittedAt;
      return { booking, outcome: discarded ? 'discarded' : 'already' };
    }
    const t = nowDate();

    if (booking.status === 'pending' && !booking.submittedAt) {
      const respondBy = new Date(
        Math.min(t.getTime() + 12 * HOUR, booking.startsAt.getTime() - HOUR),
      );
      await tx
        .update(payments)
        .set({ status: 'authorized', authorizedAt: t })
        .where(eq(payments.id, payment.id));
      const [b] = await tx
        .update(bookings)
        .set({ submittedAt: t, respondBy })
        .where(eq(bookings.id, booking.id))
        .returning();
      return { booking: b, outcome: 'submitted' };
    }

    if (booking.status === 'hold') {
      await pay.capture(payment.stripePaymentIntentId);
      await tx
        .update(payments)
        .set({ status: 'captured', authorizedAt: t, capturedAt: t })
        .where(eq(payments.id, payment.id));
      const [b] = await tx
        .update(bookings)
        .set({ status: 'confirmed', submittedAt: t, decidedAt: t, holdExpiresAt: null })
        .where(eq(bookings.id, booking.id))
        .returning();
      await enqueueCalendarSync(booking.id, 'create', tx);
      return { booking: b, outcome: 'confirmed' };
    }

    // El borrador ya venció o se canceló: no se debe cobrar nada.
    await pay.release(payment.stripePaymentIntentId);
    await tx
      .update(payments)
      .set({ status: 'released', releasedAt: t })
      .where(eq(payments.id, payment.id));
    return { booking, outcome: 'discarded' };
  });
  if (result.outcome === 'submitted') await sendNewRequestEmail(bookingId);
  if (result.outcome === 'confirmed') await sendBookingConfirmedEmail(bookingId);
  return result;
}

/** El pago falló (tarjeta rechazada): el cliente puede intentar otra vez con el mismo intento. */
export async function markPaymentFailed(paymentIntentId) {
  await db
    .update(payments)
    .set({ status: 'failed' })
    .where(
      and(eq(payments.stripePaymentIntentId, paymentIntentId), eq(payments.status, 'pending')),
    );
}

/** Busca la reserva de un PaymentIntent. */
export async function bookingIdForIntent(paymentIntentId) {
  const [row] = await db
    .select({ bookingId: payments.bookingId })
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntentId));
  return row?.bookingId ?? null;
}

/**
 * Cancela el cliente (RF-35). Pendiente o borrador: siempre, se libera. Confirmada: solo antes
 * de startsAt − cancellationLimitHours, con reembolso del 100%.
 */
export async function cancelByClient(user, bookingId) {
  const result = await db.transaction(async (tx) => {
    const row = await lockBooking(tx, bookingId);
    if (!row || row.booking.clientId !== user.id) throw notFound('Reserva no encontrada');
    const { booking, payment } = row;
    const t = nowDate();
    if (booking.status === 'pending' || booking.status === 'hold') {
      const submitted = booking.status === 'pending' && Boolean(booking.submittedAt);
      await discardDraft(tx, booking, payment, 'cancelled');
      return { notify: submitted, wasConfirmed: false };
    }
    if (booking.status !== 'confirmed')
      throw conflict('not_cancellable', 'Esta reserva ya no se puede cancelar');
    const [biz] = await tx
      .select({ limit: businesses.cancellationLimitHours })
      .from(businesses)
      .where(eq(businesses.id, booking.businessId));
    const deadline = booking.startsAt.getTime() - (biz.limit ?? 0) * HOUR;
    if (t.getTime() >= deadline)
      throw conflict(
        'cancellation_closed',
        `Solo se puede cancelar hasta ${biz.limit} h antes de la cita.`,
      );
    if (payment.status === 'captured') {
      await pay.refund(payment.stripePaymentIntentId);
      await tx
        .update(payments)
        .set({ status: 'refunded', refundedAt: t })
        .where(eq(payments.id, payment.id));
    } else if (payment.status === 'authorized' || payment.status === 'pending') {
      await pay.release(payment.stripePaymentIntentId);
      await tx
        .update(payments)
        .set({ status: 'released', releasedAt: t })
        .where(eq(payments.id, payment.id));
    }
    await tx
      .update(bookings)
      .set({ status: 'cancelled', cancelledBy: 'client', cancelledAt: t })
      .where(eq(bookings.id, booking.id));
    await enqueueCalendarSync(booking.id, 'delete', tx);
    return { notify: true, wasConfirmed: true };
  });
  if (result.notify)
    await sendCancelledByClientEmail(bookingId, { wasConfirmed: result.wasConfirmed });
  return result;
}

/** Vence un borrador o apartado sin pagar (si sigue así al bloquearlo). */
async function expireOne(bookingId) {
  // Con Stripe, el pago pudo autorizarse sin que llegara el webhook: en ese caso se aplica.
  const [p] = await db
    .select({ pi: payments.stripePaymentIntentId, status: payments.status })
    .from(payments)
    .where(eq(payments.bookingId, bookingId));
  if (p && !pay.isFake(p.pi) && (await pay.fetchStatus(p.pi)) === 'authorized') {
    const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    const stillUsable =
      (b.status === 'pending' && !b.submittedAt) ||
      (b.status === 'hold' && b.holdExpiresAt > nowDate());
    if (stillUsable) return applyAuthorized(bookingId);
  }
  await db.transaction(async (tx) => {
    const row = await lockBooking(tx, bookingId);
    if (!row) return;
    const { booking, payment } = row;
    const isDraft =
      (booking.status === 'pending' && !booking.submittedAt) || booking.status === 'hold';
    if (!isDraft || !['pending', 'failed'].includes(payment.status)) return;
    await discardDraft(tx, booking, payment, 'expired');
  });
}

/**
 * Tarea: vence borradores (pending sin enviar) de más de 30 min y apartados (hold) cuyo
 * tiempo terminó sin pago autorizado. Devuelve cuántos venció.
 */
export async function expireAbandonedDrafts() {
  const t = now();
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(payments, eq(payments.bookingId, bookings.id))
    .where(
      and(
        inArray(payments.status, ['pending', 'failed']),
        or(
          and(
            eq(bookings.status, 'pending'),
            isNull(bookings.submittedAt),
            lt(bookings.createdAt, t.minus({ minutes: DRAFT_MINUTES }).toJSDate()),
          ),
          and(eq(bookings.status, 'hold'), lt(bookings.holdExpiresAt, t.toJSDate())),
        ),
      ),
    );
  for (const r of rows) await expireOne(r.id);
  return rows.length;
}
