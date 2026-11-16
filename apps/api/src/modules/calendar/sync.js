// Sincronización con Google Calendar en ambos sentidos (RF-39 a RF-43, RF-70, RNF-06, RNF-17).
// ReserYa → Google: la cola calendar_sync_jobs crea, mueve y borra eventos.
// Google → ReserYa: se leen los cambios de cada calendario con syncToken; los eventos propios del
// negocio bloquean horarios y los movimientos o borrados de citas se reflejan y se avisan al cliente.
import { and, asc, eq, inArray, isNotNull, isNull, lte, gt, notInArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  bookings,
  businesses,
  calendarSyncJobs,
  externalBusyBlocks,
  payments,
  resources,
  services,
  users,
} from '../../db/schema.js';
import { env, APP_TZ } from '../../config/env.js';
import { decrypt, encrypt } from '../../lib/crypto.js';
import { emailLayout, sendEmail, alreadySent } from '../../lib/email.js';
import { refund, release } from '../../lib/payments.js';
import {
  formatLong,
  formatMoney,
  formatShort,
  localDateTime,
  now,
  nowDate,
} from '../../lib/time.js';
import {
  calendarApi,
  errorStatus,
  errorText,
  isInvalidGrant,
  listChanges,
  nearestCalendarColor,
  revoke,
} from './google.js';

export const MAX_ATTEMPTS = 8;
export const DELETED_REASON = 'Eliminada desde Google Calendar';

const log = (...args) => {
  if (!env.isTest) console.warn('[calendar]', ...args);
};

/** "Carlos M." (RF-47). */
export const shortName = (first, last) => `${first}${last ? ` ${last[0]}.` : ''}`;

/** Id del evento en Google derivado de la reserva: hex del uuid (válido en base32hex). */
export const eventIdFor = (bookingId) => bookingId.replace(/-/g, '');

/** Espera antes del siguiente intento: 30 s, 1, 2, 4, 8, 16, 32 min (máx. 1 h). */
export const backoffMs = (attempts) => Math.min(30_000 * 2 ** (attempts - 1), 3_600_000);

const isUuid = (v) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Ejecuta las pasadas una tras otra aunque se pidan a la vez (tarea periódica y "Sincronizar ahora"). */
function serial() {
  let chain = Promise.resolve();
  return (fn) => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => {});
    return p;
  };
}
const queueLock = serial();
const pullLock = serial();

/** Última lectura correcta de Google por negocio (en memoria, solo informativo). */
const lastSync = new Map();
export const lastSyncAt = (businessId) => lastSync.get(businessId) ?? null;

// ---------- conexión ----------

/** Refresh token descifrado, o null si no hay o no se puede descifrar. */
export function refreshTokenOf(business) {
  if (!business?.googleRefreshTokenEnc) return null;
  try {
    return decrypt(business.googleRefreshTokenEnc);
  } catch {
    return null;
  }
}

/** Ids de recursos del negocio (subconsulta). */
const resourceIdsOf = (businessId) =>
  db.select({ id: resources.id }).from(resources).where(eq(resources.businessId, businessId));
const bookingIdsOf = (businessId) =>
  db.select({ id: bookings.id }).from(bookings).where(eq(bookings.businessId, businessId));

/**
 * Guarda la conexión (token cifrado, RNF-11). Si es otra cuenta de Google, olvida los
 * calendarios anteriores porque ya no se pueden usar.
 */
export async function saveConnection(business, { refreshToken, email }) {
  const sameAccount = business.googleEmail && email && business.googleEmail === email;
  await db.transaction(async (tx) => {
    if (!sameAccount) {
      await tx
        .update(resources)
        .set({ googleCalendarId: null, googleSyncToken: null })
        .where(eq(resources.businessId, business.id));
      await tx
        .update(bookings)
        .set({ googleEventId: null })
        .where(eq(bookings.businessId, business.id));
    }
    await tx
      .delete(externalBusyBlocks)
      .where(inArray(externalBusyBlocks.resourceId, resourceIdsOf(business.id)));
    await tx
      .update(resources)
      .set({ googleSyncToken: null })
      .where(eq(resources.businessId, business.id));
    await tx
      .update(businesses)
      .set({
        googleRefreshTokenEnc: encrypt(refreshToken),
        googleEmail: email,
        googleConnectedAt: nowDate(),
      })
      .where(eq(businesses.id, business.id));
  });
}

