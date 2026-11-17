// Correos del área de reservas del cliente (RF-50): new_request, booking_confirmed,
// booking_cancelled_by_client. Cada uno se manda una sola vez por reserva (alreadySent).
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../db/index.js';
import { bookings, businesses, services, resources, users } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { sendEmail, emailLayout, alreadySent } from '../../lib/email.js';
import { formatLong, formatShort, formatMoney } from '../../lib/time.js';

const owner = alias(users, 'owner');

async function loadForEmail(bookingId) {
  const [row] = await db
    .select({
      booking: bookings,
      businessName: businesses.name,
      businessAddress: businesses.address,
      ownerEmail: owner.email,
      ownerId: owner.id,
      serviceName: services.name,
      resourceName: resources.name,
      resourceKind: resources.kind,
      client: users,
    })
    .from(bookings)
    .innerJoin(businesses, eq(businesses.id, bookings.businessId))
    .innerJoin(owner, eq(owner.id, businesses.userId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .innerJoin(users, eq(users.id, bookings.clientId))
    .where(eq(bookings.id, bookingId));
  return row;
}

/** "con Juan" para personas, "en Cancha 1" para espacios. */
const withRes = (r) =>
  r.resourceKind === 'space' ? `en ${r.resourceName}` : `con ${r.resourceName}`;
const clientName = (c) => `${c.firstName} ${c.lastName}`.trim();

/** Al negocio, cuando una solicitud entra a su cola (RF-50). */
export async function sendNewRequestEmail(bookingId) {
  if (await alreadySent('new_request', bookingId)) return;
  const r = await loadForEmail(bookingId);
  const b = r.booking;
  const url = `${env.WEB_URL}/negocio/solicitudes`;
  const paragraphs = [
    `${clientName(r.client)} solicitó ${r.serviceName} ${withRes(r)} el ${formatLong(b.startsAt)} (${formatMoney(b.priceCents)}).`,
    `Tienes hasta el ${formatShort(b.respondBy)} para aceptarla o rechazarla. Si no respondes, la solicitud vence y se libera el pago del cliente.`,
  ];
  await sendEmail({
    to: r.ownerEmail,
    toUserId: r.ownerId,
    template: 'new_request',
    bookingId,
    subject: `Nueva solicitud: ${r.serviceName} · ${formatShort(b.startsAt)}`,
    html: emailLayout({
      title: 'Tienes una nueva solicitud',
      paragraphs,
      cta: { label: 'Ver solicitudes', url },
    }),
    text: `${paragraphs.join('\n')}\n${url}`,
  });
}

/** Al cliente, cuando el negocio acepta solo y el pago se cobró (RF-32). */
export async function sendBookingConfirmedEmail(bookingId) {
  if (await alreadySent('booking_confirmed', bookingId)) return;
  const r = await loadForEmail(bookingId);
  const b = r.booking;
  const url = `${env.WEB_URL}/reservas/${bookingId}`;
  const paragraphs = [
    `Tu cita en ${r.businessName} quedó confirmada: ${r.serviceName} ${withRes(r)}, el ${formatLong(b.startsAt)}.`,
    r.businessAddress ? `Dirección: ${r.businessAddress}.` : null,
    `Se cobró ${formatMoney(b.priceCents)} a tu tarjeta.`,
  ].filter(Boolean);
  await sendEmail({
    to: r.client.email,
    toUserId: r.client.id,
    template: 'booking_confirmed',
    bookingId,
    subject: `Reserva confirmada en ${r.businessName}`,
    html: emailLayout({
      title: '¡Tu reserva está confirmada!',
      paragraphs,
      cta: { label: 'Ver mi reserva', url },
    }),
    text: `${paragraphs.join('\n')}\n${url}`,
  });
}

/** Al negocio, cuando el cliente cancela una cita confirmada o retira su solicitud. */
export async function sendCancelledByClientEmail(bookingId, { wasConfirmed }) {
  if (await alreadySent('booking_cancelled_by_client', bookingId)) return;
  const r = await loadForEmail(bookingId);
  const b = r.booking;
  const url = `${env.WEB_URL}/negocio/reservas`;
  const paragraphs = wasConfirmed
    ? [
        `${clientName(r.client)} canceló su cita de ${r.serviceName} ${withRes(r)} del ${formatLong(b.startsAt)}.`,
        'El horario quedó libre otra vez y el cliente recibe el reembolso completo.',
      ]
    : [
        `${clientName(r.client)} retiró su solicitud de ${r.serviceName} ${withRes(r)} para el ${formatLong(b.startsAt)}.`,
        'Ya no aparece en tu cola de solicitudes.',
      ];
  await sendEmail({
    to: r.ownerEmail,
    toUserId: r.ownerId,
    template: 'booking_cancelled_by_client',
    bookingId,
    subject: wasConfirmed
      ? `Cita cancelada por el cliente · ${formatShort(b.startsAt)}`
      : `Solicitud retirada · ${formatShort(b.startsAt)}`,
    html: emailLayout({
      title: wasConfirmed ? 'Un cliente canceló su cita' : 'Un cliente retiró su solicitud',
      paragraphs,
      cta: { label: 'Ver reservas', url },
    }),
    text: `${paragraphs.join('\n')}\n${url}`,
  });
}
