import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useLogin, homeFor } from '@/hooks/useAuth';
import { fieldError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { GoogleButton } from './GoogleButton';
import { PasswordInput } from './PasswordInput';

const OAUTH_ERRORS = {
  google_failed: 'No se pudo entrar con Google. Intenta de nuevo.',
  business_use_password: 'Las cuentas de negocio entran con correo y contraseña.',
  account_disabled: 'Esta cuenta está desactivada.',
};

export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = useLogin();
  const [form, setForm] = useState({ email: '', password: '' });
  const next = params.get('next');
  const oauthError = OAUTH_ERRORS[params.get('error')];

  const submit = (e) => {
    e.preventDefault();
    login.mutate(form, {
      onSuccess: ({ user }) => {
        const dest = next && user.role === 'client' ? next : homeFor(user);
        navigate(user.role === 'client' && !user.phone ? '/completar-perfil' : dest, {
          replace: true,
        });
      },
    });
  };
  const err = login.error;

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="text-[28px] font-extrabold tracking-tight">Inicia sesión</h1>
      <p className="mt-2 mb-6 text-[15px] text-muted-foreground">
        Reserva en barberías, canchas, consultorios y mucho más.
      </p>
      {oauthError && (
        <Notice kind="error" className="mb-4">
          {oauthError}
        </Notice>
      )}
      <GoogleButton next={next ?? '/'} />
      <div className="space-y-4">
        <Field label="Correo" error={fieldError(err, 'email')}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Contraseña">
          <PasswordInput
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-3 text-right">
        <Link to="/recuperar" className="text-[13px] font-bold text-primary">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
      {err && !err.details && (
        <Notice kind="error" className="mt-4">
          {err.message}
        </Notice>
      )}
      <Button type="submit" size="lg" className="mt-5 w-full" disabled={login.isPending}>
        Iniciar sesión
      </Button>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿No tienes cuenta?{' '}
        <Link
          to={`/registro${next ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="font-extrabold text-primary"
        >
          Regístrate
        </Link>
      </p>
      <p className="mt-3 text-center text-[13px] text-muted-foreground">
        ¿Tienes un negocio?{' '}
        <Link to="/negocio/registro" className="font-bold text-primary">
          Regístralo con tu clave
        </Link>
      </p>
    </form>
  );
}
