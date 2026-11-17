// Tareas periódicas de la operación del negocio. Cada `run` es idempotente: correrla dos veces
// seguidas no repite cambios ni correos.
import { expireRequests, completePastBookings, sendReminders } from './actions.js';

/** @type {{ name: string, everyMs: number, run: () => Promise<number> }[]} */
export const jobs = [
  { name: 'vencer-solicitudes', everyMs: 60_000, run: expireRequests },
  { name: 'completar-citas', everyMs: 5 * 60_000, run: completePastBookings },
  { name: 'recordatorios', everyMs: 5 * 60_000, run: sendReminders },
];
