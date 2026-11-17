// Lecturas del módulo de operación: cola de solicitudes, agenda del día, lista de reservas,
// panel del dueño, estadísticas e historial de pagos.
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  bookings,
  closedDays,
  externalBusyBlocks,
  payments,
  resourceSchedules,
  resources,
  reviews,
  services,
  users,
} from '../../db/schema.js';
import { APP_TZ } from '../../config/env.js';
import { now, nowDate, toLocal } from '../../lib/time.js';
import { notFound } from '../../lib/errors.js';
import { isRequest } from './actions.js';
import { dayRange, hhmm, selectBookings, shapeBooking, shortName, todayISO } from './common.js';

/** Solicitudes que el negocio todavía puede aceptar: futuras y sin vencer. */
const openRequest = (t) =>
  and(
    isRequest(),
    gt(bookings.startsAt, t),
    or(isNull(bookings.respondBy), gt(bookings.respondBy, t)),
  );

/** Estados que ocupan la agenda. */
const AGENDA_STATUSES = ['confirmed', 'hold', 'completed', 'no_show'];
/** Estados que cuentan como cita atendida o por atender (estadísticas, panel). */
const BOOKED = ['confirmed', 'completed', 'no_show'];

// ---------- resumen y cola ----------

export async function summary(businessId) {
  const t = nowDate();
  const { start, end } = dayRange(todayISO());
  const [{ pendingRequests }] = await db
    .select({ pendingRequests: sql`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.businessId, businessId), openRequest(t)));
  const [{ todayBookings }] = await db
    .select({ todayBookings: sql`count(*)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.businessId, businessId),
        inArray(bookings.status, AGENDA_STATUSES),
        gte(bookings.startsAt, start),
        lt(bookings.startsAt, end),
      ),
    );
  return { pendingRequests, todayBookings };
}

/**
 * Cola de solicitudes agrupada por horario (RF-28): un grupo junta las solicitudes del mismo
 * recurso que se enciman (directa o encadenadamente). Grupos por fecha de la cita; dentro de
 * cada grupo, la primera en llegar arriba y marcada con `first`.
 */
export async function listRequests(businessId) {
  const rows = await selectBookings()
    .where(and(eq(bookings.businessId, businessId), openRequest(nowDate())))
    .orderBy(asc(bookings.startsAt), asc(bookings.submittedAt));
  const items = rows.map((r) => {
    const b = shapeBooking(r);
    return {
      id: b.id,
      status: b.status,
      client: b.client,
      service: b.service,
      resource: b.resource,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      durationMin: b.durationMin,
      amountCents: b.payment?.amountCents ?? b.priceCents,
      submittedAt: b.submittedAt,
      respondBy: b.respondBy,
    };
  });

  const groups = [];
  const open = new Map(); // resourceId → grupo abierto (con su fin máximo)
  for (const it of items) {
    let g = open.get(it.resource.id);
    if (!g || it.startsAt >= g.endsAt) {
      g = { resource: it.resource, startsAt: it.startsAt, endsAt: it.endsAt, requests: [] };
      groups.push(g);
      open.set(it.resource.id, g);
    }
    g.requests.push(it);
    if (it.endsAt > g.endsAt) g.endsAt = it.endsAt;
  }

  for (const g of groups) {
    g.requests.sort((a, b) => a.submittedAt - b.submittedAt);
    g.requests.forEach((r, i) => {
      r.first = i === 0;
      r.overlapsWith = g.requests
        .filter((o) => o.id !== r.id && o.startsAt < r.endsAt && o.endsAt > r.startsAt)
        .map((o) => ({ id: o.id, shortName: o.client.shortName }));
    });
    g.id = g.requests[0].id;
    g.respondBy = g.requests.reduce(
      (min, r) => (r.respondBy && (!min || r.respondBy < min) ? r.respondBy : min),
      null,
    );
  }
  groups.sort((a, b) => a.startsAt - b.startsAt || a.resource.name.localeCompare(b.resource.name));
  return {
    groups: groups.map((g) => ({
      id: g.id,
      resource: g.resource,
      startsAt: g.startsAt,
      endsAt: g.endsAt,
      respondBy: g.respondBy,
      requests: g.requests,
    })),
    total: items.length,
  };
}

// ---------- agenda del día (app y link en vivo) ----------

/**
 * Agenda de un día con una columna por recurso (RF-44, RF-46).
 * publicView = true para el link en vivo: solo nombre corto, servicio y hora (RF-47).
 */
