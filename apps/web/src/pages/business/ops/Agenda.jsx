// Agenda del día con una columna por recurso (RF-44, pantalla 09). Se actualiza cada 30 s.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Link2, MonitorPlay, Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ButtonLink } from '@/components/ButtonLink';
import { EmptyState, ErrorState, LoadingList } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { dayLong, dt, todayISO } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAgenda, useIsDesktop, useNow } from '@/features/business-ops/hooks';
import { BookingSheet } from '@/features/business-ops/components';
import { DayGrid } from '@/features/business-ops/DayGrid';

const isISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');

export default function Agenda() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const today = todayISO();
  const date = isISODate(params.get('dia')) ? params.get('dia') : today;
  const q = useAgenda(date);
  const nowMs = useNow(30_000);
  const desktop = useIsDesktop('(min-width: 768px)');
  const [openId, setOpenId] = useState(null);
  const [tab, setTab] = useState(null);
  const [showRequests, setShowRequests] = useState(true);

  const goTo = (d) => setParams(d === today ? {} : { dia: d }, { replace: true });
  const shift = (days) => goTo(dt(date).plus({ days }).toISODate());

  const openScreen = async () => {
    // Se abre la ventana antes de pedir el link para que el navegador no la bloquee.
    const w = window.open('about:blank', '_blank');
    try {
      const { link } = await api('/business/live-links', { method: 'POST', body: {} });
      if (w) w.location.href = `/en-vivo/${link.token}`;
      else navigate(`/en-vivo/${link.token}`);
    } catch (err) {
      w?.close();
      if (err.code === 'owner_mode_locked') {
        toast.info('El modo pantalla usa el link en vivo del negocio. Desbloquea el modo dueño.');
        navigate('/negocio/dueno/link-en-vivo');
      } else toast.error(err.message);
    }
  };

  const resources = q.data?.resources ?? [];
  const current = resources.find((r) => r.id === tab) ?? resources[0];
  const visible = desktop ? resources : current ? [current] : [];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Agenda"
        actions={
          <>
            <ButtonLink
              to="/negocio/dueno/link-en-vivo"
              variant="outline"
              className="hidden sm:inline-flex"
            >
              <Link2 /> Link en vivo
            </ButtonLink>
            <Button variant="outline" onClick={openScreen} aria-label="Modo pantalla">
              <MonitorPlay /> <span className="hidden sm:inline">Modo pantalla</span>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Día anterior">
          <ChevronLeft />
        </Button>
        <label className="relative">
          <span className="sr-only">Elegir día</span>
          <input
            type="date"
            value={date}
            onChange={(e) => isISODate(e.target.value) && goTo(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          <span className="block min-w-48 px-2 text-center text-base font-extrabold md:text-lg">
            {dayLong(date)}
          </span>
        </label>
        <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Día siguiente">
          <ChevronRight />
        </Button>
        <Button variant="outline" onClick={() => goTo(today)} disabled={date === today}>
          Hoy
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Switch id="ver-solicitudes" checked={showRequests} onCheckedChange={setShowRequests} />
          <Label htmlFor="ver-solicitudes" className="text-[13px] font-semibold">
            Ver solicitudes
          </Label>
        </div>
      </div>

      {q.isLoading ? (
        <LoadingList rows={1} itemClassName="h-[520px]" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !resources.length ? (
        <EmptyState
          icon={Users}
          title="Todavía no hay equipo ni espacios"
          text="Agrega a las personas o espacios que atienden para ver su agenda."
          action={{ label: 'Agregar equipo', to: '/negocio/dueno/equipo' }}
        />
      ) : (
        <>
          {!desktop && resources.length > 1 && (
            <div
              role="tablist"
              aria-label="Recursos"
              className="mb-3 flex gap-2 overflow-x-auto pb-1"
            >
              {resources.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={current?.id === r.id}
                  onClick={() => setTab(r.id)}
                  className={cn(
                    'flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-bold',
                    current?.id === r.id
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-border bg-white',
                  )}
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                  {r.name}
                  <span className="text-xs font-semibold text-muted-foreground">
                    {r.bookings.length}
                  </span>
                </button>
              ))}
            </div>
          )}
          {q.data.closed && (
            <p className="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-sm font-semibold">
              El negocio está cerrado este día
              {q.data.closed.reason ? `: ${q.data.closed.reason}` : '.'}
            </p>
          )}
          <div className="overflow-hidden rounded-xl border border-border bg-white">
            <div className="flex border-b border-border">
              <div className="w-14 shrink-0 border-r border-border" />
              {visible.map((r) => (
                <div
                  key={r.id}
                  className="flex min-w-0 flex-1 items-center gap-2 border-r border-border px-3 py-3 last:border-r-0"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="truncate font-extrabold">{r.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {r.title ? `· ${r.title} ` : ''}· {r.bookings.length}{' '}
                    {r.bookings.length === 1 ? 'cita' : 'citas'}
                  </span>
                </div>
              ))}
            </div>
            <div className="py-3">
              <DayGrid
                date={date}
                range={q.data.range}
                resources={visible}
                nowMs={nowMs}
                isToday={date === today}
                showRequests={showRequests}
                onBookingClick={(b) => setOpenId(b.id)}
                onRequestClick={() => navigate('/negocio/solicitudes')}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Se actualiza sola cada 30 segundos. Los bloques grises vienen de Google Calendar.
          </p>
        </>
      )}

      <BookingSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
