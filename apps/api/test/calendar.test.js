// Google Calendar (RF-39 a RF-43, RF-70, RNF-11, RNF-17) con un Google simulado en memoria.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  setupDb,
  closeDb,
  createBusiness,
  createUser,
  createBooking,
  loginAs,
  loginOwner,
  localAt,
  outbox,
  setNow,
  db,
  s,
} from './helpers.js';
import { env } from '../src/config/env.js';
import { decrypt } from '../src/lib/crypto.js';
import { enqueueCalendarSync } from '../src/lib/calendarSync.js';
import { setGoogleClientFactory, nearestCalendarColor } from '../src/modules/calendar/google.js';
import { processQueue, pullChanges, jobs } from '../src/modules/calendar/jobs.js';
import { DELETED_REASON, MAX_ATTEMPTS } from '../src/modules/calendar/sync.js';

const BASE = 'https://www.googleapis.com/calendar/v3';

const httpError = (status, message = `HTTP ${status}`) =>
  Object.assign(new Error(message), {
    status,
    response: { status, data: { error: { code: status, message } } },
  });
const invalidGrant = () =>
  Object.assign(new Error('invalid_grant'), {
    response: {
      status: 400,
      data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
    },
  });

/** Google Calendar falso: calendarios, eventos con número de cambio y sync tokens. */
class FakeGoogle {
  constructor() {
    this.calendars = new Map();
    this.n = 0;
    this.seq = 0;
    this.pageSize = 2;
    this.requests = [];
    this.failures = [];
    this.badTokens = new Set();
    this.expiredTokens = new Set();
    this.revoked = [];
    this.grantScopes = null;
    this.email = 'dueno@gmail.test';
  }

  /** Falla las próximas `times` peticiones que cumplan match(method, path). */
  fail(match, status = 503, times = 1) {
    this.failures.push({ match, status, times });
  }

  // --- lo que hace la persona directamente en Google Calendar ---
  userInsert(calId, ev) {
    const cal = this.calendars.get(calId);
    cal.events.set(ev.id, { status: 'confirmed', ...ev, seq: ++this.seq });
  }
  userPatch(calId, id, patch) {
    const cal = this.calendars.get(calId);
    cal.events.set(id, { ...cal.events.get(id), ...patch, seq: ++this.seq });
  }
  userDelete(calId, id) {
    this.userPatch(calId, id, { status: 'cancelled' });
  }
  event(calId, id) {
    return this.calendars.get(calId)?.events.get(id);
  }
  /** Expira el último token del calendario (Google responde 410). */
  expire(calId) {
    for (let i = 0; i <= this.seq; i++) this.expiredTokens.add(`tok:${calId}:${i}`);
  }

  client() {
    const fake = this;
    let creds = {};
    return {
      generateAuthUrl(opts) {
        const q = new URLSearchParams({ ...opts, scope: opts.scope.join(' ') });
        return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
      },
      async getToken(code) {
        if (code !== 'buen-codigo') throw httpError(400, 'invalid code');
        return {
          tokens: {
            refresh_token: `refresh-${crypto.randomUUID()}`,
            access_token: 'acceso',
            id_token: 'id-token',
            scope: (
              fake.grantScopes ?? [
                'openid',
                'https://www.googleapis.com/auth/userinfo.email',
                'https://www.googleapis.com/auth/calendar.app.created',
              ]
            ).join(' '),
          },
        };
      },
      async verifyIdToken() {
        return { getPayload: () => ({ email: fake.email, email_verified: true }) };
      },
      setCredentials(c) {
        creds = c;
      },
      async getAccessToken() {
        if (fake.badTokens.has(creds.refresh_token)) throw invalidGrant();
        return { token: 'acceso' };
      },
      async revokeToken(token) {
        fake.revoked.push(token);
        return { data: {} };
      },
      async request(opts) {
        return { data: fake.handle(opts, creds.refresh_token) };
      },
    };
  }

