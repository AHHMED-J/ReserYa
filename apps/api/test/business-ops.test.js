import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { eq, and } from 'drizzle-orm';
import {
  app,
  setupDb,
  closeDb,
  createUser,
  createBusiness,
  createBooking,
  loginAs,
  loginOwner,
  localAt,
  outbox,
  setNow,
  db,
  s,
} from './helpers.js';
import { jobs } from '../src/modules/business-ops/jobs.js';
import {
  expireRequests,
  completePastBookings,
  sendReminders,
} from '../src/modules/business-ops/actions.js';

before(setupDb);
after(closeDb);
afterEach(() => setNow(null));

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Solicitud pendiente (pago autorizado) recibida `agoMin` minutos antes. */
async function makeRequest({ client, biz, service = 0, resource = 0, startsAt, agoMin = 60 }) {
  const { booking, payment } = await createBooking({
    client: client ?? (await createUser({ firstName: 'Cliente', lastName: 'Prueba' })),
    business: biz.business,
    service: biz.services[service],
    resource: biz.resources[resource],
    startsAt,
    status: 'pending',
  });
  const submittedAt = new Date(Date.now() - agoMin * MIN);
  await db.update(s.bookings).set({ submittedAt }).where(eq(s.bookings.id, booking.id));
  return { booking: { ...booking, submittedAt }, payment };
}

const getBooking = async (id) =>
  (await db.select().from(s.bookings).where(eq(s.bookings.id, id)))[0];
const getPayment = async (bookingId) =>
  (await db.select().from(s.payments).where(eq(s.payments.bookingId, bookingId)))[0];
const syncJobs = (bookingId) =>
  db.select().from(s.calendarSyncJobs).where(eq(s.calendarSyncJobs.bookingId, bookingId));
const mails = (template, bookingId) =>
  outbox.filter((m) => m.template === template && m.bookingId === bookingId);

describe('cola de solicitudes (RF-28)', () => {
  it('agrupa las encimadas del mismo recurso, la primera en llegar arriba', async () => {
    const biz = await createBusiness();
    const carlos = await createUser({ firstName: 'Carlos', lastName: 'Martínez' });
    const ana = await createUser({ firstName: 'Ana', lastName: 'Pérez' });
    // Ana llega después pero su cita empieza antes: Carlos sigue siendo el primero del grupo.
    const c = await makeRequest({
      client: carlos,
      biz,
      startsAt: localAt(1, '16:00'),
      agoMin: 120,
    });
    const a = await makeRequest({
      client: ana,
      biz,
      service: 1,
      startsAt: localAt(1, '15:50'),
      agoMin: 30,
    });
    // Encadenada: no choca con la de Ana pero sí con la de Carlos → mismo grupo.
    const chain = await makeRequest({ biz, service: 1, startsAt: localAt(1, '16:30'), agoMin: 10 });
    const otherRes = await makeRequest({
      biz,
      resource: 1,
      startsAt: localAt(1, '16:00'),
      agoMin: 5,
    });
    const nextDay = await makeRequest({ biz, startsAt: localAt(2, '10:00'), agoMin: 1 });
    // No son solicitudes visibles: borrador sin pagar, ya vencida y de otro negocio.
    const draft = await makeRequest({ biz, startsAt: localAt(1, '18:00') });
    await db
      .update(s.bookings)
      .set({ submittedAt: null })
      .where(eq(s.bookings.id, draft.booking.id));
    const late = await makeRequest({ biz, startsAt: localAt(1, '19:00') });
    await db
      .update(s.bookings)
      .set({ respondBy: new Date(Date.now() - MIN) })
      .where(eq(s.bookings.id, late.booking.id));
    await makeRequest({ biz: await createBusiness(), startsAt: localAt(1, '16:00') });

    const agent = await loginAs(biz.user);
    const r = await agent.get('/api/business/requests');
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 5);
    const groups = r.body.groups;
    assert.equal(groups.length, 3);

    const g1 = groups.find((g) => g.requests.some((x) => x.id === c.booking.id));
    assert.deepEqual(
      g1.requests.map((x) => x.id),
      [c.booking.id, a.booking.id, chain.booking.id],
    );
    assert.equal(g1.requests[0].first, true);
    assert.equal(g1.requests[1].first, false);
    const first = g1.requests[0];
    assert.equal(first.client.shortName, 'Carlos M.');
    assert.equal(first.client.phone, '6461234567');
    assert.ok(first.client.email);
    assert.equal(first.service.name, 'Corte de cabello');
    assert.equal(first.resource.name, 'Juan');
    assert.equal(first.amountCents, 20000);
    assert.ok(first.respondBy && first.submittedAt);
    assert.deepEqual(
      first.overlapsWith.map((o) => o.id).sort(),
      [a.booking.id, chain.booking.id].sort(),
    );
    assert.deepEqual(
      g1.requests[1].overlapsWith.map((o) => o.shortName),
      ['Carlos M.'],
    );

    // Pedro a la misma hora es otro grupo; el de mañana va al final.
    const g2 = groups.find((g) => g.requests[0].id === otherRes.booking.id);
    assert.equal(g2.requests.length, 1);
    assert.equal(g2.requests[0].first, true);
    assert.deepEqual(g2.requests[0].overlapsWith, []);
    assert.equal(groups.at(-1).requests[0].id, nextDay.booking.id);

    const sum = await agent.get('/api/business/summary');
    assert.equal(sum.body.pendingRequests, 5);
  });
});

