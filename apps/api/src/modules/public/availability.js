// Horarios libres (RF-24, RF-65, RNF-05).
//
// Un horario de inicio está libre para un recurso cuando:
// - el recurso trabaja ese día (horario semanal) y la cita cabe completa dentro del bloque;
// - el inicio cae en la rejilla del intervalo, contada desde el inicio de cada bloque;
// - no es un día cerrado del negocio (closed_days con resource_id nulo) ni del recurso;
// - respeta la anticipación mínima y la máxima del negocio;
// - no se encima con reservas confirmadas ni apartados vigentes, dejando bufferMinutes
//   después de cada cita (la existente y la nueva);
// - no se encima con eventos de Google Calendar del recurso (external_busy_blocks).
// Las solicitudes pendientes NO bloquean (RF-27).
//
// Todo se carga en pocas consultas (una por tabla, para varios negocios a la vez) y el cálculo
// es una función pura (daySlots) que se puede probar sin base de datos.
import { and, eq, gt, gte, inArray, lt, lte, or, asc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  businesses,
  services,
  resources,
  resourceServices,
  resourceSchedules,
  closedDays,
  bookings,
  externalBusyBlocks,
} from '../../db/schema.js';
import { DateTime, now } from '../../lib/time.js';
import { APP_TZ } from '../../config/env.js';

/** Días que se revisan para "siguiente horario libre" (RF-65). */
export const NEXT_SLOT_DAYS = 14;

/**
 * Anticipación mínima para solicitudes que el negocio debe aceptar a mano. La solicitud vence
 * 1 h antes de la cita (RF-31): con menos de 90 min el negocio no tendría tiempo de responder.
 * Con aceptación automática se usa la anticipación del negocio tal cual.
 */
export const REQUEST_MIN_NOTICE_MINUTES = 90;

const toMinutes = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};

/** Anticipación mínima efectiva en minutos. */
export const effectiveMinNotice = (business) =>
  business.autoAccept
    ? business.minNoticeMinutes
    : Math.max(business.minNoticeMinutes, REQUEST_MIN_NOTICE_MINUTES);

/** 'YYYY-MM-DD' de hoy en la zona de la app. */
export const todayISO = () => now().toISODate();

/** Último día que se puede reservar según maxAdvanceDays. */
export const lastBookableDate = (business) =>
  now().startOf('day').plus({ days: business.maxAdvanceDays }).toISODate();

const dayStart = (date) => DateTime.fromISO(date, { zone: APP_TZ }).startOf('day');

/**
 * Carga lo necesario para calcular horarios de varios negocios entre dos días locales.
 * @param {string[]} businessIds
 * @param {string} fromDate 'YYYY-MM-DD' (inclusive)
 * @param {string} toDate 'YYYY-MM-DD' (inclusive)
 * @returns {Promise<Map<string, object>>} businessId → contexto
 */
