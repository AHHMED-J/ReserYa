// Correos al cliente del área de operación (RF-50): aceptada, rechazada, vencida, recordatorio
// y cancelación por el negocio. Plantillas reservadas para este módulo en el brief.
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { bookings, businesses, services, resources, users } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { sendEmail, emailLayout } from '../../lib/email.js';
import { formatLong, formatMoney } from '../../lib/time.js';

async function loadForEmail(bookingId) {
  const [row] = await db
    .select({
      id: bookings.id,
      startsAt: bookings.startsAt,
      priceCents: bookings.priceCents,
      cancellationReason: bookings.cancellationReason,
      clientId: users.id,
      clientEmail: users.email,
      clientName: users.firstName,
      businessId: businesses.id,
      businessName: businesses.name,
      businessAddress: businesses.address,
      serviceName: services.name,
      resourceName: resources.name,
    })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.clientId))
    .innerJoin(businesses, eq(businesses.id, bookings.businessId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .where(eq(bookings.id, bookingId));
  return row;
}

const TEMPLATES = {
  request_accepted: (b) => ({
    subject: `Tu cita en ${b.businessName} está confirmada`,
    title: '¡Tu cita está confirmada!',
    paragraphs: [
      `Hola ${b.clientName}, ${b.businessName} aceptó tu solicitud.`,
      `${b.serviceName} con ${b.resourceName}, el ${formatLong(b.startsAt)}.`,
      `Se cobró ${formatMoney(b.priceCents)} a tu tarjeta.`,
      b.businessAddress ? `Dirección: ${b.businessAddress}.` : null,
    ],
    cta: 'Ver mi reserva',
  }),
  request_rejected: (b) => ({
    subject: `${b.businessName} no pudo aceptar tu solicitud`,
    title: 'Tu solicitud no fue aceptada',
    paragraphs: [
      `Hola ${b.clientName}, ${b.businessName} no pudo aceptar tu solicitud de ${b.serviceName} para el ${formatLong(b.startsAt)}.`,
      `No se te cobró nada: liberamos los ${formatMoney(b.priceCents)} que estaban apartados en tu tarjeta.`,
      'Puedes buscar otro horario cuando quieras.',
    ],
    cta: 'Buscar otro horario',
  }),
  request_expired: (b) => ({
    subject: `Tu solicitud en ${b.businessName} venció`,
    title: 'Tu solicitud venció',
    paragraphs: [
      `Hola ${b.clientName}, ${b.businessName} no respondió a tiempo tu solicitud de ${b.serviceName} para el ${formatLong(b.startsAt)}.`,
      `No se te cobró nada: liberamos los ${formatMoney(b.priceCents)} que estaban apartados en tu tarjeta.`,
    ],
    cta: 'Buscar otro horario',
  }),
  booking_reminder: (b) => ({
    subject: `Recordatorio: tu cita en ${b.businessName}`,
    title: 'Tu cita es pronto',
    paragraphs: [
      `Hola ${b.clientName}, te recordamos tu cita de ${b.serviceName} con ${b.resourceName} en ${b.businessName}.`,
      `Es el ${formatLong(b.startsAt)}.`,
      b.businessAddress ? `Dirección: ${b.businessAddress}.` : null,
    ],
    cta: 'Ver mi reserva',
  }),
  booking_cancelled_by_business: (b) => ({
    subject: `${b.businessName} canceló tu cita`,
    title: 'Tu cita fue cancelada',
    paragraphs: [
      `Hola ${b.clientName}, ${b.businessName} canceló tu cita de ${b.serviceName} del ${formatLong(b.startsAt)}.`,
      `Motivo: ${b.cancellationReason}`,
      `Te reembolsamos el 100%: ${formatMoney(b.priceCents)}. Puede tardar unos días en verse en tu tarjeta.`,
    ],
    cta: 'Ver mi reserva',
  }),
};

/** Envía al cliente el correo de la plantilla para esa reserva. */
export async function emailClient(template, bookingId) {
  const b = await loadForEmail(bookingId);
  if (!b) return false;
  const t = TEMPLATES[template](b);
  const url =
    t.cta === 'Buscar otro horario'
      ? `${env.WEB_URL}/negocios/${b.businessId}`
      : `${env.WEB_URL}/reservas/${b.id}`;
  const paragraphs = t.paragraphs.filter(Boolean);
  return sendEmail({
    to: b.clientEmail,
    toUserId: b.clientId,
    template,
    subject: t.subject,
    html: emailLayout({ title: t.title, paragraphs, cta: { label: t.cta, url } }),
    text: `${paragraphs.join('\n')}\n${t.cta}: ${url}`,
    bookingId: b.id,
  });
}