export async function buildAgenda({ businessId, date, resourceId = null, publicView = false }) {
  const { start, end, dt } = dayRange(date);
  const weekday = dt.weekday % 7;

  const dayBookingsWhere = and(
    eq(bookings.businessId, businessId),
    inArray(bookings.status, publicView ? BOOKED : AGENDA_STATUSES),
    lt(bookings.startsAt, end),
    gt(bookings.endsAt, start),
    resourceId ? eq(bookings.resourceId, resourceId) : undefined,
  );
  const dayBookings = await selectBookings()
    .where(dayBookingsWhere)
    .orderBy(asc(bookings.startsAt));

  // Recursos activos más los inactivos que tengan citas ese día.
  const withBookings = [...new Set(dayBookings.map((b) => b.resourceId))];
  const resRows = await db
    .select()
    .from(resources)
    .where(
      and(
        eq(resources.businessId, businessId),
        resourceId ? eq(resources.id, resourceId) : undefined,
        withBookings.length
          ? or(eq(resources.active, true), inArray(resources.id, withBookings))
          : eq(resources.active, true),
      ),
    )
    .orderBy(asc(resources.createdAt), asc(resources.name));
  const ids = resRows.map((r) => r.id);

  const [schedules, busy, closed, requests] = await Promise.all([
    ids.length
      ? db
          .select()
          .from(resourceSchedules)
          .where(
            and(inArray(resourceSchedules.resourceId, ids), eq(resourceSchedules.weekday, weekday)),
          )
          .orderBy(asc(resourceSchedules.startTime))
      : [],
    ids.length
      ? db
          .select()
          .from(externalBusyBlocks)
          .where(
            and(
              inArray(externalBusyBlocks.resourceId, ids),
              lt(externalBusyBlocks.startsAt, end),
              gt(externalBusyBlocks.endsAt, start),
            ),
          )
          .orderBy(asc(externalBusyBlocks.startsAt))
      : [],
    db
      .select()
      .from(closedDays)
      .where(and(eq(closedDays.businessId, businessId), eq(closedDays.date, date))),
    publicView || !ids.length
      ? []
      : selectBookings()
          .where(
            and(
              eq(bookings.businessId, businessId),
              inArray(bookings.resourceId, ids),
              openRequest(nowDate()),
              lt(bookings.startsAt, end),
              gt(bookings.endsAt, start),
            ),
          )
          .orderBy(asc(bookings.startsAt)),
  ]);

  const wholeClosed = closed.find((c) => !c.resourceId);
  const columns = resRows.map((r) => {
    const closedRow = wholeClosed ?? closed.find((c) => c.resourceId === r.id);
    const item = (b) => {
      const base = {
        id: b.id,
        status: b.status,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        clientName: shortName(b.clientFirstName, b.clientLastName),
        serviceName: b.serviceName,
      };
      return publicView ? base : { ...base, submittedAt: b.submittedAt, respondBy: b.respondBy };
    };
    return {
      id: r.id,
      name: r.name,
      title: r.title,
      color: r.color,
      schedule: schedules
        .filter((s) => s.resourceId === r.id)
        .map((s) => ({ start: hhmm(s.startTime), end: hhmm(s.endTime) })),
      closed: closedRow ? { reason: publicView ? null : closedRow.reason } : null,
      bookings: dayBookings.filter((b) => b.resourceId === r.id).map(item),
      busy: busy
        .filter((x) => x.resourceId === r.id)
        .map((x) =>
          publicView
            ? { startsAt: x.startsAt, endsAt: x.endsAt }
            : { id: x.id, title: x.title, startsAt: x.startsAt, endsAt: x.endsAt },
        ),
      requests: requests.filter((b) => b.resourceId === r.id).map(item),
    };
  });

  // Rango a dibujar: horario de apertura del día, ampliado si hay citas o bloques fuera de él.
  const minutes = (d) => {
    const l = toLocal(d);
    return l < dt ? 0 : l >= dt.plus({ days: 1 }) ? 24 * 60 : l.hour * 60 + l.minute;
  };
  const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  let from = Infinity;
  let to = -Infinity;
  for (const s of schedules) {
    from = Math.min(from, toMin(hhmm(s.startTime)));
    to = Math.max(to, toMin(hhmm(s.endTime)));
  }
  const open = Number.isFinite(from) ? { start: minToStr(from), end: minToStr(to) } : null;
  for (const c of columns) {
    for (const x of [...c.bookings, ...c.busy, ...c.requests]) {
      from = Math.min(from, minutes(x.startsAt));
      to = Math.max(to, minutes(x.endsAt));
    }
  }
  if (!Number.isFinite(from)) {
    from = 9 * 60;
    to = 18 * 60;
  }
  from = Math.floor(from / 60) * 60;
  to = Math.min(24 * 60, Math.ceil(to / 60) * 60);

  return {
    date,
    now: nowDate(),
    open,
    range: { start: minToStr(from), end: minToStr(to) },
    closed: wholeClosed ? { reason: publicView ? null : wholeClosed.reason } : null,
    resources: columns,
  };
}

