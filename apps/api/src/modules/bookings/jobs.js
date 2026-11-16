// Tareas del área de reservas del cliente.
import { expireAbandonedDrafts } from './service.js';

/** @type {{ name: string, everyMs: number, run: () => Promise<void> }[]} */
export const jobs = [
  {
    // Borradores sin pagar (30 min) y apartados de 10 min que no se pagaron (RF-32).
    name: 'vencer-borradores',
    everyMs: 60_000,
    run: expireAbandonedDrafts,
  },
];
