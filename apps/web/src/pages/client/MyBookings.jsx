// Mis reservas (pantalla 07): RF-38, RF-63, RF-68.
import { useSearchParams } from 'react-router';
import { CalendarDays, CalendarX, Clock, Hourglass, MapPin, History } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StateChip } from '@/components/Chip';
import { DateBox } from '@/components/DateBox';
import { ButtonLink } from '@/components/ButtonLink';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingList, Spinner } from '@/components/States';
import { weekdayShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useMyBookings } from '@/features/client/queries';
import { BookingRow, mapsUrl, timeRange, withResource } from '@/features/client/components';

const TABS = [
  ['upcoming', 'Próximas'],
  ['pending', 'Pendientes'],
  ['past', 'Pasadas'],
  ['cancelled', 'Canceladas'],
];
const EMPTY = {
  upcoming: [
    CalendarDays,
    'No tienes citas próximas',
    'Busca un negocio y reserva tu siguiente cita.',
  ],
  pending: [
    Hourglass,
    'No tienes solicitudes pendientes',
    'Aquí verás las solicitudes que esperan respuesta del negocio.',
  ],
  past: [
    History,
    'Todavía no tienes citas pasadas',
    'Cuando termine una cita aparecerá aquí para calificarla o volver a agendar.',
  ],
  cancelled: [
    CalendarX,
    'Nada por aquí',
    'Aquí aparecen las citas canceladas, rechazadas o vencidas.',
  ],
};

export default function MyBookings() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([v]) => v === params.get('tab')) ? params.get('tab') : 'upcoming';
  const q = useMyBookings(tab);
  const pages = q.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const counts = pages[0]?.counts;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Mis reservas" />
      <div
        role="tablist"
        aria-label="Tipo de reservas"
        className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
      >
        {TABS.map(([v, label]) => {
          const on = v === tab;
          const n = v === 'pending' ? counts?.pending : 0;
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setParams(v === 'upcoming' ? {} : { tab: v }, { replace: true })}
              className={cn(
                'h-10 shrink-0 rounded-full border px-4 text-sm font-bold focus-visible:ring-2 focus-visible:ring-ring',
                on
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-field bg-white hover:bg-surface',
              )}
            >
              {label}
              {n > 0 && ` · ${n}`}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {q.isLoading && <LoadingList rows={4} itemClassName="h-24" />}
        {q.isError && <ErrorState error={q.error} onRetry={q.refetch} />}
        {q.isSuccess && items.length === 0 && (
          <EmptyState
            icon={EMPTY[tab][0]}
            title={EMPTY[tab][1]}
            text={EMPTY[tab][2]}
            action={{ label: 'Buscar negocios', to: '/buscar' }}
          />
        )}
        {items.length > 0 && tab === 'upcoming' ? (
          <>
            <NextUp b={items[0]} />
            {items.length > 1 && (
              <>
                <h2 className="mt-6 mb-3 text-lg font-extrabold">Más adelante</h2>
                <div className="space-y-3">
                  {items.slice(1).map((b) => (
                    <BookingRow key={b.id} b={b} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {items.map((b) => (
              <BookingRow key={b.id} b={b} />
            ))}
          </div>
        )}
        {q.hasNextPage && (
          <div className="mt-5 flex justify-center">
            <Button
              variant="outline"
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
            >
              {q.isFetchingNextPage && <Spinner className="size-4" />}
              Ver más
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** "Tu próxima cita", destacada. */
function NextUp({ b }) {
  return (
    <div className="rounded-xl border border-primary-line bg-primary-soft p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-extrabold tracking-wide text-primary uppercase">
          Tu próxima cita
        </p>
        <StateChip status={b.status} size="sm" />
      </div>
      <div className="mt-3 flex gap-3.5">
        <DateBox date={b.startsAt} className="bg-white" />
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold">{b.business.name}</p>
          <p className="truncate text-[13px] text-muted-foreground">
            {b.service.name} · {withResource(b.resource)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold">
            <Clock className="size-3.5 text-muted-foreground" aria-hidden />
            {weekdayShort(b.startsAt)} · {timeRange(b)}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <a
          href={mapsUrl(b.business.address)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-field bg-white text-sm font-bold hover:bg-surface"
        >
          <MapPin className="size-[18px] text-primary" /> Cómo llegar
        </a>
        <ButtonLink to={`/reservas/${b.id}`} className="h-11">
          Ver detalle
        </ButtonLink>
      </div>
    </div>
  );
}
