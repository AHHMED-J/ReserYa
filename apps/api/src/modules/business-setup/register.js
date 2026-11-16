// Registro de un negocio con clave de un solo uso (RF-10). Público, con límite de intentos.
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';
import { db } from '../../db/index.js';
import { users, businesses, categories, registrationKeys } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, conflict } from '../../lib/errors.js';
import { hashSecret } from '../../lib/crypto.js';
import { createSession, publicUser } from '../../lib/session.js';
import { sendEmail, emailLayout } from '../../lib/email.js';
import { nowDate } from '../../lib/time.js';
import * as v from '../../lib/validators.js';
import { subRouter } from './shared.js';

export const router = subRouter();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'too_many_attempts', message: 'Demasiados intentos. Espera unos minutos.' },
});

/** "abcd 1234", "ABCD1234" o "abcd-1234" → "ABCD-1234". */
const code = z
  .string()
  .transform((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .refine((s) => s.length === 8, 'La clave tiene 8 caracteres, como ABCD-1234')
  .transform((s) => `${s.slice(0, 4)}-${s.slice(4)}`);

const accountFields = {
  code,
  firstName: v.name,
  lastName: v.name,
  email: v.email,
  phone: v.phone,
  password: v.password,
  acceptTerms: z.literal(true, { error: 'Debes aceptar los términos y el aviso de privacidad' }),
};

const registerBody = z.object({
  ...accountFields,
  businessName: z.string().trim().min(2, 'Escribe el nombre del negocio').max(80),
  categoryId: v.uuid,
  businessPhone: v.phone,
  address: z.string().trim().min(5, 'Escribe la dirección').max(200),
});

async function checkCode(c) {
  const [key] = await db.select().from(registrationKeys).where(eq(registrationKeys.code, c));
  if (!key)
    throw badRequest('invalid_code', 'Esa clave de registro no existe', {
      code: ['Esa clave no existe'],
    });
  if (key.usedAt)
    throw conflict('code_used', 'Esa clave ya se usó. Pide una nueva al administrador.');
  return key;
}

async function checkEmailFree(email) {
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) throw conflict('email_taken', 'Ya existe una cuenta con ese correo');
}

/** Paso 1 del formulario: revisa la clave y el correo antes de pedir los datos del negocio. */
router.post('/check', limiter, validate({ body: z.object(accountFields) }), async (req, res) => {
  await checkCode(req.valid.body.code);
  await checkEmailFree(req.valid.body.email);
  res.json({ ok: true });
});

router.post('/', limiter, validate({ body: registerBody }), async (req, res) => {
  const b = req.valid.body;
  await checkCode(b.code);
  await checkEmailFree(b.email);
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, b.categoryId));
  if (!cat)
    throw badRequest('invalid_category', 'Elige una categoría', {
      categoryId: ['Elige una categoría'],
    });

  const passwordHash = await hashSecret(b.password);
  const { user, business } = await db.transaction(async (tx) => {
    // Se marca la clave solo si sigue libre: si dos personas la usan a la vez, solo una gana.
    const [key] = await tx
      .update(registrationKeys)
      .set({ usedAt: nowDate() })
      .where(and(eq(registrationKeys.code, b.code), isNull(registrationKeys.usedAt)))
      .returning();
    if (!key) throw conflict('code_used', 'Esa clave ya se usó. Pide una nueva al administrador.');
    const [user] = await tx
      .insert(users)
      .values({
        role: 'business',
        firstName: b.firstName,
        lastName: b.lastName,
        email: b.email,
        phone: b.phone,
        passwordHash,
        // La clave de registro autoriza la cuenta: no hace falta verificar el correo.
        emailVerifiedAt: nowDate(),
      })
      .returning();
    const [business] = await tx
      .insert(businesses)
      .values({
        userId: user.id,
        categoryId: b.categoryId,
        name: b.businessName,
        phone: b.businessPhone,
        address: b.address,
        status: 'pending',
        registrationKeyId: key.id,
      })
      .returning();
    return { user, business };
  });

  await sendEmail({
    to: user.email,
    toUserId: user.id,
    template: 'business_registered',
    subject: `Recibimos el registro de ${business.name}`,
    html: emailLayout({
      title: `Hola, ${user.firstName}`,
      paragraphs: [
        `Recibimos el registro de ${business.name} en ReserYa.`,
        'Vamos a revisar tus datos y te avisaremos por correo cuando tu negocio esté aprobado.',
      ],
      cta: { label: 'Ver el estado de mi negocio', url: `${env.WEB_URL}/negocio/estado` },
    }),
    text: `Recibimos el registro de ${business.name}. Te avisaremos cuando esté aprobado.`,
  });
  await createSession(res, req, user.id);
  res.status(201).json({ user: publicUser(user, business) });
});
