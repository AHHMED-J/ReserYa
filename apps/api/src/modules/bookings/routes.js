// Reservas del cliente: crear y pagar (RF-25–RF-27, RF-32), mis reservas (RF-38), detalle
// (RF-68), cancelar (RF-35) y volver a agendar (RF-60). Montado en /api/bookings.
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNotNull, lte, gt, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  bookings,
  payments,
  businesses,
  categories,
  services,
  resources,
  resourceServices,
  reviews,
  businessPhotos,
} from '../../db/schema.js';
import { validate } from '../../middleware/validate.js';
import { requireRole, requireReadyClient } from '../../middleware/auth.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { businessIsListed } from '../../lib/businessReady.js';
import { photoUrl } from '../../lib/storage.js';
import { nowDate } from '../../lib/time.js';
import { paymentMode, fetchStatus, isFake } from '../../lib/payments.js';
import * as v from '../../lib/validators.js';
import { createDraft, applyAuthorized, cancelByClient } from './service.js';

export const router = Router();
const client = requireRole('client');
const HOUR = 3600_000;

// ---------- consulta común ----------
const firstPhoto = sql`(select ${businessPhotos.storageKey} from ${businessPhotos}
  where ${businessPhotos.businessId} = ${businesses.id}
  order by ${businessPhotos.sortOrder}, ${businessPhotos.createdAt} limit 1)`;

