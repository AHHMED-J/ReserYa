// Fechas: en la base todo es UTC (timestamptz). Para el usuario todo es America/Tijuana (RNF-02).
import { DateTime, Settings } from 'luxon';
import { APP_TZ } from '../config/env.js';

Settings.defaultZone = APP_TZ;
Settings.defaultLocale = 'es-MX';

export { DateTime };

/** Ahora, en la zona de la app. Se puede fijar en pruebas con setNow(). */
let fixedNow = null;
export const now = () => (fixedNow ? fixedNow : DateTime.now().setZone(APP_TZ));
export const setNow = (dt) => {
  fixedNow = dt ? DateTime.fromJSDate(new Date(dt)).setZone(APP_TZ) : null;
};
export const nowDate = () => now().toJSDate();

/** 'YYYY-MM-DD' + 'HH:mm' en hora local del negocio → DateTime. */
export const localDateTime = (date, hhmm) =>
  DateTime.fromISO(`${date}T${hhmm}`, { zone: APP_TZ });

export const toLocal = (jsDate) => DateTime.fromJSDate(jsDate).setZone(APP_TZ);

/** "mié 18 nov · 16:00" */
export const formatShort = (jsDate) => toLocal(jsDate).toFormat("ccc d LLL '·' HH:mm");
/** "miércoles 18 de noviembre, 16:00" */
export const formatLong = (jsDate) => toLocal(jsDate).toFormat("cccc d 'de' LLLL', 'HH:mm");

export const formatMoney = (cents) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
