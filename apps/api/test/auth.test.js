import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, setupDb, closeDb, createUser, loginAs, outbox, PASSWORD, db, s, createBusiness, createBooking, localAt } from './helpers.js';

before(setupDb);
after(closeDb);

const tokenFrom = (mail) => mail.html.match(/token=([\w-]+)/)[1];

describe('cuentas', () => {
  it('registra un cliente, manda verificación y abre sesión', async () => {
    const agent = request.agent(app);
    const r = await agent.post('/api/auth/register').send({
      firstName: 'Ana',
      lastName: 'López',
      email: 'ANA@Correo.com',
      phone: '646 123 4567',
      password: 'secreto123',
      acceptTerms: true,
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.email, 'ana@correo.com');
    assert.equal(r.body.user.phone, '6461234567');
    assert.equal(r.body.user.emailVerified, false);

    const mail = outbox.find((m) => m.template === 'verify_email');
    assert.ok(mail, 'debe enviar el correo de verificación');
    const v = await agent.post('/api/auth/verify-email').send({ token: tokenFrom(mail) });
    assert.equal(v.status, 200);
    const me = await agent.get('/api/auth/me');
    assert.equal(me.body.user.emailVerified, true);

    const again = await agent.post('/api/auth/verify-email').send({ token: tokenFrom(mail) });
    assert.equal(again.status, 400, 'el token es de un solo uso');
  });

  it('rechaza correo repetido y datos inválidos', async () => {
    const u = await createUser();
    const dup = await request(app).post('/api/auth/register').send({
      firstName: 'X', lastName: 'Y', email: u.email, phone: '6461234567', password: 'secreto123', acceptTerms: true,
    });
    assert.equal(dup.status, 409);
    const bad = await request(app).post('/api/auth/register').send({ email: 'no', phone: '12', acceptTerms: false });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.details.phone);
  });

  it('inicia y cierra sesión', async () => {
    const u = await createUser();
    const wrong = await request(app).post('/api/auth/login').send({ email: u.email, password: 'nop' });
    assert.equal(wrong.status, 401);
    const agent = await loginAs(u);
    assert.equal((await agent.get('/api/auth/me')).body.user.id, u.id);
    await agent.post('/api/auth/logout');
    assert.equal((await agent.get('/api/auth/me')).body.user, null);
  });

  it('restablece la contraseña por correo y cierra las sesiones viejas', async () => {
    const u = await createUser();
    const old = await loginAs(u);
    await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    const mail = outbox.findLast((m) => m.template === 'reset_password' && m.to === u.email);
    const r = await request(app).post('/api/auth/reset-password').send({ token: tokenFrom(mail), password: 'nueva12345' });
    assert.equal(r.status, 200);
    assert.equal((await old.get('/api/auth/me')).body.user, null);
    const ok = await request(app).post('/api/auth/login').send({ email: u.email, password: 'nueva12345' });
    assert.equal(ok.status, 200);
  });

  it('edita el perfil y cambia la contraseña', async () => {
    const u = await createUser();
    const agent = await loginAs(u);
    const p = await agent.patch('/api/me').send({ firstName: 'Luis', phone: '+52 646 999 8888' });
    assert.equal(p.body.user.firstName, 'Luis');
    assert.equal(p.body.user.phone, '6469998888');
    const bad = await agent.post('/api/me/password').send({ currentPassword: 'mal', newPassword: 'otra12345' });
    assert.equal(bad.status, 400);
    const ok = await agent.post('/api/me/password').send({ currentPassword: PASSWORD, newPassword: 'otra12345' });
    assert.equal(ok.status, 200);
  });
});

describe('base de datos', () => {
  it('impide dos reservas confirmadas encimadas en el mismo recurso (RNF-15)', async () => {
    const { business, services, resources } = await createBusiness();
    const client = await createUser();
    const base = { client, business, service: services[0], resource: resources[0] };
    await createBooking({ ...base, startsAt: localAt(1, '10:00') });
    // Una pendiente encimada sí se permite (RF-27)...
    await createBooking({ ...base, startsAt: localAt(1, '10:20'), status: 'pending' });
    // ...pero otra confirmada no.
    await assert.rejects(
      createBooking({ ...base, startsAt: localAt(1, '10:20') }),
      (e) => (e.code ?? e.cause?.code) === '23P01',
    );
    const rows = await db.select().from(s.bookings);
    assert.equal(rows.length, 2);
  });

  it('expone las 9 categorías y la configuración', async () => {
    const c = await request(app).get('/api/categories');
    assert.equal(c.body.categories.length, 9);
    const cfg = await request(app).get('/api/config');
    assert.ok(['stripe', 'fake'].includes(cfg.body.paymentMode));
  });
});
