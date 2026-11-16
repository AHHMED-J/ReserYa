// Fotos de negocios (D2): la base solo guarda storage_key. En desarrollo los archivos viven en
// UPLOADS_DIR y se sirven en /uploads. Para la nube se cambia esta función y nada más.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const uploadsDir = path.resolve(env.UPLOADS_DIR);

export async function saveUpload(buffer, originalName) {
  const ext = (path.extname(originalName || '').toLowerCase() || '.jpg').replace(/[^.a-z0-9]/g, '');
  const key = `${crypto.randomUUID()}${ext}`;
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, key), buffer);
  return key;
}

export async function deleteUpload(key) {
  await fs.rm(path.join(uploadsDir, path.basename(key)), { force: true });
}

/** URL pública de una foto. Relativa: la web la pide por el mismo dominio (proxy de Vite). */
export const photoUrl = (key) => (key ? `/uploads/${encodeURIComponent(key)}` : null);