export async function loadContexts(businessIds, fromDate, toDate) {
  const out = new Map();
  if (!businessIds.length) return out;
  const bizRows = await db.select().from(businesses).where(inArray(businesses.id, businessIds));
  const svcRows = await db
    .select()
    .from(services)
    .where(and(inArray(services.businessId, businessIds), eq(services.active, true)));
  const resRows = await db
    .select()
    .from(resources)
    .where(and(inArray(resources.businessId, businessIds), eq(resources.active, true)))
    .orderBy(asc(resources.createdAt), asc(resources.name));
  const resIds = resRows.map((r) => r.id);

  for (const b of bizRows) {
    out.set(b.id, {
      business: b,
      services: new Map(),
      resources: [],
      schedules: new Map(),
      closedAll: new Set(),
      closedByResource: new Map(),
      busy: new Map(),
    });
  }
  for (const sv of svcRows) out.get(sv.businessId).services.set(sv.id, sv);
  const resById = new Map();
  for (const r of resRows) {
    const item = { id: r.id, name: r.name, businessId: r.businessId, services: new Set() };
    resById.set(r.id, item);
    out.get(r.businessId).resources.push(item);
  }
  if (!resIds.length) return out;

  const links = await db
    .select()
    .from(resourceServices)
    .where(inArray(resourceServices.resourceId, resIds));
  for (const l of links) {
    const r = resById.get(l.resourceId);
    if (out.get(r.businessId).services.has(l.serviceId)) r.services.add(l.serviceId);
  }

  const sched = await db
    .select()
    .from(resourceSchedules)
    .where(inArray(resourceSchedules.resourceId, resIds));
  for (const sc of sched) {
    const ctx = out.get(resById.get(sc.resourceId).businessId);
    if (!ctx.schedules.has(sc.resourceId)) ctx.schedules.set(sc.resourceId, new Map());
    const byDay = ctx.schedules.get(sc.resourceId);
    if (!byDay.has(sc.weekday)) byDay.set(sc.weekday, []);
    byDay.get(sc.weekday).push([toMinutes(sc.startTime), toMinutes(sc.endTime)]);
  }
  for (const ctx of out.values())
    for (const byDay of ctx.schedules.values())
      for (const blocks of byDay.values()) blocks.sort((a, b) => a[0] - b[0]);

  const closed = await db
    .select()
    .from(closedDays)
    .where(
      and(
        inArray(closedDays.businessId, businessIds),
        gte(closedDays.date, fromDate),
        lte(closedDays.date, toDate),
      ),
    );
  for (const c of closed) {
    const ctx = out.get(c.businessId);
    if (!c.resourceId) ctx.closedAll.add(c.date);
    else {
      if (!ctx.closedByResource.has(c.resourceId))
        ctx.closedByResource.set(c.resourceId, new Set());
      ctx.closedByResource.get(c.resourceId).add(c.date);
    }
  }

  // Margen de un día a cada lado para cubrir citas que cruzan la medianoche y el buffer.
  const rangeStart = dayStart(fromDate).minus({ days: 1 }).toJSDate();
  const rangeEnd = dayStart(toDate).plus({ days: 2 }).toJSDate();
  const nowJs = now().toJSDate();
  const taken = await db
    .select({
      resourceId: bookings.resourceId,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.resourceId, resIds),
        lt(bookings.startsAt, rangeEnd),
        gt(bookings.endsAt, rangeStart),
        or(
          eq(bookings.status, 'confirmed'),
          and(eq(bookings.status, 'hold'), gt(bookings.holdExpiresAt, nowJs)),
        ),
      ),
    );
  const external = await db
    .select({
      resourceId: externalBusyBlocks.resourceId,
      startsAt: externalBusyBlocks.startsAt,
      endsAt: externalBusyBlocks.endsAt,
    })
    .from(externalBusyBlocks)
    .where(
      and(
        inArray(externalBusyBlocks.resourceId, resIds),
        lt(externalBusyBlocks.startsAt, rangeEnd),
        gt(externalBusyBlocks.endsAt, rangeStart),
      ),
    );
  const pushBusy = (row, isBooking) => {
    const ctx = out.get(resById.get(row.resourceId).businessId);
    if (!ctx.busy.has(row.resourceId)) ctx.busy.set(row.resourceId, []);
    ctx.busy
      .get(row.resourceId)
      .push({ start: row.startsAt.getTime(), end: row.endsAt.getTime(), isBooking });
  };
  for (const t of taken) pushBusy(t, true);
  for (const e of external) pushBusy(e, false);
  return out;
}

/** Carga el contexto de un solo negocio. */
export async function loadContext(businessId, fromDate, toDate) {
  const map = await loadContexts([businessId], fromDate, toDate);
  return map.get(businessId) ?? null;
}

/** Recursos activos que dan el servicio (para "cualquiera"). */
export const resourcesForService = (ctx, serviceId) =>
  ctx.resources.filter((r) => r.services.has(serviceId));

/**
 * Inicios libres de UN recurso en un día, para una duración dada.
 * @returns {DateTime[]}
 */
