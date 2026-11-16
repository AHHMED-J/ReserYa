// Google Calendar del negocio (RF-39 a RF-43, RF-70). Solo modo dueño.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  CalendarCheck,
  CalendarX,
  CircleAlert,
  Phone,
  RefreshCw,
  Share2,
  Unplug,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { Chip } from '@/components/Chip';
import { LoadingList, ErrorState, Spinner } from '@/components/States';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GoogleIcon } from '@/pages/auth/GoogleButton';
import { agoText, dateTimeShort, dayLong } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  CONNECT_ERRORS,
  CONNECT_URL,
  useCalendarStatus,
  useDisconnectCalendar,
  useSyncNow,
} from '@/features/calendar/hooks';

export default function GoogleCalendar() {
  const status = useCalendarStatus();
  useReturnToast(status.refetch);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Google Calendar"
        subtitle="Tus citas de ReserYa en el calendario de cada persona o espacio."
      />
      {status.isLoading ? (
        <LoadingList rows={3} itemClassName="h-32" />
      ) : status.isError ? (
        <ErrorState error={status.error} onRetry={status.refetch} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            {!status.data.enabled && <DeveloperNotice />}
            <ConnectionCard data={status.data} />
            <ResourcesCard data={status.data} />
            {status.data.connected && <JobsCard data={status.data} />}
          </div>
          <HowItWorks />
        </div>
      )}
    </div>
  );
}

/** Toast al regresar de Google con ?connected=1 o ?error=... */
function useReturnToast(refetch) {
  const [params, setParams] = useSearchParams();
  const shown = useRef(false);
  useEffect(() => {
    const connected = params.get('connected');
    const error = params.get('error');
    if ((!connected && !error) || shown.current) return;
    shown.current = true;
    if (connected) {
      toast.success('Google Calendar quedó conectado. Ya creamos un calendario por recurso.');
      refetch();
    } else {
      toast.error(CONNECT_ERRORS[error] ?? CONNECT_ERRORS.google_failed);
    }
    setParams({}, { replace: true });
  }, [params, setParams, refetch]);
}

