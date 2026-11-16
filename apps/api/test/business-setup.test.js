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
  loginOwner,
  localAt,
  outbox,
  db,
  s,
  PASSWORD,
} from './helpers.js';
import { registrationCode } from '../src/lib/crypto.js';

before(setupDb);
after(closeDb);

async function newKey(o = {}) {
  const admin = await createAdmin();
  const [key] = await db
    .insert(s.registrationKeys)
    .values({ code: registrationCode(), createdBy: admin.id, ...o })
    .returning();
  return key;
}

async function firstCategory() {
  const [cat] = await db.select().from(s.categories).limit(1);
  return cat;
}

let n = 0;
async function registerBody(code, o = {}) {
  const cat = await firstCategory();
  n++;
  return {
    code,
    firstName: 'Lupita',
    lastName: 'Pérez',
    email: `negocio${n}${Date.now()}@prueba.test`,
    phone: '646 222 8810',
    password: PASSWORD,
    acceptTerms: true,
    businessName: 'Uñas Lupita',
    categoryId: cat.id,
    businessPhone: '6462228810',
    address: 'Av. Ruiz 123, Ensenada',
    ...o,
  };
}

/** Negocio recién aprobado, sin servicios, recursos ni reglas. */
async function emptyBusiness() {
  const key = await newKey();
  const agent = request.agent(app);
  const r = await agent.post('/api/business/register').send(await registerBody(key.code));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const businessId = r.body.user.business.id;
  await db
    .update(s.businesses)
    .set({ status: 'approved', approvedAt: new Date() })
    .where(eq(s.businesses.id, businessId));
  await agent.post('/api/business/owner/pin').send({ pin: '1234' });
  await agent.post('/api/business/owner/unlock').send({ pin: '1234' });
  return { agent, businessId, email: r.body.user.email };
}

describe('registro del negocio con clave (RF-10)', () => {
  it('registra con una clave válida: negocio pendiente, clave usada, sesión abierta y correo', async () => {
    const key = await newKey();
    const agent = request.agent(app);
    const body = await registerBody(key.code.toLowerCase().replace('-', ' '));
    const check = await agent.post('/api/business/register/check').send(body);
    assert.equal(check.status, 200);

    const r = await agent.post('/api/business/register').send(body);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.user.role, 'business');
    assert.equal(r.body.user.emailVerified, true);
    assert.equal(r.body.user.business.status, 'pending');
    assert.equal(r.body.user.business.hasPin, false);

    const me = await agent.get('/api/auth/me');
    assert.equal(me.body.user.business.name, 'Uñas Lupita');

    const [k] = await db.select().from(s.registrationKeys).where(eq(s.registrationKeys.id, key.id));
    assert.ok(k.usedAt, 'la clave queda usada');
    const [b] = await db
      .select()
      .from(s.businesses)
      .where(eq(s.businesses.id, r.body.user.business.id));
    assert.equal(b.registrationKeyId, key.id);
    assert.equal(b.phone, '6462228810');
    assert.ok(outbox.some((m) => m.template === 'business_registered' && m.to === body.email));

    // Pendiente: no puede usar las rutas de negocio aprobado.
    const setup = await agent.get('/api/business/setup');
    assert.equal(setup.body.error, 'business_not_active');
  });

  it('rechaza una clave usada o inexistente', async () => {
    const used = await newKey({ usedAt: new Date() });
    const r1 = await request(app)
      .post('/api/business/register')
      .send(await registerBody(used.code));
    assert.equal(r1.status, 409);
    assert.equal(r1.body.error, 'code_used');

    const r2 = await request(app)
      .post('/api/business/register')
      .send(await registerBody('ZZZZ-9999'));
    assert.equal(r2.status, 400);
    assert.equal(r2.body.error, 'invalid_code');

    const r3 = await request(app)
      .post('/api/business/register/check')
      .send(await registerBody('ZZZZ-9999'));
    assert.equal(r3.body.error, 'invalid_code');
  });

  it('una clave sirve una sola vez y no repite correos', async () => {
    const key = await newKey();
    const body = await registerBody(key.code);
    assert.equal((await request(app).post('/api/business/register').send(body)).status, 201);
    const again = await request(app)
      .post('/api/business/register')
      .send({ ...body, email: 'otro@prueba.test' });
    assert.equal(again.body.error, 'code_used');

    const key2 = await newKey();
    const dupEmail = await request(app)
      .post('/api/business/register')
      .send({ ...body, code: key2.code });
    assert.equal(dupEmail.body.error, 'email_taken');
    const [k2] = await db
      .select()
      .from(s.registrationKeys)
      .where(eq(s.registrationKeys.id, key2.id));
    assert.equal(k2.usedAt, null, 'si falla, la clave sigue libre');
  });

  it('valida los datos', async () => {
    const key = await newKey();
    const r = await request(app)
      .post('/api/business/register')
      .send(await registerBody(key.code, { acceptTerms: false, businessPhone: '123' }));
    assert.equal(r.status, 400);
    assert.ok(r.body.details.acceptTerms);
    assert.ok(r.body.details.businessPhone);
  });
});

