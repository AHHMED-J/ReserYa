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
  db,
  s,
  app,
} from './helpers.js';
import {
  loadContext,
  daySlots,
  nextFreeSlot,
  availableDays,
  REQUEST_MIN_NOTICE_MINUTES,
} from '../src/modules/public/availability.js';
import { localDateTime } from '../src/lib/time.js';

before(setupDb);
after(closeDb);

// Lunes 7 de enero de 2030, 08:00 en Tijuana (PST, UTC−8).
const MONDAY_8AM = '2030-01-07T16:00:00Z';
const TUE = '2030-01-08';
const at = (date, hhmm) => localDateTime(date, hhmm).toJSDate();

async function slots(business, service, resource, date) {
  const ctx = await loadContext(business.id, date, date);
  return daySlots(ctx, { serviceId: service.id, resourceId: resource?.id ?? null, date });
}
const times = (list) => list.map((x) => x.time);

async function setSchedule(resource, blocks, weekdays = [0, 1, 2, 3, 4, 5, 6]) {
  await db.delete(s.resourceSchedules).where(eq(s.resourceSchedules.resourceId, resource.id));
  await db
    .insert(s.resourceSchedules)
    .values(
      weekdays.flatMap((weekday) =>
        blocks.map(([startTime, endTime]) => ({
          resourceId: resource.id,
          weekday,
          startTime,
          endTime,
        })),
      ),
    );
}

