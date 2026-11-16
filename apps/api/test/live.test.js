import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { eq } from 'drizzle-orm';
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
  db,
  s,
} from './helpers.js';

before(setupDb);
after(closeDb);

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tijuana' }).format(localAt(0, '12:00'));
const tomorrow = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tijuana' }).format(localAt(1, '12:00'));

describe('links en vivo (RF-45, RF-46, RF-47)', () => {
  it('solo el dueño los administra', async () => {
    const biz = await createBusiness();
    const reception = await loginAs(biz.user);
    const r = await reception.post('/api/business/live-links').send({});
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'owner_mode_locked');
  });

  it('crea, comparte sin datos sensibles, regenera y borra', async () => {
    const biz = await createBusiness();
    const client = await createUser({
      firstName: 'Carlos',
      lastName: 'Martínez',
      phone: '6469998877',
      email: 'carlos.privado@prueba.test',
    });
    await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: localAt(1, '10:00'),
    });
    await createBooking({
      client,
      business: biz.business,
      service: biz.services[1],
      resource: biz.resources[1],
      startsAt: localAt(1, '11:00'),
    });
    // Una pendiente no sale en la pantalla.
    await createBooking({
      client,
      business: biz.business,
      service: biz.services[1],
      resource: biz.resources[1],
      startsAt: localAt(1, '15:00'),
      status: 'pending',
    });
    await db.insert(s.externalBusyBlocks).values({
      resourceId: biz.resources[0].id,
      googleEventId: 'privado',
      title: 'Cita con el dentista',
      startsAt: localAt(1, '13:00'),
      endsAt: localAt(1, '14:00'),
    });

    const owner = await loginOwner(biz.user);
    const created = await owner.post('/api/business/live-links').send({});
    assert.equal(created.status, 201);
    const link = created.body.link;
    assert.equal(link.resource, null);
    assert.ok(link.token.length >= 40, 'token largo');
    assert.match(link.url, new RegExp(`/en-vivo/${link.token}$`));
    const same = await owner.post('/api/business/live-links').send({ resourceId: null });
    assert.equal(same.status, 200);
    assert.equal(same.body.link.id, link.id, 'no duplica el del negocio completo');

    const pub = await request(app).get(`/api/live/${link.token}?date=${tomorrow()}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.business.name, biz.business.name);
    assert.equal(pub.body.resources.length, 2);
    const [juan, pedro] = pub.body.resources;
    assert.equal(juan.bookings[0].clientName, 'Carlos M.');
    assert.equal(juan.bookings[0].serviceName, 'Corte de cabello');
    assert.ok(juan.bookings[0].startsAt);
    assert.equal(pedro.bookings.length, 1, 'sin solicitudes pendientes');
    assert.deepEqual(Object.keys(juan.busy[0]).sort(), ['endsAt', 'startsAt']);
    const raw = JSON.stringify(pub.body);
    for (const secret of [
      '6469998877',
      'carlos.privado',
      'Martínez',
      'dentista',
      'Cents',
      'price',
    ]) {
      assert.ok(!raw.includes(secret), `no debe incluir ${secret}`);
    }
    assert.equal(pub.headers['cache-control'], 'no-store');
    assert.equal((await request(app).get(`/api/live/${link.token}`)).body.date, today());

    const regen = await owner.post(`/api/business/live-links/${link.id}/regenerate`);
    assert.equal(regen.status, 201);
    assert.notEqual(regen.body.link.token, link.token);
    const old = await request(app).get(`/api/live/${link.token}`);
    assert.equal(old.status, 404);
    assert.match(old.body.message, /ya no es válido/);
    assert.equal((await request(app).get(`/api/live/${regen.body.link.token}`)).status, 200);

    const list = await owner.get('/api/business/live-links');
    assert.deepEqual(
      list.body.links.map((l) => l.id),
      [regen.body.link.id],
    );

    assert.equal(
      (await owner.delete(`/api/business/live-links/${regen.body.link.id}`)).status,
      200,
    );
    assert.equal((await request(app).get(`/api/live/${regen.body.link.token}`)).status, 404);
    assert.equal((await owner.get('/api/business/live-links')).body.links.length, 0);
  });

  it('un link de un recurso muestra solo esa columna', async () => {
    const biz = await createBusiness();
    const owner = await loginOwner(biz.user);
    const r = await owner
      .post('/api/business/live-links')
      .send({ resourceId: biz.resources[1].id });
    assert.equal(r.status, 201);
    assert.equal(r.body.link.resource.name, 'Pedro');
    const pub = await request(app).get(`/api/live/${r.body.link.token}`);
    assert.deepEqual(
      pub.body.resources.map((x) => x.name),
      ['Pedro'],
    );
    assert.equal(pub.body.resource.name, 'Pedro');

    const other = await createBusiness();
    const bad = await owner
      .post('/api/business/live-links')
      .send({ resourceId: other.resources[0].id });
    assert.equal(bad.body.error, 'invalid_resource');
    const otherOwner = await loginOwner(other.user);
    assert.equal(
      (await otherOwner.post(`/api/business/live-links/${r.body.link.id}/regenerate`)).status,
      404,
    );
  });

  it('deja de funcionar si el negocio se suspende', async () => {
    const biz = await createBusiness();
    const owner = await loginOwner(biz.user);
    const { link } = (await owner.post('/api/business/live-links').send({})).body;
    await db
      .update(s.businesses)
      .set({ status: 'suspended' })
      .where(eq(s.businesses.id, biz.business.id));
    assert.equal((await request(app).get(`/api/live/${link.token}`)).status, 404);
    assert.equal((await request(app).get('/api/live/corto')).status, 400);
  });
});
