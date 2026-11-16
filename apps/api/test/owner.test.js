import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, closeDb, createBusiness, loginAs, PIN, outbox, app } from './helpers.js';
import request from 'supertest';

before(setupDb);
after(closeDb);

describe('modo dueño (PIN)', () => {
  it('desbloquea con el PIN correcto y bloquea tras 5 intentos', async () => {
    const { user } = await createBusiness();
    const agent = await loginAs(user);
    const login = await agent
      .post('/api/auth/login')
      .send({ email: user.email, password: 'secreto123' });
    assert.equal(login.body.user.business.hasPin, true, 'el login trae los datos del negocio');
    const ok = await agent.post('/api/business/owner/unlock').send({ pin: PIN });
    assert.equal(ok.status, 200);
    assert.equal((await agent.get('/api/auth/me')).body.user.business.ownerMode, true);
    await agent.post('/api/business/owner/lock');
    assert.equal((await agent.get('/api/auth/me')).body.user.business.ownerMode, false);

    for (let i = 0; i < 4; i++) {
      const r = await agent.post('/api/business/owner/unlock').send({ pin: '9999' });
      assert.equal(r.status, 400);
    }
    const fifth = await agent.post('/api/business/owner/unlock').send({ pin: '9999' });
    assert.equal(fifth.body.error, 'pin_locked');
    const blocked = await agent.post('/api/business/owner/unlock').send({ pin: PIN });
    assert.equal(
      blocked.body.error,
      'pin_locked',
      'ni con el PIN correcto mientras está bloqueado',
    );

    await agent.post('/api/business/owner/forgot-pin');
    const token = outbox
      .findLast((m) => m.template === 'reset_pin')
      .html.match(/token=([\w-]+)/)[1];
    const reset = await request(app)
      .post('/api/business/owner/reset-pin')
      .send({ token, pin: '5678' });
    assert.equal(reset.status, 200);
    assert.equal(
      (await agent.post('/api/business/owner/unlock').send({ pin: '5678' })).status,
      200,
    );
  });

  it('cambia el PIN solo en modo dueño', async () => {
    const { user } = await createBusiness();
    const agent = await loginAs(user);
    const locked = await agent
      .post('/api/business/owner/change-pin')
      .send({ currentPin: PIN, newPin: '4321' });
    assert.equal(locked.body.error, 'owner_mode_locked');
    await agent.post('/api/business/owner/unlock').send({ pin: PIN });
    const r = await agent
      .post('/api/business/owner/change-pin')
      .send({ currentPin: PIN, newPin: '4321' });
    assert.equal(r.status, 200);
  });

  it('un cliente no puede usar rutas del negocio', async () => {
    const { createUser } = await import('./helpers.js');
    const agent = await loginAs(await createUser());
    const r = await agent.post('/api/business/owner/unlock').send({ pin: PIN });
    assert.equal(r.status, 403);
  });
});