describe('disponibilidad (RF-24)', () => {
  beforeEach(() => setNow(MONDAY_8AM));
  after(() => setNow(null));

  it('genera la rejilla del horario semanal: intervalo, duración y fin del bloque', async () => {
    const { business, services, resources } = await createBusiness();
    const list = await slots(business, services[0], resources[0], TUE); // 40 min, 09:00–20:00
    assert.equal(list[0].time, '09:00');
    assert.equal(list[1].time, '09:20');
    assert.equal(list.at(-1).time, '19:20', 'la cita de 40 min debe terminar dentro del bloque');
    assert.equal(list.length, 32);
    assert.equal(list[0].startsAt, '2030-01-08T17:00:00.000Z', '09:00 en Tijuana = 17:00 UTC');
    assert.deepEqual(list[0].resourceIds, [resources[0].id]);
  });

  it('cuenta el intervalo desde el inicio de cada bloque y respeta días sin horario', async () => {
    const { business, services, resources } = await createBusiness({
      rules: { slotIntervalMinutes: 30 },
    });
    // Martes (2) con dos bloques que no empiezan en hora redonda.
    await setSchedule(
      resources[0],
      [
        ['09:10', '11:00'],
        ['13:05', '14:30'],
      ],
      [2],
    );
    const list = await slots(business, services[1], resources[0], TUE); // Barba, 20 min
    assert.deepEqual(times(list), ['09:10', '09:40', '10:10', '10:40', '13:05', '13:35', '14:05']);
    const wed = await slots(business, services[1], resources[0], '2030-01-09');
    assert.deepEqual(wed, [], 'el miércoles no trabaja');
  });

  it('bloquea confirmadas y apartados vigentes con el tiempo entre citas; las pendientes no', async () => {
    const { business, services, resources } = await createBusiness({
      rules: { bufferMinutes: 10 },
    });
    const client = await createUser();
    const [juan] = resources;
    const corte = services[0]; // 40 min
    await createBooking({
      client,
      business,
      service: corte,
      resource: juan,
      startsAt: at(TUE, '10:00'),
      status: 'confirmed',
    });
    await createBooking({
      client,
      business,
      service: corte,
      resource: juan,
      startsAt: at(TUE, '15:00'),
      status: 'pending',
    });
    const list = times(await slots(business, corte, juan, TUE));
    // Ocupado 10:00–10:40 + 10 min. Una nueva de 40 min + 10 min debe terminar antes de las 10:00.
    assert.ok(list.includes('09:00'), '09:00–09:40 + 10 min termina a las 09:50');
    assert.ok(!list.includes('09:20'), '09:20–10:00 + 10 min choca con la de las 10:00');
    assert.ok(!list.includes('10:40'), 'después de las 10:40 hay que dejar 10 min');
    assert.ok(list.includes('11:00'));
    assert.ok(list.includes('15:00'), 'una solicitud pendiente no bloquea (RF-27)');

    // Apartado vigente bloquea; vencido no.
    const { booking: hold } = await createBooking({
      client,
      business,
      service: corte,
      resource: juan,
      startsAt: at(TUE, '17:00'),
      status: 'hold',
    });
    await db
      .update(s.bookings)
      .set({ holdExpiresAt: new Date(Date.parse(MONDAY_8AM) + 5 * 60_000) })
      .where(eq(s.bookings.id, hold.id));
    assert.ok(!times(await slots(business, corte, juan, TUE)).includes('17:00'));
    setNow(new Date(Date.parse(MONDAY_8AM) + 6 * 60_000));
    assert.ok(times(await slots(business, corte, juan, TUE)).includes('17:00'));
  });

  it('respeta días cerrados del negocio y de un recurso', async () => {
    const { business, services, resources } = await createBusiness();
    const [juan, pedro] = resources;
    await db
      .insert(s.closedDays)
      .values({ businessId: business.id, resourceId: juan.id, date: TUE, reason: 'Vacaciones' });
    assert.deepEqual(await slots(business, services[0], juan, TUE), []);
    assert.equal((await slots(business, services[0], pedro, TUE)).length, 32);
    const any = await slots(business, services[0], null, TUE);
    assert.ok(any.every((x) => x.resourceIds.length === 1 && x.resourceIds[0] === pedro.id));

    await db.insert(s.closedDays).values({ businessId: business.id, date: TUE, reason: 'Feriado' });
    assert.deepEqual(await slots(business, services[0], null, TUE), []);
  });

  it('bloquea eventos de Google Calendar sin agregar tiempo entre citas', async () => {
    const { business, services, resources } = await createBusiness({
      rules: { bufferMinutes: 30 },
    });
    const [juan] = resources;
    await db.insert(s.externalBusyBlocks).values({
      resourceId: juan.id,
      googleEventId: 'evt1',
      title: 'Dentista',
      startsAt: at(TUE, '12:00'),
      endsAt: at(TUE, '13:00'),
    });
    const list = times(await slots(business, services[1], juan, TUE)); // 20 min
    assert.ok(list.includes('11:40'), '11:40–12:00 termina justo cuando empieza el evento');
    assert.ok(!list.includes('12:00'));
    assert.ok(!list.includes('12:40'));
    assert.ok(list.includes('13:00'));
  });

  it('aplica la anticipación mínima y máxima', async () => {
    // Hoy lunes a las 10:05.
    setNow('2030-01-07T18:05:00Z');
    const today = '2030-01-07';
    const auto = await createBusiness({ autoAccept: true, rules: { minNoticeMinutes: 60 } });
    const autoList = times(await slots(auto.business, auto.services[1], auto.resources[0], today));
    assert.equal(autoList[0], '11:20', 'con aceptación automática: 10:05 + 60 min → 11:20');

    const manual = await createBusiness({ rules: { minNoticeMinutes: 30 } });
    const manualList = times(
      await slots(manual.business, manual.services[1], manual.resources[0], today),
    );
    assert.equal(REQUEST_MIN_NOTICE_MINUTES, 90);
    assert.equal(
      manualList[0],
      '11:40',
      'una solicitud necesita al menos 90 min (vence 1 h antes)',
    );

    const far = await createBusiness({ rules: { maxAdvanceDays: 3 } });
    assert.ok((await slots(far.business, far.services[0], far.resources[0], '2030-01-10')).length);
    assert.deepEqual(
      await slots(far.business, far.services[0], far.resources[0], '2030-01-11'),
      [],
      'más allá de la anticipación máxima no hay horarios',
    );
    assert.deepEqual(
      await slots(far.business, far.services[0], far.resources[0], '2030-01-06'),
      [],
      'días pasados no tienen horarios',
    );
  });

  it('"cualquiera" agrupa por hora y guarda qué recursos están libres', async () => {
    const { business, services, resources } = await createBusiness({
      resources: ['Juan', 'Pedro', 'Luis'],
    });
    const [juan, pedro, luis] = resources;
    const client = await createUser();
    await createBooking({
      client,
      business,
      service: services[0],
      resource: juan,
      startsAt: at(TUE, '10:00'),
    });
    // Luis no da cortes.
    await db.delete(s.resourceServices).where(eq(s.resourceServices.resourceId, luis.id));
    await db.insert(s.resourceServices).values({ resourceId: luis.id, serviceId: services[1].id });
    const any = await slots(business, services[0], null, TUE);
    const ten = any.find((x) => x.time === '10:00');
    assert.deepEqual(ten.resourceIds, [pedro.id]);
    const nine = any.find((x) => x.time === '09:00');
    assert.deepEqual(nine.resourceIds.sort(), [juan.id, pedro.id].sort());
    assert.ok(any.every((x) => !x.resourceIds.includes(luis.id)));
  });

  it('usa la hora local de Tijuana sin importar la hora UTC (y el horario de verano)', async () => {
    // 22:30 del lunes en Tijuana = 06:30 del martes en UTC.
    setNow('2030-01-08T06:30:00Z');
    const { business, services, resources } = await createBusiness();
    const ctx = await loadContext(business.id, '2030-01-07', '2030-01-08');
    const days = availableDays(ctx, {
      serviceId: services[0].id,
      resourceId: resources[0].id,
      from: '2030-01-07',
      days: 2,
    });
    assert.deepEqual(
      days.map((d) => [d.date, d.available]),
      [
        ['2030-01-07', false],
        ['2030-01-08', true],
      ],
      'el lunes ya cerró aunque en UTC ya sea martes',
    );

    // Cambio a horario de verano: domingo 10 de marzo de 2030.
    setNow('2030-03-09T16:00:00Z');
    const dst = await slots(business, services[0], resources[0], '2030-03-10');
    assert.equal(dst[0].time, '09:00');
    assert.equal(dst[0].startsAt, '2030-03-10T16:00:00.000Z', 'en verano Tijuana es UTC−7');
  });

  it('encuentra el siguiente horario libre en máximo 14 días (RF-65)', async () => {
    const { business, resources } = await createBusiness();
    // Cierra de hoy a pasado mañana.
    await db
      .insert(s.closedDays)
      .values(
        ['2030-01-07', '2030-01-08', '2030-01-09'].map((date) => ({
          businessId: business.id,
          date,
        })),
      );
    let ctx = await loadContext(business.id, '2030-01-07', '2030-01-20');
    const next = nextFreeSlot(ctx);
    assert.equal(next.toISO(), '2030-01-10T09:00:00.000-08:00');

    // Sin horario en 14 días → null.
    await setSchedule(resources[0], [['09:00', '20:00']], [3]);
    await setSchedule(resources[1], [['09:00', '20:00']], [3]);
    await db.insert(s.closedDays).values({ businessId: business.id, date: '2030-01-16' });
    ctx = await loadContext(business.id, '2030-01-07', '2030-01-20');
    assert.equal(nextFreeSlot(ctx), null);
  });
});

