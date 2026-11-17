// Panel del administrador (RF-09, RF-11, RF-12, RF-13, RF-72). Montado en /api/admin, solo rol admin.
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  businesses,
  categories,
  users,
  registrationKeys,
  bookings,
  services,
  resources,
} from '../../db/schema.js';
import { env } from '../../config/env.js';
import { requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { conflict, notFound } from '../../lib/errors.js';
import { registrationCode } from '../../lib/crypto.js';
import { sendEmail, emailLayout } from '../../lib/email.js';
import { setupChecklist } from '../../lib/businessReady.js';
import { now, nowDate } from '../../lib/time.js';
import * as v from '../../lib/validators.js';

export const router = Router();
router.use(requireRole('admin'));

const STATUS_LABEL = {
  pending: 'Pendiente',
  approved: 'Activo',
  rejected: 'Rechazado',
  suspended: 'Suspendido',
};

// ---------- resumen ----------
router.get('/summary', async (_req, res) => {
  const monthStart = now().startOf('month').toJSDate();
  const [row] = (
    await db.execute(sql`
      select
        (select count(*) from ${businesses} where status = 'pending')::int as "pendingCount",
        (select to_char(min(created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          from ${businesses} where status = 'pending') as "oldestPendingAt",
        (select count(*) from ${businesses} where status = 'approved')::int as "activeCount",
        (select count(*) from ${businesses} where status = 'suspended')::int as "suspendedCount",
        (select count(*) from ${registrationKeys} where used_at is null)::int as "freeKeysCount",
        (select count(*) from ${registrationKeys}
          where used_at is null and created_at >= ${monthStart})::int as "freeKeysThisMonth"
    `)
  ).rows;
  res.json(row);
});

// ---------- claves de registro (RF-09) ----------
async function listKeys() {
  const rows = await db
    .select({ k: registrationKeys, businessId: businesses.id, businessName: businesses.name })
    .from(registrationKeys)
    .leftJoin(businesses, eq(businesses.registrationKeyId, registrationKeys.id))
    .orderBy(sql`${registrationKeys.usedAt} is not null`, desc(registrationKeys.createdAt));
  return rows.map(({ k, businessId, businessName }) => ({
    id: k.id,
    code: k.code,
    createdAt: k.createdAt,
    usedAt: k.usedAt,
    business: businessId ? { id: businessId, name: businessName } : null,
  }));
}

router.get('/keys', async (_req, res) => {
  res.json({ keys: await listKeys() });
});

router.post(
  '/keys',
  validate({
    body: z.object({
      count: z.coerce.number().int().min(1, 'Mínimo 1').max(10, 'Máximo 10').default(1),
    }),
  }),
  async (req, res) => {
    const created = [];
    // Los códigos son aleatorios; si uno se repite se genera otro.
    for (let tries = 0; created.length < req.valid.body.count && tries < 50; tries++) {
      const [k] = await db
        .insert(registrationKeys)
        .values({ code: registrationCode(), createdBy: req.user.id })
        .onConflictDoNothing()
        .returning();
      if (k)
        created.push({
          id: k.id,
          code: k.code,
          createdAt: k.createdAt,
          usedAt: null,
          business: null,
        });
    }
    res.status(201).json({ created, keys: await listKeys() });
  },
);

router.delete('/keys/:id', validate({ params: v.idParam }), async (req, res) => {
  const [k] = await db
    .select()
    .from(registrationKeys)
    .where(eq(registrationKeys.id, req.valid.params.id));
  if (!k) throw notFound('No encontramos esa clave');
  if (k.usedAt) throw conflict('key_used', 'Esa clave ya se usó y no se puede borrar');
  await db
    .delete(registrationKeys)
    .where(and(eq(registrationKeys.id, k.id), isNull(registrationKeys.usedAt)));
  res.json({ keys: await listKeys() });
});

// ---------- negocios ----------
const businessRow = {
  b: businesses,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  ownerEmail: users.email,
  ownerFirstName: users.firstName,
  ownerLastName: users.lastName,
  ownerPhone: users.phone,
  keyCode: registrationKeys.code,
};

const baseQuery = () =>
  db
    .select(businessRow)
    .from(businesses)
    .innerJoin(categories, eq(categories.id, businesses.categoryId))
    .innerJoin(users, eq(users.id, businesses.userId))
    .leftJoin(registrationKeys, eq(registrationKeys.id, businesses.registrationKeyId));

const summaryOf = (r) => ({
  id: r.b.id,
  name: r.b.name,
  status: r.b.status,
  category: { name: r.categoryName, icon: r.categoryIcon },
  email: r.ownerEmail,
  phone: r.b.phone ?? r.ownerPhone,
  address: r.b.address,
  keyCode: r.keyCode,
  createdAt: r.b.createdAt,
  approvedAt: r.b.approvedAt,
  suspendedAt: r.b.suspendedAt,
});

router.get(
  '/businesses',
  validate({
    query: z.object({
      status: z.enum(['pending', 'approved', 'rejected', 'suspended']).optional(),
      q: z.string().trim().max(80).optional(),
    }),
  }),
  async (req, res) => {
    const { status, q } = req.valid.query;
    const conds = [];
    if (status) conds.push(eq(businesses.status, status));
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conds.push(or(ilike(businesses.name, like), ilike(users.email, like)));
    }
    const rows = await baseQuery()
      .where(conds.length ? and(...conds) : undefined)
      // Pendientes: el más antiguo primero (es el que lleva más tiempo esperando).
      .orderBy(status === 'pending' ? asc(businesses.createdAt) : desc(businesses.createdAt));
    res.json({ businesses: rows.map(summaryOf) });
  },
);

