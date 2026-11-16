import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import {
  app,
  setupDb,
  closeDb,
  createAdmin,
  createUser,
  createBusiness,
  createBooking,
  loginAs,
  localAt,
  outbox,
  db,
  s,
  PASSWORD,
} from './helpers.js';

before(setupDb);
after(closeDb);

const lastMail = (template) => outbox.findLast((m) => m.template === template);

/** Registra un negocio por la API con una clave nueva del admin. */
async function registerWithKey(adminAgent, name = 'Uñas Lupita') {
  const gen = await adminAgent.post('/api/admin/keys').send({ count: 1 });
  const code = gen.body.created[0].code;
  const [cat] = await db.select().from(s.categories).limit(1);
  const agent = request.agent(app);
  const r = await agent.post('/api/business/register').send({
    code,
    firstName: 'Lupita',
    lastName: 'Pérez',
    email: `lupita${Date.now()}${Math.random().toString(36).slice(2, 6)}@prueba.test`,
    phone: '6462228810',
    password: PASSWORD,
    acceptTerms: true,
    businessName: name,
    categoryId: cat.id,
    businessPhone: '6462228810',
    address: 'Av. Ruiz 123, Ensenada',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { agent, id: r.body.user.business.id, email: r.body.user.email, code };
}

describe('permisos del administrador', () => {
  it('un cliente, un negocio o alguien sin sesión no entra a /api/admin', async () => {
    assert.equal((await request(app).get('/api/admin/summary')).status, 401);
    const client = await loginAs(await createUser());
    const r = await client.get('/api/admin/summary');
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'wrong_role');
    const { user } = await createBusiness();
    const biz = await loginAs(user);
    assert.equal((await biz.post('/api/admin/keys').send({ count: 1 })).status, 403);
  });
});

describe('claves de registro (RF-09)', () => {
  it('genera, lista con su estado y borra solo las libres', async () => {
    const admin = await loginAs(await createAdmin());
    const gen = await admin.post('/api/admin/keys').send({ count: 3 });
    assert.equal(gen.status, 201);
    assert.equal(gen.body.created.length, 3);
    for (const k of gen.body.created) assert.match(k.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    assert.equal((await admin.post('/api/admin/keys').send({ count: 11 })).status, 400);
    assert.equal((await admin.post('/api/admin/keys').send({ count: 0 })).status, 400);

    const { code } = await registerWithKey(admin, 'Barbería Clave');
    const list = await admin.get('/api/admin/keys');
    const used = list.body.keys.find((k) => k.code === code);
    assert.ok(used.usedAt);
    assert.equal(used.business.name, 'Barbería Clave');

    const delUsed = await admin.delete(`/api/admin/keys/${used.id}`);
    assert.equal(delUsed.status, 409);
    assert.equal(delUsed.body.error, 'key_used');
    const free = gen.body.created[0];
    const del = await admin.delete(`/api/admin/keys/${free.id}`);
    assert.equal(del.status, 200);
    assert.ok(!del.body.keys.some((k) => k.id === free.id));
  });
});

describe('aprobar y rechazar (RF-11, RF-72)', () => {
  it('aprueba un pendiente y le avisa por correo', async () => {
    const admin = await loginAs(await createAdmin());
    const reg = await registerWithKey(admin, 'Futbolito Norte');

    const summary = await admin.get('/api/admin/summary');
    assert.ok(summary.body.pendingCount >= 1);
    const pending = await admin.get('/api/admin/businesses').query({ status: 'pending' });
    const row = pending.body.businesses.find((b) => b.id === reg.id);
    assert.equal(row.keyCode, reg.code);
    assert.equal(row.email, reg.email);
    const search = await admin.get('/api/admin/businesses').query({ q: 'futbolito' });
    assert.deepEqual(
      search.body.businesses.map((b) => b.id),
      [reg.id],
    );

    const detail = await admin.get(`/api/admin/businesses/${reg.id}`);
    assert.equal(detail.body.business.owner.firstName, 'Lupita');
    assert.equal(detail.body.business.counts.bookings, 0);

    const ok = await admin.post(`/api/admin/businesses/${reg.id}/approve`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.business.status, 'approved');
    assert.ok(ok.body.business.approvedAt);
    const mail = lastMail('business_approved');
    assert.equal(mail.to, reg.email);
    assert.match(mail.html, /\/entrar/);

    // El negocio ya entra a su configuración.
    const setup = await reg.agent.get('/api/business/setup');
    assert.equal(setup.status, 200);
    assert.equal(setup.body.ready, false);

    const again = await admin.post(`/api/admin/businesses/${reg.id}/approve`);
    assert.equal(again.body.error, 'invalid_status');
  });

  it('rechaza con motivo, lo manda por correo y el negocio lo ve', async () => {
    const admin = await loginAs(await createAdmin());
    const reg = await registerWithKey(admin, 'Spa Dudoso');

    const noReason = await admin.post(`/api/admin/businesses/${reg.id}/reject`).send({});
    assert.equal(noReason.status, 400);

    const reason = 'La dirección no corresponde a un local en Ensenada.';
    const r = await admin.post(`/api/admin/businesses/${reg.id}/reject`).send({ reason });
    assert.equal(r.status, 200);
    assert.equal(r.body.business.status, 'rejected');
    assert.equal(r.body.business.rejectionReason, reason);
    const mail = lastMail('business_rejected');
    assert.equal(mail.to, reg.email);
    assert.ok(mail.text.includes(reason));

    const me = await reg.agent.get('/api/auth/me');
    assert.equal(me.body.user.business.status, 'rejected');
    assert.equal(me.body.user.business.rejectionReason, reason);
    assert.equal((await reg.agent.get('/api/business/setup')).body.error, 'business_not_active');
  });
});

describe('suspender y reactivar (RF-12, RF-72)', () => {
  it('al suspender el negocio pierde el acceso y las reservas se quedan', async () => {
    const admin = await loginAs(await createAdmin());
    const { user, business, services, resources } = await createBusiness();
    const { booking } = await createBooking({
      client: await createUser(),
      business,
      service: services[0],
      resource: resources[0],
      startsAt: localAt(1, '10:00'),
    });
    const biz = await loginAs(user);
    assert.equal((await biz.get('/api/business/services')).status, 200);

    const reason = 'Recibimos varias quejas de clientes por cobros indebidos.';
    const r = await admin.post(`/api/admin/businesses/${business.id}/suspend`).send({ reason });
    assert.equal(r.status, 200);
    assert.equal(r.body.business.status, 'suspended');
    assert.equal(r.body.business.suspensionReason, reason);
    assert.equal(r.body.business.counts.bookings, 1);
    assert.ok(lastMail('business_suspended').text.includes(reason));

    // Con la misma sesión ya no puede usar las rutas del negocio.
    const blocked = await biz.get('/api/business/services');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error, 'business_not_active');
    const me = await biz.get('/api/auth/me');
    assert.equal(me.body.user.business.suspensionReason, reason);
    const [kept] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    assert.equal(kept.status, 'confirmed');

    // Solo se suspende un negocio activo.
    const twice = await admin.post(`/api/admin/businesses/${business.id}/suspend`).send({ reason });
    assert.equal(twice.body.error, 'invalid_status');

    const back = await admin.post(`/api/admin/businesses/${business.id}/reactivate`);
    assert.equal(back.body.business.status, 'approved');
    assert.equal(back.body.business.suspensionReason, null);
    assert.equal(lastMail('business_reactivated').to, user.email);
    assert.equal((await biz.get('/api/business/services')).status, 200);
  });
});

describe('contactar a un negocio (RF-13)', () => {
  it('manda un correo con asunto y mensaje', async () => {
    const admin = await loginAs(await createAdmin());
    const { user, business } = await createBusiness();
    const r = await admin
      .post(`/api/admin/businesses/${business.id}/contact`)
      .send({ subject: 'Faltan fotos', message: 'Hola.\n\nAgrega fotos de tu local, por favor.' });
    assert.equal(r.status, 200);
    const mail = lastMail('admin_contact');
    assert.equal(mail.to, user.email);
    assert.equal(mail.subject, 'Faltan fotos');
    assert.match(mail.html, /Agrega fotos de tu local/);

    const bad = await admin
      .post(`/api/admin/businesses/${business.id}/contact`)
      .send({ subject: '' });
    assert.equal(bad.status, 400);
    const missing = await admin
      .post('/api/admin/businesses/00000000-0000-4000-8000-000000000000/contact')
      .send({ subject: 'Hola', message: 'Mensaje de prueba' });
    assert.equal(missing.status, 404);
  });
});
