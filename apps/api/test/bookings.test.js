import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import {
  setupDb,
  closeDb,
  createBusiness,
  createUser,
  createBooking,
  loginAs,
  setNow,
  outbox,
  db,
  s,
  app,
} from './helpers.js';
import { localDateTime } from '../src/lib/time.js';
import { expireAbandonedDrafts, MAX_PENDING_REQUESTS } from '../src/modules/bookings/service.js';
import { jobs } from '../src/modules/bookings/jobs.js';
import { handleStripeEvent } from '../src/modules/webhooks/routes.js';

before(setupDb);
after(closeDb);

// Lunes 7 de enero de 2030, 08:00 en Tijuana.
const T0 = Date.parse('2030-01-07T16:00:00Z');
const TUE = '2030-01-08';
const at = (date, hhmm) => localDateTime(date, hhmm).toJSDate();
const iso = (date, hhmm) => at(date, hhmm).toISOString();
const minutes = (n) => new Date(T0 + n * 60_000);

const getBooking = async (id) =>
  (await db.select().from(s.bookings).where(eq(s.bookings.id, id)))[0];
const getPayment = async (bookingId) =>
  (await db.select().from(s.payments).where(eq(s.payments.bookingId, bookingId)))[0];
const mails = (template, bookingId) =>
  outbox.filter((m) => m.template === template && m.bookingId === bookingId);
const syncJobs = (bookingId) =>
  db.select().from(s.calendarSyncJobs).where(eq(s.calendarSyncJobs.bookingId, bookingId));

function post(agent, service, resource, date, hhmm, extra = {}) {
  return agent.post('/api/bookings').send({
    serviceId: service.id,
    resourceId: resource?.id ?? null,
    startsAt: iso(date, hhmm),
    ...extra,
  });
}

