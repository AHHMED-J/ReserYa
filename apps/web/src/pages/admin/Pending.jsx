// Negocios pendientes de aprobación (RF-11, pantalla 11).
import { Clock, Store, KeyRound, CircleCheck } from 'lucide-react';
import { agoText } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { LoadingList, ErrorState, EmptyState } from '@/components/States';
import { Skeleton } from '@/components/ui/skeleton';
import { useBusinesses, useSummary } from '@/features/admin/api';
import { StatCard, GenerateKeyButton } from '@/features/admin/components';
import { BusinessTable } from '@/features/admin/BusinessTable';

export default function Pending() {
  const summary = useSummary();
  const q = useBusinesses({ status: 'pending' });
  const s = summary.data;

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Negocios pendientes"
        subtitle="Negocios que se registraron con una clave y esperan tu aprobación."
        actions={<GenerateKeyButton />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {summary.isLoading ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[120px] rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Por revisar"
              value={s?.pendingCount}
              icon={Clock}
              note={
                s?.oldestPendingAt
                  ? `El más antiguo, ${agoText(s.oldestPendingAt)}`
                  : 'Nada pendiente'
              }
              noteTone={s?.oldestPendingAt ? 'warn' : undefined}
            />
            <StatCard
              label="Negocios activos"
              value={s?.activeCount}
              icon={Store}
              note={
                s?.suspendedCount
                  ? `${s.suspendedCount} ${s.suspendedCount === 1 ? 'suspendido' : 'suspendidos'}`
                  : 'Ninguno suspendido'
              }
            />
            <StatCard
              label="Claves sin usar"
              value={s?.freeKeysCount}
              icon={KeyRound}
              note={`${s?.freeKeysThisMonth ?? 0} generadas este mes`}
            />
          </>
        )}
      </div>

      {q.isLoading ? (
        <LoadingList rows={3} itemClassName="h-20" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : q.data.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="No hay negocios por revisar"
          text="Cuando un negocio se registre con una clave, aparecerá aquí."
        />
      ) : (
        <BusinessTable businesses={q.data} mode="pending" />
      )}

      <Notice kind="info" className="mt-6">
        Aprobar es un solo paso y el negocio aparece en las búsquedas cuando termine su
        configuración. Rechazar pide un motivo que se envía por correo.
      </Notice>
    </div>
  );
}
