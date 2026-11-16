// Perfil público del negocio y sus fotos (RF-14).
import { z } from 'zod';
import multer from 'multer';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { businesses, businessPhotos, categories } from '../../db/schema.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { saveUpload, deleteUpload, photoUrl } from '../../lib/storage.js';
import * as v from '../../lib/validators.js';
import { readAccess, ownerAccess, subRouter } from './shared.js';

export const profileRouter = subRouter();
export const photosRouter = subRouter();

export const MAX_PHOTOS = 8;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

async function loadPhotos(businessId) {
  const rows = await db
    .select()
    .from(businessPhotos)
    .where(eq(businessPhotos.businessId, businessId))
    .orderBy(asc(businessPhotos.sortOrder), asc(businessPhotos.createdAt));
  return rows.map((p) => ({ id: p.id, url: photoUrl(p.storageKey), sortOrder: p.sortOrder }));
}

async function profileOf(businessId) {
  const [row] = await db
    .select({ b: businesses, c: categories })
    .from(businesses)
    .innerJoin(categories, eq(categories.id, businesses.categoryId))
    .where(eq(businesses.id, businessId));
  const { b, c } = row;
  return {
    id: b.id,
    name: b.name,
    categoryId: b.categoryId,
    category: { id: c.id, name: c.name, icon: c.icon },
    description: b.description,
    address: b.address,
    phone: b.phone,
    photos: await loadPhotos(businessId),
  };
}

// ---------- perfil ----------
profileRouter.get('/', readAccess, async (req, res) => {
  res.json({ profile: await profileOf(req.business.id) });
});

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s ? s : null));

const profileBody = z
  .object({
    name: z.string().trim().min(2, 'Escribe el nombre del negocio').max(80),
    categoryId: v.uuid,
    description: optionalText(1000),
    address: optionalText(200),
    phone: v.phone.nullable(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Nada que actualizar');

profileRouter.patch('/', ownerAccess, validate({ body: profileBody }), async (req, res) => {
  const body = req.valid.body;
  if (body.categoryId) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, body.categoryId));
    if (!cat)
      throw badRequest('invalid_category', 'Elige una categoría', {
        categoryId: ['Elige una categoría'],
      });
  }
  await db.update(businesses).set(body).where(eq(businesses.id, req.business.id));
  res.json({ profile: await profileOf(req.business.id) });
});

// ---------- fotos ----------
/** Detecta el tipo real por los primeros bytes (no confía en el nombre ni en el mimetype). */
function imageExt(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (
    buf.length > 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return '.png';
  if (
    buf.length > 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return '.webp';
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS },
}).array('photos', MAX_PHOTOS);

/** multer con errores en español. */
function receivePhotos(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE')
      return next(badRequest('photo_too_large', 'Cada foto puede pesar hasta 5 MB'));
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE')
      return next(badRequest('too_many_photos', `Puedes subir hasta ${MAX_PHOTOS} fotos`));
    next(badRequest('upload_failed', 'No se pudo recibir la foto'));
  });
}

photosRouter.post('/', ownerAccess, receivePhotos, async (req, res) => {
  const files = req.files ?? [];
  if (files.length === 0) throw badRequest('no_photos', 'Elige al menos una foto');
  const exts = files.map((f) => imageExt(f.buffer));
  if (exts.some((e) => !e))
    throw badRequest('invalid_photo', 'Solo se aceptan fotos JPG, PNG o WEBP');
  const current = await loadPhotos(req.business.id);
  if (current.length + files.length > MAX_PHOTOS)
    throw badRequest(
      'too_many_photos',
      `Puedes tener hasta ${MAX_PHOTOS} fotos. Te quedan ${MAX_PHOTOS - current.length}.`,
    );
  const start = current.reduce((m, p) => Math.max(m, p.sortOrder + 1), 0);
  const keys = [];
  for (const [i, f] of files.entries()) keys.push(await saveUpload(f.buffer, `foto${exts[i]}`));
  try {
    await db
      .insert(businessPhotos)
      .values(
        keys.map((storageKey, i) => ({
          businessId: req.business.id,
          storageKey,
          sortOrder: start + i,
        })),
      );
  } catch (e) {
    await Promise.all(keys.map(deleteUpload));
    throw e;
  }
  res.status(201).json({ photos: await loadPhotos(req.business.id) });
});

photosRouter.put(
  '/order',
  ownerAccess,
  validate({ body: z.object({ ids: z.array(v.uuid).max(MAX_PHOTOS) }) }),
  async (req, res) => {
    const { ids } = req.valid.body;
    const current = await loadPhotos(req.business.id);
    const same =
      ids.length === current.length &&
      new Set(ids).size === ids.length &&
      current.every((p) => ids.includes(p.id));
    if (!same)
      throw badRequest('invalid_order', 'Manda todas las fotos del negocio en el nuevo orden');
    await db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(businessPhotos).set({ sortOrder: i }).where(eq(businessPhotos.id, id));
      }
    });
    res.json({ photos: await loadPhotos(req.business.id) });
  },
);

photosRouter.delete('/:id', ownerAccess, validate({ params: v.idParam }), async (req, res) => {
  const [photo] = await db
    .delete(businessPhotos)
    .where(
      and(
        eq(businessPhotos.id, req.valid.params.id),
        eq(businessPhotos.businessId, req.business.id),
      ),
    )
    .returning();
  if (!photo) throw notFound('No encontramos esa foto');
  await deleteUpload(photo.storageKey);
  res.json({ photos: await loadPhotos(req.business.id) });
});