const minToStr = (m) =>
  m >= 24 * 60
    ? '24:00'
    : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// ---------- reservas ----------

/** Lista paginada con filtros. Los borradores sin pagar no son reservas todavía. */
export async function listBookings(businessId, { status, from, to, q, page, pageSize }) {
  const conds = [
    eq(bookings.businessId, businessId),
    sql`not (${bookings.status} = 'pending' and ${bookings.submittedAt} is null)`,
  ];
  if (status?.length) conds.push(inArray(bookings.status, status));
  if (from) conds.push(gte(bookings.startsAt, dayRange(from).start));
  if (to) conds.push(lt(bookings.startsAt, dayRange(to).end));
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(
      sql`(${users.firstName} || ' ' || ${users.lastName} ilike ${like} or ${users.email} ilike ${like} or ${users.phone} ilike ${like})`,
    );
  }
  const where = and(...conds);
  const [{ total }] = await db
    .select({ total: sql`count(*)::int` })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.clientId))
    .where(where);
  const rows = await selectBookings()
    .where(where)
    .orderBy(desc(bookings.startsAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items: rows.map(shapeBooking), total, page, pageSize };
}

/** Detalle de una reserva del negocio, con las acciones que se pueden hacer ahora. */
export async function bookingDetail(businessId, bookingId) {
  const [row] = await selectBookings().where(
    and(eq(bookings.id, bookingId), eq(bookings.businessId, businessId)),
  );
  if (!row) throw notFound('No encontramos esa reserva');
  const b = shapeBooking(row);
  const t = nowDate();
  const isOpenRequest =
    b.status === 'pending' &&
    Boolean(b.submittedAt) &&
    b.startsAt > t &&
    (!b.respondBy || b.respondBy > t);
  const [review] = await db
    .select({ rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt })
    .from(reviews)
    .where(eq(reviews.bookingId, b.id));
  return {
    ...b,
    review: review ?? null,
    actions: {
      accept: isOpenRequest,
      reject: isOpenRequest,
      noShow: ['confirmed', 'completed'].includes(b.status) && b.startsAt <= t,
      cancel: b.status === 'confirmed',
    },
  };
}

// ---------- panel del dueño ----------

/** Cobrado menos reembolsado en [from, to). */
async function netRevenue(businessId, from, to) {
  const [r] = (
    await db.execute(sql`
      select
        coalesce(sum(case when p.captured_at >= ${from} and p.captured_at < ${to} then p.amount_cents end), 0)::int as "captured",
        coalesce(sum(case when p.status = 'refunded' and p.refunded_at >= ${from} and p.refunded_at < ${to} then p.amount_cents end), 0)::int as "refunded"
      from ${payments} p join ${bookings} b on b.id = p.booking_id
      where b.business_id = ${businessId}
    `)
  ).rows;
  return r.captured - r.refunded;
}

