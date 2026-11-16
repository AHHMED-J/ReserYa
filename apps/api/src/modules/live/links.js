// Links de la agenda en vivo (RF-45), solo modo dueño. Se monta en /api/business/live-links
// desde el router de business-ops (mismo prefijo /api/business).
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { liveLinks, resources } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { requireActiveBusiness, requireOwnerMode } from '../../middleware/auth.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { randomToken } from '../../lib/crypto.js';
import { nowDate } from '../../lib/time.js';
import * as v from '../../lib/validators.js';

export const router = Router();
const owner = [requireActiveBusiness, requireOwnerMode];

async function listLinks(businessId) {
  const rows = await db
    .select({ link: liveLinks, resourceName: resources.name, resourceColor: resources.color })
    .from(liveLinks)
    .leftJoin(resources, eq(resources.id, liveLinks.resourceId))
    .where(and(eq(liveLinks.businessId, businessId), isNull(liveLinks.revokedAt)))
    .orderBy(asc(liveLinks.createdAt));
  return rows.map(shape);
}

function shape({ link, resourceName, resourceColor }) {
  return {
    id: link.id,
    resourceId: link.resourceId,
    resource: link.resourceId
      ? { id: link.resourceId, name: resourceName, color: resourceColor }
      : null,
    token: link.token,
    url: `${env.WEB_URL}/en-vivo/${link.token}`,
    createdAt: link.createdAt,
  };
}

async function findLink(businessId, id) {
  const [link] = await db
    .select()
    .from(liveLinks)
    .where(
      and(eq(liveLinks.id, id), eq(liveLinks.businessId, businessId), isNull(liveLinks.revokedAt)),
    );
  if (!link) throw notFound('No encontramos ese link');
  return link;
}

async function createLink(businessId, resourceId) {
  const [link] = await db
    .insert(liveLinks)
    .values({ businessId, resourceId, token: randomToken(32) })
    .returning();
  return link;
}

async function withResource(link) {
  if (!link.resourceId) return shape({ link });
  const [r] = await db.select().from(resources).where(eq(resources.id, link.resourceId));
  return shape({ link, resourceName: r?.name, resourceColor: r?.color });
}

router.get('/', ...owner, async (req, res) => {
  res.json({ links: await listLinks(req.business.id) });
});

/**
 * Crea un link del negocio completo (resourceId null) o de un recurso. Si ya hay uno vigente
 * para lo mismo, lo devuelve (para regenerarlo está /:id/regenerate).
 */
router.post(
  '/',
  ...owner,
  validate({ body: z.object({ resourceId: v.uuid.nullish() }) }),
  async (req, res) => {
    const resourceId = req.valid.body.resourceId ?? null;
    if (resourceId) {
      const [r] = await db
        .select({ id: resources.id })
        .from(resources)
        .where(and(eq(resources.id, resourceId), eq(resources.businessId, req.business.id)));
      if (!r) throw badRequest('invalid_resource', 'Ese recurso no es de tu negocio');
    }
    const [existing] = await db
      .select()
      .from(liveLinks)
      .where(
        and(
          eq(liveLinks.businessId, req.business.id),
          isNull(liveLinks.revokedAt),
          resourceId ? eq(liveLinks.resourceId, resourceId) : isNull(liveLinks.resourceId),
        ),
      );
    if (existing) return res.json({ link: await withResource(existing) });
    const link = await createLink(req.business.id, resourceId);
    res.status(201).json({ link: await withResource(link) });
  },
);

/** Revoca el link y crea otro para lo mismo: el anterior deja de funcionar. */
router.post('/:id/regenerate', ...owner, validate({ params: v.idParam }), async (req, res) => {
  const old = await findLink(req.business.id, req.valid.params.id);
  const link = await db.transaction(async (tx) => {
    await tx.update(liveLinks).set({ revokedAt: nowDate() }).where(eq(liveLinks.id, old.id));
    const [created] = await tx
      .insert(liveLinks)
      .values({ businessId: old.businessId, resourceId: old.resourceId, token: randomToken(32) })
      .returning();
    return created;
  });
  res.status(201).json({ link: await withResource(link) });
});

router.delete('/:id', ...owner, validate({ params: v.idParam }), async (req, res) => {
  const link = await findLink(req.business.id, req.valid.params.id);
  await db.update(liveLinks).set({ revokedAt: nowDate() }).where(eq(liveLinks.id, link.id));
  res.json({ ok: true });
});
