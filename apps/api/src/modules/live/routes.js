// Agenda en vivo pública (RF-46, RF-47). Montado en /api/live. Sin sesión: el token largo es la llave.
// Solo muestra nombre corto del cliente, servicio y hora: nada de teléfonos, correos ni precios.
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { businesses, liveLinks, resources } from '../../db/schema.js';
import { validate } from '../../middleware/validate.js';
import { notFound } from '../../lib/errors.js';
import { isoDate } from '../../lib/validators.js';
import { buildAgenda } from '../business-ops/queries.js';
import { todayISO } from '../business-ops/common.js';

export const router = Router();

const INVALID = 'Este link ya no es válido. Pide uno nuevo al negocio.';

router.get(
  '/:token',
  validate({
    params: z.object({ token: z.string().min(20).max(100) }),
    query: z.object({ date: isoDate.optional() }),
  }),
  async (req, res) => {
    const [row] = await db
      .select({ link: liveLinks, business: businesses })
      .from(liveLinks)
      .innerJoin(businesses, eq(businesses.id, liveLinks.businessId))
      .where(and(eq(liveLinks.token, req.valid.params.token), isNull(liveLinks.revokedAt)));
    if (!row || row.business.status !== 'approved') throw notFound(INVALID);

    let resourceName = null;
    if (row.link.resourceId) {
      const [r] = await db.select().from(resources).where(eq(resources.id, row.link.resourceId));
      if (!r) throw notFound(INVALID);
      resourceName = r.name;
    }
    const agenda = await buildAgenda({
      businessId: row.business.id,
      date: req.valid.query.date ?? todayISO(),
      resourceId: row.link.resourceId,
      publicView: true,
    });
    res.set('Cache-Control', 'no-store');
    res.json({
      business: { name: row.business.name },
      resource: resourceName ? { name: resourceName } : null,
      ...agenda,
      resources: agenda.resources.map(({ requests: _requests, ...r }) => r),
    });
  },
);