/**
 * Desconecta (botón del dueño): revoca el permiso si se puede y limpia todo lo de Google.
 * Los calendarios se quedan en la cuenta de Google del usuario.
 */
export async function disconnect(businessId) {
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
  const token = refreshTokenOf(business);
  const revoked = token ? await revoke(token) : false;
  await db.transaction(async (tx) => {
    await tx
      .update(businesses)
      .set({ googleRefreshTokenEnc: null, googleEmail: null, googleConnectedAt: null })
      .where(eq(businesses.id, businessId));
    await tx
      .update(resources)
      .set({ googleCalendarId: null, googleSyncToken: null })
      .where(eq(resources.businessId, businessId));
    await tx
      .delete(externalBusyBlocks)
      .where(inArray(externalBusyBlocks.resourceId, resourceIdsOf(businessId)));
    await tx
      .update(bookings)
      .set({ googleEventId: null })
      .where(eq(bookings.businessId, businessId));
    await tx
      .update(calendarSyncJobs)
      .set({ status: 'done', lastError: 'Google Calendar desconectado' })
      .where(
        and(
          eq(calendarSyncJobs.status, 'pending'),
          inArray(calendarSyncJobs.bookingId, bookingIdsOf(businessId)),
        ),
      );
  });
  lastSync.delete(businessId);
  return { revoked };
}

/**
 * El refresh token dejó de servir (invalid_grant): se marca como desconectado y se deja de
 * intentar. Se conservan el correo y los ids de calendario para que, si el dueño vuelve a
 * conectar la misma cuenta, no se dupliquen los calendarios.
 */
export async function loseConnection(businessId) {
  await db.transaction(async (tx) => {
    await tx
      .update(businesses)
      .set({ googleRefreshTokenEnc: null })
      .where(eq(businesses.id, businessId));
    await tx
      .update(resources)
      .set({ googleSyncToken: null })
      .where(eq(resources.businessId, businessId));
    // Ya no podemos leerlos: si se quedaran, bloquearían horarios para siempre.
    await tx
      .delete(externalBusyBlocks)
      .where(inArray(externalBusyBlocks.resourceId, resourceIdsOf(businessId)));
  });
  lastSync.delete(businessId);
  log(`negocio ${businessId}: Google rechazó el token, queda desconectado`);
}

/** Encola 'create' para las reservas confirmadas futuras que aún no tienen evento. */
export async function enqueueMissingEvents(businessId) {
  const missing = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .where(
      and(
        eq(bookings.businessId, businessId),
        eq(bookings.status, 'confirmed'),
        isNull(bookings.googleEventId),
        gt(bookings.endsAt, nowDate()),
        isNotNull(resources.googleCalendarId),
        sql`not exists (select 1 from ${calendarSyncJobs} j where j.booking_id = ${bookings.id} and j.status = 'pending')`,
      ),
    );
  if (missing.length) {
    await db
      .insert(calendarSyncJobs)
      .values(missing.map((b) => ({ bookingId: b.id, action: 'create' })));
  }
  return missing.length;
}

/**
 * Crea un calendario secundario "ReserYa · Nombre" por cada recurso activo que no tenga (RF-40),
 * con el color de Google más cercano al del recurso. Devuelve cuántos creó.
 */
export async function ensureCalendars(businessId) {
  if (!env.googleEnabled) return 0;
  const rows = await db
    .select({ resource: resources, business: businesses })
    .from(resources)
    .innerJoin(businesses, eq(businesses.id, resources.businessId))
    .where(
      and(
        eq(resources.active, true),
        isNull(resources.googleCalendarId),
        isNotNull(businesses.googleRefreshTokenEnc),
        businessId ? eq(businesses.id, businessId) : undefined,
      ),
    )
    .orderBy(asc(resources.createdAt));
  let created = 0;
  const touched = new Set();
  const apis = new Map();
  const lost = new Set();
  for (const { resource, business } of rows) {
    if (lost.has(business.id)) continue;
    const token = refreshTokenOf(business);
    if (!token) {
      lost.add(business.id);
      await loseConnection(business.id);
      continue;
    }
    if (!apis.has(business.id)) apis.set(business.id, calendarApi(token));
    const api = apis.get(business.id);
    try {
      const cal = await api.createCalendar({
        summary: `ReserYa · ${resource.name}`,
        description: `Citas de ${resource.name} en ${business.name}, creadas por ReserYa. Lo que agregues aquí bloquea ese horario en ReserYa.`,
      });
      await db
        .update(resources)
        .set({ googleCalendarId: cal.id, googleSyncToken: null })
        .where(eq(resources.id, resource.id));
      created++;
      touched.add(business.id);
      try {
        await api.setCalendarColor(cal.id, nearestCalendarColor(resource.color));
      } catch (e) {
        log('no se pudo poner color al calendario', errorText(e));
      }
    } catch (e) {
      if (isInvalidGrant(e)) {
        lost.add(business.id);
        await loseConnection(business.id);
      } else {
        log(`no se pudo crear el calendario de ${resource.name}:`, errorText(e));
      }
    }
  }
  for (const id of touched) await enqueueMissingEvents(id);
  return created;
}