function Section({ title, icon: Icon, action, className, children }) {
  return (
    <section className={cn('rounded-xl border border-border bg-white p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center gap-2">
          {Icon && <Icon className="size-5 text-primary" aria-hidden />}
          <h2 className="flex-1 text-base font-extrabold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function DeveloperNotice() {
  return (
    <Notice kind="warn">
      <p className="font-bold">Google Calendar no está configurado en este servidor.</p>
      <p className="mt-1">
        Para desarrolladores: agrega <code className="font-mono">GOOGLE_CLIENT_ID</code> y{' '}
        <code className="font-mono">GOOGLE_CLIENT_SECRET</code> en{' '}
        <code className="font-mono">apps/api/.env</code>, activa Google Calendar API en el proyecto
        de Google Cloud y registra la URI de redirección{' '}
        <code className="font-mono break-all">{'<API_URL>'}/api/calendar/callback</code>. Mientras
        tanto, las reservas funcionan normal y no se sincroniza nada.
      </p>
    </Notice>
  );
}

function ConnectionCard({ data }) {
  const sync = useSyncNow();
  const [confirm, setConfirm] = useState(false);
  const disconnect = useDisconnectCalendar();

  const runSync = () =>
    sync.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          r.status.failedJobs
            ? `Sincronizado. Quedan ${r.status.failedJobs} con error.`
            : 'Todo sincronizado con Google Calendar.',
        ),
      onError: (e) => toast.error(e.message),
    });

  const runDisconnect = () =>
    disconnect.mutate(undefined, {
      onSuccess: () => {
        setConfirm(false);
        toast.success('Google Calendar quedó desconectado.');
      },
      onError: (e) => toast.error(e.message),
    });

  return (
    <Section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-white">
          <GoogleIcon className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-extrabold">Conexión</h2>
            {data.connected ? (
              <Chip tone="ok">Conectado</Chip>
            ) : data.connectionLost ? (
              <Chip tone="error">Se perdió la conexión</Chip>
            ) : (
              <Chip tone="neutral">Sin conectar</Chip>
            )}
          </div>
          {data.connected ? (
            <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              <p>
                Cuenta: <span className="font-bold text-foreground">{data.googleEmail}</span>
              </p>
              {data.connectedAt && <p>Conectada desde el {dayLong(data.connectedAt)}.</p>}
              <p>
                {data.lastSyncAt
                  ? `Última revisión de cambios ${agoText(data.lastSyncAt)}.`
                  : 'Revisamos los cambios en Google cada 45 segundos.'}
              </p>
            </div>
          ) : data.connectionLost ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Google ya no nos deja entrar a{' '}
              <span className="font-bold text-foreground">{data.googleEmail}</span> (se quitó el
              permiso o cambió la contraseña). Mientras tanto no se sincroniza nada. Vuelve a
              conectar la misma cuenta para seguir usando sus calendarios.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Conecta una sola vez la cuenta de Google del negocio. Te pediremos permiso solo para
              crear los calendarios de ReserYa y manejar sus eventos; no vemos tu calendario
              personal.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {data.connected ? (
            <>
              <Button variant="soft" onClick={runSync} disabled={sync.isPending}>
                {sync.isPending ? <Spinner className="size-4 text-current" /> : <RefreshCw />}
                Sincronizar ahora
              </Button>
              <Button variant="destructive" onClick={() => setConfirm(true)}>
                <Unplug /> Desconectar
              </Button>
            </>
          ) : data.enabled ? (
            <a href={CONNECT_URL} className={buttonVariants({ variant: 'default' })}>
              <CalendarCheck />
              {data.connectionLost ? 'Volver a conectar' : 'Conectar Google Calendar'}
            </a>
          ) : (
            <Button disabled>
              <CalendarCheck /> Conectar Google Calendar
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar Google Calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              Las citas nuevas ya no se pasarán a Google y lo que agregues allá dejará de bloquear
              horarios en ReserYa. Los calendarios y eventos que ya existen se quedan en tu cuenta
              de Google.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive-solid"
              onClick={runDisconnect}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? 'Desconectando…' : 'Sí, desconectar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

function ResourcesCard({ data }) {
  return (
    <Section title="Calendarios por persona o espacio" icon={Users}>
      {data.resources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no tienes personas ni espacios. Agrégalos en Equipo y espacios y aquí aparecerá su
          calendario.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {data.resources.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span
                className="size-4 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: r.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{r.name}</p>
                <p className="truncate text-[13px] text-muted-foreground">ReserYa · {r.name}</p>
              </div>
              {!data.connected ? (
                <Chip tone="neutral" size="sm">
                  Sin calendario
                </Chip>
              ) : r.googleCalendarId ? (
                <Chip tone="ok" size="sm">
                  Calendario listo
                </Chip>
              ) : (
                <Chip tone="warn" size="sm">
                  Creando…
                </Chip>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const ACTIONS = { create: 'Crear evento', update: 'Mover evento', delete: 'Borrar evento' };

function JobsCard({ data }) {
  const allGood = !data.pendingJobs && !data.failedJobs;
  return (
    <Section
      title="Sincronización"
      icon={RefreshCw}
      action={
        allGood ? (
          <Chip tone="ok" size="sm">
            Todo al día
          </Chip>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-surface p-3">
          <p className="text-2xl font-extrabold">{data.pendingJobs}</p>
          <p className="text-[13px] text-muted-foreground">Pendientes de enviar</p>
        </div>
        <div className={cn('rounded-lg p-3', data.failedJobs ? 'bg-error-soft' : 'bg-surface')}>
          <p className={cn('text-2xl font-extrabold', data.failedJobs && 'text-error')}>
            {data.failedJobs}
          </p>
          <p className="text-[13px] text-muted-foreground">Con error</p>
        </div>
      </div>
      {data.pendingJobs > 0 && (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Las citas pendientes se envían en unos segundos. Si Google falla, lo reintentamos solos;
          la reserva sigue válida.
        </p>
      )}
      {data.failed.length > 0 && (
        <ul className="mt-4 space-y-2">
          {data.failed.map((f) => (
            <li key={f.id} className="flex gap-3 rounded-lg border border-border p-3">
              <CircleAlert className="mt-0.5 size-[18px] shrink-0 text-error" aria-hidden />
              <div className="min-w-0 text-sm">
                <p className="font-bold">
                  {ACTIONS[f.action]} · {f.serviceName} · {f.clientName}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  Cita del {dateTimeShort(f.startsAt)}
                  {f.attempts > 0 && ` · ${f.attempts} intentos`}
                </p>
                {f.lastError && <p className="mt-1 text-[13px] break-words">{f.lastError}</p>}
              </div>
            </li>
          ))}
          <li className="text-[13px] text-muted-foreground">
            “Sincronizar ahora” vuelve a intentar las que tienen error.
          </li>
        </ul>
      )}
    </Section>
  );
}

function HowItWorks() {
  const items = [
    {
      icon: Users,
      title: 'Un calendario por persona o espacio',
      text: 'Creamos en tu cuenta un calendario “ReserYa · Nombre” para cada uno, con su color.',
    },
    {
      icon: CalendarCheck,
      title: 'Las citas aceptadas aparecen solas',
      text: 'Al aceptar una solicitud se crea el evento; si se cancela, se borra.',
    },
    {
      icon: Phone,
      title: 'Lo que pongas ahí bloquea el horario',
      text: 'Si recepción agenda una cita por teléfono o en persona en ese calendario, ese horario deja de ofrecerse en ReserYa.',
    },
    {
      icon: CalendarX,
      title: 'Mover o borrar avisa al cliente',
      text: 'Si mueves una cita de ReserYa en Google, cambiamos la reserva y le avisamos por correo. Si la borras, se cancela y se le reembolsa el 100%.',
    },
  ];
  return (
    <aside className="space-y-4">
      <Section title="Cómo funciona">
        <ul className="space-y-4">
          {items.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon className="size-[18px]" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold">{title}</p>
                <p className="text-[13px] text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Compartir con un empleado" icon={Share2}>
        <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-muted-foreground">
          <li>Abre Google Calendar en la computadora con la cuenta del negocio.</li>
          <li>
            En “Mis calendarios”, pasa el cursor sobre “ReserYa · Nombre” y entra a{' '}
            <span className="font-bold text-foreground">Configuración y uso compartido</span>.
          </li>
          <li>En “Compartir con personas específicas”, agrega el correo de Google del empleado.</li>
          <li>
            Elige{' '}
            <span className="font-bold text-foreground">Ver todos los detalles del evento</span>{' '}
            para que solo pueda verlo, sin cambiar nada.
          </li>
        </ol>
      </Section>
    </aside>
  );
}