  handle({ url, method = 'GET', params = {}, data }, token) {
    assert.ok(url.startsWith(BASE), `URL de Calendar API: ${url}`);
    const path = url.slice(BASE.length);
    this.requests.push({ method, path, params, data, token });
    if (this.badTokens.has(token)) throw invalidGrant();
    const f = this.failures.find((x) => x.times > 0 && x.match(method, path));
    if (f) {
      f.times--;
      throw httpError(f.status);
    }
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);

    if (method === 'POST' && path === '/calendars') {
      const id = `cal${++this.n}@group.calendar.google.com`;
      this.calendars.set(id, { id, ...data, events: new Map() });
      return { id, summary: data.summary, timeZone: data.timeZone };
    }
    if (parts[0] === 'users' && parts[2] === 'calendarList' && method === 'PATCH') {
      const cal = this.calendars.get(parts[3]);
      if (!cal) throw httpError(404);
      cal.colorId = data.colorId;
      return { id: cal.id, colorId: data.colorId };
    }
    if (parts[0] !== 'calendars') throw httpError(400, `ruta no simulada ${path}`);
    const cal = this.calendars.get(parts[1]);
    if (!cal) throw httpError(404, 'calendar not found');
    if (parts.length === 2 && method === 'DELETE') {
      this.calendars.delete(cal.id);
      return '';
    }
    const evId = parts[3];
    if (method === 'POST') {
      if (data.id && cal.events.has(data.id)) throw httpError(409, 'duplicate');
      const id = data.id ?? `ev${++this.n}`;
      const ev = { status: 'confirmed', ...data, id, seq: ++this.seq };
      cal.events.set(id, ev);
      return ev;
    }
    if (method === 'PATCH') {
      if (!cal.events.has(evId)) throw httpError(404);
      const ev = { ...cal.events.get(evId), ...data, seq: ++this.seq };
      cal.events.set(evId, ev);
      return ev;
    }
    if (method === 'DELETE') {
      const ev = cal.events.get(evId);
      if (!ev || ev.status === 'cancelled') throw httpError(410, 'deleted');
      cal.events.set(evId, { ...ev, status: 'cancelled', seq: ++this.seq });
      return '';
    }
    if (method === 'GET') {
      assert.equal(params.showDeleted, true);
      assert.equal(params.singleEvents, true);
      let since = -1;
      if (params.syncToken) {
        assert.equal(params.timeMin, undefined, 'syncToken no se combina con timeMin');
        if (this.expiredTokens.has(params.syncToken)) throw httpError(410, 'sync token expired');
        since = Number(params.syncToken.split(':').pop());
      }
      const all = [...cal.events.values()]
        .filter((e) => e.seq > since)
        .filter(
          (e) =>
            since >= 0 ||
            !params.timeMin ||
            !e.end?.dateTime ||
            new Date(e.end.dateTime) > new Date(params.timeMin),
        )
        .sort((a, b) => a.seq - b.seq);
      const offset = Number(params.pageToken ?? 0);
      const items = all.slice(offset, offset + this.pageSize).map(({ seq: _s, ...e }) => e);
      const more = offset + this.pageSize < all.length;
      return more
        ? { items, nextPageToken: String(offset + this.pageSize) }
        : { items, nextSyncToken: `tok:${cal.id}:${this.seq}` };
    }
    throw httpError(400, `ruta no simulada ${method} ${path}`);
  }
}

let google;
const saved = {};

before(async () => {
  await setupDb();
  saved.enabled = env.googleEnabled;
  saved.id = env.GOOGLE_CLIENT_ID;
  saved.key = env.ENCRYPTION_KEY;
  env.googleEnabled = true;
  env.GOOGLE_CLIENT_ID = 'cliente-de-prueba';
  env.GOOGLE_CLIENT_SECRET = 'secreto-de-prueba';
  if (!env.ENCRYPTION_KEY) env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
});
after(async () => {
  env.googleEnabled = saved.enabled;
  env.GOOGLE_CLIENT_ID = saved.id;
  env.ENCRYPTION_KEY = saved.key;
  setGoogleClientFactory(null);
  await closeDb();
});
beforeEach(() => {
  google = new FakeGoogle();
  setGoogleClientFactory(() => google.client());
  env.googleEnabled = true;
  setNow(null);
});

