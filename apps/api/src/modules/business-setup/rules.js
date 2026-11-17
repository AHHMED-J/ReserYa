// Reglas de reserva (RF-19, RF-20) y días cerrados (RF-18).
import { z } from 'zod';
import { and, asc, eq, gte, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { businesses, closedDays, resources } from '../../db/schema.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { now } from '../../lib/time.js';
import * as v from '../../lib/validators.js';
import {
  readAccess,
  ownerAccess,
  subRouter,
  MIN_NOTICE_OPTIONS,
  SLOT_INTERVAL_OPTIONS,
} from './shared.js';

export const rulesRouter = subRouter();
export const closedDaysRouter = subRouter();

// ---------- reglas ----------
const rulesOf = (b) => ({
  cancellationLimitHours: b.cancellationLimitHours,
  minNoticeMinutes: b.minNoticeMinutes,
  maxAdvanceDays: b.maxAdvanceDays,
  slotIntervalMinutes: b.slotIntervalMinutes,
  bufferMinutes: b.bufferMinutes,
  autoAccept: b.autoAccept,
  defined: [
    b.cancellationLimitHours,
    b.minNoticeMinutes,
    b.maxAdvanceDays,
    b.slotIntervalMinutes,
    b.bufferMinutes,
  ].every((x) => x !== null),
});

const oneOf = (options, message) =>
  z.coerce
    .number({ error: 'Escribe un número' })
    .int()
    .refine((n) => options.includes(n), message);

const rulesBody = z.object({
  cancellationLimitHours: z.coerce
    .number({ error: 'Escribe un número' })
    .int('Escribe horas enteras')
    .min(0, 'Mínimo 0 horas')
    .max(168, 'Máximo 168 horas (una semana)'),
  minNoticeMinutes: oneOf(MIN_NOTICE_OPTIONS, 'Elige una anticipación mínima de la lista'),
  maxAdvanceDays: z.coerce
    .number({ error: 'Escribe un número' })
    .int('Escribe días enteros')
    .min(1, 'Mínimo 1 día')
    .max(180, 'Máximo 180 días'),
  slotIntervalMinutes: oneOf(SLOT_INTERVAL_OPTIONS, 'Elige un intervalo de la lista'),
  bufferMinutes: z.coerce
    .number({ error: 'Escribe un número' })
    .int('Escribe minutos enteros')
    .min(0, 'Mínimo 0 minutos')
    .max(60, 'Máximo 60 minutos'),
  autoAccept: z.boolean(),
});

rulesRouter.get('/', readAccess, (req, res) => {
  res.json({
    rules: rulesOf(req.business),
    options: { minNoticeMinutes: MIN_NOTICE_OPTIONS, slotIntervalMinutes: SLOT_INTERVAL_OPTIONS },
  });
});

rulesRouter.put('/', ownerAccess, validate({ body: rulesBody }), async (req, res) => {
  const [b] = await db
    .update(businesses)
    .set(req.valid.body)
    .where(eq(businesses.id, req.business.id))
    .returning();
  res.json({ rules: rulesOf(b) });
});

// ---------- días cerrados ----------
async function listClosedDays(businessId) {
  const today = now().toISODate();
  const rows = await db
    .select({ d: closedDays, resourceName: resources.name })
    .from(closedDays)
    .leftJoin(resources, eq(resources.id, closedDays.resourceId))
    .where(and(eq(closedDays.businessId, businessId), gte(closedDays.date, today)))
    .orderBy(asc(closedDays.date), asc(closedDays.createdAt));
  return rows.map(({ d, resourceName }) => ({
    id: d.id,
    date: d.date,
    reason: d.reason,
    resourceId: d.resourceId,
    resourceName: resourceName ?? null,
  }));
}

closedDaysRouter.get('/', readAccess, async (req, res) => {
  res.json({ closedDays: await listClosedDays(req.business.id) });
});

closedDaysRouter.post(
  '/',
  ownerAccess,
  validate({
    body: z.object({
      date: v.isoDate,
      reason: z
        .string()
        .trim()
        .max(120)
        .nullable()
        .optional()
        .transform((s) => (s ? s : null)),
      resourceId: v.uuid.nullable().optional(),
    }),
  }),
  async (req, res) => {
    const { date, reason } = req.valid.body;
    const resourceId = req.valid.body.resourceId ?? null;
    if (date < now().toISODate())
      throw badRequest('past_date', 'Elige una fecha de hoy en adelante', {
        date: ['Elige una fecha de hoy en adelante'],
      });
    if (resourceId) {
      const [r] = await db
        .select({ id: resources.id })
        .from(resources)
        .where(and(eq(resources.id, resourceId), eq(resources.businessId, req.business.id)));
      if (!r) throw badRequest('invalid_resource', 'Ese recurso no es de tu negocio');
    }
    const [dup] = await db
      .select({ id: closedDays.id })
      .from(closedDays)
      .where(
        and(
          eq(closedDays.businessId, req.business.id),
          eq(closedDays.date, date),
          resourceId ? eq(closedDays.resourceId, resourceId) : isNull(closedDays.resourceId),
        ),
      );
    if (dup) throw conflict('duplicate', 'Ese día ya está marcado como cerrado');
    await db.insert(closedDays).values({ businessId: req.business.id, date, reason, resourceId });
    res.status(201).json({ closedDays: await listClosedDays(req.business.id) });
  },
);

closedDaysRouter.delete('/:id', ownerAccess, validate({ params: v.idParam }), async (req, res) => {
  const [row] = await db
    .delete(closedDays)
    .where(and(eq(closedDays.id, req.valid.params.id), eq(closedDays.businessId, req.business.id)))
    .returning();
  if (!row) throw notFound('No encontramos ese día cerrado');
  res.json({ closedDays: await listClosedDays(req.business.id) });
});