describe('lista de configuración (RF-71)', () => {
  it('muestra los pasos pendientes y se completa al configurar todo', async () => {
    const { agent } = await emptyBusiness();
    const before = await agent.get('/api/business/setup');
    assert.equal(before.status, 200);
    assert.equal(before.body.ready, false);
    const done = Object.fromEntries(before.body.steps.map((x) => [x.key, x.done]));
    assert.deepEqual(done, {
      profile: false,
      services: false,
      resources: false,
      schedules: false,
      rules: false,
      pin: true,
    });

    const sv = await agent
      .post('/api/business/services')
      .send({ name: 'Manicure', durationMin: 45, price: '250.50' });
    assert.equal(sv.status, 201);
    assert.equal(sv.body.service.priceCents, 25050);
    const rs = await agent
      .post('/api/business/resources')
      .send({ name: 'Lupita', title: 'Manicurista', serviceIds: [sv.body.service.id] });
    assert.equal(rs.status, 201);
    const sch = await agent.put(`/api/business/resources/${rs.body.resource.id}/schedule`).send({
      blocks: [
        { weekday: 1, start: '09:00', end: '14:00' },
        { weekday: 1, start: '15:00', end: '19:00' },
      ],
    });
    assert.equal(sch.status, 200);
    const rules = await agent.put('/api/business/rules').send({
      cancellationLimitHours: 12,
      minNoticeMinutes: 60,
      maxAdvanceDays: 30,
      slotIntervalMinutes: 15,
      bufferMinutes: 5,
      autoAccept: false,
    });
    assert.equal(rules.status, 200);
    await agent
      .patch('/api/business/profile')
      .send({ description: 'Uñas acrílicas y gelish', address: 'Calle 2', phone: '6461112233' });

    const after = await agent.get('/api/business/setup');
    assert.equal(after.body.ready, true);
    assert.ok(after.body.steps.every((x) => x.done));
  });
});

describe('permisos del negocio', () => {
  it('recepción lee pero no puede editar sin el modo dueño', async () => {
    const { user } = await createBusiness();
    const agent = await loginAs(user);
    assert.equal((await agent.get('/api/business/services')).status, 200);
    assert.equal((await agent.get('/api/business/resources')).status, 200);
    assert.equal((await agent.get('/api/business/rules')).status, 200);
    assert.equal((await agent.get('/api/business/profile')).status, 200);
    for (const [method, path, body] of [
      ['post', '/api/business/services', { name: 'X', durationMin: 30, price: 100 }],
      ['post', '/api/business/resources', { name: 'X' }],
      ['patch', '/api/business/profile', { name: 'Otro nombre' }],
      ['post', '/api/business/closed-days', { date: '2099-01-01' }],
      [
        'put',
        '/api/business/rules',
        {
          cancellationLimitHours: 1,
          minNoticeMinutes: 30,
          maxAdvanceDays: 10,
          slotIntervalMinutes: 10,
          bufferMinutes: 0,
          autoAccept: true,
        },
      ],
    ]) {
      const r = await agent[method](path).send(body);
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.body.error, 'owner_mode_locked');
    }
  });

  it('un cliente o un negocio suspendido no entra', async () => {
    const client = await createUser();
    const ca = await loginAs(client);
    assert.equal((await ca.get('/api/business/services')).body.error, 'wrong_role');
    const { user } = await createBusiness({ status: 'suspended' });
    const sa = await loginAs(user);
    assert.equal((await sa.get('/api/business/services')).body.error, 'business_not_active');
  });

  it('no deja tocar los datos de otro negocio', async () => {
    const other = await createBusiness();
    const { user } = await createBusiness();
    const agent = await loginOwner(user);
    const r = await agent
      .patch(`/api/business/services/${other.services[0].id}`)
      .send({ name: 'Robado' });
    assert.equal(r.status, 404);
    const r2 = await agent
      .put(`/api/business/resources/${other.resources[0].id}/schedule`)
      .send({ blocks: [] });
    assert.equal(r2.status, 404);
  });
});