/** Conecta Google como lo haría el dueño desde el navegador. */
async function connect(agent) {
  const r = await agent.get('/api/calendar/connect');
  assert.equal(r.status, 302);
  const state = new URL(r.headers.location).searchParams.get('state');
  const cb = await agent.get('/api/calendar/callback').query({ code: 'buen-codigo', state });
  return { connect: r, callback: cb };
}

/** Negocio aprobado con Google conectado. */
async function connectedBusiness(o = {}) {
  const biz = await createBusiness(o);
  const agent = await loginOwner(biz.user);
  const { callback } = await connect(agent);
  assert.match(callback.headers.location, /connected=1/);
  const resources = await db
    .select()
    .from(s.resources)
    .where(eq(s.resources.businessId, biz.business.id));
  const cal = Object.fromEntries(resources.map((r) => [r.name, r.googleCalendarId]));
  return { ...biz, agent, cal };
}

const reload = async (table, id) => (await db.select().from(table).where(eq(table.id, id)))[0];
const jobsOf = (bookingId) =>
  db.select().from(s.calendarSyncJobs).where(eq(s.calendarSyncJobs.bookingId, bookingId));
const blocksOf = (resourceId) =>
  db.select().from(s.externalBusyBlocks).where(eq(s.externalBusyBlocks.resourceId, resourceId));
const ts = (d) => new Date(d).toISOString();

/** Reserva confirmada con su evento ya creado en Google. */
async function confirmedWithEvent(biz, startsAt, resource = biz.resources[0]) {
  const client = await createUser({ firstName: 'Carlos', lastName: 'Mendoza' });
  const { booking, payment } = await createBooking({
    client,
    business: biz.business,
    service: biz.services[0],
    resource,
    startsAt,
  });
  await enqueueCalendarSync(booking.id, 'create');
  await processQueue();
  await pullChanges(); // la lectura ve el evento recién creado y lo ignora
  return { client, booking: await reload(s.bookings, booking.id), payment };
}

