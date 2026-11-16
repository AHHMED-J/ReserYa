// Crear un PIN nuevo con el enlace del correo (RF-08).
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { api, fieldError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ButtonLink } from '@/components/ButtonLink';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';

const onlyDigits = (v) => v.replace(/\D/g, '').slice(0, 6);

export default function ResetPin() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const m = useMutation({
    mutationFn: (body) => api('/business/owner/reset-pin', { method: 'POST', body }),
  });

  if (!token)
    return (
      <div>
        <h1 className="text-2xl font-extrabold">Enlace incompleto</h1>
        <p className="mt-2 text-muted-foreground">
          Abre el enlace completo del correo o pide uno nuevo desde el modo dueño.
        </p>
        <ButtonLink to="/negocio" size="lg" className="mt-6 w-full">
          Ir a mi negocio
        </ButtonLink>
      </div>
    );

  if (m.isSuccess)
    return (
      <div>
        <CircleCheck className="mb-3 size-10 text-success" />
        <h1 className="text-2xl font-extrabold">PIN actualizado</h1>
        <p className="mt-2 text-muted-foreground">
          Ya puedes entrar al modo dueño con tu PIN nuevo.
        </p>
        <ButtonLink to="/negocio/dueno" size="lg" className="mt-6 w-full">
          Ir al modo dueño
        </ButtonLink>
      </div>
    );

  const submit = (e) => {
    e.preventDefault();
    if (pin !== confirm) return setMismatch(true);
    setMismatch(false);
    m.mutate({ token, pin });
  };

  const pinInput = (value, onChange, autoFocus) => (
    <Input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(onlyDigits(e.target.value))}
      className="text-center text-xl tracking-[0.5em]"
      autoFocus={autoFocus}
    />
  );

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="text-2xl font-extrabold">Nuevo PIN del dueño</h1>
      <p className="mt-2 mb-6 text-[15px] text-muted-foreground">
        De 4 a 6 dígitos. Con él se desbloquean estadísticas, pagos y configuración.
      </p>
      <div className="space-y-4">
        <Field label="PIN nuevo" error={fieldError(m.error, 'pin')}>
          {pinInput(pin, setPin, true)}
        </Field>
        <Field label="Repite el PIN" error={mismatch ? 'Los PIN no coinciden' : undefined}>
          {pinInput(confirm, setConfirm)}
        </Field>
      </div>
      {m.error && !m.error.details && (
        <Notice kind="error" className="mt-4">
          {m.error.message}
        </Notice>
      )}
      <Button
        type="submit"
        size="lg"
        className="mt-6 w-full"
        disabled={pin.length < 4 || confirm.length < 4 || m.isPending}
      >
        Guardar PIN
      </Button>
    </form>
  );
}
