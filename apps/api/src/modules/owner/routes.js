// Modo dueño: PIN de 4 a 6 dígitos (RF-07, RF-08, RF-74). Montado en /api/business/owner.
import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { businesses, sessions } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { requireActiveBusiness, requireOwnerMode } from '../../middleware/auth.js';
import { badRequest, forbidden } from '../../lib/errors.js';
import { hashSecret, verifySecret } from '../../lib/crypto.js';
import { OWNER_MODE_MINUTES } from '../../lib/session.js';
import { createAuthToken, consumeAuthToken } from '../../lib/tokens.js';
import { sendEmail, emailLayout } from '../../lib/email.js';
import * as v from '../../lib/validators.js';

export const router = Router();

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// El restablecimiento por correo no exige sesión activa en "modo dueño", pero sí ser el negocio.
router.post(
  '/reset-pin',
  validate({ body: z.object({ token: z.string().min(10), pin: v.pin }) }),
  async (req, res) => {
    const userId = await consumeAuthToken(req.valid.body.token, 'reset_pin');
    await db
      .update(businesses)
      .set({
        ownerPinHash: await hashSecret(req.valid.body.pin),
        pinChangedAt: new Date(),
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      })
      .where(eq(businesses.userId, userId));
    res.json({ ok: true });
  },
);

router.use(requireActiveBusiness);

/** Desbloquea el modo dueño por 5 minutos. Tras 5 intentos fallidos se bloquea 15 min (RF-08). */
router.post('/unlock', validate({ body: z.object({ pin: v.pin }) }), async (req, res) => {
  const b = req.business;
  if (!b.ownerPinHash) throw badRequest('no_pin', 'Primero crea tu PIN de dueño');
  if (b.pinLockedUntil && b.pinLockedUntil > new Date()) {
    throw forbidden('pin_locked', 'Demasiados intentos. Restablece el PIN por correo o espera.');
  }
  if (!(await verifySecret(req.valid.body.pin, b.ownerPinHash))) {
    const attempts = b.pinFailedAttempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    await db
      .update(businesses)
      .set({
        pinFailedAttempts: locked ? 0 : attempts,
        pinLockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
      })
      .where(eq(businesses.id, b.id));
    if (locked)
      throw forbidden('pin_locked', 'Demasiados intentos. Restablece el PIN por correo o espera.');
    throw badRequest('wrong_pin', 'PIN incorrecto', { attemptsLeft: MAX_ATTEMPTS - attempts });
  }
  const until = new Date(Date.now() + OWNER_MODE_MINUTES * 60 * 1000);
  await db
    .update(businesses)
    .set({ pinFailedAttempts: 0, pinLockedUntil: null })
    .where(eq(businesses.id, b.id));
  await db
    .update(sessions)
    .set({ ownerUnlockedUntil: until })
    .where(eq(sessions.id, req.session.id));
  res.json({ ownerModeUntil: until });
});

router.post('/lock', async (req, res) => {
  await db
    .update(sessions)
    .set({ ownerUnlockedUntil: null })
    .where(eq(sessions.id, req.session.id));
  res.json({ ok: true });
});

/** Crea el PIN por primera vez (cuando todavía no tiene). */
router.post('/pin', validate({ body: z.object({ pin: v.pin }) }), async (req, res) => {
  if (req.business.ownerPinHash)
    throw badRequest('pin_exists', 'Ya tienes un PIN. Cámbialo desde el modo dueño.');
  await db
    .update(businesses)
    .set({ ownerPinHash: await hashSecret(req.valid.body.pin), pinChangedAt: new Date() })
    .where(eq(businesses.id, req.business.id));
  res.json({ ok: true });
});

/** Envía el enlace para restablecer el PIN al correo del negocio (RF-08). */
router.post('/forgot-pin', async (req, res) => {
  const token = await createAuthToken(req.user.id, 'reset_pin');
  const url = `${env.WEB_URL}/negocio/restablecer-pin?token=${token}`;
  await sendEmail({
    to: req.user.email,
    toUserId: req.user.id,
    template: 'reset_pin',
    subject: 'Restablece el PIN del dueño',
    html: emailLayout({
      title: 'Restablecer PIN',
      paragraphs: [
        `Pediste restablecer el PIN del dueño de ${req.business.name}. El enlace vence en 1 hora.`,
      ],
      cta: { label: 'Crear nuevo PIN', url },
    }),
    text: `Crea un nuevo PIN: ${url}`,
  });
  res.json({ ok: true });
});

/** Cambiar el PIN desde el modo dueño (RF-74). */
router.post(
  '/change-pin',
  requireOwnerMode,
  validate({ body: z.object({ currentPin: v.pin, newPin: v.pin }) }),
  async (req, res) => {
    if (!(await verifySecret(req.valid.body.currentPin, req.business.ownerPinHash)))
      throw badRequest('wrong_pin', 'El PIN actual no es correcto');
    await db
      .update(businesses)
      .set({ ownerPinHash: await hashSecret(req.valid.body.newPin), pinChangedAt: new Date() })
      .where(eq(businesses.id, req.business.id));
    res.json({ ok: true });
  },
);