describe('conectar Google Calendar', () => {
  it('pide consentimiento offline, guarda el token cifrado y crea un calendario por recurso', async () => {
    const biz = await createBusiness({ resources: ['Juan', 'Pedro'] });
    await db
      .update(s.resources)
      .set({ color: '#C23A3A' })
      .where(eq(s.resources.id, biz.resources[1].id));
    // Una reserva confirmada de antes de conectar también debe llegar a Google.
    const client = await createUser();
    const { booking } = await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: localAt(3, '11:00'),
    });
    const agent = await loginOwner(biz.user);
    const { connect: r, callback } = await connect(agent);

    const url = new URL(r.headers.location);
    assert.equal(url.searchParams.get('access_type'), 'offline');
    assert.equal(url.searchParams.get('prompt'), 'consent');
    assert.match(url.searchParams.get('scope'), /calendar\.app\.created/);
    assert.match(r.headers['set-cookie'].join(';'), /rsy_gcal=.*HttpOnly/i);
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.location, `${env.WEB_URL}/negocio/dueno/google?connected=1`);

    const b = await reload(s.businesses, biz.business.id);
    assert.ok(b.googleRefreshTokenEnc);
    assert.ok(!b.googleRefreshTokenEnc.includes('refresh-'), 'el token no se guarda en claro');
    assert.match(decrypt(b.googleRefreshTokenEnc), /^refresh-/);
    assert.equal(b.googleEmail, 'dueno@gmail.test');
    assert.ok(b.googleConnectedAt);

    const [juan, pedro] = await Promise.all(biz.resources.map((x) => reload(s.resources, x.id)));
    assert.equal(google.calendars.get(juan.googleCalendarId).summary, 'ReserYa · Juan');
    assert.equal(google.calendars.get(juan.googleCalendarId).timeZone, 'America/Tijuana');
    assert.equal(google.calendars.get(pedro.googleCalendarId).summary, 'ReserYa · Pedro');
    assert.equal(
      google.calendars.get(juan.googleCalendarId).colorId,
      nearestCalendarColor('#0A7DB2'),
    );
    assert.equal(
      google.calendars.get(pedro.googleCalendarId).colorId,
      nearestCalendarColor('#C23A3A'),
    );
    assert.ok(
      ['2', '3', '4'].includes(nearestCalendarColor('#C23A3A')),
      'rojo → un rojo de Google',
    );

    const [job] = await jobsOf(booking.id);
    assert.equal(job.action, 'create');
    await processQueue();
    assert.ok(google.event(juan.googleCalendarId, booking.id.replace(/-/g, '')));

    const st = await agent.get('/api/calendar/status');
    assert.equal(st.status, 200);
    assert.equal(st.body.enabled, true);
    assert.equal(st.body.connected, true);
    assert.equal(st.body.googleEmail, 'dueno@gmail.test');
    assert.equal(st.body.resources.length, 2);
    assert.ok(st.body.resources.every((x) => x.googleCalendarId && x.color && x.name));
    assert.equal(st.body.pendingJobs, 0);
    assert.equal(st.body.failedJobs, 0);
  });

  it('rechaza un state distinto, el permiso negado y la falta del permiso de calendario', async () => {
    const biz = await createBusiness();
    const agent = await loginOwner(biz.user);
    await agent.get('/api/calendar/connect');
    const bad = await agent
      .get('/api/calendar/callback')
      .query({ code: 'buen-codigo', state: 'otro' });
    assert.match(bad.headers.location, /error=invalid_state/);

    const denied = await agent.get('/api/calendar/callback').query({ error: 'access_denied' });
    assert.match(denied.headers.location, /error=access_denied/);

    google.grantScopes = ['openid', 'email'];
    const { callback } = await connect(agent);
    assert.match(callback.headers.location, /error=missing_scope/);

    // El state de un negocio no sirve en la sesión de otro.
    const r = await agent.get('/api/calendar/connect');
    const state = new URL(r.headers.location).searchParams.get('state');
    const other = await loginOwner((await createBusiness()).user);
    const cookie = r.headers['set-cookie'][0].split(';')[0];
    const stolen = await other
      .get('/api/calendar/callback')
      .set('Cookie', cookie)
      .query({ code: 'buen-codigo', state });
    assert.match(stolen.headers.location, /error=invalid_state/);

    const b = await reload(s.businesses, biz.business.id);
    assert.equal(b.googleRefreshTokenEnc, null);
  });

  it('crea el calendario de un recurso nuevo en la siguiente pasada', async () => {
    const biz = await connectedBusiness({ resources: ['Juan'] });
    const [luis] = await db
      .insert(s.resources)
      .values({ businessId: biz.business.id, name: 'Luis', color: '#0B7A55' })
      .returning();
    await processQueue();
    const r = await reload(s.resources, luis.id);
    assert.equal(google.calendars.get(r.googleCalendarId).summary, 'ReserYa · Luis');
  });
});