// ---------- ReserYa → Google (cola) ----------

function eventBody({ booking, service, resource, client, business }) {
  const who = shortName(client.firstName, client.lastName);
  return {
    id: eventIdFor(booking.id),
    summary: `${service.name} · ${who}`,
    // Sin teléfonos ni precios (RF-47).
    description: [
      'Cita reservada en ReserYa.',
      `Cliente: ${who}`,
      `Servicio: ${service.name} (${booking.durationMin} min)`,
      `Con: ${resource.name}`,
      '',
      `Si mueves este evento, ReserYa cambia la cita y avisa al cliente. Si lo borras, la cita se cancela y se le reembolsa al cliente. — ${business.name}`,
    ].join('\n'),
    start: { dateTime: booking.startsAt.toISOString(), timeZone: APP_TZ },
    end: { dateTime: booking.endsAt.toISOString(), timeZone: APP_TZ },
    extendedProperties: { private: { reseryaBookingId: booking.id } },
  };
}

const markDone = (jobId, lastError = null) =>
  db
    .update(calendarSyncJobs)
    .set({ status: 'done', lastError })
    .where(eq(calendarSyncJobs.id, jobId));

async function markFailedAttempt(job, error) {
  const attempts = job.attempts + 1;
  const failed = attempts >= MAX_ATTEMPTS;
  await db
    .update(calendarSyncJobs)
    .set({
      attempts,
      status: failed ? 'failed' : 'pending',
      nextAttemptAt: new Date(nowDate().getTime() + backoffMs(attempts)),
      lastError: errorText(error),
    })
    .where(eq(calendarSyncJobs.id, job.id));
}

async function runJob(row, api) {
  const { job, booking, resource } = row;
  const calendarId = resource.googleCalendarId;
  const createIt = async () => {
    const ev = await api.insertEvent(calendarId, eventBody(row));
    await db
      .update(bookings)
      .set({ googleEventId: ev?.id ?? eventIdFor(booking.id) })
      .where(eq(bookings.id, booking.id));
  };

  if (job.action === 'delete') {
    if (booking.googleEventId) await api.deleteEvent(calendarId, booking.googleEventId);
    return;
  }
  // create / update: solo tiene sentido si la reserva sigue confirmada.
  if (booking.status !== 'confirmed') return;
  if (job.action === 'create' || !booking.googleEventId) return createIt();
  const body = eventBody(row);
  await api.patchEvent(calendarId, booking.googleEventId, {
    summary: body.summary,
    description: body.description,
    start: body.start,
    end: body.end,
  });
}

/**
 * Procesa la cola (cada ~10 s). Si Google falla, la reserva sigue válida y se reintenta con
 * espera creciente; tras 8 intentos queda 'failed' (RNF-17).
 * @param {{ businessId?: string }} [opts]
 */
export function processQueue(opts = {}) {
  return queueLock(() => processQueueNow(opts));
}

