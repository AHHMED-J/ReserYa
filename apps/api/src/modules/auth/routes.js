// Cuentas y acceso: RF-01, RF-02, RF-03, RF-05, RF-06, RF-66, RF-67, RNF-12.
import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../../db/index.js';
import { users, sessions, businesses } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { badRequest, conflict, HttpError } from '../../lib/errors.js';
import { hashSecret, verifySecret, randomToken } from '../../lib/crypto.js';
import { createSession, destroySession, publicUser } from '../../lib/session.js';
import { createAuthToken, consumeAuthToken } from '../../lib/tokens.js';
import { sendEmail, emailLayout } from '../../lib/email.js';
import * as v from '../../lib/validators.js';

export const router = Router();
export const meRouter = Router();

// RNF-12: límite de intentos al iniciar sesión.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'too_many_attempts', message: 'Demasiados intentos. Espera unos minutos.' },
});

export async function sendVerificationEmail(user) {
  const token = await createAuthToken(user.id, 'verify_email');
  const url = `${env.WEB_URL}/verificar-correo?token=${token}`;
  await sendEmail({
    to: user.email,
    toUserId: user.id,
    template: 'verify_email',
    subject: 'Confirma tu correo en ReserYa',
    html: emailLayout({
      title: `Hola, ${user.firstName}`,
      paragraphs: [
        'Confirma tu correo para poder reservar en ReserYa. El enlace vence en 48 horas.',
      ],
      cta: { label: 'Confirmar mi correo', url },
    }),
    text: `Confirma tu correo: ${url}`,
  });
}

// ---------- sesión ----------
router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user, req.business, req.session) });
});

const registerBody = z.object({
  firstName: v.name,
  lastName: v.name,
  email: v.email,
  phone: v.phone,
  password: v.password,
  acceptTerms: z.literal(true, { error: 'Debes aceptar los términos y el aviso de privacidad' }),
});

router.post('/register', loginLimiter, validate({ body: registerBody }), async (req, res) => {
  const { firstName, lastName, email, phone, password } = req.valid.body;
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) throw conflict('email_taken', 'Ya existe una cuenta con ese correo');
  const [user] = await db
    .insert(users)
    .values({
      role: 'client',
      firstName,
      lastName,
      email,
      phone,
      passwordHash: await hashSecret(password),
    })
    .returning();
  await sendVerificationEmail(user);
  await createSession(res, req, user.id);
  res.status(201).json({ user: publicUser(user) });
});

const loginBody = z.object({ email: v.email, password: z.string().min(1).max(100) });

router.post('/login', loginLimiter, validate({ body: loginBody }), async (req, res) => {
  const { email, password } = req.valid.body;
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = user && user.active && (await verifySecret(password, user.passwordHash));
  if (!ok) {
    if (user && !user.passwordHash)
      throw new HttpError(401, 'use_google', 'Esta cuenta entra con Google');
    throw new HttpError(401, 'invalid_credentials', 'Correo o contraseña incorrectos');
  }
  await createSession(res, req, user.id);
  const [business] =
    user.role === 'business'
      ? await db.select().from(businesses).where(eq(businesses.userId, user.id))
      : [];
  res.json({ user: publicUser(user, business) });
});

router.post('/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

// ---------- verificar correo (RF-02) ----------
router.post(
  '/verify-email',
  validate({ body: z.object({ token: z.string().min(10) }) }),
  async (req, res) => {
    const userId = await consumeAuthToken(req.valid.body.token, 'verify_email');
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
    res.json({ ok: true });
  },
);

router.post('/resend-verification', requireAuth, async (req, res) => {
  if (req.user.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });
  await sendVerificationEmail(req.user);
  res.json({ ok: true });
});

// ---------- recuperar contraseña (RF-03) ----------
router.post(
  '/forgot-password',
  loginLimiter,
  validate({ body: z.object({ email: v.email }) }),
  async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.email, req.valid.body.email));
    // Siempre responde igual para no revelar qué correos existen.
    if (user?.active && user.passwordHash) {
      const token = await createAuthToken(user.id, 'reset_password');
      const url = `${env.WEB_URL}/restablecer?token=${token}`;
      await sendEmail({
        to: user.email,
        toUserId: user.id,
        template: 'reset_password',
        subject: 'Crea una nueva contraseña',
        html: emailLayout({
          title: 'Restablecer contraseña',
          paragraphs: [
            'Recibimos una solicitud para cambiar tu contraseña. El enlace vence en 1 hora.',
            'Si no fuiste tú, ignora este correo.',
          ],
          cta: { label: 'Crear nueva contraseña', url },
        }),
        text: `Crea una nueva contraseña: ${url}`,
      });
    }
    res.json({ ok: true });
  },
);