describe('aceptar y rechazar (RF-29, RF-30, RF-33)', () => {
  it('aceptar cobra, rechaza las encimadas, avisa y encola Google', async () => {
    const biz = await createBusiness();
    const win = await makeRequest({ biz, startsAt: localAt(1, '16:00'), agoMin: 90 });
    const lose = await makeRequest({ biz, service: 1, startsAt: localAt(1, '16:20'), agoMin: 30 });
    const otherRes = await makeRequest({ biz, resource: 1, startsAt: localAt(1, '16:00') });
    const later = await makeRequest({ biz, startsAt: localAt(1, '17:00') });

    const agent = await loginAs(biz.user);
    const r = await agent.post(`/api/business/requests/${win.booking.id}/accept`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.booking.status, 'confirmed');
    assert.deepEqual(r.body.rejected, [lose.booking.id]);

    const won = await getBooking(win.booking.id);
    assert.equal(won.status, 'confirmed');
    assert.ok(won.decidedAt);
    const wonPay = await getPayment(win.booking.id);
    assert.equal(wonPay.status, 'captured');
    assert.ok(wonPay.capturedAt);
    const jobs = await syncJobs(win.booking.id);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].action, 'create');
    assert.equal(mails('request_accepted', win.booking.id).length, 1);

    assert.equal((await getBooking(lose.booking.id)).status, 'rejected');
    assert.equal((await getPayment(lose.booking.id)).status, 'released');
    assert.equal(mails('request_rejected', lose.booking.id).length, 1);

    // Otro recurso y otra hora no se tocan.
    assert.equal((await getBooking(otherRes.booking.id)).status, 'pending');
    assert.equal((await getBooking(later.booking.id)).status, 'pending');

    const again = await agent.post(`/api/business/requests/${win.booking.id}/accept`);
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'not_pending');
  });

  it('si el horario ya está ocupado responde slot_taken y no cobra nada', async () => {
    const biz = await createBusiness();
    const client = await createUser();
    await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: localAt(1, '10:00'),
      status: 'confirmed',
    });
    const req = await makeRequest({ biz, startsAt: localAt(1, '10:20') });
    const agent = await loginAs(biz.user);
    const r = await agent.post(`/api/business/requests/${req.booking.id}/accept`);
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'slot_taken');
    assert.equal((await getBooking(req.booking.id)).status, 'pending');
    const pay = await getPayment(req.booking.id);
    assert.equal(pay.status, 'authorized');
    assert.equal(pay.capturedAt, null);
    assert.equal((await syncJobs(req.booking.id)).length, 0);
    assert.equal(mails('request_accepted', req.booking.id).length, 0);
  });

  it('dos aceptaciones al mismo tiempo: solo una gana', async () => {
    const biz = await createBusiness();
    const one = await makeRequest({ biz, startsAt: localAt(1, '12:00'), agoMin: 50 });
    const agent = await loginAs(biz.user);
    const same = await Promise.all([
      agent.post(`/api/business/requests/${one.booking.id}/accept`),
      agent.post(`/api/business/requests/${one.booking.id}/accept`),
    ]);
    assert.deepEqual(same.map((x) => x.status).sort(), [200, 409]);
    assert.equal((await syncJobs(one.booking.id)).length, 1);
    assert.equal(mails('request_accepted', one.booking.id).length, 1);

    // Dos solicitudes distintas que se enciman en el mismo recurso.
    const a = await makeRequest({ biz, startsAt: localAt(1, '15:00'), agoMin: 40 });
    const b = await makeRequest({ biz, startsAt: localAt(1, '15:20'), agoMin: 20 });
    const res = await Promise.all([
      agent.post(`/api/business/requests/${a.booking.id}/accept`),
      agent.post(`/api/business/requests/${b.booking.id}/accept`),
    ]);
    assert.deepEqual(res.map((x) => x.status).sort(), [200, 409]);
    const loser = res.find((x) => x.status === 409);
    assert.ok(['slot_taken', 'not_pending'].includes(loser.body.error));
    const rows = await Promise.all([getBooking(a.booking.id), getBooking(b.booking.id)]);
    assert.deepEqual(rows.map((x) => x.status).sort(), ['confirmed', 'rejected']);
    const pays = await Promise.all([getPayment(a.booking.id), getPayment(b.booking.id)]);
    assert.deepEqual(pays.map((p) => p.status).sort(), ['captured', 'released']);
  });

  it('rechazar libera el pago y avisa', async () => {
    const biz = await createBusiness();
    const req = await makeRequest({ biz, startsAt: localAt(2, '11:00') });
    const agent = await loginAs(biz.user);

    const outsider = await loginAs((await createBusiness()).user);
    assert.equal(
      (await outsider.post(`/api/business/requests/${req.booking.id}/reject`)).status,
      404,
    );

    const r = await agent.post(`/api/business/requests/${req.booking.id}/reject`);
    assert.equal(r.status, 200);
    assert.equal(r.body.booking.status, 'rejected');
    assert.equal((await getPayment(req.booking.id)).status, 'released');
    assert.equal(mails('request_rejected', req.booking.id).length, 1);
    const again = await agent.post(`/api/business/requests/${req.booking.id}/reject`);
    assert.equal(again.body.error, 'not_pending');
    assert.equal(mails('request_rejected', req.booking.id).length, 1);
  });

  it('no deja aceptar una solicitud que ya venció', async () => {
    const biz = await createBusiness();
    const req = await makeRequest({ biz, startsAt: localAt(2, '11:00') });
    await db
      .update(s.bookings)
      .set({ respondBy: new Date(Date.now() - MIN) })
      .where(eq(s.bookings.id, req.booking.id));
    const agent = await loginAs(biz.user);
    const r = await agent.post(`/api/business/requests/${req.booking.id}/accept`);
    assert.equal(r.body.error, 'request_expired');
    assert.equal((await getPayment(req.booking.id)).status, 'authorized');
  });
});

