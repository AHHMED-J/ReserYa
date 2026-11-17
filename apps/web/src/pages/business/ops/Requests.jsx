// Cola de solicitudes por horario (RF-28 a RF-30, pantalla 08).
import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Clock, Inbox } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Chip } from '@/components/Chip';
import { Notice } from '@/components/Notice';
import { EmptyState, ErrorState, LoadingList } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { agoText, dayLong, money, moneyMXN, phone, relativeDay, time } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDecideRequest, useIsDesktop, useNow, useRequests } from '@/features/business-ops/hooks';
import { ConfirmDialog, DetailRow, whenText } from '@/features/business-ops/components';

/** "4 h 02 min" hasta `v` contado desde `nowMs`. */
function leftText(v, nowMs) {
  const mins = Math.max(0, Math.round((new Date(v).getTime() - nowMs) / 60_000));
  const h = Math.floor(mins / 60);
  return h ? `${h} h ${String(mins % 60).padStart(2, '0')} min` : `${mins} min`;
}

export default function Requests() {
  const q = useRequests();
  const nowMs = useNow(30_000);
  const desktop = useIsDesktop();
  const [selectedId, setSelectedId] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const groups = q.data?.groups ?? [];
  const all = groups.flatMap((g) => g.requests);
  // En computadora siempre hay una seleccionada: la elegida o la primera de la cola.
  const selected = all.find((r) => r.id === selectedId) ?? (desktop ? all[0] : null);

  const select = (id) => {
    setSelectedId(id);
    if (!desktop) setSheetOpen(true);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Solicitudes"
        subtitle="Agrupadas por horario. La primera en llegar va arriba."
        actions={
          <span className="hidden text-sm font-semibold text-muted-foreground md:block">
            {dayLong(nowMs)} · {time(nowMs)}
          </span>
        }
      />

      {q.isLoading ? (
        <LoadingList rows={3} itemClassName="h-36" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !groups.length ? (
        <EmptyState
          icon={Inbox}
          title="No hay solicitudes pendientes"
          text="Cuando un cliente envíe una solicitud aparecerá aquí. La lista se actualiza sola."
        />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <ul className="space-y-4" aria-label="Solicitudes por horario">
            {groups.map((g) => (
              <li key={g.id} className="rounded-xl border border-border bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="font-extrabold">
                    {relativeDay(g.startsAt)} · {time(g.startsAt)}
                  </h2>
                  {g.respondBy && (
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-warning">
                      <Clock className="size-4" /> Vence en {leftText(g.respondBy, nowMs)}
                    </span>
                  )}
                </div>
                <ul className="space-y-2">
                  {g.requests.map((r) => (
                    <li key={r.id}>
                      <RequestCard
                        r={r}
                        selected={selected?.id === r.id}
                        onSelect={() => select(r.id)}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {desktop && selected && (
            <section
              className="sticky top-6 rounded-xl border border-border bg-white p-6"
              aria-label="Detalle de la solicitud"
            >
              <RequestDetail r={selected} nowMs={nowMs} onDone={() => setSelectedId(null)} />
            </section>
          )}
        </div>
      )}

      {!desktop && (
        <Sheet open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl p-5">
            <SheetTitle className="sr-only">Detalle de la solicitud</SheetTitle>
            {selected && (
              <RequestDetail
                r={selected}
                nowMs={nowMs}
                onDone={() => {
                  setSheetOpen(false);
                  setSelectedId(null);
                }}
              />
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function RequestCard({ r, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'w-full rounded-lg border px-4 py-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
        selected
          ? 'border-2 border-primary bg-primary-soft'
          : 'border-border bg-white hover:bg-surface',
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="font-bold">{r.client.shortName}</span>
        <span className="font-extrabold">{money(r.amountCents)}</span>
      </span>
      <span className="mt-0.5 block text-[13px] text-muted-foreground">
        {r.service.name} · con {r.resource.name} · {time(r.startsAt)} a {time(r.endsAt)}
      </span>
      <span className="mt-2 flex flex-wrap gap-1.5">
        {r.first && (
          <Chip tone={selected ? 'white' : 'primary'} size="sm">
            Primera en llegar
          </Chip>
        )}
        {!r.first && r.overlapsWith.length > 0 && (
          <Chip tone="warn" size="sm">
            Se encima con {r.overlapsWith.map((o) => o.shortName).join(', ')}
          </Chip>
        )}
      </span>
    </button>
  );
}

function RequestDetail({ r, nowMs, onDone }) {
  const decide = useDecideRequest();
  const [confirm, setConfirm] = useState(null); // 'accept' | 'reject'
  const others = r.overlapsWith.map((o) => o.shortName).join(', ');
  const urgent = new Date(r.respondBy).getTime() - nowMs < 2 * 3600_000;

  const run = (action) =>
    decide.mutate(
      { id: r.id, action },
      {
        onSuccess: (data) => {
          if (action === 'accept') {
            const n = data.rejected?.length ?? 0;
            toast.success(`Aceptaste la cita de ${r.client.shortName}`, {
              description:
                `Se cobraron ${money(r.amountCents)}.` +
                (n
                  ? ` Se rechaz${n === 1 ? 'ó 1 solicitud encimada' : `aron ${n} solicitudes encimadas`}.`
                  : ''),
            });
          } else {
            toast.success(`Rechazaste la solicitud de ${r.client.shortName}`, {
              description: 'Liberamos el monto apartado y le avisamos por correo.',
            });
          }
          setConfirm(null);
          onDone();
        },
        onError: (err) => {
          toast.error(
            err.code === 'slot_taken'
              ? 'Ese horario ya está ocupado por otra cita confirmada.'
              : err.message,
          );
          setConfirm(null);
        },
      },
    );

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-extrabold">Solicitud de {r.client.shortName}</h2>
        <Chip tone="warn">Pendiente</Chip>
      </div>
      <dl className="mt-5">
        <DetailRow label="Teléfono">
          <a href={`tel:${r.client.phone}`} className="hover:underline">
            {phone(r.client.phone)}
          </a>
        </DetailRow>
        <DetailRow label="Correo">{r.client.email}</DetailRow>
        <DetailRow label="Servicio">{r.service.name}</DetailRow>
        <DetailRow label="Con">{r.resource.name}</DetailRow>
        <DetailRow label="Fecha">{whenText(r)}</DetailRow>
        <DetailRow label="Recibida">
          {relativeDay(r.submittedAt)} · {time(r.submittedAt)}
          <span className="block text-xs font-medium text-muted-foreground">
            {agoText(r.submittedAt)}
          </span>
        </DetailRow>
        <DetailRow label="Vence">
          <span className={cn(urgent ? 'text-error' : 'text-warning')}>
            {relativeDay(r.respondBy)} · {time(r.respondBy)}
          </span>
        </DetailRow>
      </dl>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-4">
        <span className="font-bold">Monto apartado</span>
        <span className="text-2xl font-extrabold">{moneyMXN(r.amountCents)}</span>
      </div>

      <div className="mt-4 space-y-3">
        {others && (
          <Notice kind="warn">
            Hay {r.overlapsWith.length === 1 ? 'otra solicitud' : 'otras solicitudes'} que se encima
            {r.overlapsWith.length === 1 ? '' : 'n'} en este horario ({others}). Si aceptas esta,{' '}
            {r.overlapsWith.length === 1 ? 'la otra se rechaza' : 'las otras se rechazan'} y se
            libera su monto.
          </Notice>
        )}
        <Notice>
          Al aceptar se cobra el monto y se crea el evento en el calendario de {r.resource.name}.
        </Notice>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button
          variant="destructive"
          size="lg"
          disabled={decide.isPending}
          onClick={() => setConfirm('reject')}
        >
          Rechazar
        </Button>
        <Button size="lg" disabled={decide.isPending} onClick={() => setConfirm('accept')}>
          <Check /> Aceptar solicitud
        </Button>
      </div>

      <ConfirmDialog
        open={confirm === 'accept'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`¿Aceptar la cita de ${r.client.shortName}?`}
        description={
          `${r.service.name} con ${r.resource.name} · ${whenText(r)}. Se cobrarán ${money(r.amountCents)}.` +
          (others ? ` Se rechazará: ${others}.` : '')
        }
        confirmLabel="Aceptar y cobrar"
        busy={decide.isPending}
        onConfirm={() => run('accept')}
      />
      <ConfirmDialog
        open={confirm === 'reject'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`¿Rechazar la solicitud de ${r.client.shortName}?`}
        description="Se libera el monto apartado en su tarjeta y le avisamos por correo."
        confirmLabel="Rechazar"
        destructive
        busy={decide.isPending}
        onConfirm={() => run('reject')}
      />
    </div>
  );
}