router.post(
  '/reset-password',
  validate({ body: z.object({ token: z.string().min(10), password: v.password }) }),
  async (req, res) => {
    const userId = await consumeAuthToken(req.valid.body.token, 'reset_password');
    await db
      .update(users)
      .set({ passwordHash: await hashSecret(req.valid.body.password), emailVerifiedAt: new Date() })
      .where(eq(users.id, userId));
    // Cierra todas las sesiones abiertas con la contraseña anterior.
    await db.delete(sessions).where(eq(sessions.userId, userId));
    res.json({ ok: true });
  },
);

// ---------- Google (RF-01). Solo clientes: el negocio entra con correo (RF-06) ----------
const OAUTH_COOKIE = 'rsy_oauth';
const googleClient = () =>
  new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.API_URL}/api/auth/google/callback`,
  );
const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : '/');

router.get('/google', (req, res) => {
  if (!env.googleEnabled) throw badRequest('google_disabled', 'Google no está configurado');
  const state = randomToken(16);
  res.cookie(OAUTH_COOKIE, JSON.stringify({ state, next: safeNext(req.query.next) }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: 10 * 60 * 1000,
  });
  const url = googleClient().generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const fail = (code) => res.redirect(`${env.WEB_URL}/entrar?error=${code}`);
  let saved = {};
  try {
    saved = JSON.parse(req.cookies?.[OAUTH_COOKIE] ?? '{}');
  } catch {
    /* cookie dañada */
  }
  res.clearCookie(OAUTH_COOKIE);
  if (!env.googleEnabled || !req.query.code || req.query.state !== saved.state)
    return fail('google_failed');

  const client = googleClient();
  const { tokens } = await client.getToken(String(req.query.code));
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const p = ticket.getPayload();
  if (!p?.email || !p.email_verified) return fail('google_failed');
  const email = p.email.toLowerCase();

  let [user] = await db.select().from(users).where(eq(users.googleId, p.sub));
  if (!user) {
    [user] = await db.select().from(users).where(eq(users.email, email));
    if (user && user.role !== 'client') return fail('business_use_password');
    if (user) {
      [user] = await db
        .update(users)
        .set({ googleId: p.sub, emailVerifiedAt: user.emailVerifiedAt ?? new Date() })
        .where(eq(users.id, user.id))
        .returning();
    } else {
      [user] = await db
        .insert(users)
        .values({
          role: 'client',
          email,
          googleId: p.sub,
          emailVerifiedAt: new Date(),
          firstName: p.given_name ?? email.split('@')[0],
          lastName: p.family_name ?? '',
        })
        .returning();
    }
  }
  if (!user.active) return fail('account_disabled');
  await createSession(res, req, user.id);
  // Sin teléfono va a "Completa tu perfil" (RF-01).
  res.redirect(`${env.WEB_URL}${user.phone ? saved.next || '/' : '/completar-perfil'}`);
});

// ---------- mi cuenta (RF-66, RF-67) ----------
meRouter.use(requireAuth);

meRouter.patch(
  '/',
  validate({
    body: z
      .object({ firstName: v.name, lastName: v.name, phone: v.phone })
      .partial()
      .refine((o) => Object.keys(o).length > 0, 'Nada que actualizar'),
  }),
  async (req, res) => {
    const [user] = await db
      .update(users)
      .set(req.valid.body)
      .where(eq(users.id, req.user.id))
      .returning();
    res.json({ user: publicUser(user, req.business, req.session) });
  },
);

meRouter.post(
  '/password',
  validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: v.password }) }),
  async (req, res) => {
    if (!req.user.passwordHash)
      throw badRequest('no_password', 'Tu cuenta entra con Google y no tiene contraseña');
    if (!(await verifySecret(req.valid.body.currentPassword, req.user.passwordHash)))
      throw badRequest('wrong_password', 'La contraseña actual no es correcta');
    await db
      .update(users)
      .set({ passwordHash: await hashSecret(req.valid.body.newPassword) })
      .where(eq(users.id, req.user.id));
    res.json({ ok: true });
  },
);
