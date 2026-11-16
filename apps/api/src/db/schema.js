// Esquema de la base de datos de ReserYa. Ver docs/base-de-datos.md.
// Las columnas se escriben en camelCase y Drizzle las guarda en snake_case (casing: 'snake_case').
import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  smallint,
  numeric,
  time,
  date,
  primaryKey,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';

const tstz = () => timestamp({ withTimezone: true });
const id = () => uuid().primaryKey().defaultRandom();
const timestamps = {
  createdAt: tstz().notNull().defaultNow(),
  updatedAt: tstz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------- enums ----------
export const userRole = pgEnum('user_role', ['client', 'business', 'admin']);
export const authTokenType = pgEnum('auth_token_type', [
  'verify_email',
  'reset_password',
  'reset_pin',
]);
export const businessStatus = pgEnum('business_status', [
  'pending',
  'approved',
  'suspended',
  'rejected',
]);
export const resourceKind = pgEnum('resource_kind', ['person', 'space']);
export const bookingStatus = pgEnum('booking_status', [
  'pending',
  'hold',
  'confirmed',
  'rejected',
  'expired',
  'cancelled',
  'completed',
  'no_show',
]);
export const cancelledBy = pgEnum('cancelled_by', ['client', 'business']);
// 'pending' = el cliente todavía no termina de pagar (aún no hay autorización).
export const paymentStatus = pgEnum('payment_status', [
  'pending',
  'authorized',
  'captured',
  'released',
  'refunded',
  'failed',
]);
export const syncAction = pgEnum('sync_action', ['create', 'update', 'delete']);
export const syncStatus = pgEnum('sync_status', ['pending', 'done', 'failed']);

// ---------- cuentas ----------
export const users = pgTable('users', {
  id: id(),
  role: userRole().notNull().default('client'),
  email: text().notNull().unique(),
  passwordHash: text(),
  googleId: text().unique(),
  emailVerifiedAt: tstz(),
  firstName: text().notNull(),
  lastName: text().notNull().default(''),
  phone: text(),
  active: boolean().notNull().default(true),
  ...timestamps,
});

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull().unique(),
    expiresAt: tstz().notNull(),
    // Hasta cuándo está desbloqueado el modo dueño (RF-07). Se renueva con cada uso.
    ownerUnlockedUntil: tstz(),
    ip: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: authTokenType().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: tstz().notNull(),
    usedAt: tstz(),
    ...timestamps,
  },
  (t) => [index().on(t.userId, t.type)],
);

// ---------- negocios ----------
export const categories = pgTable('categories', {
  id: id(),
  name: text().notNull().unique(),
  slug: text().notNull().unique(),
  // Nombre del ícono de lucide que se usa en la web.
  icon: text().notNull(),
  sortOrder: smallint().notNull().default(0),
  ...timestamps,
});

export const registrationKeys = pgTable('registration_keys', {
  id: id(),
  code: text().notNull().unique(),
  createdBy: uuid()
    .notNull()
    .references(() => users.id),
  usedAt: tstz(),
  ...timestamps,
});

export const businesses = pgTable(
  'businesses',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .unique()
      .references(() => users.id),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    name: text().notNull(),
    description: text(),
    address: text(),
    phone: text(),
    status: businessStatus().notNull().default('pending'),
    rejectionReason: text(),
    suspensionReason: text(),
    suspendedAt: tstz(),
    approvedAt: tstz(),
    registrationKeyId: uuid()
      .unique()
      .references(() => registrationKeys.id),
    ownerPinHash: text(),
    pinChangedAt: tstz(),
    pinFailedAttempts: integer().notNull().default(0),
    pinLockedUntil: tstz(),
    autoAccept: boolean().notNull().default(false),
    // Reglas (RF-19). Nulas hasta que el dueño las guarda; un negocio sin reglas no sale en búsquedas (RF-71).
    cancellationLimitHours: integer(),
    minNoticeMinutes: integer(),
    maxAdvanceDays: integer(),
    slotIntervalMinutes: integer(),
    bufferMinutes: integer(),
    googleRefreshTokenEnc: text(),
    googleEmail: text(),
    googleConnectedAt: tstz(),
    ratingAvg: numeric({ precision: 3, scale: 2, mode: 'number' }).notNull().default(0),
    ratingCount: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index().on(t.status),
    index().on(t.categoryId),
    check(
      'min_notice_allowed',
      sql`${t.minNoticeMinutes} is null or ${t.minNoticeMinutes} in (30, 60, 180, 300, 720, 1440)`,
    ),
  ],
);

