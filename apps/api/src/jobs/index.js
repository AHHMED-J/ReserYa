// Tareas periódicas (vencimientos, citas completadas, recordatorios, Google Calendar).
// Cada módulo exporta un arreglo `jobs` en su archivo jobs.js: { name, everyMs, run }.
import { env } from '../config/env.js';
import { jobs as opsJobs } from '../modules/business-ops/jobs.js';
import { jobs as bookingJobs } from '../modules/bookings/jobs.js';
import { jobs as calendarJobs } from '../modules/calendar/jobs.js';

export const allJobs = [...bookingJobs, ...opsJobs, ...calendarJobs];

export function startJobs() {
  if (!env.JOBS_ENABLED || env.isTest) return;
  for (const job of allJobs) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await job.run();
      } catch (e) {
        console.error(`Tarea ${job.name} falló:`, e);
      } finally {
        running = false;
      }
    };
    setInterval(tick, job.everyMs).unref();
    setTimeout(tick, 2_000).unref();
  }
  console.log(`Tareas activas: ${allJobs.map((j) => j.name).join(', ') || 'ninguna'}`);
}
