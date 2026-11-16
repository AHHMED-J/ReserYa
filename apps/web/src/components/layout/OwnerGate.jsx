import { useState } from 'react';
import { Outlet } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useMe, ME_KEY } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';

/**
 * Protege las rutas del modo dueño (RF-07): sin desbloquear, pide el PIN.
 * Si el negocio todavía no tiene PIN, pide crearlo.
 */
export function OwnerGate() {
  const { user } = useMe();
  if (user?.business?.ownerMode) return <Outlet />;
  return <PinForm hasPin={user?.business?.hasPin} />;
}

function PinForm({ hasPin }) {
  const qc = useQueryClient();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!hasPin) await api('/business/owner/pin', { method: 'POST', body: { pin } });
      await api('/business/owner/unlock', { method: 'POST', body: { pin } });
      await qc.invalidateQueries({ queryKey: ME_KEY });
    } catch (err) {
      setError(
        err.code === 'wrong_pin' && err.details?.attemptsLeft
          ? `PIN incorrecto. Quedan ${err.details.attemptsLeft} intentos.`
          : err.message,
      );
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    await api('/business/owner/forgot-pin', { method: 'POST' });
    setSent(true);
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-border bg-white p-6 text-center"
      >
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Lock className="size-6" />
        </div>
        <h1 className="text-xl font-extrabold">{hasPin ? 'Modo dueño' : 'Crea tu PIN de dueño'}</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          {hasPin
            ? 'Escribe tu PIN de 4 a 6 dígitos para ver estadísticas, pagos y configuración.'
            : 'Con este PIN se desbloquean las funciones privadas. Recepción no lo necesita.'}
        </p>
        <Field label="PIN" error={error} className="text-left">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="text-center text-xl tracking-[0.5em]"
            autoFocus
          />
        </Field>
        <Button type="submit" size="lg" className="mt-4 w-full" disabled={pin.length < 4 || busy}>
          {hasPin ? 'Desbloquear' : 'Guardar PIN y entrar'}
        </Button>
        {hasPin &&
          (sent ? (
            <Notice kind="ok" className="mt-4 text-left">
              Te enviamos un enlace al correo del negocio para crear un PIN nuevo.
            </Notice>
          ) : (
            <button
              type="button"
              onClick={forgot}
              className="mt-4 text-[13px] font-bold text-primary"
            >
              ¿Olvidaste tu PIN? Te enviamos un correo
            </button>
          ))}
      </form>
    </div>
  );
}