describe('tareas periódicas', () => {
  it('están registradas', () => {
    assert.deepEqual(
      jobs.map((j) => j.name),
      ['vencer-solicitudes', 'completar-citas', 'recordatorios'],
    );
  });

  it('vence a las 12 h sin respuesta (RF-31)', async () => {
    const biz = await createBusiness();
    const t0 = Date.now();
    const req = await makeRequest({ biz, startsAt: new Date(t0 + 3 * 24 * HOUR), agoMin: 0 });
    await db
      .update(s.bookings)
      .set({ submittedAt: new Date(t0), respondBy: new Date(t0 + 12 * HOUR) })
      .where(eq(s.bookings.id, req.booking.id));

    setNow(new Date(t0 + 11 * HOUR));
    await expireRequests();
    assert.equal((await getBooking(req.booking.id)).status, 'pending');

    setNow(new Date(t0 + 12 * HOUR + MIN));
    await expireRequests();
    assert.equal((await getBooking(req.booking.id)).status, 'expired');
    assert.equal((await getPayment(req.booking.id)).status, 'released');
    assert.equal(mails('request_expired', req.booking.id).length, 1);

    await expireRequests(); // idempotente
    assert.equal(mails('request_expired', req.booking.id).length, 1);
  });

  it('vence 1 h antes de la cita si eso llega primero', async () => {
    const biz = await createBusiness();
    const t0 = Date.now();
    const start = new Date(t0 + 5 * HOUR);
    const req = await makeRequest({ biz, startsAt: start, agoMin: 0 });
    const b = await getBooking(req.booking.id);
    assert.ok(Math.abs(b.respondBy - (start - HOUR)) < 5000, 'respondBy = inicio − 1 h');

    setNow(new Date(t0 + 3 * HOUR));
    await expireRequests();
    assert.equal((await getBooking(req.booking.id)).status, 'pending');

    setNow(new Date(t0 + 4 * HOUR + MIN));
    await expireRequests();
    assert.equal((await getBooking(req.booking.id)).status, 'expired');

    // Aunque respondBy viniera mal, una solicitud a menos de 1 h de la cita también vence.
    const odd = await makeRequest({ biz, startsAt: new Date(t0 + 30 * HOUR), agoMin: 0 });
    await db
      .update(s.bookings)
      .set({ respondBy: new Date(t0 + 40 * HOUR) })
      .where(eq(s.bookings.id, odd.booking.id));
    setNow(new Date(t0 + 29.5 * HOUR));
    await expireRequests();
    assert.equal((await getBooking(odd.booking.id)).status, 'expired');
  });

  it('completa las citas confirmadas que ya pasaron (RF-37)', async () => {
    const biz = await createBusiness();
    const client = await createUser();
    const past = await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: new Date(Date.now() - 2 * HOUR),
    });
    const future = await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: localAt(1, '12:00'),
    });
    assert.ok((await completePastBookings()) >= 1);
    const done = await getBooking(past.booking.id);
    assert.equal(done.status, 'completed');
    assert.ok(done.completedAt);
    assert.equal((await getBooking(future.booking.id)).status, 'confirmed');
    assert.equal(await completePastBookings(), 0);
  });

  it('manda el recordatorio 24 h antes una sola vez (RF-50)', async () => {
    const biz = await createBusiness();
    const client = await createUser();
    const t0 = Date.now();
    const mk = (startsAt, decidedAt, resource = 0) =>
      createBooking({
        client,
        business: biz.business,
        service: biz.services[0],
        resource: biz.resources[resource],
        startsAt,
      }).then(async ({ booking }) => {
        await db.update(s.bookings).set({ decidedAt }).where(eq(s.bookings.id, booking.id));
        return booking;
      });
    const soon = await mk(new Date(t0 + 20 * HOUR), new Date(t0 - 3 * 24 * HOUR));
    const far = await mk(new Date(t0 + 30 * HOUR), new Date(t0 - 3 * 24 * HOUR));
    const justConfirmed = await mk(new Date(t0 + 20 * HOUR), new Date(t0 - HOUR), 1);

    await sendReminders();
    assert.equal(mails('booking_reminder', soon.id).length, 1);
    assert.equal(mails('booking_reminder', far.id).length, 0);
    assert.equal(mails('booking_reminder', justConfirmed.id).length, 0);
    await sendReminders();
    assert.equal(mails('booking_reminder', soon.id).length, 1, 'no se repite');

    setNow(new Date(t0 + 7 * HOUR));
    await sendReminders();
    assert.equal(mails('booking_reminder', far.id).length, 1);
  });
});

