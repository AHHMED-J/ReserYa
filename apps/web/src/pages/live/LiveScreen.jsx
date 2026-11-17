// Modo pantalla del link en vivo (RF-46, RF-47, RNF-06): sin sesión, letra grande, una columna
// por recurso, reloj y actualización cada 20 s. Solo nombre corto, servicio y hora.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Maximize, Minimize, WifiOff, Link2Off } from 'lucide-react';
import { api } from '@/lib/api';
import { dayLong, time, todayISO } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { FullPageSpinner } from '@/components/States';
import { cn } from '@/lib/utils';
import { useNow } from '@/features/business-ops/hooks';
import { DayGrid } from '@/features/business-ops/DayGrid';

export default function LiveScreen() {
  const { token } = useParams();
  const nowMs = useNow(10_000);
  const q = useQuery({
    queryKey: ['live', token],
    queryFn: () => api(`/live/${token}`),
    refetchInterval: (query) => (query.state.error?.status === 404 ? false : 20_000),
    refetchIntervalInBackground: true,
    retry: (count, err) => err?.status !== 404 && count < 3,
    staleTime: 0,
  });
  const fullscreen = useFullscreen();
  const scrolled = useRef(false);

  useEffect(() => {
    document.title = q.data ? `Agenda en vivo · ${q.data.business.name}` : 'Agenda en vivo';
  }, [q.data]);

  // Al abrir, lleva la vista a la hora actual.
  useEffect(() => {
    if (!q.data || scrolled.current) return;
    scrolled.current = true;
    document.querySelector('[data-now]')?.scrollIntoView({ block: 'center' });
  }, [q.data]);

  if (q.isLoading) return <FullPageSpinner />;
  if (q.error?.status === 404 || (q.isError && !q.data)) {
    const invalid = q.error?.status === 404 || q.error?.status === 400;
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface p-6">
        <div className="max-w-md rounded-2xl border border-border bg-white p-8 text-center">
          <img src="/logo-mark.png" alt="" className="mx-auto mb-4 size-10" />
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-neutral-soft text-muted-foreground">
            {invalid ? <Link2Off className="size-6" /> : <WifiOff className="size-6" />}
          </div>
          <h1 className="text-2xl font-extrabold">
            {invalid ? 'Este link ya no es válido' : 'No pudimos cargar la agenda'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {invalid
              ? 'Puede que el negocio lo haya cambiado por uno nuevo. Pídele el link actualizado.'
              : 'Revisa la conexión a internet. Volveremos a intentar en unos segundos.'}
          </p>
          {!invalid && (
            <Button className="mt-5" onClick={() => q.refetch()}>
              Reintentar
            </Button>
          )}
        </div>
      </div>
    );
  }

  const d = q.data;
  const total = d.resources.reduce((a, r) => a + r.bookings.length, 0);

  return (
    <div className="min-h-dvh bg-white">
      <div className="sticky top-0 z-20 bg-white">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-white px-4 py-3 md:px-8">
          <img src="/logo-mark.png" alt="" className="size-9" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold md:text-3xl">
              {d.business.name}
              {d.resource && <span className="text-muted-foreground"> · {d.resource.name}</span>}
            </h1>
            <p className="text-base font-semibold text-muted-foreground md:text-lg">
              {dayLong(d.date)} · {total} {total === 1 ? 'cita' : 'citas'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {q.isError && (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                <WifiOff className="size-4" /> Sin conexión, reintentando
              </span>
            )}
            <span
              className="text-4xl font-extrabold tabular-nums md:text-5xl"
              aria-label={`Son las ${time(nowMs)}`}
            >
              {time(nowMs)}
            </span>
            {fullscreen.supported && (
              <Button
                variant="outline"
                size="icon-lg"
                onClick={fullscreen.toggle}
                aria-label={fullscreen.active ? 'Salir de pantalla completa' : 'Pantalla completa'}
              >
                {fullscreen.active ? <Minimize /> : <Maximize />}
              </Button>
            )}
          </div>
        </header>
        {!d.closed && d.resources.length > 0 && (
          <div className="flex border-b border-border px-2 md:px-6">
            <div className="w-20 shrink-0" />
            {d.resources.map((r) => (
              <div
                key={r.id}
                className="flex min-w-0 flex-1 items-center gap-3 border-l border-border px-3 py-3"
              >
                <span
                  className="size-4 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                <span className="truncate text-2xl font-extrabold">{r.name}</span>
                <span className="text-lg text-muted-foreground">{r.bookings.length}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {d.closed ? (
        <p className="p-10 text-center text-2xl font-bold text-muted-foreground">
          Hoy el negocio está cerrado.
        </p>
      ) : !d.resources.length ? (
        <p className="p-10 text-center text-2xl font-bold text-muted-foreground">
          No hay agenda para mostrar.
        </p>
      ) : (
        <main className="px-2 pb-6 md:px-6">
          <div className={cn('pt-4', d.resources.length > 4 && 'overflow-x-auto')}>
            <div className={cn(d.resources.length > 4 && 'min-w-[960px]')}>
              <DayGrid
                date={d.date}
                range={d.range}
                resources={d.resources.map((r) => ({ ...r, requests: [] }))}
                nowMs={nowMs}
                isToday={d.date === todayISO()}
                big
              />
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

/** Pantalla completa con la API del navegador (requestFullscreen). */
function useFullscreen() {
  const [active, setActive] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  return {
    supported: Boolean(document.documentElement.requestFullscreen),
    active,
    toggle: () =>
      document.fullscreenElement
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen().catch(() => {}),
  };
}
