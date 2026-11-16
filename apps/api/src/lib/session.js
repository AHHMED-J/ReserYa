// Sesiones con cookie httpOnly (RNF-08). En la base solo se guarda el hash del token.
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, users, businesses } from '../db/schema.js';
import { env } from '../config/env.js';
import { randomToken, sha256 } from './crypto.js';

export const SESSION_COOKIE = 'rsy_session';
export const OWNER_MODE_MINUTES = 5; // RF-07

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProd,
  path: '/',
  maxAge: env.SESSION_DAYS * 24 * 60 * 60 * 1000,
});

export async function createSession(res, req, userId) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + env.SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt,
    ip: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 300),
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export async function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
}

/** Lee la cookie y deja req.user, req.session y (si es negocio) req.business. */
export async function loadSession(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return;
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || !row.user.active) return;
  req.session = row.session;
  req.user = row.user;
  if (row.user.role === 'business') {
    const [b] = await db.select().from(businesses).where(eq(businesses.userId, row.user.id));
    req.business = b ?? null;
  }
}

/** Datos públicos del usuario que se mandan a la web. */
export function publicUser(user, business, session) {
  if (!user) return null;
  return {
    id: user.id,
    role: user.role,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    emailVerified: Boolean(user.emailVerifiedAt),
    hasPassword: Boolean(user.passwordHash),
    hasGoogle: Boolean(user.googleId),
    profileComplete: user.role !== 'client' || Boolean(user.phone),
    business: business
      ? {
          id: business.id,
          name: business.name,
          status: business.status,
          rejectionReason: business.rejectionReason,
          suspensionReason: business.suspensionReason,
          hasPin: Boolean(business.ownerPinHash),
          ownerMode: Boolean(
            session?.ownerUnlockedUntil && session.ownerUnlockedUntil > new Date(),
          ),
          ownerModeUntil: session?.ownerUnlockedUntil ?? null,
        }
      : null,
  };
}
