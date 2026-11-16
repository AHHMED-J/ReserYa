// Inicio, búsqueda, perfil del negocio y horarios libres (RF-21–RF-24, RF-49, RF-58, RF-59,
// RF-61, RF-62, RF-64, RF-65, RNF-05). Visible sin sesión; con sesión de cliente se personaliza.
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, gt, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  businesses,
  categories,
  businessPhotos,
  services,
  resources,
  resourceServices,
  resourceSchedules,
  closedDays,
  bookings,
  reviews,
  users,
  businessViews,
} from '../../db/schema.js';
import { validate } from '../../middleware/validate.js';
import { notFound } from '../../lib/errors.js';
import { businessIsListed } from '../../lib/businessReady.js';
import { photoUrl } from '../../lib/storage.js';
import { DateTime, now, nowDate } from '../../lib/time.js';
import * as v from '../../lib/validators.js';
import { cardsByIds, topRated, searchBusinesses, nextSlotsFor } from './cards.js';
import {
  loadContext,
  daySlots,
  availableDays,
  effectiveMinNotice,
  lastBookableDate,
} from './availability.js';

export const router = Router();

const isClient = (req) => req.user?.role === 'client';

// ---------- inicio ----------
router.get('/home', async (req, res) => {
  const recommended = await topRated(7);
  const out = {
    recent: [],
    reviewPrompt: null,
    hasBookings: false,
    nextBooking: null,
    featured: recommended[0] ?? null,
    recommended: recommended.slice(1),
  };
  if (!isClient(req)) return res.json(out);
  const uid = req.user.id;

  // Recientes: vistos o reservados (RF-58).
  const recentRows = (
    await db.execute(sql`
      select business_id as id, max(at) as at from (
        select ${businessViews.businessId} as business_id, ${businessViews.lastViewedAt} as at
          from ${businessViews} where ${businessViews.userId} = ${uid}
        union all
        select ${bookings.businessId}, ${bookings.createdAt}
          from ${bookings} where ${bookings.clientId} = ${uid} and ${bookings.submittedAt} is not null
      ) x group by business_id order by max(at) desc limit 8
    `)
  ).rows;
  out.recent = await cardsByIds(recentRows.map((r) => r.id));

  const [any] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.clientId, uid), isNotNull(bookings.submittedAt)))
    .limit(1);
  out.hasBookings = Boolean(any);

  // Última cita completada sin reseña (RF-61).
  const [toReview] = await db
    .select({
      bookingId: bookings.id,
      startsAt: bookings.startsAt,
      businessId: businesses.id,
      businessName: businesses.name,
      serviceName: services.name,
    })
    .from(bookings)
    .innerJoin(businesses, eq(businesses.id, bookings.businessId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(reviews, eq(reviews.bookingId, bookings.id))
    .where(
      and(eq(bookings.clientId, uid), eq(bookings.status, 'completed'), sql`${reviews.id} is null`),
    )
    .orderBy(desc(bookings.startsAt))
    .limit(1);
  out.reviewPrompt = toReview ?? null;

  const [next] = await db
    .select({
      id: bookings.id,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      businessName: businesses.name,
      serviceName: services.name,
      resourceName: resources.name,
    })
    .from(bookings)
    .innerJoin(businesses, eq(businesses.id, bookings.businessId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .where(
      and(
        eq(bookings.clientId, uid),
        eq(bookings.status, 'confirmed'),
        gt(bookings.startsAt, nowDate()),
      ),
    )
    .orderBy(asc(bookings.startsAt))
    .limit(1);
  out.nextBooking = next ?? null;
  res.json(out);
});

// ---------- búsqueda ----------
const list = (inner) =>
  z.preprocess(
    (val) =>
      val === undefined
        ? undefined
        : (Array.isArray(val) ? val : String(val).split(',')).filter(Boolean),
    z.array(inner).max(9),
  );
const boolish = z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean());
const pesos = z.coerce
  .number()
  .nonnegative()
  .max(1_000_000)
  .transform((x) => Math.round(x * 100));

const searchQuery = z.object({
  q: z.string().trim().max(80).optional(),
  categories: list(z.string().max(40)).optional(),
  service: z.string().trim().max(80).optional(),
  date: v.isoDate.optional(),
  time: v.hhmm.optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  // Pesos (como los escribe el cliente); se pasan a centavos.
  minPrice: pesos.optional(),
  maxPrice: pesos.optional(),
  availableToday: boolish.optional(),
  sort: z.enum(['rating', 'price', 'next']).default('rating'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(10),
});

router.get('/businesses', validate({ query: searchQuery }), async (req, res) => {
  const f = { ...req.valid.query };
  if (f.q === '') delete f.q;
  if (f.service === '') delete f.service;
  res.json(await searchBusinesses(f));
});

// ---------- perfil del negocio (RF-23, RF-49) ----------
async function listedBusiness(id) {
  const [row] = await db
    .select({ business: businesses, category: categories })
    .from(businesses)
    .innerJoin(categories, eq(categories.id, businesses.categoryId))
    .where(and(eq(businesses.id, id), businessIsListed()));
  if (!row) throw notFound('Este negocio no existe o no está disponible');
  return row;
}

const hhmm = (t) => String(t).slice(0, 5);

/** Une rangos [inicio, fin] en 'HH:mm' que se enciman. */
function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a[0].localeCompare(b[0]));
  const out = [];
  for (const [s, e] of sorted) {
    const last = out.at(-1);
    if (last && s <= last[1]) last[1] = e > last[1] ? e : last[1];
    else out.push([s, e]);
  }
  return out;
}