describe('crear la reserva y pagar', () => {
  beforeEach(() => setNow(T0));
  after(() => setNow(null));

  it('pide sesión de cliente con correo verificado y teléfono (RF-05)', async () => {
    const { services, resources, user: owner } = await createBusiness();
    const body = {
      serviceId: services[0].id,
      resourceId: resources[0].id,
      startsAt: iso(TUE, '10:00'),
    };
    assert.equal((await request(app).post('/api/bookings').send(body)).status, 401);
    const unverified = await loginAs(await createUser({ emailVerifiedAt: null }));
    assert.equal(
      (await unverified.post('/api/bookings').send(body)).body.error,
      'email_not_verified',
    );
    const noPhone = await loginAs(await createUser({ phone: null }));
    assert.equal((await noPhone.post('/api/bookings').send(body)).body.error, 'profile_incomplete');
    const business = await loginAs(owner);
    assert.equal((await business.post('/api/bookings').send(body)).status, 403);
  });

  it('solicitud: el borrador no entra a la cola hasta que se autoriza el pago (idempotente)', async () => {
    const { business, services, resources, user: owner } = await createBusiness();
    const client = await createUser();
    const agent = await loginAs(client);
    const r = await post(agent, services[0], resources[0], TUE, '10:00');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.booking.status, 'pending');
    assert.deepEqual(r.body.payment, { mode: 'fake', clientSecret: null });
    const id = r.body.booking.id;
    let b = await getBooking(id);
    assert.equal(b.submittedAt, null, 'un borrador todavía no es solicitud');
    assert.equal(b.businessId, business.id);
    assert.equal((await getPayment(id)).status, 'pending');
    assert.equal(mails('new_request', id).length, 0);

    const pay = await agent.post(`/api/bookings/${id}/fake-pay`);
    assert.equal(pay.status, 200, JSON.stringify(pay.body));
    assert.equal(pay.body.outcome, 'submitted');
    b = await getBooking(id);
    assert.equal(b.status, 'pending');
    assert.equal(b.submittedAt.getTime(), T0);
    // min(ahora + 12 h, cita − 1 h) = lunes 20:00
    assert.equal(b.respondBy.toISOString(), '2030-01-08T04:00:00.000Z');
    const p = await getPayment(id);
    assert.equal(p.status, 'authorized');
    assert.ok(p.authorizedAt);
    const sent = mails('new_request', id);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, owner.email, 'el correo va al negocio');

    const again = await agent.post(`/api/bookings/${id}/fake-pay`);
    assert.equal(again.status, 200);
    assert.equal(again.body.outcome, 'already');
    assert.equal(mails('new_request', id).length, 1, 'no se repite el correo');
  });

  it('respondBy es 1 h antes de la cita si eso ocurre antes de 12 h', async () => {
    const { services, resources } = await createBusiness();
    const agent = await loginAs(await createUser());
    const r = await post(agent, services[0], resources[0], '2030-01-07', '09:40');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    await agent.post(`/api/bookings/${r.body.booking.id}/fake-pay`);
    const b = await getBooking(r.body.booking.id);
    assert.equal(b.respondBy.toISOString(), localDateTime('2030-01-07', '08:40').toUTC().toISO());
  });

  it('aceptación automática: aparta 10 min y confirma al pagar (RF-32)', async () => {
    const { services, resources } = await createBusiness({ autoAccept: true });
    const ana = await createUser();
    const beto = await createUser();
    const a = await loginAs(ana);
    const bAgent = await loginAs(beto);
    const r = await post(a, services[0], resources[0], TUE, '10:00');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.booking.status, 'hold');
    assert.equal(new Date(r.body.booking.holdExpiresAt).getTime(), T0 + 10 * 60_000);
    const id = r.body.booking.id;

    // Mientras está apartado, otro cliente no puede tomar ese horario con Juan…
    const clash = await post(bAgent, services[0], resources[0], TUE, '10:00');
    assert.equal(clash.status, 409);
    assert.equal(clash.body.error, 'slot_taken');
    // …pero "cualquiera" le da a Pedro.
    const any = await post(bAgent, services[0], null, TUE, '10:00');
    assert.equal(any.status, 201);
    assert.equal((await getBooking(any.body.booking.id)).resourceId, resources[1].id);

    const pay = await a.post(`/api/bookings/${id}/fake-pay`);
    assert.equal(pay.status, 200);
    assert.equal(pay.body.outcome, 'confirmed');
    const b = await getBooking(id);
    assert.equal(b.status, 'confirmed');
    assert.ok(b.decidedAt);
    assert.equal(b.holdExpiresAt, null);
    const p = await getPayment(id);
    assert.equal(p.status, 'captured');
    assert.ok(p.capturedAt);
    const jobsFor = await syncJobs(id);
    assert.deepEqual(
      jobsFor.map((j) => j.action),
      ['create'],
    );
    const sent = mails('booking_confirmed', id);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, ana.email);

    await a.post(`/api/bookings/${id}/fake-pay`);
    assert.equal((await syncJobs(id)).length, 1, 'pagar dos veces no duplica nada');
    assert.equal(mails('booking_confirmed', id).length, 1);
  });

  it('vence apartados y borradores abandonados (tarea)', async () => {
    const auto = await createBusiness({ autoAccept: true });
    const manual = await createBusiness();
    const a = await loginAs(await createUser());
    const b = await loginAs(await createUser());
    const hold = await post(a, auto.services[0], auto.resources[0], TUE, '11:00');
    const draft = await post(b, manual.services[0], manual.resources[0], TUE, '11:00');
    assert.equal(jobs[0].run, expireAbandonedDrafts);

    setNow(minutes(9));
    assert.equal(await expireAbandonedDrafts(), 0, 'todavía no vence nada');
    setNow(minutes(11));
    await expireAbandonedDrafts();
    assert.equal((await getBooking(hold.body.booking.id)).status, 'expired');
    assert.equal((await getPayment(hold.body.booking.id)).status, 'released');
    assert.equal((await getBooking(draft.body.booking.id)).status, 'pending');

    // El horario vuelve a estar libre.
    const c = await loginAs(await createUser());
    const again = await post(c, auto.services[0], auto.resources[0], TUE, '11:00');
    assert.equal(again.status, 201);

    setNow(minutes(31));
    await expireAbandonedDrafts();
    assert.equal((await getBooking(draft.body.booking.id)).status, 'expired');

    // Pagar algo ya vencido no cobra nada.
    const late = await b.post(`/api/bookings/${draft.body.booking.id}/fake-pay`);
    assert.equal(late.status, 409);
    assert.equal(late.body.error, 'booking_expired');
    assert.equal(mails('new_request', draft.body.booking.id).length, 0);
  });

  it('un cliente solo tiene un borrador en curso: el nuevo descarta el anterior', async () => {
    const { services, resources } = await createBusiness();
    const agent = await loginAs(await createUser());
    const first = await post(agent, services[0], resources[0], TUE, '12:00');
    const second = await post(agent, services[0], resources[0], TUE, '13:00');
    assert.equal(second.status, 201);
    assert.equal((await getBooking(first.body.booking.id)).status, 'expired');
    const late = await agent.post(`/api/bookings/${first.body.booking.id}/fake-pay`);
    assert.equal(late.body.error, 'booking_expired');
  });

  it('máximo 3 solicitudes pendientes (RF-27); no aplica con aceptación automática', async () => {
    const { services, resources } = await createBusiness();
    const auto = await createBusiness({ autoAccept: true });
    const agent = await loginAs(await createUser());
    for (const hhmm of ['10:00', '11:00', '12:00']) {
      const r = await post(agent, services[0], resources[0], TUE, hhmm);
      assert.equal(r.status, 201);
      await agent.post(`/api/bookings/${r.body.booking.id}/fake-pay`);
    }
    assert.equal(MAX_PENDING_REQUESTS, 3);
    const fourth = await post(agent, services[0], resources[1], TUE, '14:00');
    assert.equal(fourth.status, 409);
    assert.equal(fourth.body.error, 'too_many_requests');
    const ok = await post(agent, auto.services[0], auto.resources[0], TUE, '14:00');
    assert.equal(ok.status, 201, 'un apartado no es solicitud pendiente');
  });

  it('revalida el horario y elige al recurso con menos citas para "cualquiera"', async () => {
    const { business, services, resources } = await createBusiness();
    const [juan, pedro] = resources;
    const other = await createUser();
    await createBooking({
      client: other,
      business,
      service: services[0],
      resource: juan,
      startsAt: at(TUE, '10:00'),
    });
    const agent = await loginAs(await createUser());

    const taken = await post(agent, services[0], juan, TUE, '10:20');
    assert.equal(taken.status, 409, 'se encima con la de las 10:00');
    const offGrid = await post(agent, services[0], juan, TUE, '15:05');
    assert.equal(offGrid.status, 409, 'no es un horario de la rejilla');
    const tooSoon = await post(agent, services[0], juan, '2030-01-07', '09:00');
    assert.equal(tooSoon.status, 409, 'no respeta la anticipación mínima');

    const any = await post(agent, services[0], null, TUE, '16:00');
    assert.equal(any.status, 201);
    assert.equal(any.body.booking.resourceId, pedro.id, 'Juan ya tiene una cita ese día');

    const other2 = await createBusiness();
    const wrong = await post(agent, other2.services[0], juan, TUE, '16:00');
    assert.equal(wrong.status, 409, 'Juan no da servicios de otro negocio');
  });

  it('guarda de dónde viene al volver a agendar', async () => {
    const { business, services, resources } = await createBusiness();
    const client = await createUser();
    const { booking: prev } = await createBooking({
      client,
      business,
      service: services[0],
      resource: resources[0],
      startsAt: new Date(T0 - 7 * 86400e3),
      status: 'completed',
    });
    const agent = await loginAs(client);
    const r = await post(agent, services[0], resources[0], TUE, '10:00', {
      rebookedFromId: prev.id,
    });
    assert.equal(r.status, 201);
    assert.equal((await getBooking(r.body.booking.id)).rebookedFromId, prev.id);
    const stranger = await loginAs(await createUser());
    const bad = await post(stranger, services[0], resources[0], TUE, '11:00', {
      rebookedFromId: prev.id,
    });
    assert.equal(bad.status, 400);
  });
});