describe('servicios (RF-15)', () => {
  it('crea, edita, desactiva y borra', async () => {
    const { agent } = await emptyBusiness();
    const created = await agent
      .post('/api/business/services')
      .send({ name: 'Corte', durationMin: 40, price: 200 });
    assert.equal(created.status, 201);
    const id = created.body.service.id;
    assert.equal(created.body.service.priceCents, 20000);
    assert.equal(created.body.service.active, true);

    const edited = await agent
      .patch(`/api/business/services/${id}`)
      .send({ price: 220, durationMin: 45, active: false });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.service.priceCents, 22000);
    assert.equal(edited.body.service.durationMin, 45);
    assert.equal(edited.body.service.active, false);

    const bad = await agent
      .post('/api/business/services')
      .send({ name: '', durationMin: 0, price: -5 });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.details.name && bad.body.details.durationMin && bad.body.details.price);

    const del = await agent.delete(`/api/business/services/${id}`);
    assert.equal(del.body.result, 'deleted');
    assert.equal(del.body.services.length, 0);
  });

  it('con reservas solo se desactiva', async () => {
    const { user, business, services, resources } = await createBusiness();
    const client = await createUser();
    await createBooking({
      client,
      business,
      service: services[0],
      resource: resources[0],
      startsAt: localAt(1, '10:00'),
    });
    const agent = await loginOwner(user);
    const del = await agent.delete(`/api/business/services/${services[0].id}`);
    assert.equal(del.body.result, 'deactivated');
    const [row] = await db.select().from(s.services).where(eq(s.services.id, services[0].id));
    assert.equal(row.active, false);
  });
});

describe('recursos y horarios (RF-16, RF-18)', () => {
  it('crea recursos, asigna servicios y guarda el horario semanal', async () => {
    const { agent } = await emptyBusiness();
    const sv = (
      await agent
        .post('/api/business/services')
        .send({ name: 'Renta 1 h', durationMin: 60, price: 600 })
    ).body.service;
    const space = await agent
      .post('/api/business/resources')
      .send({ name: 'Cancha 1', kind: 'space', color: '#1f8f78' });
    assert.equal(space.status, 201);
    assert.equal(space.body.resource.kind, 'space');
    assert.equal(space.body.resource.color, '#1F8F78');
    const id = space.body.resource.id;

    const badColor = await agent.patch(`/api/business/resources/${id}`).send({ color: '#123456' });
    assert.equal(badColor.status, 400);

    const linked = await agent
      .put(`/api/business/resources/${id}/services`)
      .send({ serviceIds: [sv.id] });
    assert.deepEqual(linked.body.resource.serviceIds, [sv.id]);

    const sch = await agent.put(`/api/business/resources/${id}/schedule`).send({
      blocks: [
        { weekday: 6, start: '16:00', end: '23:00' },
        { weekday: 6, start: '08:00', end: '12:00' },
        { weekday: 0, start: '08:00', end: '12:00' },
      ],
    });
    assert.equal(sch.status, 200);
    assert.deepEqual(sch.body.resource.schedule, [
      { weekday: 0, start: '08:00', end: '12:00' },
      { weekday: 6, start: '08:00', end: '12:00' },
      { weekday: 6, start: '16:00', end: '23:00' },
    ]);

    const renamed = await agent
      .patch(`/api/business/resources/${id}`)
      .send({ name: 'Cancha techada', title: 'Fútbol 7', active: false });
    assert.equal(renamed.body.resource.name, 'Cancha techada');
    assert.equal(renamed.body.resource.active, false);

    const del = await agent.delete(`/api/business/resources/${id}`);
    assert.equal(del.body.result, 'deleted');
    const left = await db
      .select()
      .from(s.resourceSchedules)
      .where(eq(s.resourceSchedules.resourceId, id));
    assert.equal(left.length, 0);
  });

  it('valida el horario: inicio antes que fin y sin encimarse', async () => {
    const { user, resources } = await createBusiness();
    const agent = await loginOwner(user);
    const url = `/api/business/resources/${resources[0].id}/schedule`;
    const reversed = await agent
      .put(url)
      .send({ blocks: [{ weekday: 1, start: '18:00', end: '09:00' }] });
    assert.equal(reversed.status, 400);
    assert.match(reversed.body.details.blocks[0], /inicio/);

    const overlap = await agent.put(url).send({
      blocks: [
        { weekday: 2, start: '09:00', end: '14:00' },
        { weekday: 2, start: '13:00', end: '18:00' },
      ],
    });
    assert.equal(overlap.status, 400);
    assert.match(overlap.body.details.blocks[0], /enciman/);

    const badHour = await agent
      .put(url)
      .send({ blocks: [{ weekday: 7, start: '9:00', end: '25:00' }] });
    assert.equal(badHour.status, 400);

    const touching = await agent.put(url).send({
      blocks: [
        { weekday: 2, start: '09:00', end: '14:00' },
        { weekday: 2, start: '14:00', end: '18:00' },
      ],
    });
    assert.equal(touching.status, 200, 'bloques que se tocan sí se permiten');
    // El horario anterior se reemplaza completo.
    assert.equal(touching.body.resource.schedule.length, 2);
  });

  it('con reservas el recurso solo se desactiva', async () => {
    const { user, business, services, resources } = await createBusiness();
    await createBooking({
      client: await createUser(),
      business,
      service: services[0],
      resource: resources[0],
      startsAt: localAt(2, '11:00'),
    });
    const agent = await loginOwner(user);
    const del = await agent.delete(`/api/business/resources/${resources[0].id}`);
    assert.equal(del.body.result, 'deactivated');
  });
});

