import { describe, it, before, after } from 'node:test';
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
  db,
  s,
  app,
} from './helpers.js';

before(setupDb);
after(closeDb);

const daysAgo = (n) => new Date(Date.now() - n * 86400e3);
const getBusiness = async (id) =>
  (await db.select().from(s.businesses).where(eq(s.businesses.id, id)))[0];

describe('reseñas (RF-48, RF-49, RF-61)', () => {
  it('califica una cita completada y recalcula el promedio del negocio', async () => {
    const { business, services, resources } = await createBusiness();
    const client = await createUser();
    const mk = (status, n) =>
      createBooking({
        client,
        business,
        service: services[0],
        resource: resources[0],
        startsAt: daysAgo(n),
        status,
      });
    const { booking: first } = await mk('completed', 3);
    const { booking: second } = await mk('completed', 2);
    const agent = await loginAs(client);

    // El inicio pide calificar la última cita completada sin reseña.
    let home = await agent.get('/api/public/home');
    assert.equal(home.body.reviewPrompt.bookingId, second.id);

    const r = await agent
      .post('/api/reviews')
      .send({ bookingId: second.id, rating: 5, comment: '  Excelente corte  ' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.review.comment, 'Excelente corte');
    let b = await getBusiness(business.id);
    assert.equal(b.ratingAvg, 5);
    assert.equal(b.ratingCount, 1);

    home = await agent.get('/api/public/home');
    assert.equal(home.body.reviewPrompt.bookingId, first.id);

    const r2 = await agent.post('/api/reviews').send({ bookingId: first.id, rating: 2 });
    assert.equal(r2.status, 201);
    assert.equal(r2.body.review.comment, null);
    b = await getBusiness(business.id);
    assert.equal(b.ratingAvg, 3.5);
    assert.equal(b.ratingCount, 2);

    const profile = await request(app).get(`/api/public/businesses/${business.id}`);
    assert.equal(profile.body.business.ratingAvg, 3.5);
    assert.equal(profile.body.business.ratingCount, 2);
    assert.equal(profile.body.business.reviews.length, 2);

    home = await agent.get('/api/public/home');
    assert.equal(home.body.reviewPrompt, null);

    const detail = await agent.get(`/api/bookings/${second.id}`);
    assert.deepEqual(detail.body.booking.review, { rating: 5, comment: 'Excelente corte' });
    assert.equal(detail.body.booking.canReview, false);
  });

  it('solo una por reserva, solo completadas, solo el cliente de la reserva', async () => {
    const { business, services, resources } = await createBusiness();
    const client = await createUser();
    const mk = (status, startsAt = daysAgo(1)) =>
      createBooking({
        client,
        business,
        service: services[0],
        resource: resources[0],
        startsAt,
        status,
      });
    const { booking: done } = await mk('completed');
    const { booking: noShow } = await mk('no_show', daysAgo(2));
    const { booking: upcoming } = await mk('confirmed', new Date(Date.now() + 2 * 86400e3));
    const agent = await loginAs(client);

    assert.equal(
      (await agent.post('/api/reviews').send({ bookingId: done.id, rating: 4 })).status,
      201,
    );
    const dup = await agent.post('/api/reviews').send({ bookingId: done.id, rating: 5 });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error, 'already_reviewed');

    const ns = await agent.post('/api/reviews').send({ bookingId: noShow.id, rating: 5 });
    assert.equal(ns.status, 409, 'no asistió no puede calificar');
    assert.equal(ns.body.error, 'not_reviewable');
    const up = await agent.post('/api/reviews').send({ bookingId: upcoming.id, rating: 5 });
    assert.equal(up.body.error, 'not_reviewable');

    const stranger = await loginAs(await createUser());
    const other = await stranger.post('/api/reviews').send({ bookingId: noShow.id, rating: 5 });
    assert.equal(other.status, 404);

    const { booking: another } = await mk('completed', daysAgo(5));
    const tooLong = await agent
      .post('/api/reviews')
      .send({ bookingId: another.id, rating: 4, comment: 'x'.repeat(501) });
    assert.equal(tooLong.status, 400);
    assert.ok(tooLong.body.details.comment);
    for (const rating of [0, 6, 3.5]) {
      const bad = await agent.post('/api/reviews').send({ bookingId: another.id, rating });
      assert.equal(bad.status, 400, `calificación ${rating}`);
    }
    assert.equal(
      (await request(app).post('/api/reviews').send({ bookingId: another.id, rating: 4 })).status,
      401,
    );
  });
});