describe('no asistió y cancelación del dueño (RF-36, RF-37)', () => {
  it('marca no asistió solo cuando la cita ya empezó', async () => {
    const biz = await createBusiness();
    const client = await createUser();
    const started = await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: new Date(Date.now() - 30 * MIN),
    });
    const future = await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: localAt(1, '12:00'),
    });
    const agent = await loginAs(biz.user);
    const r = await agent.post(`/api/business/bookings/${started.booking.id}/no-show`);
    assert.equal(r.status, 200);
    assert.equal(r.body.booking.status, 'no_show');
    assert.equal((await getPayment(started.booking.id)).status, 'captured', 'no se reembolsa');

    const f = await agent.post(`/api/business/bookings/${future.booking.id}/no-show`);
    assert.equal(f.status, 409);
    assert.equal(f.body.error, 'cannot_mark_no_show');
  });

  it('el dueño cancela con motivo y se reembolsa el 100%', async () => {
    const biz = await createBusiness();
    const client = await createUser();
    const { booking } = await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: localAt(2, '12:00'),
    });
    const reception = await loginAs(biz.user);
    const locked = await reception
      .post(`/api/business/bookings/${booking.id}/cancel`)
      .send({ reason: 'Se enfermó el barbero' });
    assert.equal(locked.status, 403);
    assert.equal(locked.body.error, 'owner_mode_locked');

    const owner = await loginOwner(biz.user);
    const noReason = await owner.post(`/api/business/bookings/${booking.id}/cancel`).send({});
    assert.equal(noReason.status, 400);

    const r = await owner
      .post(`/api/business/bookings/${booking.id}/cancel`)
      .send({ reason: 'Se enfermó el barbero' });
    assert.equal(r.status, 200);
    const b = await getBooking(booking.id);
    assert.equal(b.status, 'cancelled');
    assert.equal(b.cancelledBy, 'business');
    assert.equal(b.cancellationReason, 'Se enfermó el barbero');
    const pay = await getPayment(booking.id);
    assert.equal(pay.status, 'refunded');
    assert.ok(pay.refundedAt);
    const jobs = await syncJobs(booking.id);
    assert.deepEqual(
      jobs.map((j) => j.action),
      ['delete'],
    );
    const mail = mails('booking_cancelled_by_business', booking.id);
    assert.equal(mail.length, 1);
    assert.equal(mail[0].to, client.email);
    assert.match(mail[0].text, /Se enfermó el barbero/);

    const again = await owner
      .post(`/api/business/bookings/${booking.id}/cancel`)
      .send({ reason: 'Otra vez el motivo' });
    assert.equal(again.body.error, 'not_confirmed');
  });
});

