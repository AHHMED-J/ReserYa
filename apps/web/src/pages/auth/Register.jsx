import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, fieldError } from '@/lib/api';
import { ME_KEY } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { PageHeader } from '@/components/PageHeader';
import { GoogleButton } from './GoogleButton';
import { PasswordInput } from './PasswordInput';

export default function Register() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const [f, setF] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    acceptTerms: false,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const reg = useMutation({
    mutationFn: (body) => api('/auth/register', { method: 'POST', body }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ME_KEY });
      navigate(
        `/verificar-correo${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`,
        { replace: true },
      );
    },
  });
  const err = reg.error;

  return (
    <form onSubmit={(e) => (e.preventDefault(), reg.mutate(f))} noValidate>
      <PageHeader title="Crear cuenta" back="/entrar" />
      <GoogleButton next={params.get('next') ?? '/'} />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" error={fieldError(err, 'firstName')}>
            <Input
              autoComplete="given-name"
              value={f.firstName}
              onChange={set('firstName')}
              placeholder="Ana"
            />
          </Field>
          <Field label="Apellido" error={fieldError(err, 'lastName')}>
            <Input
              autoComplete="family-name"
              value={f.lastName}
              onChange={set('lastName')}
              placeholder="López"
            />
          </Field>
        </div>
        <Field label="Correo" error={fieldError(err, 'email')}>
          <Input
            type="email"
            autoComplete="email"
            value={f.email}
            onChange={set('email')}
            placeholder="tu@correo.com"
          />
        </Field>
        <Field
          label="Teléfono"
          error={fieldError(err, 'phone')}
          hint="El negocio lo usa para contactarte."
        >
          <Input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={f.phone}
            onChange={set('phone')}
            placeholder="646 123 4567"
          />
        </Field>
        <Field label="Contraseña" error={fieldError(err, 'password')}>
          <PasswordInput
            autoComplete="new-password"
            value={f.password}
            onChange={set('password')}
            placeholder="Mínimo 8 caracteres"
          />
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={f.acceptTerms}
            onCheckedChange={(v) => setF({ ...f, acceptTerms: Boolean(v) })}
            className="mt-0.5"
          />
          <span>
            Acepto los{' '}
            <Link to="/terminos" target="_blank" className="font-bold text-primary">
              términos
            </Link>{' '}
            y el{' '}
            <Link to="/privacidad" target="_blank" className="font-bold text-primary">
              aviso de privacidad
            </Link>
          </span>
        </label>
        {fieldError(err, 'acceptTerms') && (
          <p className="text-xs font-semibold text-error">{fieldError(err, 'acceptTerms')}</p>
        )}
      </div>
      {err && !err.details && (
        <Notice kind="error" className="mt-4">
          {err.message}
        </Notice>
      )}
      <Button type="submit" size="lg" className="mt-6 w-full" disabled={reg.isPending}>
        Crear cuenta
      </Button>
    </form>
  );
}
