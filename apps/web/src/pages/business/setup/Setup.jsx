// Lista de pasos para que el negocio aparezca en búsquedas (RF-71).
import { Link } from 'react-router';
import { Check, ChevronRight, Lock } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { LoadingList, ErrorState } from '@/components/States';
import { useSetup } from '@/features/business-setup/api';
import { STEP_LINKS } from '@/features/business-setup/constants';
import { cn } from '@/lib/utils';

const HINTS = {
  profile: 'Descripción, dirección, teléfono y fotos.',
  services: 'Nombre, duración y precio de lo que ofreces.',
  resources: 'Las personas o los espacios que se reservan.',
  schedules: 'Qué días y horas trabaja cada uno y qué servicios da.',
  rules: 'Cancelación, anticipación, intervalos y aceptación automática.',
  pin: 'Protege estadísticas, pagos y configuración.',
};

export default function Setup() {
  const q = useSetup();

  if (q.isLoading)
    return (
      <div className="max-w-3xl">
        <PageHeader title="Configura tu negocio" />
        <LoadingList rows={6} itemClassName="h-16" />
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;

  const { steps, ready } = q.data;
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Configura tu negocio"
        subtitle={`${done} de ${steps.length} pasos listos`}
      />
      <div
        className="mb-5 h-2 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        aria-label="Avance de la configuración"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(done / steps.length) * 100}%` }}
        />
      </div>

      {ready ? (
        <Notice kind="ok" className="mb-5">
          Tu negocio ya aparece en las búsquedas y puede recibir solicitudes.
          {done < steps.length && ' Completa los pasos que faltan para que tu perfil se vea mejor.'}
        </Notice>
      ) : (
        <Notice kind="warn" className="mb-5">
          Tu negocio no aparece en las búsquedas hasta que tenga al menos un servicio, alguien de tu
          equipo con horario y tus reglas de reserva.
        </Notice>
      )}

      <ol className="overflow-hidden rounded-xl border border-border bg-white">
        {steps.map((s, i) => (
          <li key={s.key} className="border-b border-border last:border-0">
            <Link
              to={STEP_LINKS[s.key] ?? '/negocio/dueno'}
              className="flex items-center gap-4 px-4 py-4 hover:bg-surface md:px-5"
            >
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold',
                  s.done ? 'bg-success-soft text-success' : 'bg-primary-soft text-primary',
                )}
                aria-hidden
              >
                {s.done ? <Check className="size-5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-[15px] font-bold',
                    s.done && 'text-muted-foreground line-through decoration-1',
                  )}
                >
                  {s.label}
                </span>
                <span className="block text-[13px] text-muted-foreground">{HINTS[s.key]}</span>
              </span>
              <span className="sr-only">{s.done ? 'Listo' : 'Pendiente'}</span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
        <Lock className="size-4" /> Estas páginas están en el modo dueño: te pediremos tu PIN.
      </p>
    </div>
  );
}