async function processQueueNow({ businessId } = {}) {
  if (!env.googleEnabled) {
    // Sin Google configurado en el servidor no hay nada que sincronizar.
    const res = await db
      .update(calendarSyncJobs)
      .set({ status: 'done' })
      .where(eq(calendarSyncJobs.status, 'pending'))
      .returning({ id: calendarSyncJobs.id });
    return { processed: res.length, done: res.length, retried: 0, failed: 0 };
  }

  await ensureCalendars(businessId);

  const rows = await db
    .select({
      job: calendarSyncJobs,
      booking: bookings,
      resource: resources,
      service: { name: services.name },
      client: { firstName: users.firstName, lastName: users.lastName },
      business: {
        id: businesses.id,
        name: businesses.name,
        googleRefreshTokenEnc: businesses.googleRefreshTokenEnc,
      },
    })
    .from(calendarSyncJobs)
    .innerJoin(bookings, eq(bookings.id, calendarSyncJobs.bookingId))
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(users, eq(users.id, bookings.clientId))
    .innerJoin(businesses, eq(businesses.id, bookings.businessId))
    .where(
      and(
        eq(calendarSyncJobs.status, 'pending'),
        lte(calendarSyncJobs.nextAttemptAt, nowDate()),
        businessId ? eq(businesses.id, businessId) : undefined,
      ),
    )
    .orderBy(asc(calendarSyncJobs.createdAt))
    .limit(200);

  const stats = { processed: rows.length, done: 0, retried: 0, failed: 0 };
  const apis = new Map();
  const lost = new Set();
  for (const row of rows) {
    const { job, business } = row;
    const token = lost.has(business.id) ? null : refreshTokenOf(business);
    // Sin Google conectado o sin calendario para el recurso: no hay nada que hacer.
    if (!token || !row.resource.googleCalendarId) {
      await markDone(job.id);
      stats.done++;
      continue;
    }
    if (!apis.has(business.id)) apis.set(business.id, calendarApi(token));
    try {
      await runJob(row, apis.get(business.id));
      await markDone(job.id);
      stats.done++;
    } catch (e) {
      if (isInvalidGrant(e)) {
        lost.add(business.id);
        await loseConnection(business.id);
        await markDone(job.id, 'Google desconectado: vuelve a conectar la cuenta');
        stats.done++;
        continue;
      }
      await markFailedAttempt(job, e);
      if (job.attempts + 1 >= MAX_ATTEMPTS) stats.failed++;
      else stats.retried++;
    }
  }
  return stats;
}

// ---------- Google → ReserYa (lectura de cambios) ----------

/** [inicio, fin] del evento como Date. Los de todo el día ocupan el día completo local. */
export function eventRange(ev) {
  if (ev.start?.dateTime) {
    const start = new Date(ev.start.dateTime);
    const end = new Date(ev.end?.dateTime ?? ev.start.dateTime);
    return end > start ? [start, end] : null;
  }
  if (ev.start?.date) {
    const start = localDateTime(ev.start.date, '00:00');
    const end = ev.end?.date ? localDateTime(ev.end.date, '00:00') : start.plus({ days: 1 });
    return end > start ? [start.toJSDate(), end.toJSDate()] : null;
  }
  return null;
}

/** Ventana de eventos que nos interesan: desde ayer hasta poco más de un año. */
const windowStart = () => now().minus({ days: 1 });
const windowEnd = () => now().plus({ days: 400 });

const deleteBlock = (resourceId, eventId) =>
  db
    .delete(externalBusyBlocks)
    .where(
      and(
        eq(externalBusyBlocks.resourceId, resourceId),
        eq(externalBusyBlocks.googleEventId, eventId),
      ),
    );

/** Evento personal del negocio (sin reseryaBookingId) → bloque ocupado (RF-42, RF-70). */
async function applyBusyEvent(resource, ev) {
  const range =
    ev.status === 'cancelled' || ev.transparency === 'transparent' ? null : eventRange(ev);
  if (!range || range[1] <= windowStart().toJSDate() || range[0] >= windowEnd().toJSDate()) {
    await deleteBlock(resource.id, ev.id);
    return false;
  }
  const [startsAt, endsAt] = range;
  const title = ev.summary ? String(ev.summary).slice(0, 120) : null;
  await db
    .insert(externalBusyBlocks)
    .values({ resourceId: resource.id, googleEventId: ev.id, title, startsAt, endsAt })
    .onConflictDoUpdate({
      target: [externalBusyBlocks.resourceId, externalBusyBlocks.googleEventId],
      set: { title, startsAt, endsAt, updatedAt: new Date() },
    });
  return true;
}

