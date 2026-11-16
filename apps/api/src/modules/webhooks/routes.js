// Webhook de Stripe (RF-26, RF-32, RNF-16). Recibe el cuerpo crudo (express.raw en app.js)
// para verificar la firma. Cada evento se procesa una sola vez (tabla stripe_events).
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { stripeEvents } from '../../db/schema.js';
import { constructWebhookEvent } from '../../lib/payments.js';
import { applyAuthorized, bookingIdForIntent, markPaymentFailed } from '../bookings/service.js';

export const router = Router();

/**
 * Procesa un evento ya verificado. Idempotente: si el id ya está en stripe_events, no hace nada.
 * Se registra al final para que, si algo falla, Stripe lo reintente (applyAuthorized también es
 * idempotente, así que dos entregas simultáneas no cobran dos veces).
 * @returns {Promise<'processed'|'duplicate'|'ignored'>}
 */
export async function handleStripeEvent(event) {
  const [seen] = await db
    .select({ id: stripeEvents.id })
    .from(stripeEvents)
    .where(eq(stripeEvents.id, event.id));
  if (seen) return 'duplicate';
  let result = 'ignored';
  const pi = event.data?.object;
  if (event.type === 'payment_intent.amount_capturable_updated' && pi?.id) {
    const bookingId = await bookingIdForIntent(pi.id);
    if (bookingId) {
      await applyAuthorized(bookingId);
      result = 'processed';
    }
  } else if (event.type === 'payment_intent.payment_failed' && pi?.id) {
    await markPaymentFailed(pi.id);
    result = 'processed';
  }
  await db.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
  return result;
}

router.post('/stripe', async (req, res) => {
  let event;
  try {
    event = constructWebhookEvent(req.body, req.get('stripe-signature'));
  } catch {
    return res.status(400).json({ error: 'bad_signature', message: 'Firma inválida' });
  }
  const result = await handleStripeEvent(event);
  res.json({ received: true, result });
});
