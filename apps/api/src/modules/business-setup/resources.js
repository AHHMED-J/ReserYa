// Recursos del negocio (RF-16, RF-18): personas o espacios, qué servicios dan y su horario semanal.
import { z } from 'zod';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  resources,
  services,
  resourceServices,
  resourceSchedules,
  bookings,
} from '../../db/schema.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import * as v from '../../lib/validators.js';
import { readAccess, ownerAccess, subRouter, RESOURCE_COLORS, hhmmOf } from './shared.js';

export const router = subRouter();

/** Recursos con sus servicios y su horario. */
export async function listResources(businessId) {
  const rows = await db
    .select({
      r: resources,
      hasBookings:
        sql`exists (select 1 from ${bookings} where ${bookings.resourceId} = ${resources.id})`.mapWith(
          Boolean,
        ),
    })
    .from(resources)
    .where(eq(resources.businessId, businessId))
    .orderBy(desc(resources.active), asc(resources.createdAt));
  const ids = rows.map((x) => x.r.id);
  const [links, blocks] = ids.length
    ? await Promise.all([
        db.select().from(resourceServices).where(inArray(resourceServices.resourceId, ids)),
        db
          .select()
          .from(resourceSchedules)
          .where(inArray(resourceSchedules.resourceId, ids))
          .orderBy(asc(resourceSchedules.weekday), asc(resourceSchedules.startTime)),
      ])
    : [[], []];
  return rows.map(({ r, hasBookings }) => ({
    id: r.id,
    name: r.name,
    title: r.title,
    kind: r.kind,
    color: r.color,
    active: r.active,
    hasBookings,
    serviceIds: links.filter((l) => l.resourceId === r.id).map((l) => l.serviceId),
    schedule: blocks
      .filter((b) => b.resourceId === r.id)
      .map((b) => ({ weekday: b.weekday, start: hhmmOf(b.startTime), end: hhmmOf(b.endTime) })),
  }));
}

async function ownResource(businessId, id) {
  const [r] = await db
    .select()
    .from(resources)
    .where(and(eq(resources.id, id), eq(resources.businessId, businessId)));
  if (!r) throw notFound('No encontramos ese recurso');
  return r;
}

async function checkServices(businessId, ids) {
  if (!ids.length) return;
  const rows = await db
    .select({ id: services.id })
    .from(services)
    .where(and(inArray(services.id, ids), eq(services.businessId, businessId)));
  if (rows.length !== new Set(ids).size)
    throw badRequest('invalid_service', 'Alguno de los servicios no es de tu negocio');
}

async function setResourceServices(tx, resourceId, serviceIds) {
  await tx.delete(resourceServices).where(eq(resourceServices.resourceId, resourceId));
  const unique = [...new Set(serviceIds)];
  if (unique.length)
    await tx
      .insert(resourceServices)
      .values(unique.map((serviceId) => ({ resourceId, serviceId })));
}

const resourceFields = {
  name: z.string().trim().min(1, 'Escribe el nombre').max(60),
  title: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .optional()
    .transform((s) => (s ? s : null)),
  kind: z.enum(['person', 'space'], { error: 'Elige persona o espacio' }),
  color: z
    .string()
    .transform((s) => s.toUpperCase())
    .refine((s) => RESOURCE_COLORS.includes(s), 'Elige un color de la paleta'),
  active: z.boolean(),
};

router.get('/', readAccess, async (req, res) => {
  res.json({ resources: await listResources(req.business.id), colors: RESOURCE_COLORS });
});

router.post(
  '/',
  ownerAccess,
  validate({
    body: z.object({
      ...resourceFields,
      kind: resourceFields.kind.default('person'),
      color: resourceFields.color.optional(),
      active: resourceFields.active.optional(),
      serviceIds: z.array(v.uuid).max(200).optional(),
    }),
  }),
  async (req, res) => {
    const { serviceIds, ...rest } = req.valid.body;
    await checkServices(req.business.id, serviceIds ?? []);
    const id = await db.transaction(async (tx) => {
      let color = rest.color;
      if (!color) {
        // Siguiente color de la paleta que menos se haya usado.
        const [{ n }] = await tx
          .select({ n: sql`count(*)`.mapWith(Number) })
          .from(resources)
          .where(eq(resources.businessId, req.business.id));
        color = RESOURCE_COLORS[n % RESOURCE_COLORS.length];
      }
      const [r] = await tx
        .insert(resources)
        .values({ ...rest, color, businessId: req.business.id })
        .returning();
      if (serviceIds) await setResourceServices(tx, r.id, serviceIds);
      return r.id;
    });
    const list = await listResources(req.business.id);
    res.status(201).json({ resource: list.find((r) => r.id === id), resources: list });
  },
);