async function loadBookingContext(bookingId) {
  const [row] = await db
    .select({
      booking: bookings,
      service: { name: services.name },
      resource: { id: resources.id, name: resources.name },
      client: { id: users.id, email: users.email, firstName: users.firstName },
      business: { id: businesses.id, name: businesses.name, phone: businesses.phone },
    })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .innerJoin(users, eq(users.id, bookings.clientId))
    .innerJoin(businesses, eq(businesses.id, bookings.businessId))
    .where(eq(bookings.id, bookingId));
  return row ?? null;
}

const isExclusionError = (e) => (e?.code ?? e?.cause?.code) === '23P01';

/** La cita se movió en Google: nuevas horas y correo booking_moved (RF-43, RF-50). */
async function moveFromGoogle(ctx, [startsAt, endsAt]) {
  const { booking } = ctx;
  let updated;
  try {
    [updated] = await db
      .update(bookings)
      .set({ startsAt, endsAt })
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, 'confirmed')))
      .returning();
  } catch (e) {
    if (!isExclusionError(e)) throw e;
    // Choca con otra reserva confirmada: la reserva se queda como estaba. Se registra el
    // problema (lo ve el dueño en la página de Google Calendar) y se regresa el evento a su hora.
    await db.insert(calendarSyncJobs).values([
      {
        bookingId: booking.id,
        action: 'update',
        status: 'failed',
        lastError: `Moviste la cita en Google al ${formatShort(startsAt)}, pero ese horario choca con otra reserva confirmada de ${ctx.resource.name}. En ReserYa sigue el ${formatShort(booking.startsAt)}.`,
      },
      { bookingId: booking.id, action: 'update' },
    ]);
    log(`no se pudo mover la reserva ${booking.id}: choca con otra confirmada`);
    return 'conflict';
  }
  if (!updated) return 'ignored';
  const { client, business, service, resource } = ctx;
  await sendEmail({
    to: client.email,
    toUserId: client.id,
    template: 'booking_moved',
    bookingId: booking.id,
    subject: `Tu cita en ${business.name} cambió de horario`,
    html: emailLayout({
      title: 'Tu cita cambió de horario',
      paragraphs: [
        `Hola ${client.firstName}, ${business.name} cambió el horario de tu cita de ${service.name} con ${resource.name}.`,
        `Nuevo horario: ${formatLong(startsAt)}.`,
        `Antes era: ${formatLong(booking.startsAt)}.`,
        business.phone
          ? `Si el nuevo horario no te queda, comunícate con el negocio al ${business.phone}.`
          : 'Si el nuevo horario no te queda, comunícate con el negocio.',
      ],
      cta: { label: 'Ver mi reserva', url: `${env.WEB_URL}/reservas/${booking.id}` },
    }),
    text: `${business.name} cambió tu cita de ${service.name}: ahora es el ${formatLong(startsAt)} (antes ${formatLong(booking.startsAt)}).`,
  });
  return 'moved';
}

/** La cita se borró en Google: se cancela por el negocio con reembolso (RF-43, RF-36). */
async function cancelFromGoogle(ctx) {
  const { booking } = ctx;
  let refunded = 0;
  const cancelled = await db.transaction(async (tx) => {
    const [b] = await tx
      .update(bookings)
      .set({
        status: 'cancelled',
        cancelledAt: nowDate(),
        cancelledBy: 'business',
        cancellationReason: DELETED_REASON,
      })
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, 'confirmed')))
      .returning();
    if (!b) return false;
    const [pay] = await tx.select().from(payments).where(eq(payments.bookingId, booking.id));
    if (pay?.status === 'captured') {
      // Si Stripe falla se revierte todo y se reintenta en la siguiente lectura.
      await refund(pay.stripePaymentIntentId);
      await tx
        .update(payments)
        .set({ status: 'refunded', refundedAt: nowDate() })
        .where(eq(payments.id, pay.id));
      refunded = pay.amountCents;
    } else if (pay?.status === 'authorized') {
      await release(pay.stripePaymentIntentId);
      await tx
        .update(payments)
        .set({ status: 'released', releasedAt: nowDate() })
        .where(eq(payments.id, pay.id));
    }
    return true;
  });
  if (!cancelled) return 'ignored';
  if (!(await alreadySent('booking_deleted_in_google', booking.id))) {
    const { client, business, service, resource } = ctx;
    await sendEmail({
      to: client.email,
      toUserId: client.id,
      template: 'booking_deleted_in_google',
      bookingId: booking.id,
      subject: `${business.name} canceló tu cita`,
      html: emailLayout({
        title: 'Tu cita fue cancelada',
        paragraphs: [
          `Hola ${client.firstName}, ${business.name} canceló tu cita de ${service.name} con ${resource.name} del ${formatLong(booking.startsAt)}.`,
          refunded
            ? `Te reembolsamos el 100% (${formatMoney(refunded)}). Puede tardar unos días en verse en tu tarjeta.`
            : 'No se te hizo ningún cargo.',
          'Puedes reservar otro horario cuando quieras.',
        ],
        cta: { label: 'Ver mi reserva', url: `${env.WEB_URL}/reservas/${booking.id}` },
      }),
      text: `${business.name} canceló tu cita de ${service.name} del ${formatLong(booking.startsAt)}.${refunded ? ` Te reembolsamos ${formatMoney(refunded)}.` : ''}`,
    });
  }
  return 'cancelled';
}

