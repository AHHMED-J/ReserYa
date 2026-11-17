import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, fieldError } from '@/lib/api';
import { useMe, ME_KEY } from '@/hooks/useAuth';
import { RequireAuth } from '@/components/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/Field';

/** Tras entrar con Google sin teléfono (RF-01). */
export default function CompleteProfile() {
  return (
    <RequireAuth roles={['client']}>
      <Form />
    </RequireAuth>
  );
}

function Form() {
  const { user } = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const [f, setF] = useState({
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    phone: user.phone ?? '',
  });
  const m = useMutation({
    mutationFn: (body) => api('/me', { method: 'PATCH', body }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ME_KEY });
      const next = params.get('next');
      navigate(next?.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
    },
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={(e) => (e.preventDefault(), m.mutate(f))} noValidate>
      <h1 className="text-2xl font-extrabold tracking-tight">Completa tu perfil</h1>
      <p className="mt-2 mb-6 text-[15px] text-muted-foreground">
        Necesitamos tu teléfono para que el negocio pueda contactarte si hay algún cambio.
      </p>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" error={fieldError(m.error, 'firstName')}>
            <Input value={f.firstName} onChange={set('firstName')} autoComplete="given-name" />
          </Field>
          <Field label="Apellido" error={fieldError(m.error, 'lastName')}>
            <Input value={f.lastName} onChange={set('lastName')} autoComplete="family-name" />
          </Field>
        </div>
        <Field label="Teléfono" error={fieldError(m.error, 'phone')}>
          <Input
            type="tel"
            inputMode="tel"
            value={f.phone}
            onChange={set('phone')}
            placeholder="646 123 4567"
            autoComplete="tel"
            autoFocus
          />
        </Field>
      </div>
      <Button type="submit" size="lg" className="mt-6 w-full" disabled={m.isPending}>
        Guardar y continuar
      </Button>
    </form>
  );
}
