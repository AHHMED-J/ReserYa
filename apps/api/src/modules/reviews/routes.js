// Reseñas (RF-48, RF-49). Montado en /api/reviews.
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { bookings, reviews, businesses } from '../../db/schema.js';
import { validate } from '../../middleware/validate.js';
import { requireRole } from '../../middleware/auth.js';
import { conflict, notFound } from '../../lib/errors.js';
import * as v from '../../lib/validators.js';

export const router = Router();

const body = z.object({
  bookingId: v.uuid,
  rating: z.coerce.number().int().min(1, 'De 1 a 5 estrellas').max(5, 'De 1 a 5 estrellas'),
  comment: z
    .string()
    .trim()
    .max(500, 'Máximo 500 caracteres')
    .nullish()
    .transform((c) => c || null),
});

/** Solo el cliente de una reserva completada (no "no asistió"), una vez por reserva. */
router.post('/', requireRole('client'), validate({ body }), async (req, res) => {
  const { bookingId, rating, comment } = req.valid.body;
  const review = await db.transaction(async (tx) => {
    const [b] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, req.user.id)))
      .for('update');
    if (!b) throw notFound('Reserva no encontrada');
    if (b.status !== 'completed')
      throw conflict('not_reviewable', 'Solo puedes calificar citas que ya se completaron');
    const [exists] = await tx
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.bookingId, bookingId));
    if (exists) throw conflict('already_reviewed', 'Ya calificaste esta cita');
    const [r] = await tx
      .insert(reviews)
      .values({ bookingId, clientId: req.user.id, businessId: b.businessId, rating, comment })
      .returning();
    // Caché de la calificación del negocio (RF-49, RF-64), en la misma transacción.
    await tx
      .update(businesses)
      .set({
        ratingAvg: sql`(select round(avg(${reviews.rating})::numeric, 2) from ${reviews} where ${reviews.businessId} = ${b.businessId})`,
        ratingCount: sql`(select count(*) from ${reviews} where ${reviews.businessId} = ${b.businessId})`,
      })
      .where(eq(businesses.id, b.businessId));
    return r;
  });
  res.status(201).json({ review });
});