/** Evento de una cita de ReserYa. Se ignoran los cambios que hizo la propia ReserYa. */
async function applyBookingEvent(business, resource, ev, bookingId) {
  if (!isUuid(bookingId)) return 'ignored';
  const ctx = await loadBookingContext(bookingId);
  // Solo citas de este negocio y de este recurso (si lo pasaron a otro calendario, se ignora).
  if (!ctx || ctx.booking.businessId !== business.id || ctx.booking.resourceId !== resource.id)
    return 'ignored';
  if (ctx.booking.status !== 'confirmed') return 'ignored';
  if (ev.status === 'cancelled') return cancelFromGoogle(ctx);
  const range = eventRange(ev);
  if (!range) return 'ignored';
  const same =
    range[0].getTime() === ctx.booking.startsAt.getTime() &&
    range[1].getTime() === ctx.booking.endsAt.getTime();
  if (same) return 'ignored';
  return moveFromGoogle(ctx, range);
}

/** Lee los cambios de un calendario de recurso y los aplica. */
export async function syncResource(business, resource, api) {
  const { items, nextSyncToken, full } = await listChanges(api, resource.googleCalendarId, {
    syncToken: resource.googleSyncToken,
    timeMin: windowStart().toUTC().toISO(),
  });
  const result = { full, blocks: 0, moved: 0, cancelled: 0, conflicts: 0 };
  const keep = [];
  for (const ev of items) {
    const bookingId = ev.extendedProperties?.private?.reseryaBookingId;
    if (bookingId) {
      const r = await applyBookingEvent(business, resource, ev, bookingId);
      if (r === 'moved') result.moved++;
      if (r === 'cancelled') result.cancelled++;
      if (r === 'conflict') result.conflicts++;
    } else if (await applyBusyEvent(resource, ev)) {
      keep.push(ev.id);
      result.blocks++;
    }
  }
  if (full) {
    // Sincronización completa (primera vez o 410): lo que ya no existe en Google se borra.
    await db
      .delete(externalBusyBlocks)
      .where(
        and(
          eq(externalBusyBlocks.resourceId, resource.id),
          keep.length ? notInArray(externalBusyBlocks.googleEventId, keep) : undefined,
        ),
      );
  }
  await db
    .update(resources)
    .set({ googleSyncToken: nextSyncToken })
    .where(eq(resources.id, resource.id));
  return result;
}

/**
 * Lee los cambios de todos los calendarios de recursos (cada ~45 s, RF-43, RNF-06).
 * @param {{ businessId?: string }} [opts]
 */
export function pullChanges(opts = {}) {
  return pullLock(() => pullChangesNow(opts));
}

