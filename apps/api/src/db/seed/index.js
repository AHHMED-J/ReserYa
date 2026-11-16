// Datos de demostración. Uso: pnpm db:seed (o pnpm db:reset para empezar de cero).
// Cuentas: ver README (todas con la contraseña demo1234 y el PIN de dueño 1234).
import { sql } from 'drizzle-orm';
import { db, pool } from '../index.js';
import * as s from '../schema.js';
import { hashSecret, registrationCode } from '../../lib/crypto.js';
import { now } from '../../lib/time.js';
import {
  CATEGORIES,
  BUSINESSES,
  PENDING_BUSINESSES,
  SUSPENDED_BUSINESS,
  CLIENTS,
  REVIEW_COMMENTS,
  RES_COLORS,
  DEMO_PASSWORD,
  DEMO_PIN,
} from './data.js';

// Números pseudoaleatorios fijos: el seed siempre produce los mismos datos.
let seedState = 20261116;
const rnd = () => (seedState = (seedState * 16807) % 2147483647) / 2147483647;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const [{ count }] = await db.select({ count: sql`count(*)::int` }).from(s.users);
if (count > 0) {
  console.log('La base ya tiene datos. Usa "pnpm db:reset" para borrarla y volver a sembrar.');
  await pool.end();
  process.exit(0);
}

const pw = await hashSecret(DEMO_PASSWORD);
const pinHash = await hashSecret(DEMO_PIN);
const T = now();
const today = T.startOf('day');
const verified = T.minus({ months: 3 }).toJSDate();

// ---------- categorías, admin y clientes ----------
const cats = await db
  .insert(s.categories)
  .values(CATEGORIES.map(([name, slug, icon], i) => ({ name, slug, icon, sortOrder: i })))
  .returning();
const catBySlug = Object.fromEntries(cats.map((c) => [c.slug, c]));

const [admin] = await db
  .insert(s.users)
  .values({
    role: 'admin',
    email: 'admin@reserya.test',
    passwordHash: pw,
    emailVerifiedAt: verified,
    firstName: 'Administrador',
    lastName: 'ReserYa',
  })
  .returning();

const clients = await db
  .insert(s.users)
  .values(
    CLIENTS.map(([firstName, lastName, email, phone]) => ({
      role: 'client',
      firstName,
      lastName,
      email,
      phone,
      passwordHash: pw,
      emailVerifiedAt: verified,
    })),
  )
  .returning();
const client = Object.fromEntries(clients.map((c) => [c.firstName, c]));

// ---------- negocios ----------
async function createBusinessAccount(def, status) {
  const [key] = await db
    .insert(s.registrationKeys)
    .values({ code: registrationCode(), createdBy: admin.id, usedAt: T.minus({ days: 40 }).toJSDate() })
    .returning();
  const [user] = await db
    .insert(s.users)
    .values({
      role: 'business',
      email: def.email,
      passwordHash: pw,
      emailVerifiedAt: verified,
      firstName: def.contact[0],
      lastName: def.contact[1],
      phone: def.phone,
    })
    .returning();
  const [business] = await db
    .insert(s.businesses)
    .values({
      userId: user.id,
      categoryId: catBySlug[def.cat].id,
      name: def.name,
      description: def.description ?? null,
      address: def.address ?? null,
      phone: def.phone,
      status,
      approvedAt: status === 'approved' ? T.minus({ days: 35 }).toJSDate() : null,
      registrationKeyId: key.id,
      ownerPinHash: status === 'pending' ? null : pinHash,
      autoAccept: def.autoAccept ?? false,
      ...(def.rules ?? {}),
      createdAt: T.minus({ days: status === 'pending' ? 1 + PENDING_BUSINESSES.indexOf(def) : 40 }).toJSDate(),
    })
    .returning();
  return business;
}

