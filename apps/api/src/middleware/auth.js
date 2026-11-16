import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { loadSession, OWNER_MODE_MINUTES } from '../lib/session.js';

/** Carga la sesión en cada petición (si hay cookie). */
export async function sessionMiddleware(req, _res, next) {
  try {
    await loadSession(req);
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

/** RNF-08: cada ruta verifica el rol. Uso: requireRole('client') */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden('wrong_role'));
    next();
  };

/** Cliente con correo verificado (RF-02) y teléfono (RF-01). Para reservar. */
export function requireReadyClient(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'client') return next(forbidden('wrong_role'));
  if (!req.user.emailVerifiedAt)
    return next(forbidden('email_not_verified', 'Verifica tu correo para reservar'));
  if (!req.user.phone)
    return next(forbidden('profile_incomplete', 'Agrega tu teléfono para reservar'));
  next();
}

/** Negocio aprobado (RF-73). Deja req.business. */
export function requireActiveBusiness(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'business' || !req.business) return next(forbidden('wrong_role'));
  if (req.business.status !== 'approved')
    return next(forbidden('business_not_active', 'Tu negocio no está activo'));
  next();
}

/** Modo dueño desbloqueado con PIN (RF-07). Cada uso lo renueva 5 minutos más. */
export async function requireOwnerMode(req, res, next) {
  try {
    if (!req.session?.ownerUnlockedUntil || req.session.ownerUnlockedUntil <= new Date()) {
      return next(forbidden('owner_mode_locked', 'Ingresa el PIN del dueño'));
    }
    const until = new Date(Date.now() + OWNER_MODE_MINUTES * 60 * 1000);
    await db.update(sessions).set({ ownerUnlockedUntil: until }).where(eq(sessions.id, req.session.id));
    req.session.ownerUnlockedUntil = until;
    res.setHeader('X-Owner-Mode-Until', until.toISOString());
    next();
  } catch (e) {
    next(e);
  }
}