describe('endpoints de horarios', () => {
  beforeEach(() => setNow(MONDAY_8AM));
  after(() => setNow(null));

  it('GET /availability y /days responden y validan', async () => {
    const { business, services, resources } = await createBusiness();
    const r = await request(app)
      .get(`/api/public/businesses/${business.id}/availability`)
      .query({ serviceId: services[0].id, resourceId: 'any', date: TUE });
    assert.equal(r.status, 200);
    assert.equal(r.body.slots[0].time, '09:00');
    assert.equal(r.body.slots[0].resourceIds.length, 2);

    const days = await request(app)
      .get(`/api/public/businesses/${business.id}/days`)
      .query({ serviceId: services[0].id, resourceId: resources[0].id, days: 7 });
    assert.equal(days.status, 200);
    assert.equal(days.body.days.length, 7);
    assert.equal(days.body.days[0].date, '2030-01-07');
    assert.equal(days.body.maxDate, '2030-02-06');

    const other = await createBusiness();
    const bad = await request(app)
      .get(`/api/public/businesses/${business.id}/availability`)
      .query({ serviceId: other.services[0].id, date: TUE });
    assert.equal(bad.status, 404);

    const suspended = await createBusiness({ status: 'suspended' });
    const hidden = await request(app)
      .get(`/api/public/businesses/${suspended.business.id}/availability`)
      .query({ serviceId: suspended.services[0].id, date: TUE });
    assert.equal(hidden.status, 404);
  });
});

