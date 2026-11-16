// Utilidades del módulo de operación del negocio: columnas y forma de una reserva para la web,
// rangos de un día local y el nombre corto que se usa en las agendas (RF-47).
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { bookings, payments, users, services, resources } from '../../db/schema.js';
import { localDateTime, now } from '../../lib/time.js';

/** "Carlos M." (nombre + inicial del apellido). */
export const shortName = (first, last) => {
  const initial = (last ?? '').trim()[0];
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
};

/** Columnas de una reserva con su cliente, servicio, recurso y pago. */
export const bookingColumns = {
  id: bookings.id,
  status: bookings.status,
  startsAt: bookings.startsAt,
  endsAt: bookings.endsAt,
  priceCents: bookings.priceCents,
  durationMin: bookings.durationMin,
  submittedAt: bookings.submittedAt,
  respondBy: bookings.respondBy,
  decidedAt: bookings.decidedAt,
  cancelledAt: bookings.cancelledAt,
  cancelledBy: bookings.cancelledBy,
  cancellationReason: bookings.cancellationReason,
  completedAt: bookings.completedAt,
  createdAt: bookings.createdAt,
  businessId: bookings.businessId,
  clientId: bookings.clientId,
  clientFirstName: users.firstName,
  clientLastName: users.lastName,
  clientPhone: users.phone,
  clientEmail: users.email,
  serviceId: bookings.serviceId,
  serviceName: services.name,
  resourceId: bookings.resourceId,
  resourceName: resources.name,
  resourceColor: resources.color,
  paymentId: payments.id,
  paymentIntentId: payments.stripePaymentIntentId,
  paymentStatus: payments.status,
  amountCents: payments.amountCents,
  authorizedAt: payments.authorizedAt,
  capturedAt: payments.capturedAt,
  releasedAt: payments.releasedAt,
  refundedAt: payments.refundedAt,
};

/** select de reservas con sus joins; se le agrega .where(...) */
export const selectBookings = (cols = bookingColumns, tx = db) =>
  tx
    .select(cols)
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.clientId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .leftJoin(payments, eq(payments.bookingId, bookings.id));

/** Forma completa de una reserva para la recepción y el dueño (incluye contacto del cliente). */
export function shapeBooking(r) {
  return {
    id: r.id,
    status: r.status,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    durationMin: r.durationMin,
    priceCents: r.priceCents,
    submittedAt: r.submittedAt,
    respondBy: r.respondBy,
    decidedAt: r.decidedAt,
    completedAt: r.completedAt,
    cancelledAt: r.cancelledAt,
    cancelledBy: r.cancelledBy,
    cancellationReason: r.cancellationReason,
    client: {
      id: r.clientId,
      firstName: r.clientFirstName,
      lastName: r.clientLastName,
      shortName: shortName(r.clientFirstName, r.clientLastName),
      phone: r.clientPhone,
      email: r.clientEmail,
    },
    service: { id: r.serviceId, name: r.serviceName },
    resource: { id: r.resourceId, name: r.resourceName, color: r.resourceColor },
    payment: r.paymentId
      ? {
          status: r.paymentStatus,
          amountCents: r.amountCents,
          authorizedAt: r.authorizedAt,
          capturedAt: r.capturedAt,
          releasedAt: r.releasedAt,
          refundedAt: r.refundedAt,
        }
      : null,
  };
}

/** Inicio y fin (Date) del día local 'YYYY-MM-DD'. */
export function dayRange(date) {
  const start = localDateTime(date, '00:00');
  return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate(), dt: start };
}

/** 'YYYY-MM-DD' de hoy en la zona de la app. */
export const todayISO = () => now().toISODate();

/** '09:00:00' → '09:00' */
export const hhmm = (t) => (t ? String(t).slice(0, 5) : null);