export const businessPhotos = pgTable(
  'business_photos',
  {
    id: id(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    storageKey: text().notNull(),
    sortOrder: smallint().notNull().default(0),
    ...timestamps,
  },
  (t) => [index().on(t.businessId)],
);

// ---------- catálogo ----------
export const services = pgTable(
  'services',
  {
    id: id(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    description: text(),
    durationMin: integer().notNull(),
    priceCents: integer().notNull(),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index().on(t.businessId),
    check('duration_positive', sql`${t.durationMin} > 0`),
    check('price_non_negative', sql`${t.priceCents} >= 0`),
  ],
);

export const resources = pgTable(
  'resources',
  {
    id: id(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    // Rol o descripción corta: "Barbero", "Cancha techada"...
    title: text(),
    kind: resourceKind().notNull().default('person'),
    color: text().notNull().default('#0A7DB2'),
    googleCalendarId: text(),
    googleSyncToken: text(),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [index().on(t.businessId)],
);

export const resourceServices = pgTable(
  'resource_services',
  {
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    serviceId: uuid()
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.serviceId] })],
);

export const resourceSchedules = pgTable(
  'resource_schedules',
  {
    id: id(),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    // 0 = domingo ... 6 = sábado
    weekday: smallint().notNull(),
    startTime: time().notNull(),
    endTime: time().notNull(),
    ...timestamps,
  },
  (t) => [
    index().on(t.resourceId),
    check('weekday_range', sql`${t.weekday} between 0 and 6`),
    check('time_order', sql`${t.startTime} < ${t.endTime}`),
  ],
);

export const closedDays = pgTable(
  'closed_days',
  {
    id: id(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    // Nulo = cierra todo el negocio.
    resourceId: uuid().references(() => resources.id, { onDelete: 'cascade' }),
    date: date().notNull(),
    reason: text(),
    ...timestamps,
  },
  (t) => [index().on(t.businessId, t.date)],
);

// ---------- reservas y pagos ----------
// La restricción de exclusión (RNF-15) está en la migración 0001_exclusion.sql porque Drizzle no la expresa.
export const bookings = pgTable(
  'bookings',
  {
    id: id(),
    clientId: uuid()
      .notNull()
      .references(() => users.id),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id),
    serviceId: uuid()
      .notNull()
      .references(() => services.id),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id),
    startsAt: tstz().notNull(),
    endsAt: tstz().notNull(),
    status: bookingStatus().notNull().default('pending'),
    priceCents: integer().notNull(),
    durationMin: integer().notNull(),
    holdExpiresAt: tstz(),
    respondBy: tstz(),
    // Cuándo quedó autorizado el pago y la solicitud entró a la cola del negocio.
    submittedAt: tstz(),
    decidedAt: tstz(),
    cancelledAt: tstz(),
    cancelledBy: cancelledBy(),
    cancellationReason: text(),
    completedAt: tstz(),
    googleEventId: text(),
    rebookedFromId: uuid(),
    ...timestamps,
  },
  (t) => [
    index().on(t.businessId, t.startsAt),
    index().on(t.clientId, t.startsAt),
    index().on(t.status, t.respondBy),
    index().on(t.resourceId, t.startsAt),
    check('booking_time_order', sql`${t.startsAt} < ${t.endsAt}`),
  ],
);

export const payments = pgTable('payments', {
  id: id(),
  bookingId: uuid()
    .notNull()
    .unique()
    .references(() => bookings.id),
  // 'fake_...' cuando no hay llaves de Stripe (modo demostración).
  stripePaymentIntentId: text().notNull().unique(),
  amountCents: integer().notNull(),
  status: paymentStatus().notNull().default('pending'),
  authorizedAt: tstz(),
  capturedAt: tstz(),
  releasedAt: tstz(),
  refundedAt: tstz(),
  ...timestamps,
});

export const stripeEvents = pgTable('stripe_events', {
  id: text().primaryKey(),
  type: text().notNull(),
  processedAt: tstz().notNull().defaultNow(),
});

// ---------- después de la cita ----------
export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    bookingId: uuid()
      .notNull()
      .unique()
      .references(() => bookings.id),
    clientId: uuid()
      .notNull()
      .references(() => users.id),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id),
    rating: smallint().notNull(),
    comment: text(),
    ...timestamps,
  },
  (t) => [index().on(t.businessId), check('rating_range', sql`${t.rating} between 1 and 5`)],
);

export const businessViews = pgTable(
  'business_views',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    lastViewedAt: tstz().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.businessId] })],
);

// ---------- calendario y agenda en vivo ----------
export const calendarSyncJobs = pgTable(
  'calendar_sync_jobs',
  {
    id: id(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id),
    action: syncAction().notNull(),
    status: syncStatus().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    nextAttemptAt: tstz().notNull().defaultNow(),
    lastError: text(),
    ...timestamps,
  },
  (t) => [index().on(t.status, t.nextAttemptAt)],
);

export const externalBusyBlocks = pgTable(
  'external_busy_blocks',
  {
    id: id(),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    googleEventId: text().notNull(),
    title: text(),
    startsAt: tstz().notNull(),
    endsAt: tstz().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex().on(t.resourceId, t.googleEventId),
    index().on(t.resourceId, t.startsAt),
  ],
);

export const liveLinks = pgTable(
  'live_links',
  {
    id: id(),
    businessId: uuid()
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    // Nulo = negocio completo.
    resourceId: uuid().references(() => resources.id, { onDelete: 'cascade' }),
    // El token se guarda tal cual porque el dueño lo vuelve a copiar; regenerar revoca el anterior.
    token: text().notNull().unique(),
    revokedAt: tstz(),
    ...timestamps,
  },
  (t) => [index().on(t.businessId)],
);

// ---------- avisos ----------
export const emailLog = pgTable(
  'email_log',
  {
    id: id(),
    toUserId: uuid().references(() => users.id),
    toEmail: text().notNull(),
    template: text().notNull(),
    bookingId: uuid().references(() => bookings.id),
    status: text().notNull().default('sent'),
    sentAt: tstz(),
    ...timestamps,
  },
  (t) => [index().on(t.bookingId, t.template)],
);