const B = {}; // nombre → { business, services, resources, def }
for (const def of BUSINESSES) {
  const business = await createBusinessAccount(def, 'approved');
  const services = await db
    .insert(s.services)
    .values(
      def.services.map(([name, durationMin, pesos]) => ({
        businessId: business.id,
        name,
        durationMin,
        priceCents: Math.round((pesos * def.factor) / 10) * 1000,
      })),
    )
    .returning();
  const resources = await db
    .insert(s.resources)
    .values(
      def.resources.map(([name, title, kind], i) => ({
        businessId: business.id,
        name,
        title,
        kind,
        color: RES_COLORS[i % RES_COLORS.length],
      })),
    )
    .returning();
  await db
    .insert(s.resourceServices)
    .values(resources.flatMap((r) => services.map((sv) => ({ resourceId: r.id, serviceId: sv.id }))));
  await db.insert(s.resourceSchedules).values(
    resources.flatMap((r) =>
      def.schedule.flatMap(([days, startTime, endTime]) =>
        days.map((weekday) => ({ resourceId: r.id, weekday, startTime, endTime })),
      ),
    ),
  );
  B[def.name] = { business, services, resources, def };
}

for (const def of PENDING_BUSINESSES) await createBusinessAccount(def, 'pending');
const suspended = await createBusinessAccount(
  { ...SUSPENDED_BUSINESS, description: 'Masajes rápidos en la zona centro.', address: 'Calle Primera 900, Ensenada' },
  'suspended',
);
await db
  .update(s.businesses)
  .set({ suspensionReason: SUSPENDED_BUSINESS.reason, suspendedAt: T.minus({ days: 5 }).toJSDate() })
  .where(sql`${s.businesses.id} = ${suspended.id}`);

// Claves sin usar (RF-09).
await db
  .insert(s.registrationKeys)
  .values(Array.from({ length: 4 }, () => ({ code: registrationCode(), createdBy: admin.id })));

// ---------- reservas ----------
let paymentSeq = 0;
const svc = (b, name) => B[b].services.find((x) => x.name === name);
const res = (b, name) => B[b].resources.find((x) => x.name === name);
const dbWeekday = (dt) => dt.weekday % 7; // luxon: 1=lunes..7=domingo → 0=domingo..6=sábado
const isOpen = (b, day) => B[b].def.schedule.some(([days]) => days.includes(dbWeekday(day)));
const nextOpen = (b, day) => {
  let d = day;
  while (!isOpen(b, d)) d = d.plus({ days: 1 });
  return d;
};
const prevOpen = (b, day) => {
  let d = day;
  while (!isOpen(b, d)) d = d.minus({ days: 1 });
  return d;
};
const at = (day, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
};

const PAYMENT_FOR = {
  pending: 'authorized',
  hold: 'pending',
  confirmed: 'captured',
  completed: 'captured',
  no_show: 'captured',
  cancelled: 'refunded',
  rejected: 'released',
  expired: 'released',
};