describe('permisos', () => {
  it('recepción ve la operación; el dueño además dinero y estadísticas', async () => {
    const biz = await createBusiness();
    assert.equal((await request(app).get('/api/business/requests')).status, 401);

    const client = await loginAs(await createUser());
    const c = await client.get('/api/business/requests');
    assert.equal(c.status, 403);
    assert.equal(c.body.error, 'wrong_role');

    const pending = await createBusiness({ status: 'pending' });
    const p = await (await loginAs(pending.user)).get('/api/business/agenda');
    assert.equal(p.body.error, 'business_not_active');

    const reception = await loginAs(biz.user);
    for (const path of ['summary', 'requests', 'agenda', 'bookings']) {
      assert.equal((await reception.get(`/api/business/${path}`)).status, 200, path);
    }
    for (const path of ['dashboard', 'stats', 'payments', 'live-links']) {
      const r = await reception.get(`/api/business/${path}`);
      assert.equal(r.body.error, 'owner_mode_locked', path);
    }
    const owner = await loginOwner(biz.user);
    for (const path of ['dashboard', 'stats', 'payments', 'live-links']) {
      assert.equal((await owner.get(`/api/business/${path}`)).status, 200, path);
    }
  });
});

describe('agenda y reservas (RF-44)', () => {
  it('arma una columna por recurso con citas, bloques de Google y solicitudes', async () => {
    const biz = await createBusiness();
    const client = await createUser({ firstName: 'Diego', lastName: 'Arce' });
    const day = localAt(1, '00:00');
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tijuana' }).format(day);
    const conf = await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: localAt(1, '10:00'),
    });
    await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: localAt(1, '12:00'),
      status: 'cancelled',
    });
    const req = await makeRequest({ biz, resource: 1, startsAt: localAt(1, '11:00') });
    await db.insert(s.externalBusyBlocks).values({
      resourceId: biz.resources[0].id,
      googleEventId: 'g1',
      title: 'Comida',
      startsAt: localAt(1, '13:00'),
      endsAt: localAt(1, '14:00'),
    });
    const agent = await loginAs(biz.user);
    const r = await agent.get(`/api/business/agenda?date=${date}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.open, { start: '09:00', end: '20:00' });
    const [juan, pedro] = r.body.resources;
    assert.equal(juan.name, 'Juan');
    assert.ok(juan.color);
    assert.deepEqual(
      juan.bookings.map((b) => b.id),
      [conf.booking.id],
    );
    assert.equal(juan.bookings[0].clientName, 'Diego A.');
    assert.equal(juan.busy[0].title, 'Comida');
    assert.deepEqual(
      pedro.requests.map((b) => b.id),
      [req.booking.id],
    );

    const bad = await agent.get('/api/business/agenda?date=mañana');
    assert.equal(bad.status, 400);
  });

  it('lista reservas con filtros y muestra el detalle', async () => {
    const biz = await createBusiness();
    const diego = await createUser({ firstName: 'Diego', lastName: 'Arce' });
    const rosa = await createUser({ firstName: 'Rosa', lastName: 'Treviño' });
    const d1 = await createBooking({
      client: diego,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: localAt(1, '10:00'),
    });
    await createBooking({
      client: rosa,
      business: biz.business,
      service: biz.services[1],
      resource: biz.resources[1],
      startsAt: localAt(1, '10:00'),
      status: 'cancelled',
    });
    const draft = await makeRequest({ client: rosa, biz, startsAt: localAt(3, '10:00') });
    await db
      .update(s.bookings)
      .set({ submittedAt: null })
      .where(eq(s.bookings.id, draft.booking.id));

    const agent = await loginAs(biz.user);
    const all = await agent.get('/api/business/bookings');
    assert.equal(all.body.total, 2, 'sin borradores');
    const q = await agent.get('/api/business/bookings?q=dieg');
    assert.deepEqual(
      q.body.items.map((b) => b.id),
      [d1.booking.id],
    );
    const st = await agent.get('/api/business/bookings?status=cancelled');
    assert.equal(st.body.items[0].client.firstName, 'Rosa');
    const page = await agent.get('/api/business/bookings?pageSize=1&page=2');
    assert.equal(page.body.items.length, 1);
    assert.equal((await agent.get('/api/business/bookings?status=nope')).status, 400);

    const det = await agent.get(`/api/business/bookings/${d1.booking.id}`);
    assert.equal(det.status, 200);
    assert.equal(det.body.booking.client.phone, '6461234567');
    assert.equal(det.body.booking.payment.status, 'captured');
    assert.deepEqual(det.body.booking.actions, {
      accept: false,
      reject: false,
      noShow: false,
      cancel: true,
    });
    const other = await loginAs((await createBusiness()).user);
    assert.equal((await other.get(`/api/business/bookings/${d1.booking.id}`)).status, 404);
  });
});

describe('panel, estadísticas y pagos (RF-51, RF-52)', () => {
  it('calcula ingresos por semana, servicios más vendidos y horas ocupadas', async () => {
    const biz = await createBusiness();
    const client = await createUser();
    const mk = async (service, startsAt, extra = {}) => {
      const { booking, payment } = await createBooking({
        client,
        business: biz.business,
        service: biz.services[service],
        resource: biz.resources[0],
        startsAt,
        status: extra.status ?? 'completed',
        paymentStatus: extra.paymentStatus,
      });
      await db
        .update(s.payments)
        .set({ capturedAt: startsAt, refundedAt: extra.refundedAt ?? null })
        .where(eq(s.payments.id, payment.id));
      return booking;
    };
    // Esta semana o la pasada, según el día; lo importante es que caen en el rango de 8 semanas.
    await mk(0, localAt(-7, '10:00'));
    await mk(0, localAt(-8, '10:00'));
    await mk(1, localAt(-9, '17:00'));
    await mk(0, localAt(-10, '10:00'), {
      status: 'cancelled',
      paymentStatus: 'refunded',
      refundedAt: localAt(-10, '09:00'),
    });

    const owner = await loginOwner(biz.user);
    const r = await owner.get('/api/business/stats?weeks=8');
    assert.equal(r.status, 200);
    assert.equal(r.body.revenueByWeek.length, 8);
    // Cobrados 200 + 200 + 120 + 200, reembolsados 200 → neto 520.
    assert.equal(r.body.totals.netCents, 52000);
    assert.equal(r.body.totals.bookings, 3);
    const captured = r.body.revenueByWeek.reduce((a, w) => a + w.capturedCents, 0);
    assert.equal(captured, 72000);
    assert.equal(r.body.topServices[0].name, 'Corte de cabello');
    assert.equal(r.body.topServices[0].count, 2);
    const ten = r.body.busyHours.filter((h) => h.hour === 10).reduce((a, h) => a + h.count, 0);
    assert.equal(ten, 2);
    assert.equal((await owner.get('/api/business/stats?weeks=0')).status, 400);

    const pay = await owner.get('/api/business/payments');
    assert.equal(pay.status, 200);
    assert.equal(pay.body.total, 4);
    assert.equal(pay.body.totals.capturedCents, 72000);
    assert.equal(pay.body.totals.refundedCents, 20000);
    assert.equal(pay.body.totals.netCents, 52000);
    const refunded = await owner.get('/api/business/payments?status=refunded');
    assert.equal(refunded.body.items.length, 1);
    assert.equal(refunded.body.items[0].serviceName, 'Corte de cabello');
    assert.ok(refunded.body.items[0].client.name);

    const dash = await owner.get('/api/business/dashboard');
    assert.equal(dash.status, 200);
    assert.equal(dash.body.bookingsByDay.length, 7);
    for (const k of ['monthCents', 'weekCents', 'prevMonthCents']) {
      assert.equal(typeof dash.body.revenue[k], 'number');
    }
    assert.equal(typeof dash.body.pendingRequests, 'number');
    assert.ok(Array.isArray(dash.body.upcoming));
    assert.equal(dash.body.setup.activeServices, 2);
  });
});

describe('aislamiento entre negocios', () => {
  it('un negocio no acepta solicitudes de otro', async () => {
    const a = await createBusiness();
    const b = await createBusiness();
    const req = await makeRequest({ biz: a, startsAt: localAt(1, '12:00') });
    const agentB = await loginAs(b.user);
    assert.equal(
      (await agentB.post(`/api/business/requests/${req.booking.id}/accept`)).status,
      404,
    );
    const rows = await db
      .select()
      .from(s.bookings)
      .where(and(eq(s.bookings.id, req.booking.id), eq(s.bookings.status, 'pending')));
    assert.equal(rows.length, 1);
  });
});
