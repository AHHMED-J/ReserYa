import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// RNF-07: contraseñas y PIN con hash.
export const hashSecret = (plain) => bcrypt.hash(plain, 10);
export const verifySecret = (plain, hash) => (hash ? bcrypt.compare(plain, hash) : false);

// RNF-11: tokens de Google cifrados con AES-256-GCM.
function key() {
  if (!env.ENCRYPTION_KEY) throw new Error('Falta ENCRYPTION_KEY en el .env');
  const k = Buffer.from(env.ENCRYPTION_KEY, 'base64');
  if (k.length !== 32) throw new Error('ENCRYPTION_KEY debe ser de 32 bytes en base64');
  return k;
}

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload) {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Clave de registro legible: ABCD-1234 sin letras confusas. */
export function registrationCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set, n) =>
    Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('');
  return `${pick(letters + digits, 4)}-${pick(letters + digits, 4)}`;
}
