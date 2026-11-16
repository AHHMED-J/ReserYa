// Tareas periódicas de Google Calendar.
// - calendar-queue: manda a Google lo que cambió en ReserYa (RF-41, RNF-17).
// - calendar-pull: lee de Google lo que cambió el negocio cada 45 s (RF-42, RF-43, RNF-06).
import { processQueue, pullChanges } from './sync.js';

export { processQueue, pullChanges };

/** @type {{ name: string, everyMs: number, run: () => Promise<void> }[]} */
export const jobs = [
  { name: 'calendar-queue', everyMs: 10_000, run: () => processQueue() },
  { name: 'calendar-pull', everyMs: 45_000, run: () => pullChanges() },
];
