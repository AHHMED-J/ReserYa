// Pagos con Stripe: se autoriza al enviar la solicitud y se cobra cuando el negocio acepta
// (RF-26, RF-29). Sin STRIPE_SECRET_KEY se usa un pago simulado para poder hacer la demo.
// Todo lo que toque dinero debe pasar por aquí. Nunca se guardan datos de tarjeta (RNF-10).
import Stripe from 'stripe';
import { env } from '../config/env.js';
import { randomToken } from './crypto.js';

export const stripe = env.stripeEnabled ? new Stripe(env.STRIPE_SECRET_KEY) : null;

export const isFake = (paymentIntentId) => paymentIntentId.startsWith('fake_');

/** Modo actual, para que la web sepa si muestra Stripe Elements o el pago simulado. */
export const paymentMode = () => (stripe ? 'stripe' : 'fake');

/**
 * Crea la autorización (sin cobrar).
 * @returns {{ id: string, clientSecret: string|null, mode: 'stripe'|'fake' }}
 */
export async function createAuthorization({ amountCents, bookingId, description, email }) {
  if (!stripe) return { id: `fake_${randomToken(12)}`, clientSecret: null, mode: 'fake' };
  const pi = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: 'mxn',
      capture_method: 'manual',
      // Stripe ya no acepta payment_method_types: los métodos se activan en el Dashboard.
      // Sin redirecciones, para que el pago se confirme sin salir de ReserYa.
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description,
      receipt_email: email,
      metadata: { bookingId },
    },
    { idempotencyKey: `auth-${bookingId}` },
  );
  return { id: pi.id, clientSecret: pi.client_secret, mode: 'stripe' };
}

/**
 * Estado del pago según Stripe, traducido a nuestro enum payment_status.
 * Para pagos simulados devuelve null (el estado vive solo en la base).
 */
export async function fetchStatus(paymentIntentId) {
  if (isFake(paymentIntentId)) return null;
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  return mapStripeStatus(pi.status);
}

export function mapStripeStatus(status) {
  return (
    {
      requires_capture: 'authorized',
      succeeded: 'captured',
      canceled: 'released',
    }[status] ?? 'pending'
  );
}

/** Cobra lo autorizado (el negocio aceptó). */
export async function capture(paymentIntentId) {
  if (isFake(paymentIntentId)) return;
  await stripe.paymentIntents.capture(paymentIntentId, undefined, {
    idempotencyKey: `capture-${paymentIntentId}`,
  });
}

/** Libera la autorización sin cobrar (rechazo, vencimiento, solicitud abandonada). */
export async function release(paymentIntentId) {
  if (isFake(paymentIntentId)) return;
  try {
    await stripe.paymentIntents.cancel(paymentIntentId);
  } catch (e) {
    // Si ya estaba cancelado o nunca se completó, no es un error para nosotros.
    if (e?.code !== 'payment_intent_unexpected_state') throw e;
  }
}

/** Reembolsa el 100% de un pago cobrado (RF-35, RF-36). */
export async function refund(paymentIntentId) {
  if (isFake(paymentIntentId)) return;
  await stripe.refunds.create(
    { payment_intent: paymentIntentId },
    { idempotencyKey: `refund-${paymentIntentId}` },
  );
}

/** Verifica la firma del webhook. Devuelve el evento o lanza error. */
export function constructWebhookEvent(rawBody, signature) {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) throw new Error('Webhook de Stripe no configurado');
  return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