router.get('/businesses/:id', validate({ params: v.idParam }), async (req, res) => {
  const { business: b, category } = await listedBusiness(req.valid.params.id);
  const photos = await db
    .select()
    .from(businessPhotos)
    .where(eq(businessPhotos.businessId, b.id))
    .orderBy(asc(businessPhotos.sortOrder), asc(businessPhotos.createdAt));
  const svcRows = await db
    .select()
    .from(services)
    .where(and(eq(services.businessId, b.id), eq(services.active, true)))
    .orderBy(asc(services.priceCents), asc(services.name));
  const resRows = await db
    .select()
    .from(resources)
    .where(and(eq(resources.businessId, b.id), eq(resources.active, true)))
    .orderBy(asc(resources.createdAt), asc(resources.name));
  const links = await db
    .select({ resourceId: resourceServices.resourceId, serviceId: resourceServices.serviceId })
    .from(resourceServices)
    .innerJoin(resources, eq(resources.id, resourceServices.resourceId))
    .where(eq(resources.businessId, b.id));
  const schedules = await db
    .select({
      resourceId: resourceSchedules.resourceId,
      weekday: resourceSchedules.weekday,
      startTime: resourceSchedules.startTime,
      endTime: resourceSchedules.endTime,
    })
    .from(resourceSchedules)
    .innerJoin(resources, eq(resources.id, resourceSchedules.resourceId))
    .where(and(eq(resources.businessId, b.id), eq(resources.active, true)));
  const today = now().toISODate();
  const closedToday = await db
    .select({ resourceId: closedDays.resourceId })
    .from(closedDays)
    .where(and(eq(closedDays.businessId, b.id), eq(closedDays.date, today)));

  const activeSvc = new Set(svcRows.map((sv) => sv.id));
  const resourcesOut = resRows
    .map((r) => ({
      id: r.id,
      name: r.name,
      title: r.title,
      kind: r.kind,
      color: r.color,
      serviceIds: links
        .filter((l) => l.resourceId === r.id && activeSvc.has(l.serviceId))
        .map((l) => l.serviceId),
    }))
    .filter((r) => r.serviceIds.length);
  const offered = new Set(resourcesOut.flatMap((r) => r.serviceIds));
  const servicesOut = svcRows
    .filter((sv) => offered.has(sv.id))
    .map((sv) => ({
      id: sv.id,
      name: sv.name,
      description: sv.description,
      durationMin: sv.durationMin,
      priceCents: sv.priceCents,
      resourceIds: resourcesOut.filter((r) => r.serviceIds.includes(sv.id)).map((r) => r.id),
    }));

  // Horario del negocio = unión de los horarios de su equipo, por día (0 = domingo).
  const workingIds = new Set(resourcesOut.map((r) => r.id));
  const week = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    ranges: mergeRanges(
      schedules
        .filter((sc) => sc.weekday === weekday && workingIds.has(sc.resourceId))
        .map((sc) => [hhmm(sc.startTime), hhmm(sc.endTime)]),
    ),
  }));
  const todayWeekday = now().weekday % 7;
  const closedAllToday = closedToday.some((c) => !c.resourceId);
  const todayRanges = closedAllToday ? [] : week[todayWeekday].ranges;
  const nowHHmm = now().toFormat('HH:mm');
  const openNow = todayRanges.some(([s, e]) => s <= nowHHmm && nowHHmm < e);

  const next = await nextSlotsFor([b.id]);
  const recentReviews = await reviewPage(b.id, 1, 3);

  if (isClient(req)) {
    await db
      .insert(businessViews)
      .values({ userId: req.user.id, businessId: b.id, lastViewedAt: nowDate() })
      .onConflictDoUpdate({
        target: [businessViews.userId, businessViews.businessId],
        set: { lastViewedAt: nowDate() },
      });
  }

  res.json({
    business: {
      id: b.id,
      name: b.name,
      description: b.description,
      address: b.address,
      phone: b.phone,
      category: { id: category.id, name: category.name, slug: category.slug, icon: category.icon },
      photos: photos.map((p) => ({ id: p.id, url: photoUrl(p.storageKey) })),
      ratingAvg: Number(b.ratingAvg),
      ratingCount: b.ratingCount,
      priceFromCents: servicesOut.length ? Math.min(...servicesOut.map((s) => s.priceCents)) : null,
      nextSlot: next.get(b.id)?.toUTC().toISO() ?? null,
      autoAccept: b.autoAccept,
      rules: {
        cancellationLimitHours: b.cancellationLimitHours,
        minNoticeMinutes: effectiveMinNotice(b),
        maxAdvanceDays: b.maxAdvanceDays,
        slotIntervalMinutes: b.slotIntervalMinutes,
      },
      week,
      today: { ranges: todayRanges, openNow, closed: closedAllToday },
      services: servicesOut,
      resources: resourcesOut,
      reviews: recentReviews.items,
    },
  });
});

