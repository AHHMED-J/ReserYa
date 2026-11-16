// Todos los negocios con filtro por estado y búsqueda (RF-12).
import { useDeferredValue } from 'react';
import { useSearchParams } from 'react-router';
import { Search, Store } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { LoadingList, ErrorState, EmptyState } from '@/components/States';
import { useBusinesses } from '@/features/admin/api';
import { BusinessTable } from '@/features/admin/BusinessTable';
import { OptionPills } from '@/features/business-setup/components';

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'approved', label: 'Activos' },
  { value: 'suspended', label: 'Suspendidos' },
  { value: 'rejected', label: 'Rechazados' },
];

export default function Businesses() {
  const [params, setParams] = useSearchParams();
  const status = params.get('estado') ?? '';
  const text = params.get('q') ?? '';
  const q = useDeferredValue(text);
  const list = useBusinesses({ status: status || undefined, q: q.trim() || undefined });

  const update = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <div className="max-w-6xl">
      <PageHeader title="Negocios" subtitle="Todos los negocios registrados en ReserYa." />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
        <OptionPills
          label="Filtrar por estado"
          options={FILTERS}
          value={status}
          onChange={(v) => update('estado', v)}
          className="flex-1"
        />
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={text}
            onChange={(e) => update('q', e.target.value)}
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar negocios"
            className="h-10 pl-10"
          />
        </div>
      </div>

      {list.isLoading ? (
        <LoadingList rows={5} itemClassName="h-16" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : list.data.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No hay negocios"
          text={
            text || status ? 'Prueba con otro filtro o búsqueda.' : 'Aún no se registra ninguno.'
          }
        />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            {list.data.length === 1 ? '1 negocio' : `${list.data.length} negocios`}
          </p>
          <BusinessTable businesses={list.data} />
        </>
      )}
    </div>
  );
}
