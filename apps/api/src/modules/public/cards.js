// Tarjetas de negocio (inicio y resultados) y búsqueda con filtros (RF-21, RF-22, RF-64, RF-65).
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { businesses, categories, businessPhotos, services } from '../../db/schema.js';
import { businessIsListed } from '../../lib/businessReady.js';
import { photoUrl } from '../../lib/storage.js';
import { now } from '../../lib/time.js';
import { loadContexts, nextFreeSlot, NEXT_SLOT_DAYS } from './availability.js';

/** Minúsculas y sin acentos, igual en SQL y en JS, para buscar "fisioterapia" o "fisio". */
const ACCENTS = 'áéíóúüñ';
const PLAIN = 'aeiouun';
export const normSql = (expr) => sql`translate(lower(${expr}), ${ACCENTS}, ${PLAIN})`;
export const normJs = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => PLAIN[ACCENTS.indexOf(c)]);
const likePattern = (s) => `%${normJs(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const firstPhoto = sql`(select ${businessPhotos.storageKey} from ${businessPhotos}
  where ${businessPhotos.businessId} = ${businesses.id}
  order by ${businessPhotos.sortOrder}, ${businessPhotos.createdAt} limit 1)`;

/** Condición sobre servicios "sv" (activos y, si hay filtros, que coincidan). */
function serviceCondition({ service, minPrice, maxPrice } = {}) {
  const parts = [sql`sv.active`];
  if (service) parts.push(sql`${normSql(sql`sv.name`)} like ${likePattern(service)}`);
  if (minPrice != null) parts.push(sql`sv.price_cents >= ${minPrice}`);
  if (maxPrice != null) parts.push(sql`sv.price_cents <= ${maxPrice}`);
  return sql.join(parts, sql` and `);
}

const priceFrom = (svcCond) =>
  sql`(select min(sv.price_cents) from ${services} sv
    where sv.business_id = ${businesses.id} and ${svcCond})`.mapWith(Number);

const cardColumns = (svcCond) => ({
  id: businesses.id,
  name: businesses.name,
  address: businesses.address,
  ratingAvg: businesses.ratingAvg,
  ratingCount: businesses.ratingCount,
  categoryId: categories.id,
  categoryName: categories.name,
  categorySlug: categories.slug,
  categoryIcon: categories.icon,
  photoKey: firstPhoto,
  priceFromCents: priceFrom(svcCond),
});

export function toCard(row, next) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    category: {
      id: row.categoryId,
      name: row.categoryName,
      slug: row.categorySlug,
      icon: row.categoryIcon,
    },
    photoUrl: photoUrl(row.photoKey),
    ratingAvg: Number(row.ratingAvg),
    ratingCount: row.ratingCount,
    priceFromCents: row.priceFromCents ?? null,
    nextSlot: next ? next.toUTC().toISO() : next === null ? null : undefined,
  };
}

/** Siguiente horario libre de varios negocios a la vez (pocas consultas). */
export async function nextSlotsFor(ids, options = {}) {
  const map = new Map();
  if (!ids.length) return map;
  const today = now().startOf('day');
  const from = options.onlyDate ?? today.toISODate();
  const to = options.onlyDate ?? today.plus({ days: NEXT_SLOT_DAYS - 1 }).toISODate();
  const ctxs = await loadContexts(ids, from, to);
  for (const id of ids) {
    const ctx = ctxs.get(id);
    if (!ctx) {
      map.set(id, null);
      continue;
    }
    let serviceIds = null;
    if (options.matchService) {
      serviceIds = new Set(
        [...ctx.services.values()].filter((sv) => options.matchService(sv)).map((sv) => sv.id),
      );
    }
    map.set(
      id,
      nextFreeSlot(ctx, { serviceIds, onlyDate: options.onlyDate, minTime: options.minTime }),
    );
  }
  return map;
}

/** Tarjetas de negocios visibles por id, en el mismo orden. withNext agrega el siguiente horario. */
export async function cardsByIds(ids, { withNext = false } = {}) {
  if (!ids.length) return [];
  const rows = await db
    .select(cardColumns(serviceCondition()))
    .from(businesses)
    .innerJoin(categories, eq(categories.id, businesses.categoryId))
    .where(and(inArray(businesses.id, ids), businessIsListed()));
  const next = withNext ? await nextSlotsFor(rows.map((r) => r.id)) : null;
  const byId = new Map(rows.map((r) => [r.id, toCard(r, next ? next.get(r.id) : undefined)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/** Mejor calificados (RF-59, RF-62). */
export async function topRated(limit = 7) {
  const rows = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(businessIsListed())
    .orderBy(desc(businesses.ratingAvg), desc(businesses.ratingCount), asc(businesses.name))
    .limit(limit);
  return cardsByIds(
    rows.map((r) => r.id),
    { withNext: true },
  );
}

/**
 * Búsqueda (RF-21, RF-22, RF-64). Filtros:
 * q, categories (slugs), service (texto), date ('YYYY-MM-DD'), time ('HH:mm', "a partir de"),
 * minRating, minPrice/maxPrice (centavos), availableToday, sort (rating|price|next), page, pageSize.
 */
export async function searchBusinesses(f) {
  const svcCond = serviceCondition(f);
  const where = [businessIsListed()];
  if (f.categories?.length) where.push(inArray(categories.slug, f.categories));
  if (f.q) {
    const pat = likePattern(f.q);
    where.push(sql`(
      ${normSql(businesses.name)} like ${pat}
      or ${normSql(sql`coalesce(${businesses.description}, '')`)} like ${pat}
      or ${normSql(categories.name)} like ${pat}
      or exists (select 1 from ${services} sv where sv.business_id = ${businesses.id}
        and sv.active and ${normSql(sql`sv.name`)} like ${pat})
    )`);
  }
  if (f.service || f.minPrice != null || f.maxPrice != null) {
    where.push(
      sql`exists (select 1 from ${services} sv where sv.business_id = ${businesses.id} and ${svcCond})`,
    );
  }
  if (f.minRating) where.push(sql`${businesses.ratingAvg} >= ${f.minRating}`);

  const page = f.page ?? 1;
  const pageSize = f.pageSize ?? 10;
  const sort = f.sort ?? 'rating';
  const base = db
    .select(cardColumns(svcCond))
    .from(businesses)
    .innerJoin(categories, eq(categories.id, businesses.categoryId))
    .where(and(...where));
  const order =
    sort === 'price'
      ? [
          sql`${priceFrom(svcCond)} asc nulls last`,
          desc(businesses.ratingAvg),
          asc(businesses.name),
        ]
      : [desc(businesses.ratingAvg), desc(businesses.ratingCount), asc(businesses.name)];

  const onlyDate = f.availableToday
    ? now().toISODate()
    : (f.date ?? (f.time ? now().toISODate() : null));
  const matchService =
    f.service || f.minPrice != null || f.maxPrice != null
      ? (sv) =>
          (!f.service || normJs(sv.name).includes(normJs(f.service))) &&
          (f.minPrice == null || sv.priceCents >= f.minPrice) &&
          (f.maxPrice == null || sv.priceCents <= f.maxPrice)
      : null;
  const needsAvailability = Boolean(onlyDate) || sort === 'next';

  if (!needsAvailability) {
    const [{ total }] = await db
      .select({ total: sql`count(*)`.mapWith(Number) })
      .from(businesses)
      .innerJoin(categories, eq(categories.id, businesses.categoryId))
      .where(and(...where));
    const rows = await base
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const next = await nextSlotsFor(
      rows.map((r) => r.id),
      { matchService },
    );
    return {
      items: rows.map((r) => toCard(r, next.get(r.id))),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  // Filtros que dependen de los horarios: se calculan para todos los candidatos (RNF-05: con
  // pocas consultas y un cálculo en memoria; el número de negocios de una ciudad es chico).
  const rows = await base.orderBy(...order);
  const next = await nextSlotsFor(
    rows.map((r) => r.id),
    { matchService, onlyDate, minTime: f.time },
  );
  let list = rows.filter((r) => !onlyDate || next.get(r.id));
  if (sort === 'next') {
    list = list
      .map((r, i) => ({ r, i, t: next.get(r.id)?.toMillis() ?? Infinity }))
      .sort((a, b) => a.t - b.t || a.i - b.i)
      .map((x) => x.r);
  }
  const total = list.length;
  const pageRows = list.slice((page - 1) * pageSize, page * pageSize);
  return {
    items: pageRows.map((r) => toCard(r, next.get(r.id))),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}
