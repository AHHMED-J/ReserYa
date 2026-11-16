// Cola de sincronización con Google Calendar (RF-41, RNF-17).
// Quien acepta, confirma o cancela una reserva solo encola; el módulo calendar procesa la cola
// y reintenta si Google falla. Si el negocio no tiene Google conectado, el trabajo se marca como hecho.
import { db } from '../db/index.js';
import { calendarSyncJobs } from '../db/schema.js';

/**
 * @param {string} bookingId
 * @param {'create'|'update'|'delete'} action
 * @param {object} [tx] transacción de drizzle, si se llama dentro de una
 */
export async function enqueueCalendarSync(bookingId, action, tx = db) {
  await tx.insert(calendarSyncJobs).values({ bookingId, action });
}
