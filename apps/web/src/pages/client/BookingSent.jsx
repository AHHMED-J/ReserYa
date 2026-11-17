// Después de pagar: "Solicitud enviada" o "Reserva confirmada" (RF-26, RF-32).
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { CalendarCheck, CircleX, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { ButtonLink } from '@/components/ButtonLink';
import { Notice } from '@/components/Notice';
import { ErrorState, FullPageSpinner } from '@/components/States';
import { dayLong, money, time } from '@/lib/format';
import { useBooking, useInvalidateBookings } from '@/features/client/queries';
import { withResource } from '@/features/client/components';

export default function BookingSent() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const q = useBooking(id);
  const invalidate = useInvalidateBookings();
  const [confirming, setConfirming] = useState(Boolean(params.get('payment_intent')));
  const once = useRef(false);

  // Si Stripe tuvo que redirigir (p. ej. 3-D Secure), al volver se avisa a la API.
  useEffect(() => {
    if (!confirming || once.current) return;
    once.current = true;
    api(`/bookings/${id}/payment-confirmed`, { method: 'POST' })
      .catch(() => {})
      .finally(() => {
        invalidate();
        setConfirming(false);
      });
  }, [confirming, id, invalidate]);

  if (q.isLoading || confirming) return <FullPageSpinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} className="mt-6" />;
  const b = q.data;
  const confirmed = b.status === 'confirmed';
  const sent = b.status === 'pending' && b.submittedAt;

  let icon = <Send className="size-8" />;
  let title = 'Solicitud enviada';
  let tone = 'bg-primary-soft text-primary';
  if (confirmed) {
    icon = <CalendarCheck className="size-8" />;
    title = '¡Reserva confirmada!';
    tone = 'bg-success-soft text-success';
  } else if (!sent) {
    icon = <CircleX className="size-8" />;
    title = 'El pago no se completó';
    tone = 'bg-error-soft text-error';
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-8 text-center">
      <div className={`flex size-16 items-center justify-center rounded-full ${tone}`}>{icon}</div>
      <h1 className="mt-4 text-[26px] font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        {b.service.name} {withResource(b.resource)} en <b>{b.business.name}</b>
        <br />
        {dayLong(b.startsAt)} · {time(b.startsAt)} a {time(b.endsAt)}
      </p>
      <div className="mt-6 w-full text-left">
        {sent && (
          <Notice kind="blue">
            {b.business.name} tiene hasta el {dayLong(b.respondBy).toLowerCase()} a las{' '}
            {time(b.respondBy)} para responder. Solo apartamos {money(b.priceCents)} en tu tarjeta:
            se cobra cuando acepte y, si no responde, se libera. Te avisamos por correo.
          </Notice>
        )}
        {confirmed && (
          <Notice kind="ok">
            Se cobró {money(b.priceCents)}. Te mandamos la confirmación por correo.
          </Notice>
        )}
        {!confirmed && !sent && (
          <Notice kind="error">
            No pudimos confirmar tu pago, así que no se te cobró nada. Intenta reservar de nuevo.
          </Notice>
        )}
      </div>
      <div className="mt-6 flex w-full flex-col gap-2">
        <ButtonLink to={`/reservas/${b.id}`} size="lg">
          Ver mi reserva
        </ButtonLink>
        <ButtonLink to="/" variant="outline" size="lg">
          Volver al inicio
        </ButtonLink>
      </div>
    </div>
  );
}
