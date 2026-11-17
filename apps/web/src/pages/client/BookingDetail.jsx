// Detalle de una reserva: estado, Cómo llegar (RF-68), cancelar (RF-35), calificar (RF-48) y
// volver a agendar (RF-60).
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { MapPin, Phone, RotateCcw, Star } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Photo } from '@/components/Photo';
import { StateChip } from '@/components/Chip';
import { Notice } from '@/components/Notice';
import { Stars } from '@/components/Stars';
import { ButtonLink } from '@/components/ButtonLink';
import { EmptyState, ErrorState, FullPageSpinner } from '@/components/States';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { dayLong, dayShort, money, moneyMXN, phone, time } from '@/lib/format';
import { useBooking, useCancelBooking } from '@/features/client/queries';
import { mapsUrl } from '@/features/client/components';

const at = (v) => `${dayShort(v).toLowerCase()} a las ${time(v)}`;

function StatusNotice({ b }) {
  const limit = b.business.cancellationLimitHours;
  switch (b.status) {
    case 'pending':
      return b.submittedAt ? (
        <Notice kind="warn">
          Esperando respuesta del negocio (tiene hasta el {at(b.respondBy)}). Solo apartamos{' '}
          {money(b.priceCents)} en tu tarjeta; se cobra si acepta y se libera si no responde.
        </Notice>
      ) : (
        <Notice>No terminaste de pagar, así que esta solicitud no se envió.</Notice>
      );
    case 'hold':
      return <Notice>Este horario está apartado mientras terminas de pagar.</Notice>;
    case 'confirmed':
      return b.canCancel ? (
        <Notice kind="ok">
          Cita confirmada. Puedes cancelar gratis hasta el {at(b.cancelDeadline)} ({limit} h antes)
          y te devolvemos el 100%.
        </Notice>
      ) : (
        <Notice kind="ok">
          Cita confirmada. Ya pasó el límite para cancelar ({limit} h antes de la cita).
        </Notice>
      );
    case 'completed':
      return <Notice kind="blue">Cita completada. ¡Gracias por usar ReserYa!</Notice>;
    case 'no_show':
      return <Notice>El negocio marcó que no asististe. Lo cobrado no se reembolsa.</Notice>;
    case 'cancelled':
      return b.cancelledBy === 'business' ? (
        <Notice kind="error">
          El negocio canceló tu cita
          {b.cancellationReason ? `: “${b.cancellationReason}”` : ''}. Te devolvemos el 100%.
        </Notice>
      ) : (
        <Notice>
          Cancelaste esta {b.payment?.status === 'refunded' ? 'cita' : 'solicitud'}.{' '}
          {b.payment?.status === 'refunded'
            ? `Te devolvimos ${money(b.priceCents)}.`
            : 'No se te cobró nada.'}
        </Notice>
      );
    case 'rejected':
      return (
        <Notice kind="error">
          El negocio no pudo atenderte en ese horario. Liberamos el monto apartado; no se te cobró
          nada.
        </Notice>
      );
    case 'expired':
      return (
        <Notice>
          El negocio no respondió a tiempo. Liberamos el monto apartado; no se te cobró nada.
        </Notice>
      );
    default:
      return null;
  }
}

export default function BookingDetail() {
  const { id } = useParams();
  const q = useBooking(id);
  if (q.isLoading) return <FullPageSpinner />;
  if (q.isError)
    return q.error.status === 404 ? (
      <EmptyState
        title="No encontramos esta reserva"
        action={{ label: 'Mis reservas', to: '/reservas' }}
        className="mt-6"
      />
    ) : (
      <ErrorState error={q.error} onRetry={q.refetch} className="mt-6" />
    );
  return <Detail b={q.data} />;
}

