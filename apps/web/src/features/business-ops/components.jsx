// Piezas compartidas de las pantallas de operación: filas de detalle, confirmaciones,
// detalle de una reserva (con "No asistió" y la cancelación del dueño) y tarjetas de números.
import { useState } from 'react';
import { toast } from 'sonner';
import { Star, UserX, Ban, Inbox } from 'lucide-react';
import { useMe } from '@/hooks/useAuth';
import { fieldError } from '@/lib/api';
import { money, moneyMXN, phone, relativeDay, time, dateTimeShort } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { StateChip, Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { ButtonLink } from '@/components/ButtonLink';
import { ErrorState, LoadingList } from '@/components/States';
import { cn } from '@/lib/utils';
import { useBooking, useCancelBooking, useNoShow, useIsDesktop } from './hooks';

/** "Hoy · 16:00 a 16:40" */
export const whenText = (b) =>
  `${relativeDay(b.startsAt)} · ${time(b.startsAt)} a ${time(b.endsAt)}`;

export const PAYMENT_STATES = {
  pending: ['Sin pagar', 'neutral'],
  authorized: ['Apartado', 'warn'],
  captured: ['Cobrado', 'ok'],
  released: ['Liberado', 'neutral'],
  refunded: ['Reembolsado', 'error'],
  failed: ['Falló', 'error'],
};

export function PaymentChip({ status, size }) {
  const [label, tone] = PAYMENT_STATES[status] ?? [status, 'neutral'];
  return (
    <Chip tone={tone} size={size}>
      {label}
    </Chip>
  );
}

/** Fila "Etiqueta ........ valor" del panel de detalle. */
export function DetailRow({ label, children, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-1.5 text-sm', className)}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-semibold break-words">{children}</dd>
    </div>
  );
}

/** Confirmación con dos botones. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  busy,
  onConfirm,
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-extrabold">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Volver</AlertDialogCancel>
          <Button
            variant={destructive ? 'destructive-solid' : 'default'}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Cancelación del dueño con motivo (RF-36). Si no está en modo dueño, pide el PIN ahí mismo. */
export function CancelBookingDialog({ booking, open, onOpenChange }) {
  const { user } = useMe();
  const ownerMode = user?.business?.ownerMode;
  const cancel = useCancelBooking();
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');

  const submit = (e) => {
    e.preventDefault();
    cancel.mutate(
      { id: booking.id, reason, pin: ownerMode ? undefined : pin },
      {
        onSuccess: () => {
          toast.success('Reserva cancelada', {
            description: `Le reembolsamos ${money(booking.payment?.amountCents ?? booking.priceCents)} a ${booking.client.shortName} y le avisamos por correo.`,
          });
          setReason('');
          setPin('');
          onOpenChange(false);
        },
        onError: (err) => {
          if (!['validation', 'wrong_pin'].includes(err.code)) toast.error(err.message);
        },
      },
    );
  };
  const err = cancel.error;
  const pinError =
    err?.code === 'wrong_pin' || err?.code === 'pin_locked' || err?.code === 'owner_mode_locked'
      ? err.message
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">Cancelar la reserva</DialogTitle>
            <DialogDescription>
              {booking.client.shortName} · {booking.service.name} ·{' '}
              {dateTimeShort(booking.startsAt)}. Se reembolsa el 100% y le enviamos el motivo por
              correo.
            </DialogDescription>
          </DialogHeader>
          <Field label="Motivo" error={fieldError(err, 'reason')} hint="Lo leerá el cliente.">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="Ej. El barbero se enfermó y no podrá atender ese día."
              required
            />
          </Field>
          {!ownerMode && (
            <Field label="PIN del dueño" error={pinError} hint="Solo el dueño puede cancelar.">
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Volver
            </Button>
            <Button
              type="submit"
              variant="destructive-solid"
              disabled={
                cancel.isPending || reason.trim().length < 5 || (!ownerMode && pin.length < 4)
              }
            >
              Cancelar y reembolsar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Detalle de una reserva para recepción y dueño, con sus acciones. */
export function BookingDetail({ id }) {
  const q = useBooking(id);
  const noShow = useNoShow();
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (q.isLoading) return <LoadingList rows={4} itemClassName="h-10" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const b = q.data;
  const amount = b.payment?.amountCents ?? b.priceCents;

  const markNoShow = () =>
    noShow.mutate(b.id, {
      onSuccess: () => {
        toast.success(`${b.client.shortName} quedó como "no asistió"`);
        setConfirmNoShow(false);
      },
      onError: (err) => {
        toast.error(err.message);
        setConfirmNoShow(false);
      },
    });

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-extrabold">Reserva de {b.client.shortName}</h2>
        <StateChip status={b.status} />
      </div>
      <dl className="mt-4">
        <DetailRow label="Cliente">
          {b.client.firstName} {b.client.lastName}
        </DetailRow>
        <DetailRow label="Teléfono">
          {b.client.phone ? (
            <a href={`tel:${b.client.phone}`} className="hover:underline">
              {phone(b.client.phone)}
            </a>
          ) : (
            '—'
          )}
        </DetailRow>
        <DetailRow label="Correo">{b.client.email}</DetailRow>
        <DetailRow label="Servicio">{b.service.name}</DetailRow>
        <DetailRow label="Con">{b.resource.name}</DetailRow>
        <DetailRow label="Fecha">{whenText(b)}</DetailRow>
        {b.status === 'cancelled' && (
          <>
            <DetailRow label="Canceló">
              {b.cancelledBy === 'business' ? 'El negocio' : 'El cliente'}
            </DetailRow>
            {b.cancellationReason && <DetailRow label="Motivo">{b.cancellationReason}</DetailRow>}
          </>
        )}
        {b.review && (
          <DetailRow label="Reseña">
            <span className="inline-flex items-center gap-1">
              <Star className="size-4 fill-star text-star" /> {b.review.rating}
            </span>
          </DetailRow>
        )}
      </dl>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-4">
        <span className="font-bold">Monto</span>
        <span className="flex items-center gap-2">
          {b.payment && <PaymentChip status={b.payment.status} size="sm" />}
          <span className="text-xl font-extrabold">{moneyMXN(amount)}</span>
        </span>
      </div>

      {b.status === 'no_show' && (
        <Notice className="mt-4">El cliente no asistió. Lo cobrado no se reembolsa.</Notice>
      )}
      {b.actions.accept && (
        <Notice kind="warn" icon={Inbox} className="mt-4">
          Esta reserva todavía es una solicitud.{' '}
          <ButtonLink to="/negocio/solicitudes" variant="link" className="h-auto text-[13px]">
            Responder en Solicitudes
          </ButtonLink>
        </Notice>
      )}

      {(b.actions.noShow || b.actions.cancel) && (
        <div className="mt-5 flex flex-wrap gap-2">
          {b.actions.noShow && (
            <Button variant="outline" onClick={() => setConfirmNoShow(true)}>
              <UserX /> No asistió
            </Button>
          )}
          {b.actions.cancel && (
            <Button variant="destructive" onClick={() => setCancelOpen(true)}>
              <Ban /> Cancelar reserva
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmNoShow}
        onOpenChange={setConfirmNoShow}
        title={`¿${b.client.shortName} no asistió?`}
        description="La cita queda marcada como no asistió. No se cobra nada extra y lo cobrado no se reembolsa."
        confirmLabel="Sí, no asistió"
        busy={noShow.isPending}
        onConfirm={markNoShow}
      />
      {b.actions.cancel && (
        <CancelBookingDialog booking={b} open={cancelOpen} onOpenChange={setCancelOpen} />
      )}
    </div>
  );
}

/** Hoja lateral (computadora) o inferior (celular) con el detalle de una reserva. */
export function BookingSheet({ id, onClose }) {
  const desktop = useIsDesktop('(min-width: 768px)');
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={desktop ? 'right' : 'bottom'}
        className={cn(
          'overflow-y-auto p-5',
          desktop ? 'w-full sm:max-w-md' : 'max-h-[88dvh] rounded-t-2xl',
        )}
      >
        <SheetTitle className="sr-only">Detalle de la reserva</SheetTitle>
        {id && <BookingDetail id={id} />}
      </SheetContent>
    </Sheet>
  );
}

/** Tarjeta de un número del panel. */
export function StatCard({ label, value, icon: Icon, foot, footTone = 'muted' }) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        {Icon && (
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Icon className="size-[18px]" />
          </span>
        )}
      </div>
      <p className="mt-1 text-[28px] leading-9 font-extrabold tracking-tight">{value}</p>
      {foot && (
        <p
          className={cn(
            'mt-2 text-xs font-semibold',
            footTone === 'ok' && 'text-success',
            footTone === 'warn' && 'text-warning',
            footTone === 'error' && 'text-error',
            footTone === 'muted' && 'text-muted-foreground',
          )}
        >
          {foot}
        </p>
      )}
    </div>
  );
}

/** <select> nativo con el estilo de los campos (filtros). */
export function NativeSelect({ className, children, ...props }) {
  return (
    <select
      className={cn(
        'h-10 rounded-lg border border-field bg-white px-3 text-sm font-semibold outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
