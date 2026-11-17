// Pago del flujo de reservar: Stripe Elements o pago simulado (RF-26, RF-32).
import { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Lock, Timer } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/Notice';
import { Spinner } from '@/components/States';
import { money } from '@/lib/format';

const stripeCache = new Map();
const getStripe = (key) => {
  if (!stripeCache.has(key)) stripeCache.set(key, loadStripe(key));
  return stripeCache.get(key);
};

const appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#0A7DB2',
    colorText: '#0E1A26',
    colorDanger: '#C23A3A',
    borderRadius: '12px',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Avisa a la API que Stripe ya autorizó. Reintenta un poco por si Stripe tarda en reflejarlo. */
async function confirmWithApi(bookingId) {
  for (let i = 0; ; i++) {
    try {
      return await api(`/bookings/${bookingId}/payment-confirmed`, { method: 'POST' });
    } catch (e) {
      if (e.code !== 'payment_not_authorized' || i >= 3) throw e;
      await wait(1500);
    }
  }
}

/**
 * Formulario de pago. mode: 'stripe' | 'fake'.
 * onPaid() al terminar; onError(error) si la API rechaza (p. ej. booking_expired).
 */
export function PaymentForm({
  mode,
  publishableKey,
  clientSecret,
  bookingId,
  label,
  onPaid,
  onError,
}) {
  if (mode === 'stripe' && publishableKey && clientSecret) {
    return (
      <Elements
        stripe={getStripe(publishableKey)}
        options={{ clientSecret, appearance, locale: 'es-419' }}
      >
        <StripeForm bookingId={bookingId} label={label} onPaid={onPaid} onError={onError} />
      </Elements>
    );
  }
  return <FakeForm bookingId={bookingId} label={label} onPaid={onPaid} onError={onError} />;
}

function StripeForm({ bookingId, label, onPaid, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setMessage(null);
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}/reservas/${bookingId}/enviada` },
    });
    if (error) {
      setMessage(error.message ?? 'No se pudo autorizar el pago. Revisa tu tarjeta.');
      setBusy(false);
      return;
    }
    try {
      await confirmWithApi(bookingId);
      onPaid();
    } catch (err) {
      setBusy(false);
      onError(err);
    }
  };
  return (
    <form onSubmit={submit}>
      <h2 className="mb-3 text-lg font-extrabold">Pago con tarjeta</h2>
      <PaymentElement
        options={{ layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never' } }}
      />
      {message && (
        <Notice kind="error" className="mt-3">
          {message}
        </Notice>
      )}
      <Button type="submit" size="lg" className="mt-5 w-full" disabled={!stripe || busy}>
        {busy && <Spinner className="size-4 text-white" />}
        {label}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Pagos procesados de forma segura por Stripe
      </p>
    </form>
  );
}

function FakeForm({ bookingId, label, onPaid, onError }) {
  const [busy, setBusy] = useState(false);
  const pay = async () => {
    setBusy(true);
    try {
      await api(`/bookings/${bookingId}/fake-pay`, { method: 'POST' });
      onPaid();
    } catch (err) {
      setBusy(false);
      onError(err);
    }
  };
  return (
    <div>
      <h2 className="mb-3 text-lg font-extrabold">Pago</h2>
      <Notice kind="warn">
        <b>Modo de prueba.</b> Stripe no está configurado: el pago es simulado, no se pide tarjeta y
        no se cobra dinero real.
      </Notice>
      <Button type="button" size="lg" className="mt-5 w-full" disabled={busy} onClick={pay}>
        {busy && <Spinner className="size-4 text-white" />}
        {label} (prueba)
      </Button>
    </div>
  );
}

/** Nota bajo el pago: cuándo se cobra. */
export function ChargeNote({ autoAccept, priceCents }) {
  return (
    <p className="mt-4 flex gap-2 text-[13px] leading-5 text-muted-foreground">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
      {autoAccept
        ? `Al pagar se cobra ${money(priceCents)} y tu cita queda confirmada al momento.`
        : 'Todavía no se te cobra: solo apartamos el monto. Se cobra cuando el negocio acepte; si no responde a tiempo, se libera.'}
    </p>
  );
}

/** Contador del apartado de 10 min (RF-32). */
export function HoldCountdown({ until, onExpire }) {
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, new Date(until).getTime() - now);
  useEffect(() => {
    if (left <= 0) {
      onExpire?.();
      return;
    }
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [left, onExpire]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <Notice kind={left < 120_000 ? 'warn' : 'blue'} icon={Timer}>
      Apartamos tu horario por{' '}
      <b className="tabular-nums" aria-live="off">
        {m}:{String(s).padStart(2, '0')}
      </b>{' '}
      min mientras pagas.
    </Notice>
  );
}