function Detail({ b }) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelBooking(b.id);
  const confirmed = b.status === 'confirmed';
  const finished = ['completed', 'no_show', 'cancelled', 'rejected', 'expired'].includes(b.status);
  const rebookUrl = `/negocios/${b.business.id}/reservar?serviceId=${b.service.id}&resourceId=${b.resource.id}&rebook=${b.id}`;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Detalle de la reserva" back="/reservas" />
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-start gap-3">
          <Photo
            url={b.business.photoUrl}
            icon={b.business.category.icon}
            className="size-14 shrink-0 rounded-lg"
            iconClassName="size-6"
          />
          <div className="min-w-0 flex-1">
            <Link
              to={`/negocios/${b.business.id}`}
              className="block truncate text-lg font-extrabold hover:underline"
            >
              {b.business.name}
            </Link>
            {b.business.address && (
              <p className="text-[13px] text-muted-foreground">{b.business.address}</p>
            )}
          </div>
          <StateChip status={b.status} />
        </div>
        <dl className="mt-4 space-y-2.5 border-t border-border pt-4 text-sm">
          <Row label="Servicio" value={b.service.name} />
          <Row label={b.resource.kind === 'space' ? 'Lugar' : 'Con'} value={b.resource.name} />
          <Row label="Fecha" value={dayLong(b.startsAt)} />
          <Row label="Hora" value={`${time(b.startsAt)} a ${time(b.endsAt)}`} />
          <Row label="Total" value={moneyMXN(b.priceCents)} strong />
        </dl>
      </div>

      <div className="mt-4">
        <StatusNotice b={b} />
      </div>

      {b.review && (
        <div className="mt-4 rounded-xl border border-border p-4">
          <p className="text-sm font-bold">Tu reseña</p>
          <Stars value={b.review.rating} size="size-5" className="mt-1" />
          {b.review.comment && <p className="mt-2 text-[15px]">{b.review.comment}</p>}
        </div>
      )}

      <div className="mt-5 grid gap-2.5">
        {(confirmed || b.status === 'pending') && b.business.address && (
          <a
            href={mapsUrl(b.business.address)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-field bg-white text-[15px] font-bold hover:bg-surface"
          >
            <MapPin className="size-[18px] text-primary" /> Cómo llegar
          </a>
        )}
        {confirmed && b.business.phone && (
          <a
            href={`tel:${b.business.phone}`}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-field bg-white text-[15px] font-bold hover:bg-surface"
          >
            <Phone className="size-[18px] text-primary" /> Llamar al {phone(b.business.phone)}
          </a>
        )}
        {b.canReview && (
          <ButtonLink to={`/reservas/${b.id}/resena`} variant="dark" size="lg">
            <Star /> Calificar
          </ButtonLink>
        )}
        {finished && b.canRebook && (
          <ButtonLink to={rebookUrl} size="lg">
            <RotateCcw /> Volver a agendar
          </ButtonLink>
        )}
        {b.canCancel && (
          <Button variant="destructive" size="lg" onClick={() => setOpen(true)}>
            {confirmed ? 'Cancelar cita' : 'Retirar solicitud'}
          </Button>
        )}
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-extrabold">
              {confirmed ? '¿Cancelar tu cita?' : '¿Retirar tu solicitud?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmed
                ? `Te devolvemos el 100% (${money(b.priceCents)}) a tu tarjeta. El reembolso puede tardar unos días en verse en tu estado de cuenta.`
                : `Liberamos los ${money(b.priceCents)} apartados en tu tarjeta. No se te cobra nada.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancel.error && <Notice kind="error">{cancel.error.message}</Notice>}
          <AlertDialogFooter>
            <AlertDialogCancel>No, mantener</AlertDialogCancel>
            <Button
              variant="destructive-solid"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate(undefined, {
                  onSuccess: () => {
                    setOpen(false);
                    toast.success(confirmed ? 'Cita cancelada' : 'Solicitud retirada');
                  },
                })
              }
            >
              {confirmed ? 'Sí, cancelar' : 'Sí, retirar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? 'text-base font-extrabold' : 'text-right font-semibold'}>{value}</dd>
    </div>
  );
}