describe('webhook de Stripe (RNF-16)', () => {
  beforeEach(() => setNow(T0));
  after(() => setNow(null));

  it('procesa cada evento una sola vez y maneja el pago fallido', async () => {
    const { services, resources } = await createBusiness();
    const agent = await loginAs(await createUser());
    const r = await post(agent, services[0], resources[0], TUE, '10:00');
    const id = r.body.booking.id;
    const { stripePaymentIntentId: pi } = await getPayment(id);

    const failed = {
      id: 'evt_fail',
      type: 'payment_intent.payment_failed',
      data: { object: { id: pi } },
    };
    assert.equal(await handleStripeEvent(failed), 'processed');
    assert.equal((await getPayment(id)).status, 'failed');

    const ok = {
      id: 'evt_ok',
      type: 'payment_intent.amount_capturable_updated',
      data: { object: { id: pi } },
    };
    assert.equal(await handleStripeEvent(ok), 'processed');
    assert.equal(await handleStripeEvent(ok), 'duplicate');
    // Otro evento distinto para el mismo pago (Stripe puede mandar varios): tampoco repite nada.
    assert.equal(await handleStripeEvent({ ...ok, id: 'evt_ok2' }), 'processed');
    assert.equal((await getPayment(id)).status, 'authorized');
    assert.ok((await getBooking(id)).submittedAt);
    assert.equal(mails('new_request', id).length, 1);
    const events = await db.select().from(s.stripeEvents);
    assert.equal(events.length, 3);

    assert.equal(
      await handleStripeEvent({ id: 'evt_x', type: 'charge.updated', data: {} }),
      'ignored',
    );

    const bad = await request(app)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 'falsa')
      .set('Content-Type', 'application/json')
      .send('{}');
    assert.equal(bad.status, 400);

    const confirmed = await agent.post(`/api/bookings/${id}/payment-confirmed`);
    assert.equal(confirmed.status, 400, 'en modo simulado se usa fake-pay');
  });
});