router.patch(
  '/:id',
  ownerAccess,
  validate({
    params: v.idParam,
    body: z
      .object(resourceFields)
      .partial()
      .refine((o) => Object.keys(o).length > 0, 'Nada que actualizar'),
  }),
  async (req, res) => {
    const r = await ownResource(req.business.id, req.valid.params.id);
    await db.update(resources).set(req.valid.body).where(eq(resources.id, r.id));
    const list = await listResources(req.business.id);
    res.json({ resource: list.find((x) => x.id === r.id), resources: list });
  },
);

/** Con reservas solo se desactiva; sin reservas se borra con su horario. */
router.delete('/:id', ownerAccess, validate({ params: v.idParam }), async (req, res) => {
  const r = await ownResource(req.business.id, req.valid.params.id);
  const [used] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.resourceId, r.id))
    .limit(1);
  if (used) {
    await db.update(resources).set({ active: false }).where(eq(resources.id, r.id));
  } else {
    await db.delete(resources).where(eq(resources.id, r.id));
  }
  res.json({
    result: used ? 'deactivated' : 'deleted',
    resources: await listResources(req.business.id),
  });
});

router.put(
  '/:id/services',
  ownerAccess,
  validate({ params: v.idParam, body: z.object({ serviceIds: z.array(v.uuid).max(200) }) }),
  async (req, res) => {
    const r = await ownResource(req.business.id, req.valid.params.id);
    await checkServices(req.business.id, req.valid.body.serviceIds);
    await db.transaction((tx) => setResourceServices(tx, r.id, req.valid.body.serviceIds));
    const list = await listResources(req.business.id);
    res.json({ resource: list.find((x) => x.id === r.id), resources: list });
  },
);

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Bloques por día: inicio < fin y sin encimarse (pueden tocarse: 09:00–14:00 y 14:00–18:00). */
export const scheduleBody = z
  .object({
    blocks: z
      .array(
        z.object({
          weekday: z.number().int().min(0).max(6),
          start: v.hhmm,
          end: v.hhmm,
        }),
      )
      .max(7 * 6, 'Máximo 6 bloques por día'),
  })
  .superRefine(({ blocks }, ctx) => {
    for (const [i, b] of blocks.entries()) {
      if (toMin(b.start) >= toMin(b.end)) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', i],
          message: 'La hora de inicio debe ser antes de la de fin',
        });
      }
    }
    for (let day = 0; day <= 6; day++) {
      const list = blocks
        .map((b, i) => ({ ...b, i }))
        .filter((b) => b.weekday === day)
        .sort((a, b) => toMin(a.start) - toMin(b.start));
      if (list.length > 6) {
        ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'Máximo 6 bloques por día' });
      }
      for (let k = 1; k < list.length; k++) {
        if (toMin(list[k].start) < toMin(list[k - 1].end)) {
          ctx.addIssue({
            code: 'custom',
            path: ['blocks', list[k].i],
            message: 'Hay horarios que se enciman el mismo día',
          });
        }
      }
    }
  });

router.put(
  '/:id/schedule',
  ownerAccess,
  validate({ params: v.idParam, body: scheduleBody }),
  async (req, res) => {
    const r = await ownResource(req.business.id, req.valid.params.id);
    const { blocks } = req.valid.body;
    await db.transaction(async (tx) => {
      await tx.delete(resourceSchedules).where(eq(resourceSchedules.resourceId, r.id));
      if (blocks.length)
        await tx.insert(resourceSchedules).values(
          blocks.map((b) => ({
            resourceId: r.id,
            weekday: b.weekday,
            startTime: b.start,
            endTime: b.end,
          })),
        );
    });
    const list = await listResources(req.business.id);
    res.json({ resource: list.find((x) => x.id === r.id), resources: list });
  },
);
