// Reglas de reserva (RF-19, RF-20) y cambio del PIN del dueño (RF-74). Modo dueño.
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Zap } from 'lucide-react';
import { api, fieldError } from '@/lib/api';
import { duration } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { PageHeader } from '@/components/PageHeader';
import { LoadingList, ErrorState } from '@/components/States';
import { useRules, useSetupMutation, RULES_KEY } from '@/features/business-setup/api';
import { OptionPills, Section } from '@/features/business-setup/components';
import { MIN_NOTICE, SLOT_INTERVALS } from '@/features/business-setup/constants';

/** Valores sugeridos para un negocio que todavía no guarda sus reglas. */
const DEFAULTS = {
  cancellationLimitHours: 12,
  minNoticeMinutes: 60,
  maxAdvanceDays: 30,
  slotIntervalMinutes: 30,
  bufferMinutes: 0,
  autoAccept: false,
};

/** 545 → "9:05" */
const clock = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

export default function Rules() {
  const q = useRules();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Reglas de reserva"
        subtitle="Cómo y cuándo te pueden reservar. Tus clientes ven la política de cancelación antes de enviar su solicitud."
      />
      {q.isLoading ? (
        <LoadingList rows={4} itemClassName="h-24" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <RulesForm rules={q.data.rules} />
      )}
      <ChangePin />
    </div>
  );
}

function RulesForm({ rules }) {
  const [f, setF] = useState(() =>
    Object.fromEntries(Object.entries(DEFAULTS).map(([k, def]) => [k, rules[k] ?? def])),
  );
  const save = useSetupMutation(
    (body) => api('/business/rules', { method: 'PUT', body }),
    [RULES_KEY],
    { onSuccess: () => toast.success('Reglas guardadas') },
  );
  const err = save.error;
  const num = (k) => (e) =>
    setF({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) });

  return (
    <form onSubmit={(e) => (e.preventDefault(), save.mutate(f))} noValidate className="space-y-6">
      {!rules.defined && (
        <Notice kind="warn">
          Todavía no guardas tus reglas. Te sugerimos unos valores: revísalos y guarda.
        </Notice>
      )}

      <Section title="Cancelación">
        <Field
          label="Tus clientes pueden cancelar hasta"
          error={fieldError(err, 'cancellationLimitHours')}
          hint={`Hasta ${f.cancellationLimitHours || 0} h antes de la cita con reembolso completo. Después ya no pueden cancelar.`}
        >
          <div className="flex items-center gap-3">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={168}
              value={f.cancellationLimitHours}
              onChange={num('cancellationLimitHours')}
              className="w-28"
            />
            <span className="text-sm font-semibold text-muted-foreground">horas antes</span>
          </div>
        </Field>
      </Section>

      <Section title="Cuándo se puede reservar">
        <div className="space-y-6">
          <div className="grid gap-2">
            <span className="text-[13px] font-bold">Anticipación mínima</span>
            <OptionPills
              label="Anticipación mínima"
              options={MIN_NOTICE}
              value={f.minNoticeMinutes}
              onChange={(v) => setF({ ...f, minNoticeMinutes: v })}
            />
            <p className="text-xs text-muted-foreground">
              {fieldError(err, 'minNoticeMinutes') ? (
                <span className="font-semibold text-error">
                  {fieldError(err, 'minNoticeMinutes')}
                </span>
              ) : (
                `Nadie puede pedir una cita que empiece en menos de ${duration(f.minNoticeMinutes)}.`
              )}
            </p>
          </div>
          <Field
            label="Anticipación máxima"
            error={fieldError(err, 'maxAdvanceDays')}
            hint="Hasta cuántos días en el futuro se puede reservar (de 1 a 180)."
          >
            <div className="flex items-center gap-3">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={180}
                value={f.maxAdvanceDays}
                onChange={num('maxAdvanceDays')}
                className="w-28"
              />
              <span className="text-sm font-semibold text-muted-foreground">días</span>
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Horarios">
        <div className="space-y-6">
          <div className="grid gap-2">
            <span className="text-[13px] font-bold">Los horarios empiezan cada</span>
            <OptionPills
              label="Intervalo entre horarios"
              options={SLOT_INTERVALS.map((v) => ({ value: v, label: `${v} min` }))}
              value={f.slotIntervalMinutes}
              onChange={(v) => setF({ ...f, slotIntervalMinutes: v })}
            />
            <p className="text-xs text-muted-foreground">
              {fieldError(err, 'slotIntervalMinutes') ? (
                <span className="font-semibold text-error">
                  {fieldError(err, 'slotIntervalMinutes')}
                </span>
              ) : (
                `Por ejemplo: ${[0, 1, 2].map((i) => clock(9 * 60 + i * f.slotIntervalMinutes)).join(', ')}…`
              )}
            </p>
          </div>
          <Field
            label="Tiempo libre entre citas"
            error={fieldError(err, 'bufferMinutes')}
            hint="Para limpiar o preparar el lugar. De 0 a 60 minutos."
          >
            <div className="flex items-center gap-3">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={60}
                step={5}
                value={f.bufferMinutes}
                onChange={num('bufferMinutes')}
                className="w-28"
              />
              <span className="text-sm font-semibold text-muted-foreground">minutos</span>
            </div>
          </Field>
        </div>
      </Section>

      <Section>
        <label className="flex items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Zap className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold">Aceptación automática</span>
            <span className="mt-0.5 block text-[13px] text-muted-foreground">
              El primer cliente que paga se queda con el horario sin que tengas que aceptarlo.
              Mientras paga, el horario queda apartado 10 minutos.
            </span>
          </span>
          <Switch
            checked={f.autoAccept}
            onCheckedChange={(autoAccept) => setF({ ...f, autoAccept })}
            className="mt-2"
          />
        </label>
      </Section>

      {err && !err.details && <Notice kind="error">{err.message}</Notice>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={save.isPending}>
          Guardar reglas
        </Button>
      </div>
    </form>
  );
}

