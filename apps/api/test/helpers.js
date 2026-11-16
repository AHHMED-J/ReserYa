// Utilidades para las pruebas de la API (node:test + supertest).
// Corren contra reserya_test (o TEST_DATABASE_URL). Cada archivo de prueba llama a setupDb() en before().
import request from 'supertest';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { createApp } from '../src/app.js';
import { hashSecret, registrationCode } from '../src/lib/crypto.js';
import { outbox } from '../src/lib/email.js';
import { now, setNow } from '../src/lib/time.js';
import { CATEGORIES } from '../src/db/seed/data.js';

export { db, s, outbox, now, setNow, sql };
export const app = createApp();
export const PASSWORD = 'secreto123';
export const PIN = '1234';

let migrated = false;

/** Deja la base de pruebas vacía (solo con las 9 categorías). */
export async function setupDb() {
  if (!migrated) {
    await db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
    await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
    migrated = true;
  }
  const tables = await db.execute(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = tables.rows.map((r) => `"${r.tablename}"`).join(', ');
  if (names) await db.execute(sql.raw(`truncate ${names} restart identity cascade`));
  await db
    .insert(s.categories)
    .values(CATEGORIES.map(([name, slug, icon], i) => ({ name, slug, icon, sortOrder: i })));
  outbox.length = 0;
  setNow(null);
}

export async function closeDb() {
  await pool.end();
}

let n = 0;
const uniq = () => `${Date.now().toString(36)}${++n}`;

export async function createUser(overrides = {}) {
  const [user] = await db
    .insert(s.users)
    .values({
      role: 'client',
      email: `u${uniq()}@prueba.test`,
      firstName: 'Prueba',
      lastName: 'Cliente',
      phone: '6461234567',
      passwordHash: await hashSecret(PASSWORD),
      emailVerifiedAt: new Date(),
      ...overrides,
    })
    .returning();
  return user;
}

export const createAdmin = (o = {}) => createUser({ role: 'admin', firstName: 'Admin', ...o });

/**
 * Crea un negocio listo para recibir reservas: cuenta, servicios, recursos con horario
 * de lunes a domingo 09:00–20:00 y reglas. Devuelve { user, business, services, resources }.
 */
export async function createBusiness(o = {}) {
  const [cat] = await db.select().from(s.categories).limit(1);
  const user = await createUser({ role: 'business', firstName: 'Dueño', phone: '6460000000' });
  const admin = o.admin ?? (await createAdmin());
  const [key] = await db
    .insert(s.registrationKeys)
    .values({ code: registrationCode(), createdBy: admin.id, usedAt: new Date() })
    .returning();
  const [business] = await db
    .insert(s.businesses)
    .values({
      userId: user.id,
      categoryId: o.categoryId ?? cat.id,
      name: o.name ?? `Negocio ${uniq()}`,
      description: 'Negocio de prueba',
      address: 'Calle 1, Ensenada',
      phone: '6460000000',
      status: o.status ?? 'approved',
      approvedAt: new Date(),
      registrationKeyId: key.id,
      ownerPinHash: await hashSecret(PIN),
      autoAccept: o.autoAccept ?? false,
      cancellationLimitHours: 12,
      minNoticeMinutes: 60,
      maxAdvanceDays: 30,
      slotIntervalMinutes: 20,
      bufferMinutes: 0,
      ...(o.rules ?? {}),
    })
    .returning();
  const services = await db
    .insert(s.services)
    .values(
      (o.services ?? [['Corte de cabello', 40, 20000], ['Barba', 20, 12000]]).map(
        ([name, durationMin, priceCents]) => ({ businessId: business.id, name, durationMin, priceCents }),
      ),
    )
    .returning();
  const resources = await db
    .insert(s.resources)
    .values((o.resources ?? ['Juan', 'Pedro']).map((name) => ({ businessId: business.id, name })))
    .returning();
  await db
    .insert(s.resourceServices)
    .values(resources.flatMap((r) => services.map((sv) => ({ resourceId: r.id, serviceId: sv.id }))));
  await db.insert(s.resourceSchedules).values(
    resources.flatMap((r) =>
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        resourceId: r.id,
        weekday,
        startTime: '09:00',
        endTime: '20:00',
      })),
    ),
  );
  return { user, business, services, resources };
}

/** Agente de supertest con sesión iniciada (guarda la cookie). */
export async function loginAs(user) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`No se pudo iniciar sesión: ${r.status} ${JSON.stringify(r.body)}`);
  return agent;
}

/** Agente de negocio con el modo dueño desbloqueado (requiere la ruta POST /api/business/owner/unlock). */
export async function loginOwner(user) {
  const agent = await loginAs(user);
  await agent.post('/api/business/owner/unlock').send({ pin: PIN });
  return agent;
}

/** Inserta una reserva con su pago directamente (para preparar escenarios). */
export async function createBooking({ client, business, service, resource, startsAt, status = 'confirmed', paymentStatus }) {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + service.durationMin * 60000);
  const [booking] = await db
    .insert(s.bookings)
    .values({
      clientId: client.id,
      businessId: business.id,
      serviceId: service.id,
      resourceId: resource.id,
      startsAt: start,
      endsAt: end,
      status,
      priceCents: service.priceCents,
      durationMin: service.durationMin,
      submittedAt: new Date(),
      respondBy: status === 'pending' ? new Date(Math.min(Date.now() + 12 * 3600e3, start - 3600e3)) : null,
    })
    .returning();
  const defaultPay = { pending: 'authorized', confirmed: 'captured', completed: 'captured', hold: 'pending' }[status] ?? 'released';
  const [payment] = await db
    .insert(s.payments)
    .values({
      bookingId: booking.id,
      stripePaymentIntentId: `fake_test_${uniq()}`,
      amountCents: service.priceCents,
      status: paymentStatus ?? defaultPay,
      authorizedAt: new Date(),
    })
    .returning();
  return { booking, payment };
}

/** Siguiente día (en America/Tijuana) a la hora dada, como Date. days=1 → mañana. */
export const localAt = (days, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return now().startOf('day').plus({ days }).set({ hour: h, minute: m }).toJSDate();
};