export function resourceDaySlots(ctx, resource, date, durationMin, { first = false } = {}) {
  const b = ctx.business;
  if (ctx.closedAll.has(date) || ctx.closedByResource.get(resource.id)?.has(date)) return [];
  const today = todayISO();
  if (date < today || date > lastBookableDate(b)) return [];
  const day = dayStart(date);
  const blocks = ctx.schedules.get(resource.id)?.get(day.weekday % 7) ?? [];
  if (!blocks.length) return [];
  const earliest = now().toMillis() + effectiveMinNotice(b) * 60_000;
  const interval = b.slotIntervalMinutes;
  const bufferMs = b.bufferMinutes * 60_000;
  const busy = ctx.busy.get(resource.id) ?? [];
  const out = [];
  for (const [blockStart, blockEnd] of blocks) {
    for (let m = blockStart; m + durationMin <= blockEnd; m += interval) {
      // set() respeta la hora local aunque ese día cambie el horario de verano.
      const start = day.set({ hour: Math.floor(m / 60), minute: m % 60 });
      const s = start.toMillis();
      if (s < earliest) continue;
      const e = s + durationMin * 60_000;
      const clash = busy.some((x) =>
        x.isBooking ? s < x.end + bufferMs && x.start < e + bufferMs : s < x.end && x.start < e,
      );
      if (clash) continue;
      out.push(start);
      if (first) return out;
    }
  }
  return out;
}

/**
 * Horarios libres de un día. resourceId null = "cualquiera": se agrupan por hora y cada horario
 * guarda qué recursos están libres.
 * @returns {{ time: string, startsAt: string, resourceIds: string[] }[]}
 */
export function daySlots(ctx, { serviceId, resourceId = null, date }) {
  const service = ctx.services.get(serviceId);
  if (!service) return [];
  const candidates = resourceId
    ? ctx.resources.filter((r) => r.id === resourceId && r.services.has(serviceId))
    : resourcesForService(ctx, serviceId);
  const byTime = new Map();
  for (const r of candidates) {
    for (const start of resourceDaySlots(ctx, r, date, service.durationMin)) {
      const key = start.toMillis();
      if (!byTime.has(key)) byTime.set(key, { start, resourceIds: [] });
      byTime.get(key).resourceIds.push(r.id);
    }
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, { start, resourceIds }]) => ({
      time: start.toFormat('HH:mm'),
      startsAt: start.toUTC().toISO(),
      resourceIds,
    }));
}

/**
 * Primer horario libre del negocio a partir de hoy (máx. NEXT_SLOT_DAYS días) (RF-65).
 * Para cada recurso usa su servicio más corto (si cabe el más corto no hay un horario más
 * temprano con otro). serviceIds limita los servicios (filtro de tipo de servicio).
 * minTime ('HH:mm') y onlyDate permiten los filtros de día y hora de la búsqueda.
 * @returns {DateTime|null}
 */
export function nextFreeSlot(ctx, { serviceIds = null, onlyDate = null, minTime = null } = {}) {
  const allowed = (id) => !serviceIds || serviceIds.has(id);
  const durations = [];
  for (const r of ctx.resources) {
    let min = Infinity;
    for (const id of r.services)
      if (allowed(id)) min = Math.min(min, ctx.services.get(id).durationMin);
    if (min !== Infinity) durations.push([r, min]);
  }
  if (!durations.length) return null;
  const start = now().startOf('day');
  const days = onlyDate ? [onlyDate] : [];
  if (!onlyDate)
    for (let i = 0; i < NEXT_SLOT_DAYS; i++) days.push(start.plus({ days: i }).toISODate());
  const minMinutes = minTime ? toMinutes(minTime) : 0;
  for (const date of days) {
    let best = null;
    for (const [r, dur] of durations) {
      const slots = resourceDaySlots(ctx, r, date, dur, { first: !minTime });
      const hit = slots.find((x) => x.hour * 60 + x.minute >= minMinutes);
      if (hit && (!best || hit < best)) best = hit;
    }
    if (best) return best;
  }
  return null;
}

/**
 * Qué días tienen al menos un horario libre (tira de fechas del flujo de reservar).
 * @returns {{ date: string, available: boolean, count: number }[]}
 */
export function availableDays(ctx, { serviceId, resourceId = null, from, days }) {
  const out = [];
  const start = dayStart(from);
  for (let i = 0; i < days; i++) {
    const date = start.plus({ days: i }).toISODate();
    const count = daySlots(ctx, { serviceId, resourceId, date }).length;
    out.push({ date, available: count > 0, count });
  }
  return out;
}