describe('perfil del negocio (RF-23, RF-49)', () => {
  beforeEach(() => setNow(MONDAY_8AM));
  after(() => setNow(null));

  it('muestra servicios, equipo, horario, reglas y registra la vista del cliente', async () => {
    const { business, resources } = await createBusiness({ services: [['Corte', 40, 20000]] });
    await db.update(s.resources).set({ active: false }).where(eq(s.resources.id, resources[1].id));
    const anon = await request(app).get(`/api/public/businesses/${business.id}`);
    assert.equal(anon.status, 200);
    const b = anon.body.business;
    assert.equal(b.services.length, 1);
    assert.equal(b.resources.length, 1, 'no muestra recursos inactivos');
    assert.deepEqual(b.week[1].ranges, [['09:00', '20:00']]);
    assert.equal(b.rules.cancellationLimitHours, 12);
    assert.equal(b.rules.minNoticeMinutes, 90);
    assert.equal(b.priceFromCents, 20000);
    assert.equal(b.nextSlot, '2030-01-07T17:40:00.000Z', 'hoy 09:40 (08:00 + 90 min → 09:40)');
    assert.equal(b.today.openNow, false);

    const client = await createUser();
    const agent = await loginAs(client);
    await agent.get(`/api/public/businesses/${business.id}`);
    const [view] = await db
      .select()
      .from(s.businessViews)
      .where(eq(s.businessViews.userId, client.id));
    assert.equal(view.businessId, business.id);

    const pending = await createBusiness({ status: 'pending' });
    assert.equal(
      (await request(app).get(`/api/public/businesses/${pending.business.id}`)).status,
      404,
    );
  });

  it('pagina las reseñas con nombre corto', async () => {
    const { business, services, resources } = await createBusiness();
    const client = await createUser({ firstName: 'Carlos', lastName: 'Mendoza' });
    for (let i = 0; i < 3; i++) {
      const { booking } = await createBooking({
        client,
        business,
        service: services[0],
        resource: resources[0],
        startsAt: new Date(Date.parse(MONDAY_8AM) - (i + 1) * 86400e3),
        status: 'completed',
      });
      await db.insert(s.reviews).values({
        bookingId: booking.id,
        clientId: client.id,
        businessId: business.id,
        rating: 5 - i,
      });
    }
    const r = await request(app)
      .get(`/api/public/businesses/${business.id}/reviews`)
      .query({ pageSize: 2 });
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 3);
    assert.equal(r.body.items.length, 2);
    assert.equal(r.body.hasMore, true);
    assert.equal(r.body.items[0].clientName, 'Carlos M.');
  });
});

