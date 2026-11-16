import { Router } from 'express';
import { asc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { categories } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { paymentMode } from '../../lib/payments.js';

export const router = Router();

/** Configuración pública que la web necesita saber. */
router.get('/config', (_req, res) => {
  res.json({
    paymentMode: paymentMode(),
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY ?? null,
    googleLogin: env.googleEnabled,
    timezone: 'America/Tijuana',
  });
});

/** Las 9 categorías fijas (RF-14). */
router.get('/categories', async (_req, res) => {
  const rows = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug, icon: categories.icon })
    .from(categories)
    .orderBy(asc(categories.sortOrder));
  res.json({ categories: rows });
});