describe('cola ReserYa → Google', () => {
  it('crea, mueve y borra el evento sin teléfonos ni precios', async () => {
    const biz = await connectedBusiness();
    const client = await createUser({
      firstName: 'Carlos',
      lastName: 'Mendoza',
      phone: '6461112233',
    });
    const startsAt = localAt(2, '10:00');
    const { booking } = await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt,
    });
    await enqueueCalendarSync(booking.id, 'create');
    await processQueue();

    const cal = biz.cal.Juan;
    const b = await reload(s.bookings, booking.id);
    assert.ok(b.googleEventId);
    const ev = google.event(cal, b.googleEventId);
    assert.equal(ev.summary, 'Corte de cabello · Carlos M.');
    assert.equal(ev.extendedProperties.private.reseryaBookingId, booking.id);
    assert.equal(ts(ev.start.dateTime), ts(startsAt));
    assert.equal(ts(ev.end.dateTime), ts(b.endsAt));
    assert.ok(!ev.description.includes('6461112233'), 'sin teléfono');
    assert.ok(!/\$|200/.test(ev.description), 'sin precio');
    assert.equal((await jobsOf(booking.id))[0].status, 'done');

    // Reintentar un create no duplica (id determinista + 409 → patch).
    await enqueueCalendarSync(booking.id, 'create');
    await processQueue();
    assert.equal(google.calendars.get(cal).events.size, 1);

    const newStart = localAt(2, '15:00');
    await db
      .update(s.bookings)
      .set({ startsAt: newStart, endsAt: new Date(newStart.getTime() + 40 * 60000) })
      .where(eq(s.bookings.id, booking.id));
    await enqueueCalendarSync(booking.id, 'update');
    await processQueue();
    assert.equal(ts(google.event(cal, b.googleEventId).start.dateTime), ts(newStart));

    await db.update(s.bookings).set({ status: 'cancelled' }).where(eq(s.bookings.id, booking.id));
    await enqueueCalendarSync(booking.id, 'delete');
    await processQueue();
    assert.equal(google.event(cal, b.googleEventId).status, 'cancelled');
    assert.ok((await jobsOf(booking.id)).every((j) => j.status === 'done'));
  });

  it('si Google falla reintenta con espera creciente y marca failed tras 8 intentos', async () => {
    const biz = await connectedBusiness();
    const client = await createUser();
    const { booking } = await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: localAt(2, '12:00'),
    });
    const cal = encodeURIComponent(biz.cal.Juan);
    const isInsert = (m, p) => m === 'POST' && p === `/calendars/${cal}/events`;

    // Un fallo y luego funciona.
    google.fail(isInsert, 503, 1);
    await enqueueCalendarSync(booking.id, 'create');
    await processQueue();
    let [job] = await jobsOf(booking.id);
    assert.equal(job.status, 'pending');
    assert.equal(job.attempts, 1);
    assert.match(job.lastError, /503/);
    assert.ok(job.nextAttemptAt > new Date(), 'espera antes de reintentar');
    await processQueue();
    assert.equal((await jobsOf(booking.id))[0].attempts, 1, 'no reintenta antes de tiempo');
    setNow(new Date(Date.now() + 60_000));
    await processQueue();
    [job] = await jobsOf(booking.id);
    assert.equal(job.status, 'done');
    assert.equal(
      (await reload(s.bookings, booking.id)).status,
      'confirmed',
      'la reserva sigue válida',
    );

    // Falla siempre: espera creciente y failed al 8.º intento.
    const client2 = await createUser();
    const { booking: b2 } = await createBooking({
      client: client2,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: localAt(3, '12:00'),
    });
    google.fail(isInsert, 500, 100);
    await enqueueCalendarSync(b2.id, 'create');
    let t = Date.now() + 120_000;
    const waits = [];
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      setNow(new Date(t));
      await processQueue();
      [job] = await jobsOf(b2.id);
      waits.push(job.nextAttemptAt.getTime() - t);
      t += 2 * 3600e3;
    }
    assert.equal(job.status, 'failed');
    assert.equal(job.attempts, MAX_ATTEMPTS);
    assert.ok(waits[1] > waits[0] && waits[2] > waits[1], 'la espera crece');

    setNow(null);
    const st = await biz.agent.get('/api/calendar/status');
    assert.equal(st.body.failedJobs, 1);
    assert.equal(st.body.failed[0].bookingId, b2.id);
    assert.equal(st.body.failed[0].action, 'create');

    // "Sincronizar ahora" vuelve a intentar lo fallido.
    google.failures = [];
    const now2 = await biz.agent.post('/api/calendar/sync-now');
    assert.equal(now2.status, 200);
    assert.equal(now2.body.status.failedJobs, 0);
    assert.equal((await jobsOf(b2.id))[0].status, 'done');
  });

  it('sin Google configurado o sin conectar, los trabajos se marcan como hechos', async () => {
    const biz = await createBusiness();
    const client = await createUser();
    const { booking } = await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: localAt(2, '10:00'),
    });
    await enqueueCalendarSync(booking.id, 'create');
    await processQueue();
    assert.equal((await jobsOf(booking.id))[0].status, 'done', 'negocio sin conectar');
    assert.equal(google.requests.length, 0);

    env.googleEnabled = false;
    await enqueueCalendarSync(booking.id, 'update');
    await processQueue();
    await pullChanges();
    assert.ok((await jobsOf(booking.id)).every((j) => j.status === 'done'));

    const agent = await loginOwner(biz.user);
    const st = await agent.get('/api/calendar/status');
    assert.equal(st.body.enabled, false);
    assert.equal(st.body.connected, false);
    const c = await agent.get('/api/calendar/connect');
    assert.equal(c.status, 400);
    assert.equal(c.body.error, 'google_disabled');
  });

  it('si el refresh token deja de servir marca el negocio como desconectado', async () => {
    const biz = await connectedBusiness();
    const b = await reload(s.businesses, biz.business.id);
    const token = decrypt(b.googleRefreshTokenEnc);
    google.badTokens.add(token);
    const client = await createUser();
    const { booking } = await createBooking({
      client,
      business: biz.business,
      service: biz.services[0],
      resource: biz.resources[0],
      startsAt: localAt(2, '10:00'),
    });
    await enqueueCalendarSync(booking.id, 'create');
    await processQueue();
    const [job] = await jobsOf(booking.id);
    assert.equal(job.status, 'done');
    const after = await reload(s.businesses, biz.business.id);
    assert.equal(after.googleRefreshTokenEnc, null);
    const st = await biz.agent.get('/api/calendar/status');
    assert.equal(st.body.connected, false);
    assert.equal(st.body.connectionLost, true);

    // Deja de intentar: la siguiente pasada ni siquiera llama a Google.
    const mine = () => google.requests.filter((q) => q.token === token).length;
    const before = mine();
    await pullChanges();
    await processQueue();
    assert.equal(mine(), before);
  });
});

