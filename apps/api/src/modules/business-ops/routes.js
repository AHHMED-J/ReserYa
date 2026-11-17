// Operación diaria del negocio (RF-28 a RF-31, RF-36, RF-37, RF-44, RF-45, RF-51, RF-52).
// Montado en /api/business junto con business-setup: aquí solo hay subrutas propias y los
// middlewares van por ruta (nunca router.use global).
//   Recepción = requireActiveBusiness. Dueño = además requireOwnerMode.
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requireActiveBusiness, requireOwnerMode } from '../../middleware/auth.js';
import * as v from '../../lib/validators.js';
import { router as liveLinksRouter } from '../live/links.js';
import { acceptRequest, rejectRequest, markNoShow, cancelByBusiness } from './actions.js';
import {
  summary,
  listRequests,
  buildAgenda,
  listBookings,
  bookingDetail,
  dashboard,
  stats,
  paymentHistory,
} from './queries.js';
import { todayISO } from './common.js';

export const router = Router();
const reception = [requireActiveBusiness];
const owner = [requireActiveBusiness, requireOwnerMode];

const BOOKING_STATUS = [
  'pending',
  'hold',
  'confirmed',
  'rejected',
  'expired',
  'cancelled',
  'completed',
  'no_show',
];
/** "confirmed,completed" o ?status=a&status=b → arreglo validado */
const statusList = (allowed) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((s) =>
      s === undefined
        ? []
        : [s]
            .flat()
            .flatMap((x) => x.split(','))
            .filter(Boolean),
    )
    .pipe(z.array(z.enum(allowed)));
const paging = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

// ---------- recepción ----------

router.get('/summary', ...reception, async (req, res) => {
  res.json(await summary(req.business.id));
});

router.get('/requests', ...reception, async (req, res) => {
  res.json(await listRequests(req.business.id));
});

router.post(
  '/requests/:id/accept',
  ...reception,
  validate({ params: v.idParam }),
  async (req, res) => {
    const { booking, rejected } = await acceptRequest(req.business.id, req.valid.params.id);
    res.json({ booking: await bookingDetail(req.business.id, booking.id), rejected });
  },
);

router.post(
  '/requests/:id/reject',
  ...reception,
  validate({ params: v.idParam }),
  async (req, res) => {
    const b = await rejectRequest(req.business.id, req.valid.params.id);
    res.json({ booking: await bookingDetail(req.business.id, b.id) });
  },
);

router.get(
  '/agenda',
  ...reception,
  validate({ query: z.object({ date: v.isoDate.optional() }) }),
  async (req, res) => {
    res.json(
      await buildAgenda({ businessId: req.business.id, date: req.valid.query.date ?? todayISO() }),
    );
  },
);

router.get(
  '/bookings',
  ...reception,
  validate({
    query: z.object({
      status: statusList(BOOKING_STATUS),
      from: v.isoDate.optional(),
      to: v.isoDate.optional(),
      q: z.string().trim().max(80).optional(),
      ...paging,
    }),
  }),
  async (req, res) => {
    res.json(await listBookings(req.business.id, req.valid.query));
  },
);

router.get('/bookings/:id', ...reception, validate({ params: v.idParam }), async (req, res) => {
  res.json({ booking: await bookingDetail(req.business.id, req.valid.params.id) });
});

router.post(
  '/bookings/:id/no-show',
  ...reception,
  validate({ params: v.idParam }),
  async (req, res) => {
    await markNoShow(req.business.id, req.valid.params.id);
    res.json({ booking: await bookingDetail(req.business.id, req.valid.params.id) });
  },
);

// ---------- modo dueño ----------

router.post(
  '/bookings/:id/cancel',
  ...owner,
  validate({
    params: v.idParam,
    body: z.object({
      reason: z.string().trim().min(5, 'Escribe el motivo (mínimo 5 letras)').max(500),
    }),
  }),
  async (req, res) => {
    await cancelByBusiness(req.business.id, req.valid.params.id, req.valid.body.reason);
    res.json({ booking: await bookingDetail(req.business.id, req.valid.params.id) });
  },
);

router.get('/dashboard', ...owner, async (req, res) => {
  res.json(await dashboard(req.business));
});

router.get(
  '/stats',
  ...owner,
  validate({ query: z.object({ weeks: z.coerce.number().int().min(1).max(26).default(8) }) }),
  async (req, res) => {
    res.json(await stats(req.business.id, req.valid.query.weeks));
  },
);

router.get(
  '/payments',
  ...owner,
  validate({
    query: z.object({
      status: statusList(['authorized', 'captured', 'released', 'refunded']),
      from: v.isoDate.optional(),
      to: v.isoDate.optional(),
      ...paging,
    }),
  }),
  async (req, res) => {
    res.json(await paymentHistory(req.business.id, req.valid.query));
  },
);

router.use('/live-links', liveLinksRouter);