export async function dashboard(business) {
  const businessId = business.id;
  const T = now();
  const monthStart = T.startOf('month');
  const weekStart = T.startOf('week');
  const prevMonthStart = monthStart.minus({ months: 1 });
  const nextMonth = monthStart.plus({ months: 1 }).toJSDate();
  const nextWeek = weekStart.plus({ weeks: 1 }).toJSDate();

  const [monthRevenueCents, prevMonthRevenueCents, weekRevenueCents, sum] = await Promise.all([
    netRevenue(businessId, monthStart.toJSDate(), nextMonth),
    netRevenue(businessId, prevMonthStart.toJSDate(), monthStart.toJSDate()),
    netRevenue(businessId, weekStart.toJSDate(), nextWeek),
    summary(businessId),
  ]);

  const [counts] = (
    await db.execute(sql`
      select
        count(*) filter (where status in ('confirmed', 'completed', 'no_show'))::int as "booked",
        count(*) filter (where status = 'cancelled')::int as "cancelled"
      from ${bookings}
      where business_id = ${businessId} and starts_at >= ${monthStart.toJSDate()} and starts_at < ${nextMonth}
    `)
  ).rows;

  const byDayRows = (
    await db.execute(sql`
      select to_char(starts_at at time zone ${APP_TZ}, 'YYYY-MM-DD') as "date", count(*)::int as "count"
      from ${bookings}
      where business_id = ${businessId} and status in ('confirmed', 'completed', 'no_show', 'hold')
        and starts_at >= ${weekStart.toJSDate()} and starts_at < ${nextWeek}
      group by 1
    `)
  ).rows;
  const bookingsByDay = Array.from({ length: 7 }, (_, i) => {
    const date = weekStart.plus({ days: i }).toISODate();
    return { date, count: byDayRows.find((r) => r.date === date)?.count ?? 0 };
  });

  const upcoming = await selectBookings()
    .where(
      and(
        eq(bookings.businessId, businessId),
        eq(bookings.status, 'confirmed'),
        gte(bookings.startsAt, T.toJSDate()),
      ),
    )
    .orderBy(asc(bookings.startsAt))
    .limit(5);

  const [extra] = (
    await db.execute(sql`
      select
        (select count(*) from ${services} where business_id = ${businessId} and active)::int as "services",
        (select count(*) from ${resources} where business_id = ${businessId} and active)::int as "resources",
        (select count(*) from ${reviews} where business_id = ${businessId} and created_at >= ${monthStart.toJSDate()})::int as "newReviews"
    `)
  ).rows;

  return {
    month: monthStart.toISODate(),
    weekStart: weekStart.toISODate(),
    revenue: {
      monthCents: monthRevenueCents,
      prevMonthCents: prevMonthRevenueCents,
      weekCents: weekRevenueCents,
    },
    monthBookings: counts.booked,
    monthCancelled: counts.cancelled,
    todayBookings: sum.todayBookings,
    pendingRequests: sum.pendingRequests,
    rating: {
      avg: Number(business.ratingAvg),
      count: business.ratingCount,
      newThisMonth: extra.newReviews,
    },
    bookingsByDay,
    upcoming: upcoming.map((r) => ({
      id: r.id,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      clientName: shortName(r.clientFirstName, r.clientLastName),
      serviceName: r.serviceName,
      resource: { id: r.resourceId, name: r.resourceName, color: r.resourceColor },
    })),
    setup: {
      activeServices: extra.services,
      activeResources: extra.resources,
      cancellationLimitHours: business.cancellationLimitHours,
      googleConnected: Boolean(business.googleConnectedAt),
    },
  };
}

// ---------- estadísticas (RF-51) ----------

export async function stats(businessId, weeks) {
  const T = now();
  const fromDt = T.startOf('week').minus({ weeks: weeks - 1 });
  const from = fromDt.toJSDate();
  const to = T.startOf('week').plus({ weeks: 1 }).toJSDate();
  const week = (col) =>
    sql`to_char(date_trunc('week', ${col} at time zone ${APP_TZ}), 'YYYY-MM-DD')`;

  const [moneyRows, bookingRows, top, hours] = await Promise.all([
    db.execute(sql`
      select w as "week", sum(captured)::int as "captured", sum(refunded)::int as "refunded" from (
        select ${week(sql`p.captured_at`)} as w, p.amount_cents as captured, 0 as refunded
        from ${payments} p join ${bookings} b on b.id = p.booking_id
        where b.business_id = ${businessId} and p.captured_at >= ${from} and p.captured_at < ${to}
        union all
        select ${week(sql`p.refunded_at`)}, 0, p.amount_cents
        from ${payments} p join ${bookings} b on b.id = p.booking_id
        where b.business_id = ${businessId} and p.status = 'refunded' and p.refunded_at >= ${from} and p.refunded_at < ${to}
      ) x group by w
    `),
    db.execute(sql`
      select ${week(sql`starts_at`)} as "week", count(*)::int as "count"
      from ${bookings}
      where business_id = ${businessId} and status in ('confirmed', 'completed', 'no_show')
        and starts_at >= ${from} and starts_at < ${to}
      group by 1
    `),
    db.execute(sql`
      select s.id as "id", s.name as "name", count(*)::int as "count", sum(b.price_cents)::int as "revenueCents"
      from ${bookings} b join ${services} s on s.id = b.service_id
      where b.business_id = ${businessId} and b.status in ('confirmed', 'completed', 'no_show')
        and b.starts_at >= ${from} and b.starts_at < ${to}
      group by s.id, s.name
      order by count(*) desc, s.name
      limit 5
    `),
    db.execute(sql`
      select extract(dow from b.starts_at at time zone ${APP_TZ})::int as "weekday",
             extract(hour from b.starts_at at time zone ${APP_TZ})::int as "hour",
             count(*)::int as "count"
      from ${bookings} b
      where b.business_id = ${businessId} and b.status in ('confirmed', 'completed', 'no_show')
        and b.starts_at >= ${from} and b.starts_at < ${to}
      group by 1, 2
      order by 1, 2
    `),
  ]);

  const revenueByWeek = Array.from({ length: weeks }, (_, i) => {
    const weekStart = fromDt.plus({ weeks: i }).toISODate();
    const m = moneyRows.rows.find((r) => r.week === weekStart);
    const captured = m?.captured ?? 0;
    const refunded = m?.refunded ?? 0;
    return {
      weekStart,
      capturedCents: captured,
      refundedCents: refunded,
      netCents: captured - refunded,
      bookings: bookingRows.rows.find((r) => r.week === weekStart)?.count ?? 0,
    };
  });

  return {
    from: fromDt.toISODate(),
    weeks,
    revenueByWeek,
    totals: {
      netCents: revenueByWeek.reduce((a, w) => a + w.netCents, 0),
      bookings: revenueByWeek.reduce((a, w) => a + w.bookings, 0),
    },
    topServices: top.rows,
    busyHours: hours.rows,
  };
}