async function book({ b, who, service, resource, start, status, review, submittedAgoMin = 60 * 24 * 2 }) {
  const sv = svc(b, service);
  const rs = res(b, resource);
  const end = start.plus({ minutes: sv.durationMin });
  const submittedAt = start < T ? start.minus({ days: 2 }) : T.minus({ minutes: submittedAgoMin });
  const decidedAt = submittedAt.plus({ hours: 1 });
  const values = {
    clientId: client[who].id,
    businessId: B[b].business.id,
    serviceId: sv.id,
    resourceId: rs.id,
    startsAt: start.toJSDate(),
    endsAt: end.toJSDate(),
    status,
    priceCents: sv.priceCents,
    durationMin: sv.durationMin,
    submittedAt: submittedAt.toJSDate(),
    createdAt: submittedAt.toJSDate(),
  };
  if (status === 'pending') {
    const twelve = submittedAt.plus({ hours: 12 });
    const oneBefore = start.minus({ hours: 1 });
    values.respondBy = (twelve < oneBefore ? twelve : oneBefore).toJSDate();
  } else {
    values.decidedAt = decidedAt.toJSDate();
  }
  if (status === 'completed' || status === 'no_show') values.completedAt = end.toJSDate();
  if (status === 'cancelled') {
    values.cancelledAt = start.minus({ days: 1 }).toJSDate();
    values.cancelledBy = 'client';
  }
  const [booking] = await db.insert(s.bookings).values(values).returning();
  const pStatus = PAYMENT_FOR[status];
  await db.insert(s.payments).values({
    bookingId: booking.id,
    stripePaymentIntentId: `fake_seed_${++paymentSeq}`,
    amountCents: sv.priceCents,
    status: pStatus,
    authorizedAt: submittedAt.toJSDate(),
    capturedAt: ['captured', 'refunded'].includes(pStatus) ? decidedAt.toJSDate() : null,
    releasedAt: pStatus === 'released' ? decidedAt.toJSDate() : null,
    refundedAt: pStatus === 'refunded' ? values.cancelledAt : null,
  });
  if (review) {
    await db.insert(s.reviews).values({
      bookingId: booking.id,
      clientId: client[who].id,
      businessId: B[b].business.id,
      rating: review[0],
      comment: review[1],
      createdAt: end.plus({ hours: 3 }).toJSDate(),
    });
  }
  return booking;
}

// Historial: citas pasadas con reseñas para que cada negocio tenga calificación.
const reviewers = clients.filter((c) => c.firstName !== 'Ana');
for (const name of Object.keys(B)) {
  const { def } = B[name];
  const n = 8 + Math.floor(rnd() * 8);
  for (let i = 0; i < n; i++) {
    const day = prevOpen(name, today.minus({ days: 3 + i * 3 + Math.floor(rnd() * 3) }));
    const [, startTime] = def.schedule[0];
    const hour = Number(startTime.slice(0, 2)) + (i % 4);
    const service = pick(def.services)[0];
    const resource = def.resources[i % def.resources.length][0];
    const who = pick(reviewers).firstName;
    const status = i % 9 === 4 ? 'no_show' : i % 11 === 7 ? 'cancelled' : 'completed';
    const rating = rnd() < 0.7 ? 5 : rnd() < 0.8 ? 4 : 3;
    await book({
      b: name,
      who,
      service,
      resource,
      start: at(day, `${String(hour).padStart(2, '0')}:00`),
      status,
      review: status === 'completed' && rnd() < 0.8 ? [rating, pick(REVIEW_COMMENTS)] : null,
    });
  }
}

// Agenda de hoy en Barbería El Patrón (pantalla "Agenda del día").
const P = 'Barbería El Patrón';
const agenda = [
  ['Carlos', 'Corte de cabello', 'Juan', '09:00'],
  ['Marta', 'Corte de cabello', 'Juan', '10:20'],
  ['Diego', 'Corte + barba', 'Juan', '14:00'],
  ['Raúl', 'Corte de cabello', 'Juan', '17:00'],
  ['Rosa', 'Barba', 'Pedro', '09:40'],
  ['Luis', 'Corte + barba', 'Pedro', '11:00'],
  ['Jorge', 'Corte de cabello', 'Pedro', '15:00'],
  ['Tomás', 'Corte + barba', 'Pedro', '18:00'],
  ['Pepe', 'Lavado y peinado', 'Luis', '10:00'],
  ['Óscar', 'Corte de cabello', 'Luis', '13:40'],
  ['Iván', 'Corte + barba', 'Luis', '16:20'],
];
for (const [who, service, resource, hhmm] of agenda) {
  const start = at(today, hhmm);
  await book({ b: P, who, service, resource, start, status: start.plus({ hours: 1 }) < T ? 'completed' : 'confirmed' });
}