async function loadBusiness(id) {
  const [r] = await baseQuery().where(eq(businesses.id, id));
  if (!r) throw notFound('No encontramos ese negocio');
  return r;
}

async function detailOf(id) {
  const r = await loadBusiness(id);
  const [counts] = (
    await db.execute(sql`
      select
        (select count(*) from ${bookings} where business_id = ${id})::int as "bookings",
        (select count(*) from ${bookings}
          where business_id = ${id} and status in ('confirmed', 'completed'))::int as "confirmedBookings",
        (select count(*) from ${services} where business_id = ${id} and active)::int as "services",
        (select count(*) from ${resources} where business_id = ${id} and active)::int as "resources"
    `)
  ).rows;
  const setup = await setupChecklist(id);
  return {
    ...summaryOf(r),
    description: r.b.description,
    owner: {
      firstName: r.ownerFirstName,
      lastName: r.ownerLastName,
      email: r.ownerEmail,
      phone: r.ownerPhone,
    },
    rejectionReason: r.b.rejectionReason,
    suspensionReason: r.b.suspensionReason,
    ratingAvg: r.b.ratingAvg,
    ratingCount: r.b.ratingCount,
    counts,
    setup,
  };
}

router.get('/businesses/:id', validate({ params: v.idParam }), async (req, res) => {
  res.json({ business: await detailOf(req.valid.params.id) });
});

/** Cambia el estado solo si el negocio está en uno de los estados permitidos. */
async function transition(id, from, changes) {
  const r = await loadBusiness(id);
  if (!from.includes(r.b.status)) {
    throw conflict(
      'invalid_status',
      `No se puede hacer eso con un negocio ${STATUS_LABEL[r.b.status].toLowerCase()}`,
    );
  }
  await db.update(businesses).set(changes).where(eq(businesses.id, id));
  return r;
}

const notify = (r, template, subject, paragraphs, cta) =>
  sendEmail({
    to: r.ownerEmail,
    toUserId: r.b.userId,
    template,
    subject,
    html: emailLayout({ title: subject, paragraphs, cta }),
    text: [...paragraphs, cta ? `${cta.label}: ${cta.url}` : ''].join('\n\n'),
  });

const reasonBody = z.object({
  reason: z.string().trim().min(5, 'Escribe el motivo (mínimo 5 caracteres)').max(1000),
});
/** Correo de soporte (el mismo que muestra la web en /negocio/estado). */
export const SUPPORT_EMAIL = 'soporte@reserya.test';
const contactUs = `Si tienes dudas, escríbenos a ${SUPPORT_EMAIL} y con gusto te ayudamos.`;

