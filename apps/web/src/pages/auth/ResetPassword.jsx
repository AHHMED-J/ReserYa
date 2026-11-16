import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { api, fieldError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ButtonLink';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { PasswordInput } from './PasswordInput';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const m = useMutation({
    mutationFn: (body) => api('/auth/reset-password', { method: 'POST', body }),
  });
  if (m.isSuccess)
    return (
      <div>
        <h1 className="text-2xl font-extrabold">Contraseña actualizada</h1>
        <p className="mt-2 text-muted-foreground">Cerramos tus otras sesiones por seguridad.</p>
        <ButtonLink to="/entrar" size="lg" className="mt-6 w-full">
          Iniciar sesión
        </ButtonLink>
      </div>
    );
  return (
    <form
      onSubmit={(e) => (
        e.preventDefault(),
        m.mutate({ token: params.get('token') ?? '', password })
      )}
      noValidate
    >
      <h1 className="text-2xl font-extrabold">Nueva contraseña</h1>
      <p className="mt-2 mb-6 text-[15px] text-muted-foreground">Mínimo 8 caracteres.</p>
      <Field label="Contraseña nueva" error={fieldError(m.error, 'password')}>
        <PasswordInput
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {m.error && !m.error.details && (
        <Notice kind="error" className="mt-4">
          {m.error.message}
        </Notice>
      )}
      <Button type="submit" size="lg" className="mt-6 w-full" disabled={m.isPending}>
        Guardar contraseña
      </Button>
    </form>
  );
}