describe('búsqueda (RF-21, RF-22, RF-64, RF-65)', () => {
  let cats;
  let patron, spa, fisio;
  before(async () => {
    await setupDb();
    setNow(MONDAY_8AM);
    cats = Object.fromEntries((await db.select().from(s.categories)).map((c) => [c.slug, c]));
    const mk = async (name, slug, services, rating, extra = {}) => {
      const r = await createBusiness({ name, categoryId: cats[slug].id, services, ...extra });
      await db
        .update(s.businesses)
        .set({ ratingAvg: rating, ratingCount: 10 })
        .where(eq(s.businesses.id, r.business.id));
      return r;
    };
    patron = await mk(
      'Barbería El Patrón',
      'barberias',
      [
        ['Corte de cabello', 40, 20000],
        ['Barba', 20, 12000],
      ],
      4.8,
    );
    await mk('Corte Fino', 'barberias', [['Corte de cabello', 40, 22000]], 4.4);
    spa = await mk('Spa Brisa', 'masajes', [['Masaje relajante', 60, 60000]], 4.9);
    fisio = await mk('Fisio Activa', 'fisioterapia', [['Sesión de fisioterapia', 50, 45000]], 4.6);
    // El Patrón cerrado hoy; Spa Brisa abre solo por la tarde.
    await db.insert(s.closedDays).values({ businessId: patron.business.id, date: '2030-01-07' });
    for (const r of spa.resources) await setSchedule(r, [['16:00', '20:00']]);
    // Negocios que no deben aparecer.
    await createBusiness({ name: 'Barbería Suspendida', status: 'suspended' });
    await createBusiness({ name: 'Barbería Sin Reglas', rules: { bufferMinutes: null } });
  });
  after(() => setNow(null));

  const search = (q) => request(app).get('/api/public/businesses').query(q);
  const names = (r) => r.body.items.map((x) => x.name);

  it('ordena por calificación por defecto y solo muestra negocios visibles', async () => {
    const r = await search({});
    assert.equal(r.status, 200);
    assert.deepEqual(names(r), ['Spa Brisa', 'Barbería El Patrón', 'Fisio Activa', 'Corte Fino']);
    assert.equal(r.body.total, 4);
    const card = r.body.items[1];
    assert.equal(card.category.slug, 'barberias');
    assert.equal(card.category.icon, 'scissors');
    assert.equal(card.priceFromCents, 12000);
    assert.equal(card.ratingAvg, 4.8);
    assert.equal(card.nextSlot, '2030-01-08T17:00:00.000Z', 'hoy está cerrado: mañana 09:00');
  });

  it('busca por texto en nombre, descripción y servicios, sin importar acentos', async () => {
    assert.deepEqual(names(await search({ q: 'patron' })), ['Barbería El Patrón']);
    assert.deepEqual(
      names(await search({ q: 'barberia' })),
      ['Barbería El Patrón', 'Corte Fino'],
      'también busca en el nombre de la categoría',
    );
    assert.deepEqual(names(await search({ q: 'corte' })).sort(), [
      'Barbería El Patrón',
      'Corte Fino',
    ]);
    assert.deepEqual(names(await search({ q: 'FISIOTERAPIA' })), ['Fisio Activa']);
    assert.deepEqual(names(await search({ q: 'nada que coincida' })), []);
  });

  it('filtra por varias categorías, servicio, calificación y precio', async () => {
    assert.deepEqual(names(await search({ categories: 'masajes,fisioterapia' })), [
      'Spa Brisa',
      'Fisio Activa',
    ]);
    assert.deepEqual(
      names(await search({ categories: ['barberias', 'masajes'], minRating: 4.5 })),
      ['Spa Brisa', 'Barbería El Patrón'],
    );
    const barba = await search({ service: 'barba' });
    assert.deepEqual(names(barba), ['Barbería El Patrón']);
    assert.equal(barba.body.items[0].priceFromCents, 12000);
    const price = await search({ minPrice: 150, maxPrice: 500 });
    assert.deepEqual(names(price), ['Barbería El Patrón', 'Fisio Activa', 'Corte Fino']);
    assert.equal(price.body.items[0].priceFromCents, 20000, 'precio desde dentro del rango');
    assert.equal((await search({ minRating: 9 })).status, 400);
  });

  it('filtra por disponible hoy, día y hora', async () => {
    assert.deepEqual(
      names(await search({ availableToday: 'true' })),
      ['Spa Brisa', 'Fisio Activa', 'Corte Fino'],
      'El Patrón está cerrado hoy',
    );
    assert.deepEqual(names(await search({ date: '2030-01-08', time: '17:00' })), [
      'Spa Brisa',
      'Barbería El Patrón',
      'Fisio Activa',
      'Corte Fino',
    ]);
    const evening = await search({ date: '2030-01-08', time: '19:10', sort: 'next' });
    assert.deepEqual(
      names(evening),
      ['Barbería El Patrón', 'Corte Fino'],
      'Spa (60 min) y Fisio (50 min) ya no caben después de las 19:10',
    );
    assert.equal(evening.body.items[0].nextSlot, '2030-01-09T03:20:00.000Z', '19:20 local');
  });

  it('ordena por menor precio y por horario más próximo, con paginación', async () => {
    assert.deepEqual(names(await search({ sort: 'price' })), [
      'Barbería El Patrón',
      'Corte Fino',
      'Fisio Activa',
      'Spa Brisa',
    ]);
    const next = await search({ sort: 'next' });
    // Hoy 08:00, solicitudes con 90 min: Corte Fino y Fisio 09:40, Spa 16:00, El Patrón mañana.
    assert.deepEqual(names(next), [
      'Fisio Activa',
      'Corte Fino',
      'Spa Brisa',
      'Barbería El Patrón',
    ]);
    const p1 = await search({ pageSize: 3 });
    const p2 = await search({ pageSize: 3, page: 2 });
    assert.equal(p1.body.items.length, 3);
    assert.equal(p1.body.hasMore, true);
    assert.deepEqual(names(p2), ['Corte Fino']);
    assert.equal(p2.body.hasMore, false);
  });

  it('responde en menos de 2 s (RNF-05)', async () => {
    const t0 = Date.now();
    const r = await search({ sort: 'next', availableToday: 'true' });
    assert.equal(r.status, 200);
    const r2 = await request(app)
      .get(`/api/public/businesses/${fisio.business.id}/days`)
      .query({ serviceId: fisio.services[0].id, days: 30 });
    assert.equal(r2.status, 200);
    assert.ok(Date.now() - t0 < 2000);
  });
});