describe('cancelar (RF-35)', () => {
  beforeEach(() => setNow(T0));
  after(() => setNow(null));

  it('retira una solicitud pendiente y libera la autorización', async () => {
    const { services, resources, user: owner } = await createBusiness();
    const agent = await loginAs(await createUser());
    const r = await post(agent, services[0], resources[0], TUE, '10:00');
    const id = r.body.booking.id;
    await agent.post(`/api/bookings/${id}/fake-pay`);
    const c = await agent.post(`/api/bookings/${id}/cancel`);
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal(c.body.booking.status, 'cancelled');
    const b = await getBooking(id);
    assert.equal(b.cancelledBy, 'client');
    assert.equal((await getPayment(id)).status, 'released');
    const mail = mails('booking_cancelled_by_client', id);
    assert.equal(mail.length, 1);
    assert.equal(mail[0].to, owner.email);
  });

  it('cancela una confirmada antes del límite con reembolso y no después', async () => {
    const { business, services, resources } = await createBusiness();
    const client = await createUser();
    const { booking } = await createBooking({
      client,
      business,
      service: services[0],
      resource: resources[0],
      startsAt: at(TUE, '10:00'),
      status: 'confirmed',
    });
    const { booking: late } = await createBooking({
      client,
      business,
      service: services[0],
      resource: resources[0],
      startsAt: at(TUE, '12:00'),
      status: 'confirmed',
    });
    const agent = await loginAs(client);

    const detail = await agent.get(`/api/bookings/${booking.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.booking.canCancel, true);
    assert.equal(detail.body.booking.business.address, 'Calle 1, Ensenada');
    assert.equal(detail.body.booking.business.cancellationLimitHours, 12);
    // Límite: martes 10:00 − 12 h = lunes 22:00.
    assert.equal(detail.body.booking.cancelDeadline, '2030-01-08T06:00:00.000Z');

    const ok = await agent.post(`/api/bookings/${booking.id}/cancel`);
    assert.equal(ok.status, 200);
    assert.equal((await getPayment(booking.id)).status, 'refunded');
    assert.ok((await getPayment(booking.id)).refundedAt);
    assert.deepEqual(
      (await syncJobs(booking.id)).map((j) => j.action),
      ['delete'],
    );
    assert.equal(mails('booking_cancelled_by_client', booking.id).length, 1);

    // La de las 12:00 se puede cancelar hasta el martes 00:00; a esa hora ya no.
    setNow('2030-01-08T08:00:00Z');
    const closed = await agent.post(`/api/bookings/${late.id}/cancel`);
    assert.equal(closed.status, 409);
    assert.equal(closed.body.error, 'cancellation_closed');
    assert.equal((await getBooking(late.id)).status, 'confirmed');
    assert.equal((await agent.get(`/api/bookings/${late.id}`)).body.booking.canCancel, false);

    const again = await agent.post(`/api/bookings/${booking.id}/cancel`);
    assert.equal(again.body.error, 'not_cancellable');
    const stranger = await loginAs(await createUser());
    assert.equal((await stranger.post(`/api/bookings/${late.id}/cancel`)).status, 404);
    assert.equal((await stranger.get(`/api/bookings/${late.id}`)).status, 404);
  });
});

describe('mis reservas y volver a agendar (RF-38, RF-60)', () => {
  beforeEach(() => setNow(T0));
  after(() => setNow(null));

  it('separa en pestañas con conteos', async () => {
    const { business, services, resources } = await createBusiness();
    const client = await createUser();
    const mk = (startsAt, status) =>
      createBooking({
        client,
        business,
        service: services[0],
        resource: resources[0],
        startsAt,
        status,
      });
    const { booking: upcoming } = await mk(at(TUE, '10:00'), 'confirmed');
    const { booking: pending } = await mk(at(TUE, '12:00'), 'pending');
    const { booking: past } = await mk(new Date(T0 - 86400e3), 'completed');
    await mk(new Date(T0 - 2 * 86400e3), 'no_show');
    await mk(at('2030-01-09', '10:00'), 'cancelled');
    await mk(at('2030-01-09', '12:00'), 'rejected');
    const agent = await loginAs(client);
    // Un borrador no aparece en ninguna pestaña.
    await post(agent, services[0], resources[1], TUE, '15:00');

    const r = await agent.get('/api/bookings').query({ tab: 'upcoming' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.counts, { upcoming: 1, pending: 1, past: 2, cancelled: 2 });
    assert.deepEqual(
      r.body.items.map((x) => x.id),
      [upcoming.id],
    );
    assert.equal(r.body.items[0].service.name, services[0].name);
    assert.equal(r.body.items[0].resource.name, 'Juan');
    assert.equal((await agent.get('/api/bookings?tab=pending')).body.items[0].id, pending.id);
    const pastTab = (await agent.get('/api/bookings?tab=past')).body.items;
    assert.equal(pastTab[0].id, past.id, 'las pasadas van de la más reciente a la más antigua');
    assert.equal(pastTab[0].canReview, true);
    assert.equal(pastTab[1].canReview, false, 'no asistió no se puede calificar');
    assert.equal((await agent.get('/api/bookings?tab=cancelled')).body.items.length, 2);
    assert.equal((await agent.get('/api/bookings?tab=otra')).status, 400);
  });

  it('lista citas anteriores, una por negocio + servicio + recurso, solo si siguen activos', async () => {
    const { business, services, resources } = await createBusiness();
    const hidden = await createBusiness({ status: 'suspended' });
    const client = await createUser();
    const mk = (b, sv, rs, daysAgo, status = 'completed') =>
      createBooking({
        client,
        business: b,
        service: sv,
        resource: rs,
        startsAt: new Date(T0 - daysAgo * 86400e3),
        status,
      });
    await mk(business, services[0], resources[0], 30);
    const { booking: recent } = await mk(business, services[0], resources[0], 5);
    await mk(business, services[1], resources[1], 10);
    await mk(business, services[0], resources[1], 3, 'cancelled');
    await mk(hidden.business, hidden.services[0], hidden.resources[0], 2);
    const agent = await loginAs(client);
    const r = await agent.get('/api/bookings/rebook');
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 2);
    assert.equal(r.body.items[0].bookingId, recent.id, 'la más reciente primero');
    assert.equal(r.body.items[0].service.id, services[0].id);
    assert.equal(r.body.items[0].resource.id, resources[0].id);

    await db.update(s.services).set({ active: false }).where(eq(s.services.id, services[1].id));
    const after = await agent.get('/api/bookings/rebook');
    assert.equal(after.body.items.length, 1, 'el servicio desactivado ya no aparece');
    const detail = await agent.get(`/api/bookings/${recent.id}`);
    assert.equal(detail.body.booking.canRebook, true);
  });
});
