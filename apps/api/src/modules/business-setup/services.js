// Servicios del negocio (RF-15, RF-17): nombre, duración y precio. Variantes = servicios separados.
import { z } from 'zod';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { services, resources, resourceServices, bookings } from '../../db/schema.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import * as v from '../../lib/validators.js';
import { readAccess, ownerAccess, subRouter } from './shared.js';

export const router = subRouter();

/** Servicios del negocio con los recursos que los dan y si ya tienen reservas. */
export async function listServices(businessId) {
  const rows = await db
    .select({
      s: services,
      hasBookings:
        sql`exists (select 1 from ${bookings} where ${bookings.serviceId} = ${services.id})`.mapWith(
          Boolean,
        ),
    })
    .from(services)
    .where(eq(services.businessId, businessId))
    .orderBy(desc(services.active), asc(services.createdAt));
  const links = rows.length
    ? await db
        .select()
        .from(resourceServices)
        .where(
          inArray(
            resourceServices.serviceId,
            rows.map((r) => r.s.id),
          ),
        )
    : [];
  return rows.map(({ s, hasBookings }) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    durationMin: s.durationMin,
    priceCents: s.priceCents,
    active: s.active,
    hasBookings,
    resourceIds: links.filter((l) => l.serviceId === s.id).map((l) => l.resourceId),
  }));
}

async function ownService(businessId, id) {
  const [s] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, id), eq(services.businessId, businessId)));
  if (!s) throw notFound('No encontramos ese servicio');
  return s;
}

/** Revisa que los recursos sean del negocio. */
async function checkResources(businessId, ids) {
  if (!ids.length) return;
  const rows = await db
    .select({ id: resources.id })
    .from(resources)
    .where(and(inArray(resources.id, ids), eq(resources.businessId, businessId)));
  if (rows.length !== new Set(ids).size)
    throw badRequest('invalid_resource', 'Alguno de los recursos no es de tu negocio');
}

async function setServiceResources(tx, serviceId, resourceIds) {
  await tx.delete(resourceServices).where(eq(resourceServices.serviceId, serviceId));
  const unique = [...new Set(resourceIds)];
  if (unique.length)
    await tx
      .insert(resourceServices)
      .values(unique.map((resourceId) => ({ resourceId, serviceId })));
}

const serviceFields = {
  name: z.string().trim().min(2, 'Escribe el nombre del servicio').max(80),
  description: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .transform((s) => (s ? s : null)),
  durationMin: z.coerce
    .number()
    .int('Escribe minutos enteros')
    .min(5, 'Mínimo 5 minutos')
    .max(600, 'Máximo 10 horas'),
  /** Precio en pesos (el formulario lo pide así); se guarda en centavos. */
  price: v.pesosToCents,
  active: z.boolean(),
  resourceIds: z.array(v.uuid).max(100),
};

router.get('/', readAccess, async (req, res) => {
  res.json({ services: await listServices(req.business.id) });
});

router.post(
  '/',
  ownerAccess,
  validate({
    body: z.object({
      ...serviceFields,
      active: serviceFields.active.optional(),
      resourceIds: serviceFields.resourceIds.optional(),
    }),
  }),
  async (req, res) => {
    const { price, resourceIds, ...rest } = req.valid.body;
    await checkResources(req.business.id, resourceIds ?? []);
    const id = await db.transaction(async (tx) => {
      const [s] = await tx
        .insert(services)
        .values({ ...rest, priceCents: price, businessId: req.business.id })
        .returning();
      if (resourceIds) await setServiceResources(tx, s.id, resourceIds);
      return s.id;
    });
    const list = await listServices(req.business.id);
    res.status(201).json({ service: list.find((s) => s.id === id), services: list });
  },
);

router.patch(
  '/:id',
  ownerAccess,
  validate({
    params: v.idParam,
    body: z
      .object(serviceFields)
      .partial()
      .refine((o) => Object.keys(o).length > 0, 'Nada que actualizar'),
  }),
  async (req, res) => {
    const s = await ownService(req.business.id, req.valid.params.id);
    const { price, resourceIds, ...rest } = req.valid.body;
    if (resourceIds) await checkResources(req.business.id, resourceIds);
    const changes = { ...rest, ...(price !== undefined ? { priceCents: price } : {}) };
    await db.transaction(async (tx) => {
      if (Object.keys(changes).length)
        await tx.update(services).set(changes).where(eq(services.id, s.id));
      if (resourceIds) await setServiceResources(tx, s.id, resourceIds);
    });
    const list = await listServices(req.business.id);
    res.json({ service: list.find((x) => x.id === s.id), services: list });
  },
);

/** Si el servicio ya tiene reservas solo se desactiva (para no perder el historial). */
router.delete('/:id', ownerAccess, validate({ params: v.idParam }), async (req, res) => {
  const s = await ownService(req.business.id, req.valid.params.id);
  const [used] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.serviceId, s.id))
    .limit(1);
  if (used) {
    await db.update(services).set({ active: false }).where(eq(services.id, s.id));
  } else {
    await db.delete(services).where(eq(services.id, s.id));
  }
  res.json({
    result: used ? 'deactivated' : 'deleted',
    services: await listServices(req.business.id),
  });
});
