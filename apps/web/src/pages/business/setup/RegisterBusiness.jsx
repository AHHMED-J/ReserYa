// Registro de un negocio con clave (RF-10): paso 1 clave y cuenta, paso 2 datos del negocio.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { api, fieldError } from '@/lib/api';
import { ME_KEY } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { PageHeader } from '@/components/PageHeader';
import { PasswordInput } from '@/pages/auth/PasswordInput';
import { CategoryPicker } from '@/features/business-setup/components';
import { cn } from '@/lib/utils';

const STEP1_FIELDS = ['code', 'firstName', 'lastName', 'email', 'phone', 'password', 'acceptTerms'];
const STEP1_CODES = ['invalid_code', 'code_used', 'email_taken'];

/** Muestra la clave como ABCD-1234 mientras se escribe. */
const formatCode = (v) => {
  const raw = v
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
};

/** Error del campo, incluido el de la clave cuando el código de error no trae detalles. */
const errorFor = (err, field) => {
  if (!err) return undefined;
  if (field === 'code' && ['invalid_code', 'code_used'].includes(err.code)) return err.message;
  if (field === 'email' && err.code === 'email_taken') return err.message;
  return fieldError(err, field);
};

export default function RegisterBusiness() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({
    code: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    acceptTerms: false,
    businessName: '',
    categoryId: '',
    businessPhone: '',
    address: '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const check = useMutation({
    mutationFn: (body) => api('/business/register/check', { method: 'POST', body }),
    onSuccess: () => {
      setF((x) => ({ ...x, businessPhone: x.businessPhone || x.phone }));
      setStep(2);
    },
  });

  const reg = useMutation({
    mutationFn: (body) => api('/business/register', { method: 'POST', body }),
    onSuccess: (data) => {
      qc.setQueryData(ME_KEY, data);
      navigate('/negocio/estado', { replace: true });
    },
    onError: (err) => {
      // Si el problema es de la clave o de la cuenta, regresa al paso 1.
      const details = Object.keys(err.details ?? {});
      if (STEP1_CODES.includes(err.code) || details.some((k) => STEP1_FIELDS.includes(k)))
        setStep(1);
    },
  });

  const step1Body = () => ({
    code: f.code,
    firstName: f.firstName,
    lastName: f.lastName,
    email: f.email,
    phone: f.phone,
    password: f.password,
    acceptTerms: f.acceptTerms,
  });

  const err = step === 1 ? (check.error ?? reg.error) : reg.error;
  const generalError = err && !err.details && !STEP1_CODES.includes(err.code) ? err.message : null;

  return (
    <div>
      <PageHeader
        title="Registra tu negocio"
        subtitle={step === 1 ? 'Paso 1 de 2 · Tu clave y tu cuenta' : 'Paso 2 de 2 · Tu negocio'}
        back={step === 1 ? '/entrar' : undefined}
      />
      <div className="mb-6 flex gap-2" aria-hidden>
        {[1, 2].map((n) => (
          <span
            key={n}
            className={cn('h-1.5 flex-1 rounded-full', n <= step ? 'bg-primary' : 'bg-border')}
          />
        ))}
      </div>

      {step === 1 ? (
        <form
          onSubmit={(e) => (e.preventDefault(), reg.reset(), check.mutate(step1Body()))}
          noValidate
          className="space-y-4"
        >
          <Notice kind="blue" icon={KeyRound}>
            Para registrar un negocio necesitas una clave de registro. Pídesela al equipo de
            ReserYa.
          </Notice>
          <Field label="Clave de registro" error={errorFor(err, 'code')} hint="Ejemplo: ABCD-1234">
            <Input
              value={f.code}
              onChange={(e) => setF({ ...f, code: formatCode(e.target.value) })}
              placeholder="ABCD-1234"
              autoComplete="off"
              autoCapitalize="characters"
              className="font-mono tracking-widest uppercase"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" error={errorFor(err, 'firstName')}>
              <Input autoComplete="given-name" value={f.firstName} onChange={set('firstName')} />
            </Field>
            <Field label="Apellido" error={errorFor(err, 'lastName')}>
              <Input autoComplete="family-name" value={f.lastName} onChange={set('lastName')} />
            </Field>
          </div>
          <Field
            label="Correo"
            error={errorFor(err, 'email')}
            hint="Con este correo entran el dueño y la recepción."
          >
            <Input
              type="email"
              autoComplete="email"
              value={f.email}
              onChange={set('email')}
              placeholder="negocio@correo.com"
            />
          </Field>
          <Field label="Tu teléfono" error={errorFor(err, 'phone')}>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={f.phone}
              onChange={set('phone')}
              placeholder="646 123 4567"
            />
          </Field>
          <Field label="Contraseña" error={errorFor(err, 'password')}>
            <PasswordInput
              autoComplete="new-password"
              value={f.password}
              onChange={set('password')}
              placeholder="Mínimo 8 caracteres"
            />
          </Field>
          <div>
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
            {errorFor(err, 'acceptTerms') && (
              <p className="mt-2 text-xs font-semibold text-error">
                {errorFor(err, 'acceptTerms')}
              </p>
            )}
          </div>
          {generalError && <Notice kind="error">{generalError}</Notice>}
          <Button type="submit" size="lg" className="w-full" disabled={check.isPending}>
            Continuar
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{' '}
            <Link to="/entrar" className="font-bold text-primary">
              Inicia sesión
            </Link>
          </p>
        </form>
      ) : (
        <form
          onSubmit={(e) => (
            e.preventDefault(),
            reg.mutate({
              ...step1Body(),
              businessName: f.businessName,
              categoryId: f.categoryId,
              businessPhone: f.businessPhone,
              address: f.address,
            })
          )}
          noValidate
          className="space-y-4"
        >
          <Field label="Nombre del negocio" error={errorFor(err, 'businessName')}>
            <Input
              value={f.businessName}
              onChange={set('businessName')}
              placeholder="Barbería El Patrón"
              autoComplete="organization"
            />
          </Field>
          <fieldset>
            <legend className="mb-2 text-[13px] font-bold">Categoría</legend>
            <CategoryPicker
              value={f.categoryId}
              onChange={(categoryId) => setF({ ...f, categoryId })}
              invalid={Boolean(errorFor(err, 'categoryId'))}
            />
            {errorFor(err, 'categoryId') && (
              <p className="mt-2 text-xs font-semibold text-error">
                {f.categoryId ? errorFor(err, 'categoryId') : 'Elige una categoría'}
              </p>
            )}
          </fieldset>
          <Field
            label="Teléfono del negocio"
            error={errorFor(err, 'businessPhone')}
            hint="Lo verán tus clientes."
          >
            <Input
              type="tel"
              inputMode="tel"
              value={f.businessPhone}
              onChange={set('businessPhone')}
              placeholder="646 123 4567"
            />
          </Field>
          <Field label="Dirección" error={errorFor(err, 'address')}>
            <Input
              value={f.address}
              onChange={set('address')}
              placeholder="Av. Ruiz 123, Zona Centro, Ensenada"
              autoComplete="street-address"
            />
          </Field>
          {generalError && <Notice kind="error">{generalError}</Notice>}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => (reg.reset(), setStep(1))}
            >
              Atrás
            </Button>
            <Button type="submit" size="lg" className="flex-1" disabled={reg.isPending}>
              Enviar registro
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Revisaremos tus datos y te avisaremos por correo cuando tu negocio esté aprobado.
          </p>
        </form>
      )}
    </div>
  );
}