router.post('/businesses/:id/approve', validate({ params: v.idParam }), async (req, res) => {
  const id = req.valid.params.id;
  const r = await transition(id, ['pending', 'rejected'], {
    status: 'approved',
    approvedAt: nowDate(),
    rejectionReason: null,
  });
  await notify(
    r,
    'business_approved',
    `¡${r.b.name} ya está aprobado!`,
    [
      `Hola, ${r.ownerFirstName}. Aprobamos tu negocio en ReserYa.`,
      'Entra para crear tu PIN de dueño y completar la configuración: servicios, equipo, horarios y reglas. Tu negocio aparecerá en las búsquedas cuando termines.',
    ],
    { label: 'Entrar a ReserYa', url: `${env.WEB_URL}/entrar?next=/negocio/configuracion` },
  );
  res.json({ business: await detailOf(id) });
});

router.post(
  '/businesses/:id/reject',
  validate({ params: v.idParam, body: reasonBody }),
  async (req, res) => {
    const id = req.valid.params.id;
    const { reason } = req.valid.body;
    const r = await transition(id, ['pending'], { status: 'rejected', rejectionReason: reason });
    await notify(r, 'business_rejected', `No pudimos aprobar ${r.b.name}`, [
      `Hola, ${r.ownerFirstName}. Revisamos el registro de tu negocio y por ahora no lo podemos aprobar.`,
      `Motivo: ${reason}`,
      contactUs,
    ]);
    res.json({ business: await detailOf(id) });
  },
);

router.post(
  '/businesses/:id/suspend',
  validate({ params: v.idParam, body: reasonBody }),
  async (req, res) => {
    const id = req.valid.params.id;
    const { reason } = req.valid.body;
    // Las sesiones abiertas no se cierran: requireActiveBusiness ya bloquea al suspendido.
    // Las reservas existentes se quedan como están.
    const r = await transition(id, ['approved'], {
      status: 'suspended',
      suspensionReason: reason,
      suspendedAt: nowDate(),
    });
    await notify(r, 'business_suspended', `${r.b.name} fue suspendido`, [
      `Hola, ${r.ownerFirstName}. Suspendimos tu negocio en ReserYa: ya no aparece en las búsquedas ni recibe solicitudes nuevas.`,
      `Motivo: ${reason}`,
      contactUs,
    ]);
    res.json({ business: await detailOf(id) });
  },
);

router.post('/businesses/:id/reactivate', validate({ params: v.idParam }), async (req, res) => {
  const id = req.valid.params.id;
  const r = await transition(id, ['suspended'], {
    status: 'approved',
    suspensionReason: null,
    suspendedAt: null,
  });
  await notify(
    r,
    'business_reactivated',
    `${r.b.name} está activo de nuevo`,
    [
      `Hola, ${r.ownerFirstName}. Reactivamos tu negocio en ReserYa.`,
      'Ya puedes recibir solicitudes otra vez.',
    ],
    { label: 'Entrar a ReserYa', url: `${env.WEB_URL}/entrar` },
  );
  res.json({ business: await detailOf(id) });
});

router.post(
  '/businesses/:id/contact',
  validate({
    params: v.idParam,
    body: z.object({
      subject: z.string().trim().min(3, 'Escribe el asunto').max(120),
      message: z.string().trim().min(5, 'Escribe el mensaje').max(5000),
    }),
  }),
  async (req, res) => {
    const r = await loadBusiness(req.valid.params.id);
    const { subject, message } = req.valid.body;
    const paragraphs = message
      .split(/\n{2,}|\r\n\r\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    await sendEmail({
      to: r.ownerEmail,
      toUserId: r.b.userId,
      template: 'admin_contact',
      subject,
      html: emailLayout({
        title: subject,
        paragraphs,
        footer: `Mensaje del equipo de ReserYa para ${r.b.name}.`,
      }),
      text: message,
    });
    res.json({ ok: true });
  },
);