describe('inicio (RF-58, RF-59, RF-61, RF-62)', () => {
  before(setupDb);
  beforeEach(() => setNow(MONDAY_8AM));
  after(() => setNow(null));

  it('sin sesión: recomendados con uno destacado y sin recientes', async () => {
    const a = await createBusiness({ name: 'A' });
    const b = await createBusiness({ name: 'B' });
    await db
      .update(s.businesses)
      .set({ ratingAvg: 4.9, ratingCount: 3 })
      .where(eq(s.businesses.id, b.business.id));
    const r = await request(app).get('/api/public/home');
    assert.equal(r.status, 200);
    assert.equal(r.body.featured.id, b.business.id);
    assert.deepEqual(
      r.body.recommended.map((x) => x.id),
      [a.business.id],
    );
    assert.ok(r.body.featured.nextSlot);
    assert.deepEqual(r.body.recent, []);
    assert.equal(r.body.hasBookings, false);
  });

  it('con sesión: recientes, dar reseña y próxima cita', async () => {
    const client = await createUser();
    const x = await createBusiness({ name: 'Visto' });
    const y = await createBusiness({ name: 'Reservado' });
    await db.insert(s.businessViews).values({
      userId: client.id,
      businessId: x.business.id,
      lastViewedAt: new Date(Date.now() - 86400e3),
    });
    const { booking: done } = await createBooking({
      client,
      business: y.business,
      service: y.services[0],
      resource: y.resources[0],
      startsAt: new Date(Date.parse(MONDAY_8AM) - 3 * 86400e3),
      status: 'completed',
    });
    const { booking: next } = await createBooking({
      client,
      business: y.business,
      service: y.services[0],
      resource: y.resources[0],
      startsAt: at(TUE, '10:00'),
      status: 'confirmed',
    });
    const agent = await loginAs(client);
    const r = await agent.get('/api/public/home');
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.body.recent.map((b) => b.name),
      ['Reservado', 'Visto'],
    );
    assert.equal(r.body.hasBookings, true);
    assert.equal(r.body.reviewPrompt.bookingId, done.id);
    assert.equal(r.body.reviewPrompt.businessName, 'Reservado');
    assert.equal(r.body.nextBooking.id, next.id);
  });
});
