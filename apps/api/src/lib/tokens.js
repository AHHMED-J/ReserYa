// Tokens de un solo uso que viajan por correo: verificar correo, restablecer contraseña o PIN.
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { authTokens } from '../db/schema.js';
import { randomToken, sha256 } from './crypto.js';
import { badRequest } from './errors.js';

const TTL_MINUTES = { verify_email: 60 * 48, reset_password: 60, reset_pin: 60 };

/** Crea un token y devuelve el valor en claro (para el enlace). Invalida los anteriores del mismo tipo. */
export async function createAuthToken(userId, type) {
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.usedAt)));
  const token = randomToken();
  await db.insert(authTokens).values({
    userId,
    type,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + TTL_MINUTES[type] * 60 * 1000),
  });
  return token;
}

/** Marca el token como usado y devuelve el userId. Lanza 400 si no sirve. */
export async function consumeAuthToken(token, type) {
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, sha256(token)),
        eq(authTokens.type, type),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: authTokens.userId });
  if (!row) throw badRequest('invalid_token', 'El enlace ya no es válido. Pide uno nuevo.');
  return row.userId;
}
