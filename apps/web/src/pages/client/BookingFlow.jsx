// Flujo de reservar (pantallas 05 y 06): servicio → persona/espacio → fecha y hora → confirmar
// y pagar. 4 pasos (RNF-03). RF-25, RF-26, RF-27, RF-32, RF-60.
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Clock,
  MailWarning,
  PhoneMissed,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useMe } from '@/hooks/useAuth';
import { useConfig } from '@/hooks/useConfig';
import { Photo } from '@/components/Photo';
import { Notice } from '@/components/Notice';
import { ButtonLink } from '@/components/ButtonLink';
import { EmptyState, ErrorState, FullPageSpinner, LoadingList, Spinner } from '@/components/States';
import { Button } from '@/components/ui/button';
import {
  DateTime,
  TZ,
  dayShort,
  duration,
  money,
  moneyMXN,
  time,
  todayISO,
  weekdayShort,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { useBusiness, useDays, useInvalidateBookings, useSlots } from '@/features/client/queries';
import { StepBar, withResource } from '@/features/client/components';
import { ChargeNote, HoldCountdown, PaymentForm } from '@/features/client/payment';

const TOTAL = 4;
const TITLES = {
  1: 'Elige el servicio',
  2: '¿Con quién?',
  3: 'Elige fecha y hora',
  4: 'Confirma y paga',
};

export default function BookingFlow() {
  const { id } = useParams();
  const { user } = useMe();
  const q = useBusiness(id);
  if (!user.emailVerified)
    return (
      <Gate
        icon={MailWarning}
        title="Verifica tu correo para reservar"
        text="Te mandamos un enlace a tu correo. Ábrelo para confirmar tu cuenta y vuelve aquí."
        action={{ label: 'Verificar mi correo', to: '/verificar-correo' }}
      />
    );
  if (!user.profileComplete)
    return (
      <Gate
        icon={PhoneMissed}
        title="Agrega tu teléfono para reservar"
        text="El negocio lo necesita por si hay algún cambio con tu cita."
        action={{ label: 'Agregar teléfono', to: '/completar-perfil' }}
      />
    );
  if (q.isLoading) return <FullPageSpinner />;
  if (q.isError)
    return q.error.status === 404 ? (
      <Gate
        icon={CalendarX}
        title="Este negocio no está disponible"
        text="Puede que ya no reciba reservas."
        action={{ label: 'Buscar negocios', to: '/buscar' }}
      />
    ) : (
      <ErrorState error={q.error} onRetry={q.refetch} className="mt-6" />
    );
  return <Flow b={q.data} />;
}

function Gate({ icon, title, text, action }) {
  return (
    <div className="mx-auto max-w-xl">
      <EmptyState icon={icon} title={title} text={text} action={action} className="mt-8" />
    </div>
  );
}

const resourcesFor = (b, serviceId) => b.resources.filter((r) => r.serviceIds.includes(serviceId));

function initialState(b, params) {
  const service = b.services.find((s) => s.id === params.get('serviceId'));
  if (!service) return { serviceId: null, resourceId: null, step: 1 };
  const options = resourcesFor(b, service.id);
  const fromUrl = options.find((r) => r.id === params.get('resourceId'));
  if (fromUrl) return { serviceId: service.id, resourceId: fromUrl.id, step: 3 };
  if (options.length === 1) return { serviceId: service.id, resourceId: options[0].id, step: 3 };
  return { serviceId: service.id, resourceId: null, step: 2 };
}

function Flow({ b }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: config } = useConfig();
  const invalidate = useInvalidateBookings();
  const init = useMemo(() => initialState(b, params), [b, params]);
  const [step, setStep] = useState(init.step);
  const [serviceId, setServiceId] = useState(init.serviceId);
  // null = todavía no elige; 'any' = cualquiera.
  const [resourceId, setResourceId] = useState(init.resourceId);
  const [date, setDate] = useState(null);
  const [slot, setSlot] = useState(null);
  const [draft, setDraft] = useState(null);
  const [blocker, setBlocker] = useState(null);
  const rebookedFromId = params.get('rebook');

  const service = b.services.find((s) => s.id === serviceId);
  const options = service ? resourcesFor(b, service.id) : [];
  const chosenId = draft?.booking.resourceId ?? (resourceId !== 'any' ? resourceId : null);
  const chosen = b.resources.find((r) => r.id === chosenId);
  const isSpace = options.length > 0 && options.every((r) => r.kind === 'space');

  const create = useMutation({
    mutationFn: () =>
      api('/bookings', {
        method: 'POST',
        body: {
          serviceId,
          resourceId: resourceId === 'any' ? null : resourceId,
          startsAt: slot.startsAt,
          rebookedFromId: rebookedFromId || null,
        },
      }),
    onSuccess: (r) => {
      setDraft(r);
      setBlocker(null);
      setStep(4);
    },
    onError: (e) => {
      if (e.code === 'slot_taken') {
        toast.error('Ese horario se acaba de ocupar. Elige otro.');
        setSlot(null);
        invalidate();
      } else setBlocker(e);
    },
  });

  const discardDraft = useCallback(() => {
    if (draft) api(`/bookings/${draft.booking.id}/cancel`, { method: 'POST' }).catch(() => {});
    setDraft(null);
  }, [draft]);

  const back = () => {
    setBlocker(null);
    if (step === 4) {
      discardDraft();
      setSlot(null);
      invalidate();
      return setStep(3);
    }
    if (step === 3) return setStep(options.length > 1 ? 2 : 1);
    if (step === 2) return setStep(1);
    navigate(`/negocios/${b.id}`);
  };

  const pickService = (s) => {
    setServiceId(s.id);
    setSlot(null);
    setDate(null);
    const opts = resourcesFor(b, s.id);
    if (opts.length === 1) {
      setResourceId(opts[0].id);
      setStep(3);
    } else {
      setResourceId(null);
      setStep(2);
    }
  };

  const onPaid = () => {
    invalidate();
    navigate(`/reservas/${draft.booking.id}/enviada`, { replace: true });
  };
  const onPayError = (e) => {
    if (e.code === 'booking_expired') {
      toast.error(e.message);
      setDraft(null);
      setSlot(null);
      invalidate();
      setStep(3);
    } else toast.error(e.message);
  };
  const onHoldExpired = useCallback(() => {
    toast.error('Se acabó el tiempo para pagar. Elige el horario otra vez.');
    setDraft(null);
    setSlot(null);
    invalidate();
    setStep(3);
  }, [invalidate]);

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={back}
          aria-label="Regresar"
          className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface"
        >
          <ChevronLeft className="size-6" />
        </button>
        <h1 className="text-xl font-extrabold tracking-tight">
          {step === 2 && isSpace ? 'Elige el espacio' : TITLES[step]}
        </h1>
      </div>
      <StepBar step={step} total={TOTAL} />

      {step > 1 && service && step < 4 && (
        <ServiceSummary
          b={b}
          service={service}
          resource={step === 3 ? chosen : null}
          any={resourceId === 'any' && step === 3}
        />
      )}

      {step === 1 && (
        <ul className="space-y-2.5">
          {b.services.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => pickService(s)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border bg-white p-4 text-left hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring',
                  s.id === serviceId ? 'border-primary' : 'border-border',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{s.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <Clock className="size-3.5" /> {duration(s.durationMin)}
                  </p>
                </div>
                <span className="font-bold">{money(s.priceCents)}</span>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {step === 2 && service && (
        <ul className="space-y-2.5">
          {[{ id: 'any' }, ...options].map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setResourceId(r.id);
                  setSlot(null);
                  setStep(3);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border bg-white p-3.5 text-left hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring',
                  r.id === resourceId ? 'border-primary' : 'border-border',
                )}
              >
                {r.id === 'any' ? (
                  <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Users className="size-5" />
                  </span>
                ) : (
                  <span
                    className="flex size-11 items-center justify-center rounded-full text-base font-extrabold text-white"
                    style={{ backgroundColor: r.color }}
                    aria-hidden
                  >
                    {r.name[0]}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{r.id === 'any' ? 'Cualquiera' : r.name}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {r.id === 'any'
                      ? isSpace
                        ? 'El primero que esté libre'
                        : 'Quien esté libre a la hora que elijas'
                      : r.title}
                  </p>
                </div>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {step === 3 && service && (
        <DateTimeStep
          b={b}
          service={service}
          resourceId={resourceId}
          date={date}
          setDate={(d) => {
            setDate(d);
            setSlot(null);
          }}
          slot={slot}
          setSlot={setSlot}
          blocker={blocker}
          busy={create.isPending}
          onContinue={() => create.mutate()}
        />
      )}

      {step === 4 && draft && (
        <ConfirmStep
          b={b}
          service={service}
          resource={chosen}
          draft={draft}
          config={config}
          onPaid={onPaid}
          onPayError={onPayError}
          onHoldExpired={onHoldExpired}
        />
      )}
    </div>
  );
}

function ServiceSummary({ b, service, resource, any }) {
  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl border border-border p-3.5">
      <Photo
        icon={b.category.icon}
        url={b.photos[0]?.url}
        className="size-11 shrink-0 rounded-lg"
        iconClassName="size-5"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{service.name}</p>
        <p className="truncate text-[13px] text-muted-foreground">
          {b.name}
          {resource ? ` · ${withResource(resource)}` : any ? ' · Cualquiera' : ''}
        </p>
      </div>
      <div className="text-right">
        <p className="font-bold">{money(service.priceCents)}</p>
        <p className="text-[13px] text-muted-foreground">{duration(service.durationMin)}</p>
      </div>
    </div>
  );
}

const startOfWeek = (iso) => {
  const d = DateTime.fromISO(iso, { zone: TZ });
  return d.minus({ days: d.weekday - 1 }).toISODate();
};
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function DateTimeStep({
  b,
  service,
  resourceId,
  date,
  setDate,
  slot,
  setSlot,
  blocker,
  busy,
  onContinue,
}) {
  const rid = resourceId === 'any' ? undefined : resourceId;
  const today = todayISO();
  const span = Math.min(b.rules.maxAdvanceDays + 1, 62);
  const days = useDays(b.id, { serviceId: service.id, resourceId: rid, from: today, days: span });
  const available = useMemo(
    () => new Map((days.data?.days ?? []).map((d) => [d.date, d.available])),
    [days.data],
  );
  const firstAvailable = days.data?.days.find((d) => d.available)?.date;
  const selected = date ?? firstAvailable ?? null;
  const [week, setWeek] = useState(null);
  const weekStart = week ?? startOfWeek(selected ?? today);
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    DateTime.fromISO(weekStart, { zone: TZ }).plus({ days: i }).toISODate(),
  );
  const lastDate = days.data?.maxDate ?? today;
  const canPrev = weekStart > startOfWeek(today);
  const canNext = DateTime.fromISO(weekStart).plus({ days: 7 }).toISODate() <= lastDate;
  const slots = useSlots(
    b.id,
    { serviceId: service.id, resourceId: rid, date: selected },
    Boolean(selected),
  );
  const list = slots.data?.slots ?? [];
  const groups = [
    ['Mañana', list.filter((s) => s.time < '12:00')],
    ['Tarde', list.filter((s) => s.time >= '12:00' && s.time < '19:00')],
    ['Noche', list.filter((s) => s.time >= '19:00')],
  ].filter(([, g]) => g.length);
  const noticeH = b.rules.minNoticeMinutes / 60;

  if (days.isLoading) return <LoadingList rows={3} itemClassName="h-16" />;
  if (days.isError) return <ErrorState error={days.error} onRetry={days.refetch} />;
  if (!firstAvailable)
    return (
      <EmptyState
        icon={CalendarX}
        title="No hay horarios disponibles"
        text="Este servicio no tiene lugares libres en los próximos días. Prueba con otra persona u otro servicio."
      />
    );

  return (
    <div className="pb-24">
      <div className="mb-3 flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          aria-label="Semana anterior"
          disabled={!canPrev}
          onClick={() => setWeek(DateTime.fromISO(weekStart).minus({ days: 7 }).toISODate())}
        >
          <ChevronLeft />
        </Button>
        <p className="text-base font-extrabold">
          {cap(DateTime.fromISO(weekStart, { zone: TZ }).plus({ days: 3 }).toFormat('LLLL yyyy'))}
        </p>
        <Button
          variant="outline"
          size="icon"
          aria-label="Semana siguiente"
          disabled={!canNext}
          onClick={() => setWeek(DateTime.fromISO(weekStart).plus({ days: 7 }).toISODate())}
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Días">
        {weekDays.map((d) => {
          const ok = available.get(d) === true;
          const on = d === selected;
          return (
            <button
              key={d}
              type="button"
              disabled={!ok}
              aria-pressed={on}
              aria-label={`${dayShort(d)}${ok ? '' : ', sin horarios'}`}
              onClick={() => setDate(d)}
              className={cn(
                'flex h-16 flex-col items-center justify-center rounded-lg border text-center focus-visible:ring-2 focus-visible:ring-ring',
                on
                  ? 'border-primary bg-primary text-white'
                  : ok
                    ? 'border-field bg-white hover:bg-surface'
                    : 'border-transparent bg-surface text-disabled',
              )}
            >
              <span className="text-xs font-semibold">{weekdayShort(d)}</span>
              <span className="text-lg leading-6 font-extrabold">
                {DateTime.fromISO(d).toFormat('d')}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 mb-3 flex items-center justify-between">
        <h2 className="text-lg font-extrabold">Horarios disponibles</h2>
        {selected && <span className="text-sm text-muted-foreground">{dayShort(selected)}</span>}
      </div>
      {slots.isLoading && <LoadingList rows={2} itemClassName="h-12" />}
      {slots.isError && <ErrorState error={slots.error} onRetry={slots.refetch} />}
      {slots.isSuccess && list.length === 0 && (
        <Notice>Ya no quedan horarios este día. Elige otro.</Notice>
      )}
      <div className="space-y-4">
        {groups.map(([label, g]) => (
          <div key={label}>
            <p className="mb-2 text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase">
              {label}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {g.map((s) => {
                const on = slot?.startsAt === s.startsAt;
                return (
                  <button
                    key={s.startsAt}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSlot(s)}
                    className={cn(
                      'h-12 rounded-lg border text-[15px] font-bold tabular-nums focus-visible:ring-2 focus-visible:ring-ring',
                      on
                        ? 'border-primary bg-primary text-white'
                        : 'border-field bg-white hover:bg-surface',
                    )}
                  >
                    {s.time}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <Notice className="mt-5">
        Puedes reservar desde {noticeH >= 1 ? `${noticeH} h` : `${b.rules.minNoticeMinutes} min`}{' '}
        antes y hasta {b.rules.maxAdvanceDays} días adelante.
      </Notice>
      {blocker && <BlockerNotice error={blocker} />}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            {slot ? (
              <>
                <p className="text-[17px] font-extrabold">
                  {dayShort(slot.startsAt)} · {time(slot.startsAt)}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  Termina a las{' '}
                  {time(DateTime.fromISO(slot.startsAt).plus({ minutes: service.durationMin }))}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Elige un horario</p>
            )}
          </div>
          <Button size="lg" className="w-40" disabled={!slot || busy} onClick={onContinue}>
            {busy && <Spinner className="size-4 text-white" />}
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}

function BlockerNotice({ error }) {
  if (error.code === 'too_many_requests')
    return (
      <Notice kind="warn" className="mt-4">
        {error.message}{' '}
        <ButtonLink to="/reservas?tab=pending" variant="link" className="text-[13px]">
          Ver mis pendientes
        </ButtonLink>
      </Notice>
    );
  if (error.code === 'email_not_verified')
    return (
      <Notice kind="warn" className="mt-4">
        {error.message}.{' '}
        <ButtonLink to="/verificar-correo" variant="link" className="text-[13px]">
          Verificar correo
        </ButtonLink>
      </Notice>
    );
  if (error.code === 'profile_incomplete')
    return (
      <Notice kind="warn" className="mt-4">
        {error.message}.{' '}
        <ButtonLink to="/completar-perfil" variant="link" className="text-[13px]">
          Agregar teléfono
        </ButtonLink>
      </Notice>
    );
  return (
    <Notice kind="error" className="mt-4">
      {error.message}
    </Notice>
  );
}

function ConfirmStep({ b, service, resource, draft, config, onPaid, onPayError, onHoldExpired }) {
  const { booking, payment } = draft;
  const hold = booking.status === 'hold';
  const limit = b.rules.cancellationLimitHours;
  const deadline = DateTime.fromISO(booking.startsAt).minus({ hours: limit });
  const deadlineInPast = deadline < DateTime.now();
  const label = `${hold ? 'Pagar y confirmar' : 'Enviar solicitud'} · ${money(booking.priceCents)}`;
  return (
    <div className="space-y-4 pb-6">
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center gap-3">
          <Photo
            icon={b.category.icon}
            url={b.photos[0]?.url}
            className="size-12 shrink-0 rounded-lg"
            iconClassName="size-5"
          />
          <div className="min-w-0">
            <p className="truncate font-bold">{b.name}</p>
            {b.address && <p className="truncate text-[13px] text-muted-foreground">{b.address}</p>}
          </div>
        </div>
        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <Row label="Servicio" value={service.name} />
          {resource && (
            <Row label={resource.kind === 'space' ? 'Lugar' : 'Con'} value={resource.name} />
          )}
          <Row
            label="Fecha"
            value={`${dayShort(booking.startsAt)} · ${time(booking.startsAt)} a ${time(booking.endsAt)}`}
          />
        </dl>
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="font-bold">Total</span>
          <span className="text-xl font-extrabold">{moneyMXN(booking.priceCents)}</span>
        </div>
      </div>

      <Notice kind="blue">
        {deadlineInPast
          ? `Tu cita es en menos de ${limit} h: una vez confirmada ya no se podrá cancelar con reembolso.`
          : `Cancelación gratis hasta el ${dayShort(deadline).toLowerCase()} a las ${time(deadline)} (${limit} h antes de tu cita).`}
      </Notice>
      {hold && <HoldCountdown until={booking.holdExpiresAt} onExpire={onHoldExpired} />}

      <div className="pt-2">
        <PaymentForm
          mode={payment.mode}
          publishableKey={config?.stripePublishableKey}
          clientSecret={payment.clientSecret}
          bookingId={booking.id}
          label={label}
          onPaid={onPaid}
          onError={onPayError}
        />
        <ChargeNote autoAccept={hold} priceCents={booking.priceCents} />
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