// ---------- pagos (RF-52, RF-69) ----------

const PAYMENT_HISTORY = ['authorized', 'captured', 'released', 'refunded'];

export async function paymentHistory(businessId, { status, from, to, page, pageSize }) {
  const eventAt = sql`coalesce(${payments.refundedAt}, ${payments.releasedAt}, ${payments.capturedAt}, ${payments.authorizedAt}, ${payments.createdAt})`;
  const conds = [
    eq(bookings.businessId, businessId),
    inArray(payments.status, status?.length ? status : PAYMENT_HISTORY),
  ];
  if (from) conds.push(sql`${eventAt} >= ${dayRange(from).start}`);
  if (to) conds.push(sql`${eventAt} < ${dayRange(to).end}`);
  const where = and(...conds);

  const base = () =>
    db
      .select({
        id: payments.id,
        bookingId: bookings.id,
        status: payments.status,
        amountCents: payments.amountCents,
        authorizedAt: payments.authorizedAt,
        capturedAt: payments.capturedAt,
        releasedAt: payments.releasedAt,
        refundedAt: payments.refundedAt,
        eventAt: sql`${eventAt}`.mapWith(payments.createdAt),
        bookingStatus: bookings.status,
        startsAt: bookings.startsAt,
        cancelledBy: bookings.cancelledBy,
        clientFirstName: users.firstName,
        clientLastName: users.lastName,
        serviceName: services.name,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(users, eq(users.id, bookings.clientId))
      .innerJoin(services, eq(services.id, bookings.serviceId));

  const [totals] = await db
    .select({
      count: sql`count(*)::int`,
      capturedCents: sql`coalesce(sum(${payments.amountCents}) filter (where ${payments.capturedAt} is not null), 0)::int`,
      refundedCents: sql`coalesce(sum(${payments.amountCents}) filter (where ${payments.status} = 'refunded'), 0)::int`,
      releasedCents: sql`coalesce(sum(${payments.amountCents}) filter (where ${payments.status} = 'released'), 0)::int`,
      authorizedCents: sql`coalesce(sum(${payments.amountCents}) filter (where ${payments.status} = 'authorized'), 0)::int`,
    })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .where(where);

  const rows = await base()
    .where(where)
    .orderBy(desc(eventAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    items: rows.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      status: r.status,
      amountCents: r.amountCents,
      date: r.eventAt,
      authorizedAt: r.authorizedAt,
      capturedAt: r.capturedAt,
      releasedAt: r.releasedAt,
      refundedAt: r.refundedAt,
      booking: { status: r.bookingStatus, startsAt: r.startsAt, cancelledBy: r.cancelledBy },
      client: {
        name: `${r.clientFirstName} ${r.clientLastName}`.trim(),
        shortName: shortName(r.clientFirstName, r.clientLastName),
      },
      serviceName: r.serviceName,
    })),
    totals: {
      capturedCents: totals.capturedCents,
      refundedCents: totals.refundedCents,
      netCents: totals.capturedCents - totals.refundedCents,
      releasedCents: totals.releasedCents,
      authorizedCents: totals.authorizedCents,
    },
    total: totals.count,
    page,
    pageSize,
  };
}
