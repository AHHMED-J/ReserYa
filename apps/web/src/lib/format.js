// Formatos en español de México, zona America/Tijuana (RNF-02), sin importar la zona del navegador.
import { DateTime, Settings } from 'luxon';

export const TZ = 'America/Tijuana';
Settings.defaultZone = TZ;
Settings.defaultLocale = 'es-MX';
export { DateTime };

export const dt = (value) =>
  value instanceof DateTime
    ? value.setZone(TZ)
    : typeof value === 'string'
      ? DateTime.fromISO(value, { zone: TZ })
      : DateTime.fromJSDate(new Date(value), { zone: TZ });

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const noDot = (s) => s.replace(/\./g, '');

/** $200 o $200.50 */
export const money = (cents) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
/** $200 MXN */
export const moneyMXN = (cents) => `${money(cents)} MXN`;

/** 16:00 */
export const time = (v) => dt(v).toFormat('HH:mm');
/** Mié 18 nov */
export const dayShort = (v) => cap(noDot(dt(v).toFormat('ccc d LLL')));
/** Mié 18 nov · 16:00 */
export const dateTimeShort = (v) => `${dayShort(v)} · ${time(v)}`;
/** Miércoles 18 de noviembre */
export const dayLong = (v) => cap(dt(v).toFormat("cccc d 'de' LLLL"));
/** NOV y 18 para la cajita de fecha */
export const monthAbbr = (v) => noDot(dt(v).toFormat('LLL')).toUpperCase();
export const dayNum = (v) => dt(v).toFormat('d');
/** Mié */
export const weekdayShort = (v) => cap(noDot(dt(v).toFormat('ccc')));
/** Hoy · 16:00 / Mañana · 16:00 / Mié 18 nov · 16:00 */
export function relativeDay(v) {
  const d = dt(v).startOf('day');
  const today = DateTime.now().setZone(TZ).startOf('day');
  const diff = Math.round(d.diff(today, 'days').days);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return dayShort(v);
}
/** "en 4 h 02 min" a partir de ahora */
export function untilText(v) {
  const mins = Math.max(0, Math.round(dt(v).diffNow('minutes').minutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
/** "hace 2 h", "ayer", "hace 3 días" */
export function agoText(v) {
  const mins = Math.round(-dt(v).diffNow('minutes').minutes);
  if (mins < 1) return 'justo ahora';
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}
/** 40 min / 1 h / 1 h 30 min */
export function duration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
/** YYYY-MM-DD de hoy en Tijuana */
export const todayISO = () => DateTime.now().setZone(TZ).toISODate();
/** Teléfono 6461234567 → 646 123 4567 */
export const phone = (p) =>
  p && p.length === 10 ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : (p ?? '');
/** Nombre corto para agendas (RF-47): "Carlos M." */
export const shortName = (first, last) => `${first}${last ? ` ${last[0]}.` : ''}`;
