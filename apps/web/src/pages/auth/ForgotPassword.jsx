import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, fieldError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { PageHeader } from '@/components/PageHeader';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const m = useMutation({
    mutationFn: (body) => api('/auth/forgot-password', { method: 'POST', body }),
  });
  return (
    <form onSubmit={(e) => (e.preventDefault(), m.mutate({ email }))} noValidate>
      <PageHeader title="Recuperar contraseña" back="/entrar" />
      {m.isSuccess ? (
        <Notice kind="ok">
          Si <b>{email}</b> tiene una cuenta, te llegará un enlace para crear una contraseña nueva.
          Vence en 1 hora.
        </Notice>
      ) : (
        <>
          <p className="mb-5 text-[15px] text-muted-foreground">
            Escribe tu correo y te enviamos un enlace para crear una nueva.
          </p>
          <Field label="Correo" error={fieldError(m.error, 'email')}>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
            />
          </Field>
          {m.error && !m.error.details && (
            <Notice kind="error" className="mt-4">
              {m.error.message}
            </Notice>
          )}
          <Button type="submit" size="lg" className="mt-6 w-full" disabled={m.isPending}>
            Enviar enlace
          </Button>
        </>
      )}
    </form>
  );
}
