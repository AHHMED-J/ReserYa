// Perfil del cliente: RF-66 (nombre, apellido, teléfono; correo solo lectura) y RF-67.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight, FileText, LogOut, ShieldCheck } from 'lucide-react';
import { api, fieldError } from '@/lib/api';
import { useMe, useLogout, ME_KEY } from '@/hooks/useAuth';
import { PageHeader } from '@/components/PageHeader';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/pages/auth/PasswordInput';

export default function Profile() {
  const { user } = useMe();
  const navigate = useNavigate();
  const logout = useLogout();
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageHeader title="Mi perfil" />
      <PersonalData user={user} />
      {user.hasPassword && <ChangePassword />}
      <section className="overflow-hidden rounded-xl border border-border">
        {[
          ['/privacidad', 'Aviso de privacidad', ShieldCheck],
          ['/terminos', 'Términos y condiciones', FileText],
        ].map(([to, label, Icon]) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 border-b border-border px-4 py-3.5 text-[15px] font-semibold last:border-b-0 hover:bg-surface"
          >
            <Icon className="size-5 text-muted-foreground" />{' '}
            <span className="flex-1">{label}</span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </Link>
        ))}
      </section>
      <Button
        variant="destructive"
        size="lg"
        className="w-full"
        disabled={logout.isPending}
        onClick={() =>
          logout.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) })
        }
      >
        <LogOut /> Cerrar sesión
      </Button>
    </div>
  );
}

function PersonalData({ user }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    phone: user.phone ?? '',
  });
  const m = useMutation({
    mutationFn: (body) => api('/me', { method: 'PATCH', body }),
    onSuccess: (r) => {
      qc.setQueryData(ME_KEY, { user: r.user });
      toast.success('Datos guardados');
    },
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="rounded-xl border border-border p-4 md:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate(f);
      }}
      noValidate
    >
      <h2 className="mb-4 text-lg font-extrabold">Tus datos</h2>
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
          />
        </Field>
        <Field label="Correo" hint="El correo no se puede cambiar.">
          <Input type="email" value={user.email} disabled readOnly />
        </Field>
      </div>
      {m.error && !m.error.details && (
        <Notice kind="error" className="mt-4">
          {m.error.message}
        </Notice>
      )}
      <Button type="submit" className="mt-5" disabled={m.isPending}>
        Guardar cambios
      </Button>
    </form>
  );
}

function ChangePassword() {
  const empty = { currentPassword: '', newPassword: '' };
  const [f, setF] = useState(empty);
  const m = useMutation({
    mutationFn: (body) => api('/me/password', { method: 'POST', body }),
    onSuccess: () => {
      setF(empty);
      toast.success('Contraseña actualizada');
    },
  });
  return (
    <form
      className="rounded-xl border border-border p-4 md:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate(f);
      }}
      noValidate
    >
      <h2 className="mb-4 text-lg font-extrabold">Cambiar contraseña</h2>
      <div className="space-y-4">
        <Field label="Contraseña actual" error={fieldError(m.error, 'currentPassword')}>
          <PasswordInput
            autoComplete="current-password"
            value={f.currentPassword}
            onChange={(e) => setF({ ...f, currentPassword: e.target.value })}
          />
        </Field>
        <Field
          label="Nueva contraseña"
          error={fieldError(m.error, 'newPassword')}
          hint="Mínimo 8 caracteres"
        >
          <PasswordInput
            autoComplete="new-password"
            value={f.newPassword}
            onChange={(e) => setF({ ...f, newPassword: e.target.value })}
          />
        </Field>
      </div>
      {m.error && !m.error.details && (
        <Notice kind="error" className="mt-4">
          {m.error.message}
        </Notice>
      )}
      <Button
        type="submit"
        variant="outline"
        className="mt-5"
        disabled={m.isPending || !f.currentPassword || !f.newPassword}
      >
        Cambiar contraseña
      </Button>
    </form>
  );
}
