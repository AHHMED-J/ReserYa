// Cuándo un negocio aparece en búsquedas y puede recibir reservas (RF-12, RF-71):
// aprobado, con reglas definidas, al menos un servicio activo y un recurso activo con horario
// que dé alguno de esos servicios.
import { sql, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  businesses,
  services,
  resources,
  resourceSchedules,
  resourceServices,
} from '../db/schema.js';

/** Condición SQL para usar en where(): solo negocios visibles para clientes. */
export const businessIsListed = (b = businesses) => sql`(
  ${b.status} = 'approved'
  and ${b.cancellationLimitHours} is not null
  and ${b.minNoticeMinutes} is not null
  and ${b.maxAdvanceDays} is not null
  and ${b.slotIntervalMinutes} is not null
  and ${b.bufferMinutes} is not null
  and exists (
    select 1 from ${resources} r
    join ${resourceServices} rs on rs.resource_id = r.id
    join ${services} sv on sv.id = rs.service_id and sv.active
    where r.business_id = ${b.id} and r.active
      and exists (select 1 from ${resourceSchedules} sc where sc.resource_id = r.id)
  )
)`;

/**
 * Lista de pasos de configuración para el negocio (RF-71).
 * @returns {Promise<{ steps: {key: string, label: string, done: boolean}[], ready: boolean }>}
 */
export async function setupChecklist(businessId) {
  const [b] = await db.select().from(businesses).where(eq(businesses.id, businessId));
  const [{ hasService, hasResource, hasScheduledResource }] = (
    await db.execute(sql`
      select
        exists (select 1 from ${services} where business_id = ${businessId} and active) as "hasService",
        exists (select 1 from ${resources} where business_id = ${businessId} and active) as "hasResource",
        exists (
          select 1 from ${resources} r
          join ${resourceServices} rs on rs.resource_id = r.id
          join ${services} sv on sv.id = rs.service_id and sv.active
          where r.business_id = ${businessId} and r.active
            and exists (select 1 from ${resourceSchedules} sc where sc.resource_id = r.id)
        ) as "hasScheduledResource"
    `)
  ).rows;
  const rulesDone = [
    b.cancellationLimitHours,
    b.minNoticeMinutes,
    b.maxAdvanceDays,
    b.slotIntervalMinutes,
    b.bufferMinutes,
  ].every((v) => v !== null);
  const steps = [
    {
      key: 'profile',
      label: 'Completa tu perfil público',
      done: Boolean(b.description && b.address && b.phone),
    },
    { key: 'services', label: 'Agrega al menos un servicio', done: hasService },
    { key: 'resources', label: 'Agrega a tu equipo o tus espacios', done: hasResource },
    {
      key: 'schedules',
      label: 'Define el horario y los servicios de cada uno',
      done: hasScheduledResource,
    },
    { key: 'rules', label: 'Define tus reglas de reserva', done: rulesDone },
    { key: 'pin', label: 'Crea tu PIN de dueño', done: Boolean(b.ownerPinHash) },
  ];
  const ready = b.status === 'approved' && hasScheduledResource && rulesDone;
  return { steps, ready };
}