// Solicitudes pendientes de El Patrón (pantalla "Solicitudes"): hoy si aún es temprano, si no mañana.
const reqDay = nextOpen(P, T.hour < 12 ? today : today.plus({ days: 1 }));
const reqDay2 = nextOpen(P, reqDay.plus({ days: 1 }));
await book({ b: P, who: 'Carlos', service: 'Corte de cabello', resource: 'Juan', start: at(reqDay, '16:00'), status: 'pending', submittedAgoMin: 136 });
await book({ b: P, who: 'Raúl', service: 'Barba', resource: 'Juan', start: at(reqDay, '16:20'), status: 'pending', submittedAgoMin: 95 });
await book({ b: P, who: 'Luis', service: 'Corte + barba', resource: 'Pedro', start: at(reqDay, '19:00'), status: 'pending', submittedAgoMin: 50 });
await book({ b: P, who: 'Rosa', service: 'Lavado y peinado', resource: 'Luis', start: at(reqDay2, '10:00'), status: 'pending', submittedAgoMin: 20 });

// Reservas de Ana (cliente de demostración).
const S = 'Spa Brisa';
const C10 = 'Cancha La 10';
const D = 'Dental Sonrisa';
await book({ b: P, who: 'Ana', service: 'Corte de cabello', resource: 'Juan', start: at(nextOpen(P, today.plus({ days: 2 })), '16:00'), status: 'confirmed' });
await book({ b: C10, who: 'Ana', service: 'Renta 1 h', resource: 'Cancha 1', start: at(today.plus({ days: 5 }), '19:00'), status: 'confirmed' });
await book({ b: D, who: 'Ana', service: 'Limpieza dental', resource: 'Dra. Ruiz', start: at(nextOpen(D, today.plus({ days: 9 })), '10:00'), status: 'confirmed' });
await book({ b: S, who: 'Ana', service: 'Masaje relajante', resource: 'Sofía', start: at(today.plus({ days: 3 }), '18:00'), status: 'pending', submittedAgoMin: 60 });
await book({ b: P, who: 'Ana', service: 'Corte de cabello', resource: 'Juan', start: at(prevOpen(P, today.minus({ days: 14 })), '11:00'), status: 'completed' });
await book({ b: S, who: 'Ana', service: 'Masaje relajante', resource: 'Sofía', start: at(today.minus({ days: 40 }), '17:00'), status: 'completed', review: [5, 'Muy relajante, Sofía es excelente.'] });
await book({ b: 'Fisio Activa', who: 'Ana', service: 'Sesión de fisioterapia', resource: 'Lic. Ramírez', start: at(prevOpen('Fisio Activa', today.minus({ days: 60 })), '09:00'), status: 'completed', review: [4, 'Me ayudó mucho con el dolor de espalda.'] });
await book({ b: 'Uñas Glam', who: 'Ana', service: 'Manicure', resource: 'Sofía', start: at(prevOpen('Uñas Glam', today.minus({ days: 10 })), '12:00'), status: 'cancelled' });
await book({ b: 'Corte Fino', who: 'Ana', service: 'Barba', resource: 'Toño', start: at(prevOpen('Corte Fino', today.minus({ days: 20 })), '12:00'), status: 'expired' });

await db.insert(s.businessViews).values(
  [P, C10, S, D].map((b, i) => ({
    userId: client.Ana.id,
    businessId: B[b].business.id,
    lastViewedAt: T.minus({ hours: 2 + i * 20 }).toJSDate(),
  })),
);

// Calificación en caché (RF-49, RF-64).
await db.execute(sql`
  update businesses b set
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from reviews r where r.business_id = b.id), 0),
    rating_count = (select count(*) from reviews r where r.business_id = b.id)
`);

const [{ bookings: nb }] = await db.select({ bookings: sql`count(*)::int` }).from(s.bookings);
console.log(`Listo: ${cats.length} categorías, ${clients.length} clientes, ${Object.keys(B).length} negocios activos, ${nb} reservas.`);
console.log(`Cuentas de prueba con contraseña "${DEMO_PASSWORD}" y PIN "${DEMO_PIN}". Ver README.`);
await pool.end();
