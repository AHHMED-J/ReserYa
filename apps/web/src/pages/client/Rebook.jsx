// Volver a agendar (botón central de la barra): RF-60, RF-63.
import { Link } from 'react-router';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Photo } from '@/components/Photo';
import { EmptyState, ErrorState, LoadingList } from '@/components/States';
import { dayShort, duration, money } from '@/lib/format';
import { useRebookList } from '@/features/client/queries';
import { withResource } from '@/features/client/components';

export default function Rebook() {
  const q = useRebookList();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Volver a agendar"
        subtitle="Elige una cita anterior: el servicio y la persona ya quedan elegidos, solo escoges la fecha y la hora."
      />
      {q.isLoading && <LoadingList rows={4} itemClassName="h-24" />}
      {q.isError && <ErrorState error={q.error} onRetry={q.refetch} />}
      {q.isSuccess && q.data.length === 0 && (
        <EmptyState
          icon={RotateCcw}
          title="Todavía no tienes citas anteriores"
          text="Cuando tengas tu primera cita, desde aquí podrás repetirla en dos toques."
          action={{ label: 'Buscar negocios', to: '/buscar' }}
        />
      )}
      {q.isSuccess && q.data.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {q.data.map((x) => (
            <li key={x.bookingId}>
              <Link
                to={`/negocios/${x.business.id}/reservar?serviceId=${x.service.id}&resourceId=${x.resource.id}&rebook=${x.bookingId}`}
                className="flex items-center gap-3.5 rounded-xl border border-border bg-white p-3 hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Photo
                  url={x.business.photoUrl}
                  icon={x.business.category.icon}
                  className="size-16 shrink-0 rounded-lg"
                  iconClassName="size-6"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{x.business.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {x.service.name} · {withResource(x.resource)}
                  </p>
                  <p className="mt-1 text-[13px]">
                    <b>{money(x.service.priceCents)}</b>
                    <span className="text-muted-foreground">
                      {' '}
                      · {duration(x.service.durationMin)} · Última vez: {dayShort(x.lastDate)}
                    </span>
                  </p>
                </div>
                <span className="hidden h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-bold text-white sm:inline-flex">
                  Agendar
                </span>
                <ChevronRight className="size-5 text-muted-foreground sm:hidden" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