const selectBooking = () =>
  db
    .select({
      booking: bookings,
      payStatus: payments.status,
      payAmount: payments.amountCents,
      businessName: businesses.name,
      businessAddress: businesses.address,
      businessPhone: businesses.phone,
      limitHours: businesses.cancellationLimitHours,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      photoKey: firstPhoto,
      serviceName: services.name,
      resourceName: resources.name,
      resourceKind: resources.kind,
      reviewRating: reviews.rating,
      reviewComment: reviews.comment,
    })
    .from(bookings)
    .innerJoin(businesses, eq(businesses.id, bookings.businessId))
    .innerJoin(categories, eq(categories.id, businesses.categoryId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .leftJoin(payments, eq(payments.bookingId, bookings.id))
    .leftJoin(reviews, eq(reviews.bookingId, bookings.id));

function toOut(r) {
  const b = r.booking;
  const t = nowDate().getTime();
  const deadline =
    r.limitHours == null ? null : new Date(b.startsAt.getTime() - r.limitHours * HOUR);
  const canCancel =
    b.status === 'pending' ||
    b.status === 'hold' ||
    (b.status === 'confirmed' && deadline && t < deadline.getTime());
  return {
    id: b.id,
    status: b.status,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    priceCents: b.priceCents,
    durationMin: b.durationMin,
    submittedAt: b.submittedAt,
    respondBy: b.respondBy,
    holdExpiresAt: b.holdExpiresAt,
    decidedAt: b.decidedAt,
    cancelledAt: b.cancelledAt,
    cancelledBy: b.cancelledBy,
    cancellationReason: b.cancellationReason,
    completedAt: b.completedAt,
    rebookedFromId: b.rebookedFromId,
    business: {
      id: b.businessId,
      name: r.businessName,
      address: r.businessAddress,
      phone: r.businessPhone,
      category: { name: r.categoryName, icon: r.categoryIcon },
      photoUrl: photoUrl(r.photoKey),
      cancellationLimitHours: r.limitHours,
    },
    service: { id: b.serviceId, name: r.serviceName },
    resource: { id: b.resourceId, name: r.resourceName, kind: r.resourceKind },
    payment: r.payStatus ? { status: r.payStatus, amountCents: r.payAmount } : null,
    review: r.reviewRating ? { rating: r.reviewRating, comment: r.reviewComment } : null,
    cancelDeadline: b.status === 'confirmed' ? deadline : null,
    canCancel: Boolean(canCancel),
    canReview: b.status === 'completed' && !r.reviewRating,
  };
}

// ---------- mis reservas (RF-38) ----------
const TABS = {
  upcoming: () => and(eq(bookings.status, 'confirmed'), gt(bookings.endsAt, nowDate())),
  pending: () => and(eq(bookings.status, 'pending'), isNotNull(bookings.submittedAt)),
  past: () =>
    or(
      inArray(bookings.status, ['completed', 'no_show']),
      and(eq(bookings.status, 'confirmed'), lte(bookings.endsAt, nowDate())),
    ),
  cancelled: () =>
    and(
      inArray(bookings.status, ['cancelled', 'rejected', 'expired']),
      isNotNull(bookings.submittedAt),
    ),
};
const ASCENDING = new Set(['upcoming', 'pending']);

router.get(
  '/',
  client,
  validate({
    query: z.object({
      tab: z.enum(['upcoming', 'pending', 'past', 'cancelled']).default('upcoming'),
      page: z.coerce.number().int().min(1).max(500).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(20),
    }),
  }),
  async (req, res) => {
    const { tab, page, pageSize } = req.valid.query;
    const mine = eq(bookings.clientId, req.user.id);
    const rows = await selectBooking()
      .where(and(mine, TABS[tab]()))
      .orderBy(ASCENDING.has(tab) ? asc(bookings.startsAt) : desc(bookings.startsAt))
      .limit(pageSize + 1)
      .offset((page - 1) * pageSize);
    const [counts] = await db
      .select({
        upcoming: sql`count(*) filter (where ${TABS.upcoming()})`.mapWith(Number),
        pending: sql`count(*) filter (where ${TABS.pending()})`.mapWith(Number),
        past: sql`count(*) filter (where ${TABS.past()})`.mapWith(Number),
        cancelled: sql`count(*) filter (where ${TABS.cancelled()})`.mapWith(Number),
      })
      .from(bookings)
      .where(mine);
    res.json({
      items: rows.slice(0, pageSize).map(toOut),
      counts,
      page,
      hasMore: rows.length > pageSize,
    });
  },
);

// ---------- volver a agendar (RF-60) ----------
router.get('/rebook', client, async (req, res) => {
  const rows = await db
    .selectDistinctOn([bookings.businessId, bookings.serviceId, bookings.resourceId], {
      id: bookings.id,
      startsAt: bookings.startsAt,
      businessId: businesses.id,
      businessName: businesses.name,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      photoKey: firstPhoto,
      serviceId: services.id,
      serviceName: services.name,
      durationMin: services.durationMin,
      priceCents: services.priceCents,
      resourceId: resources.id,
      resourceName: resources.name,
      resourceKind: resources.kind,
    })
    .from(bookings)
    .innerJoin(businesses, eq(businesses.id, bookings.businessId))
    .innerJoin(categories, eq(categories.id, businesses.categoryId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .innerJoin(
      resourceServices,
      and(
        eq(resourceServices.resourceId, bookings.resourceId),
        eq(resourceServices.serviceId, bookings.serviceId),
      ),
    )
    .where(
      and(
        eq(bookings.clientId, req.user.id),
        inArray(bookings.status, ['completed', 'no_show', 'confirmed']),
        lte(bookings.startsAt, nowDate()),
        eq(services.active, true),
        eq(resources.active, true),
        businessIsListed(),
      ),
    )
    .orderBy(bookings.businessId, bookings.serviceId, bookings.resourceId, desc(bookings.startsAt));
  rows.sort((a, b) => b.startsAt - a.startsAt);
  res.json({
    items: rows.map((r) => ({
      bookingId: r.id,
      lastDate: r.startsAt,
      business: {
        id: r.businessId,
        name: r.businessName,
        category: { name: r.categoryName, icon: r.categoryIcon },
        photoUrl: photoUrl(r.photoKey),
      },
      service: {
        id: r.serviceId,
        name: r.serviceName,
        durationMin: r.durationMin,
        priceCents: r.priceCents,
      },
      resource: { id: r.resourceId, name: r.resourceName, kind: r.resourceKind },
    })),
  });
});

// ---------- detalle (RF-68) ----------
async function loadMine(req, id) {
  const [row] = await selectBooking().where(
    and(eq(bookings.id, id), eq(bookings.clientId, req.user.id)),
  );
  if (!row) throw notFound('Reserva no encontrada');
  return row;
}

router.get('/:id', client, validate({ params: v.idParam }), async (req, res) => {
  const row = await loadMine(req, req.valid.params.id);
  const out = toOut(row);
  // ¿Se puede volver a agendar? Negocio visible, servicio y recurso activos.
  const [ok] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .innerJoin(services, eq(services.businessId, businesses.id))
    .innerJoin(resources, eq(resources.businessId, businesses.id))
    .where(
      and(
        eq(businesses.id, row.booking.businessId),
        eq(services.id, row.booking.serviceId),
        eq(resources.id, row.booking.resourceId),
        eq(services.active, true),
        eq(resources.active, true),
        businessIsListed(),
      ),
    );
  out.canRebook = Boolean(ok);
  res.json({ booking: out });
});

// ---------- crear y pagar ----------
const createBody = z.object({
  serviceId: v.uuid,
  resourceId: v.uuid.nullish(),
  startsAt: z.iso.datetime({ offset: true }),
  rebookedFromId: v.uuid.nullish(),
});

router.post('/', requireReadyClient, validate({ body: createBody }), async (req, res) => {
  const out = await createDraft(req.user, req.valid.body);
  res.status(201).json(out);
});

async function respondAfterPayment(req, res, id) {
  const { outcome } = await applyAuthorized(id);
  if (outcome === 'discarded')
    throw conflict(
      'booking_expired',
      'El tiempo para completar el pago terminó. No se te cobró nada; elige el horario otra vez.',
    );
  const row = await loadMine(req, id);
  res.json({ booking: toOut(row), outcome });
}

/** Stripe: la web avisa que confirmPayment terminó. Se verifica con Stripe antes de aplicar. */
router.post('/:id/payment-confirmed', client, validate({ params: v.idParam }), async (req, res) => {
  const row = await loadMine(req, req.valid.params.id);
  const [p] = await db.select().from(payments).where(eq(payments.bookingId, row.booking.id));
  if (!p) throw notFound('Pago no encontrado');
  if (isFake(p.stripePaymentIntentId))
    throw badRequest('fake_payment', 'Este pago es de prueba: usa el pago simulado');
  if (['pending', 'failed'].includes(p.status)) {
    const status = await fetchStatus(p.stripePaymentIntentId);
    if (status !== 'authorized' && status !== 'captured')
      throw badRequest(
        'payment_not_authorized',
        'El pago todavía no se autoriza. Intenta de nuevo.',
      );
  }
  await respondAfterPayment(req, res, row.booking.id);
});

/** Pago simulado (sin llaves de Stripe). Solo existe en modo de prueba. */
router.post('/:id/fake-pay', client, validate({ params: v.idParam }), async (req, res) => {
  if (paymentMode() !== 'fake')
    throw badRequest('not_fake_mode', 'El pago simulado no está disponible');
  const row = await loadMine(req, req.valid.params.id);
  await respondAfterPayment(req, res, row.booking.id);
});

// ---------- cancelar (RF-35) ----------
router.post('/:id/cancel', client, validate({ params: v.idParam }), async (req, res) => {
  await cancelByClient(req.user, req.valid.params.id);
  const row = await loadMine(req, req.valid.params.id);
  res.json({ booking: toOut(row) });
});