const onlyDigits = (v) => v.replace(/\D/g, '').slice(0, 6);

function ChangePin() {
  const [f, setF] = useState({ currentPin: '', newPin: '', confirm: '' });
  const [mismatch, setMismatch] = useState(false);
  const m = useMutation({
    mutationFn: (body) => api('/business/owner/change-pin', { method: 'POST', body }),
    onSuccess: () => {
      toast.success('PIN cambiado');
      setF({ currentPin: '', newPin: '', confirm: '' });
    },
  });
  const submit = (e) => {
    e.preventDefault();
    if (f.newPin !== f.confirm) return setMismatch(true);
    setMismatch(false);
    m.mutate({ currentPin: f.currentPin, newPin: f.newPin });
  };
  const pinField = (k, label, error) => (
    <Field label={label} error={error}>
      <Input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: onlyDigits(e.target.value) })}
        className="tracking-[0.4em]"
      />
    </Field>
  );
  const currentError =
    fieldError(m.error, 'currentPin') ??
    (m.error?.code === 'wrong_pin' ? m.error.message : undefined);

  return (
    <Section
      title="PIN del dueño"
      description="Con este PIN se desbloquean estadísticas, pagos y configuración. Recepción no lo necesita."
      actions={<KeyRound className="size-5 text-muted-foreground" />}
    >
      <form onSubmit={submit} noValidate>
        <div className="grid gap-3 sm:grid-cols-3">
          {pinField('currentPin', 'PIN actual', currentError)}
          {pinField('newPin', 'PIN nuevo', fieldError(m.error, 'newPin'))}
          {pinField(
            'confirm',
            'Repite el PIN nuevo',
            mismatch ? 'Los PIN no coinciden' : undefined,
          )}
        </div>
        {m.error && !m.error.details && m.error.code !== 'wrong_pin' && (
          <Notice kind="error" className="mt-3">
            {m.error.message}
          </Notice>
        )}
        <Button
          type="submit"
          variant="outline-primary"
          className="mt-4"
          disabled={f.currentPin.length < 4 || f.newPin.length < 4 || m.isPending}
        >
          Cambiar PIN
        </Button>
      </form>
    </Section>
  );
}