async function reviewPage(businessId, page, pageSize) {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
      serviceName: services.name,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.clientId))
    .innerJoin(bookings, eq(bookings.id, reviews.bookingId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(eq(reviews.businessId, businessId))
    .orderBy(desc(reviews.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ total }] = await db
    .select({ total: sql`count(*)`.mapWith(Number) })
    .from(reviews)
    .where(eq(reviews.businessId, businessId));
  return {
    items: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      // Solo nombre e inicial del apellido.
      clientName: `${r.firstName}${r.lastName ? ` ${r.lastName[0]}.` : ''}`,
      serviceName: r.serviceName,
    })),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}

router.get(
  '/businesses/:id/reviews',
  validate({
    params: v.idParam,
    query: z.object({
      page: z.coerce.number().int().min(1).max(1000).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(10),
    }),
  }),
  async (req, res) => {
    const { business } = await listedBusiness(req.valid.params.id);
    res.json(await reviewPage(business.id, req.valid.query.page, req.valid.query.pageSize));
  },
);

// ---------- horarios libres (RF-24) ----------
const slotQuery = z.object({
  serviceId: v.uuid,
  // Vacío o "any" = cualquiera.
  resourceId: z.preprocess((x) => (x === '' || x === 'any' ? undefined : x), v.uuid.optional()),
  date: v.isoDate.optional(),
  from: v.isoDate.optional(),
  days: z.coerce.number().int().min(1).max(62).default(14),
});

async function contextFor(businessId, { serviceId, resourceId }, from, to) {
  await listedBusiness(businessId);
  const ctx = await loadContext(businessId, from, to);
  if (!ctx.services.has(serviceId)) throw notFound('Ese servicio no existe o no está activo');
  if (resourceId && !ctx.resources.some((r) => r.id === resourceId && r.services.has(serviceId)))
    throw notFound('Esa persona o espacio no da este servicio');
  return ctx;
}

router.get(
  '/businesses/:id/availability',
  validate({ params: v.idParam, query: slotQuery }),
  async (req, res) => {
    const q = req.valid.query;
    const date = q.date ?? now().toISODate();
    const ctx = await contextFor(req.valid.params.id, q, date, date);
    res.json({ date, slots: daySlots(ctx, { ...q, date }) });
  },
);

router.get(
  '/businesses/:id/days',
  validate({ params: v.idParam, query: slotQuery }),
  async (req, res) => {
    const q = req.valid.query;
    const today = now().toISODate();
    const from = q.from && q.from > today ? q.from : today;
    const to = DateTime.fromISO(from)
      .plus({ days: q.days - 1 })
      .toISODate();
    const ctx = await contextFor(req.valid.params.id, q, from, to);
    res.json({
      from,
      maxDate: lastBookableDate(ctx.business),
      days: availableDays(ctx, { ...q, from, days: q.days }),
    });
  },
);