describe('días cerrados (RF-18)', () => {
  it('agrega, lista y borra días cerrados del negocio o de un recurso', async () => {
    const { user, resources } = await createBusiness();
    const agent = await loginOwner(user);
    const all = await agent
      .post('/api/business/closed-days')
      .send({ date: '2099-12-25', reason: 'Navidad' });
    assert.equal(all.status, 201);
    const one = await agent
      .post('/api/business/closed-days')
      .send({ date: '2099-12-26', resourceId: resources[0].id });
    assert.equal(one.status, 201);
    assert.equal(one.body.closedDays.length, 2);
    assert.equal(one.body.closedDays[1].resourceName, resources[0].name);

    const dup = await agent.post('/api/business/closed-days').send({ date: '2099-12-25' });
    assert.equal(dup.status, 409);
    const past = await agent.post('/api/business/closed-days').send({ date: '2000-01-01' });
    assert.equal(past.body.error, 'past_date');

    const del = await agent.delete(`/api/business/closed-days/${all.body.closedDays[0].id}`);
    assert.equal(del.body.closedDays.length, 1);
  });
});

describe('reglas (RF-19, RF-20)', () => {
  it('guarda las reglas y valida los valores permitidos', async () => {
    const { user } = await createBusiness();
    const agent = await loginOwner(user);
    const rules = {
      cancellationLimitHours: 24,
      minNoticeMinutes: 180,
      maxAdvanceDays: 60,
      slotIntervalMinutes: 30,
      bufferMinutes: 10,
      autoAccept: true,
    };
    const ok = await agent.put('/api/business/rules').send(rules);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.rules, { ...rules, defined: true });
    const got = await agent.get('/api/business/rules');
    assert.equal(got.body.rules.autoAccept, true);

    const bad = await agent.put('/api/business/rules').send({
      ...rules,
      minNoticeMinutes: 45,
      slotIntervalMinutes: 25,
      maxAdvanceDays: 181,
      bufferMinutes: 61,
    });
    assert.equal(bad.status, 400);
    for (const k of ['minNoticeMinutes', 'slotIntervalMinutes', 'maxAdvanceDays', 'bufferMinutes'])
      assert.ok(bad.body.details[k], k);
  });
});

describe('perfil y fotos (RF-14)', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  it('edita el perfil y sube, ordena y borra fotos', async () => {
    const { user } = await createBusiness();
    const agent = await loginOwner(user);
    const cats = await db.select().from(s.categories);
    const p = await agent
      .patch('/api/business/profile')
      .send({ name: 'Barbería El Patrón', categoryId: cats[2].id, description: 'Cortes clásicos' });
    assert.equal(p.status, 200);
    assert.equal(p.body.profile.category.id, cats[2].id);

    const up = await agent
      .post('/api/business/photos')
      .attach('photos', PNG, 'a.png')
      .attach('photos', PNG, 'b.png');
    assert.equal(up.status, 201, JSON.stringify(up.body));
    assert.equal(up.body.photos.length, 2);
    assert.match(up.body.photos[0].url, /^\/uploads\/.+\.png$/);

    const fake = await agent
      .post('/api/business/photos')
      .attach('photos', Buffer.from('no soy imagen'), 'x.jpg');
    assert.equal(fake.body.error, 'invalid_photo');

    const [a, b] = up.body.photos;
    const order = await agent.put('/api/business/photos/order').send({ ids: [b.id, a.id] });
    assert.deepEqual(
      order.body.photos.map((x) => x.id),
      [b.id, a.id],
    );
    const del = await agent.delete(`/api/business/photos/${a.id}`);
    assert.equal(del.body.photos.length, 1);

    const files = Array.from({ length: 8 }, () => PNG);
    let req = agent.post('/api/business/photos');
    for (const [i, f] of files.entries()) req = req.attach('photos', f, `f${i}.png`);
    const tooMany = await req;
    assert.equal(tooMany.body.error, 'too_many_photos');
    await agent.delete(`/api/business/photos/${b.id}`); // no deja archivos en uploads/
  });
});