describe('Google → ReserYa', () => {
  it('los eventos propios del negocio bloquean horarios: crear, mover, borrar y 410', async () => {
    const biz = await connectedBusiness({ resources: ['Juan'] });
    const cal = biz.cal.Juan;
    const juan = biz.resources[0];
    const at = (d, h) => localAt(d, h).toISOString();

    google.userInsert(cal, {
      id: 'tel1',
      summary: 'Cita por teléfono: Don Pepe',
      start: { dateTime: at(1, '10:00') },
      end: { dateTime: at(1, '11:00') },
    });
    google.userInsert(cal, {
      id: 'libre',
      summary: 'Recordatorio',
      transparency: 'transparent',
      start: { dateTime: at(1, '12:00') },
      end: { dateTime: at(1, '13:00') },
    });
    google.userInsert(cal, {
      id: 'vacaciones',
      summary: 'Día libre',
      start: { date: localAt(4, '00:00').toISOString().slice(0, 10) },
      end: { date: localAt(5, '00:00').toISOString().slice(0, 10) },
    });
    // Un evento de hace semanas no nos interesa.
    google.userInsert(cal, {
      id: 'viejo',
      start: { dateTime: at(-20, '10:00') },
      end: { dateTime: at(-20, '11:00') },
    });
    await pullChanges();
    let blocks = await blocksOf(juan.id);
    assert.deepEqual(blocks.map((x) => x.googleEventId).sort(), ['tel1', 'vacaciones']);
    const tel = blocks.find((x) => x.googleEventId === 'tel1');
    assert.equal(ts(tel.startsAt), at(1, '10:00'));
    assert.equal(tel.title, 'Cita por teléfono: Don Pepe');
    const vac = blocks.find((x) => x.googleEventId === 'vacaciones');
    assert.equal(vac.endsAt.getTime() - vac.startsAt.getTime(), 24 * 3600e3, 'todo el día');
    const r = await reload(s.resources, juan.id);
    assert.ok(r.googleSyncToken, 'guarda el sync token');

    // Mover y volver disponible.
    google.userPatch(cal, 'tel1', {
      start: { dateTime: at(1, '16:00') },
      end: { dateTime: at(1, '17:30') },
    });
    google.userPatch(cal, 'vacaciones', { transparency: 'transparent' });
    await pullChanges();
    blocks = await blocksOf(juan.id);
    assert.equal(blocks.length, 1);
    assert.equal(ts(blocks[0].endsAt), at(1, '17:30'));
    const syncCall = google.requests.findLast((q) => q.method === 'GET');
    assert.ok(syncCall.params.syncToken, 'la segunda lectura es incremental');

    // Borrar.
    google.userDelete(cal, 'tel1');
    await pullChanges();
    assert.equal((await blocksOf(juan.id)).length, 0);

    // 410: el token venció → sincronización completa; lo que ya no existe se borra.
    google.userInsert(cal, {
      id: 'a',
      start: { dateTime: at(2, '10:00') },
      end: { dateTime: at(2, '11:00') },
    });
    google.userInsert(cal, {
      id: 'b',
      start: { dateTime: at(2, '12:00') },
      end: { dateTime: at(2, '13:00') },
    });
    await pullChanges();
    assert.equal((await blocksOf(juan.id)).length, 2);
    google.calendars.get(cal).events.delete('b'); // desaparece sin aviso
    google.expire(cal);
    const n = google.requests.length;
    await pullChanges();
    const calls = google.requests.slice(n).filter((q) => q.method === 'GET');
    assert.ok(calls[0].params.syncToken, 'primero intenta con el token');
    assert.ok(
      calls.some((q) => !q.params.syncToken && q.params.timeMin),
      'luego completa',
    );
    assert.deepEqual(
      (await blocksOf(juan.id)).map((x) => x.googleEventId),
      ['a'],
    );
  });

  it('si mueven la cita en Google se actualiza la reserva y se avisa al cliente', async () => {
    const biz = await connectedBusiness();
    const { booking, client } = await confirmedWithEvent(biz, localAt(2, '10:00'));
    assert.ok(!outbox.some((m) => m.bookingId === booking.id), 'su propio evento no avisa');

    const start = localAt(2, '11:00');
    const end = new Date(start.getTime() + 40 * 60000);
    google.userPatch(biz.cal.Juan, booking.googleEventId, {
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    });
    await pullChanges();
    const b = await reload(s.bookings, booking.id);
    assert.equal(ts(b.startsAt), ts(start));
    assert.equal(ts(b.endsAt), ts(end));
    const mail = outbox.find((m) => m.template === 'booking_moved' && m.bookingId === booking.id);
    assert.ok(mail);
    assert.equal(mail.to, client.email);
    assert.equal((await blocksOf(biz.resources[0].id)).length, 0, 'una cita no es bloque externo');

    await pullChanges();
    assert.equal(outbox.filter((m) => m.template === 'booking_moved').length, 1);
  });

  it('si la mueven encima de otra confirmada, la reserva no cambia y se registra el problema', async () => {
    const biz = await connectedBusiness();
    const { booking: b1 } = await confirmedWithEvent(biz, localAt(2, '10:00'));
    const { booking: b2 } = await confirmedWithEvent(biz, localAt(2, '12:00'));
    google.userPatch(biz.cal.Juan, b1.googleEventId, {
      start: { dateTime: b2.startsAt.toISOString() },
      end: { dateTime: b2.endsAt.toISOString() },
    });
    await pullChanges(); // no debe romper
    const after = await reload(s.bookings, b1.id);
    assert.equal(ts(after.startsAt), ts(b1.startsAt));
    assert.ok(!outbox.some((m) => m.template === 'booking_moved' && m.bookingId === b1.id));
    const jobs1 = await jobsOf(b1.id);
    assert.ok(jobs1.some((j) => j.status === 'failed' && /choca/.test(j.lastError)));

    // El evento regresa a su hora en Google.
    await processQueue();
    assert.equal(ts(google.event(biz.cal.Juan, b1.googleEventId).start.dateTime), ts(b1.startsAt));
    const st = await biz.agent.get('/api/calendar/status');
    assert.equal(st.body.failedJobs, 1);
    assert.match(st.body.failed[0].lastError, /choca/);
  });

  it('si borran la cita en Google se cancela por el negocio con reembolso', async () => {
    const biz = await connectedBusiness();
    const { booking, payment, client } = await confirmedWithEvent(biz, localAt(2, '10:00'));
    google.userDelete(biz.cal.Juan, booking.googleEventId);
    await pullChanges();
    const b = await reload(s.bookings, booking.id);
    assert.equal(b.status, 'cancelled');
    assert.equal(b.cancelledBy, 'business');
    assert.equal(b.cancellationReason, DELETED_REASON);
    assert.ok(b.cancelledAt);
    const p = await reload(s.payments, payment.id);
    assert.equal(p.status, 'refunded');
    assert.ok(p.refundedAt);
    const mail = outbox.find(
      (m) => m.template === 'booking_deleted_in_google' && m.bookingId === booking.id,
    );
    assert.equal(mail.to, client.email);
    assert.match(mail.html, /reembolsamos/);

    // Si ReserYa misma borra el evento (cancelación normal), no se repite nada.
    const { booking: other } = await confirmedWithEvent(biz, localAt(3, '10:00'));
    await db
      .update(s.bookings)
      .set({ status: 'cancelled', cancelledBy: 'client' })
      .where(eq(s.bookings.id, other.id));
    await enqueueCalendarSync(other.id, 'delete');
    await processQueue();
    await pullChanges();
    assert.equal((await reload(s.bookings, other.id)).cancelledBy, 'client');
    assert.ok(!outbox.some((m) => m.bookingId === other.id));
  });

  it('una cita de otro negocio en el calendario se ignora', async () => {
    const a = await connectedBusiness();
    const b = await connectedBusiness();
    const { booking } = await confirmedWithEvent(b, localAt(2, '10:00'));
    google.userInsert(a.cal.Juan, {
      id: 'intruso',
      start: { dateTime: localAt(2, '15:00').toISOString() },
      end: { dateTime: localAt(2, '16:00').toISOString() },
      extendedProperties: { private: { reseryaBookingId: booking.id } },
    });
    await pullChanges();
    assert.equal(ts((await reload(s.bookings, booking.id)).startsAt), ts(booking.startsAt));
  });
});