async function pullChangesNow({ businessId } = {}) {
  if (!env.googleEnabled) return { resources: 0 };
  const rows = await db
    .select({ resource: resources, business: businesses })
    .from(resources)
    .innerJoin(businesses, eq(businesses.id, resources.businessId))
    .where(
      and(
        eq(resources.active, true),
        isNotNull(resources.googleCalendarId),
        isNotNull(businesses.googleRefreshTokenEnc),
        businessId ? eq(businesses.id, businessId) : undefined,
      ),
    )
    .orderBy(asc(businesses.id), asc(resources.createdAt));

  const byBusiness = new Map();
  for (const r of rows) {
    if (!byBusiness.has(r.business.id))
      byBusiness.set(r.business.id, { business: r.business, list: [] });
    byBusiness.get(r.business.id).list.push(r.resource);
  }
  let count = 0;
  for (const { business, list } of byBusiness.values()) {
    const token = refreshTokenOf(business);
    if (!token) {
      await loseConnection(business.id);
      continue;
    }
    const api = calendarApi(token);
    let ok = true;
    for (const resource of list) {
      try {
        await syncResource(business, resource, api);
        count++;
      } catch (e) {
        ok = false;
        if (isInvalidGrant(e)) {
          await loseConnection(business.id);
          break;
        }
        if (errorStatus(e) === 404) {
          // Borraron el calendario en Google: se olvida y la cola crea uno nuevo.
          await db
            .update(resources)
            .set({ googleCalendarId: null, googleSyncToken: null })
            .where(eq(resources.id, resource.id));
          await deleteBlocksOf(resource.id);
          await db
            .update(bookings)
            .set({ googleEventId: null })
            .where(eq(bookings.resourceId, resource.id));
          continue;
        }
        log(`no se pudieron leer los cambios de ${resource.name}:`, errorText(e));
      }
    }
    if (ok) lastSync.set(business.id, nowDate());
  }
  return { resources: count };
}

const deleteBlocksOf = (resourceId) =>
  db.delete(externalBusyBlocks).where(eq(externalBusyBlocks.resourceId, resourceId));

// ---------- estado para la página del dueño ----------

export async function statusFor(businessId) {
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
  const list = await db
    .select({
      id: resources.id,
      name: resources.name,
      color: resources.color,
      googleCalendarId: resources.googleCalendarId,
    })
    .from(resources)
    .where(and(eq(resources.businessId, businessId), eq(resources.active, true)))
    .orderBy(asc(resources.createdAt));
  const counts = await db
    .select({ status: calendarSyncJobs.status, n: sql`count(*)::int` })
    .from(calendarSyncJobs)
    .innerJoin(bookings, eq(bookings.id, calendarSyncJobs.bookingId))
    .where(
      and(
        eq(bookings.businessId, businessId),
        inArray(calendarSyncJobs.status, ['pending', 'failed']),
      ),
    )
    .groupBy(calendarSyncJobs.status);
  const failed = await db
    .select({
      id: calendarSyncJobs.id,
      action: calendarSyncJobs.action,
      attempts: calendarSyncJobs.attempts,
      lastError: calendarSyncJobs.lastError,
      updatedAt: calendarSyncJobs.updatedAt,
      bookingId: bookings.id,
      startsAt: bookings.startsAt,
      serviceName: services.name,
      clientFirstName: users.firstName,
      clientLastName: users.lastName,
    })
    .from(calendarSyncJobs)
    .innerJoin(bookings, eq(bookings.id, calendarSyncJobs.bookingId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(users, eq(users.id, bookings.clientId))
    .where(and(eq(bookings.businessId, businessId), eq(calendarSyncJobs.status, 'failed')))
    .orderBy(sql`${calendarSyncJobs.updatedAt} desc`)
    .limit(10);
  const connected = Boolean(business.googleRefreshTokenEnc);
  const n = (s) => counts.find((c) => c.status === s)?.n ?? 0;
  return {
    enabled: env.googleEnabled,
    connected,
    // Había conexión y Google rechazó el permiso (lo revocaron): hay que volver a conectar.
    connectionLost: !connected && Boolean(business.googleEmail),
    googleEmail: business.googleEmail,
    connectedAt: business.googleConnectedAt,
    lastSyncAt: connected ? lastSyncAt(businessId) : null,
    resources: list,
    pendingJobs: n('pending'),
    failedJobs: n('failed'),
    failed: failed.map(({ clientFirstName, clientLastName, ...f }) => ({
      ...f,
      clientName: shortName(clientFirstName, clientLastName),
    })),
  };
}

/** "Sincronizar ahora": reintenta lo fallido y hace una pasada completa del negocio. */
export async function syncNow(businessId) {
  await db
    .update(calendarSyncJobs)
    .set({ status: 'pending', attempts: 0, nextAttemptAt: nowDate() })
    .where(
      and(
        inArray(calendarSyncJobs.status, ['pending', 'failed']),
        inArray(calendarSyncJobs.bookingId, bookingIdsOf(businessId)),
      ),
    );
  const queue = await processQueue({ businessId });
  const pull = await pullChanges({ businessId });
  return { queue, pull };
}