describe('desconectar y permisos', () => {
  it('desconectar revoca el token y limpia calendarios y bloques', async () => {
    const biz = await connectedBusiness({ resources: ['Juan'] });
    const token = decrypt((await reload(s.businesses, biz.business.id)).googleRefreshTokenEnc);
    google.userInsert(biz.cal.Juan, {
      id: 'x',
      start: { dateTime: localAt(1, '10:00').toISOString() },
      end: { dateTime: localAt(1, '11:00').toISOString() },
    });
    await pullChanges();
    assert.equal((await blocksOf(biz.resources[0].id)).length, 1);

    const r = await biz.agent.post('/api/calendar/disconnect');
    assert.equal(r.status, 200);
    assert.deepEqual(google.revoked, [token]);
    const b = await reload(s.businesses, biz.business.id);
    assert.equal(b.googleRefreshTokenEnc, null);
    assert.equal(b.googleEmail, null);
    const res = await reload(s.resources, biz.resources[0].id);
    assert.equal(res.googleCalendarId, null);
    assert.equal(res.googleSyncToken, null);
    assert.equal((await blocksOf(biz.resources[0].id)).length, 0);
    assert.ok(google.calendars.has(biz.cal.Juan), 'no borra los calendarios del usuario');
    const st = await biz.agent.get('/api/calendar/status');
    assert.equal(st.body.connected, false);
    assert.equal(st.body.connectionLost, false);
  });

  it('solo el dueño con PIN usa estas rutas', async () => {
    const biz = await createBusiness();
    const reception = await loginAs(biz.user);
    for (const [m, p] of [
      ['get', '/api/calendar/status'],
      ['get', '/api/calendar/connect'],
      ['post', '/api/calendar/disconnect'],
      ['post', '/api/calendar/sync-now'],
    ]) {
      const r = await reception[m](p);
      assert.equal(r.status, 403, `${m} ${p}`);
      assert.equal(r.body.error, 'owner_mode_locked');
    }
    const client = await loginAs(await createUser());
    assert.equal((await client.get('/api/calendar/status')).body.error, 'wrong_role');

    const owner = await loginOwner(biz.user);
    const r = await owner.post('/api/calendar/sync-now');
    assert.equal(r.body.error, 'not_connected');
  });

  it('exporta las tareas periódicas', () => {
    assert.deepEqual(
      jobs.map((j) => j.name),
      ['calendar-queue', 'calendar-pull'],
    );
    assert.ok(jobs.find((j) => j.name === 'calendar-pull').everyMs <= 60_000, 'RNF-06');
  });
});
