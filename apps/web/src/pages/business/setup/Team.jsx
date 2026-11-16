// Equipo y espacios (RF-16, RF-18): recursos, qué servicios dan, horario semanal y días cerrados.
import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users, CalendarClock, CalendarOff, User, Box } from 'lucide-react';
import { api, fieldError } from '@/lib/api';
import { dayLong, todayISO } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/Field';
import { Chip } from '@/components/Chip';
import { Notice } from '@/components/Notice';
import { PageHeader } from '@/components/PageHeader';
import { LoadingList, ErrorState, EmptyState } from '@/components/States';
import {
  useServices,
  useResources,
  useClosedDays,
  useSetupMutation,
  SERVICES_KEY,
  RESOURCES_KEY,
  CLOSED_DAYS_KEY,
} from '@/features/business-setup/api';
import {
  ColorPicker,
  NativeSelect,
  OptionPills,
  Section,
} from '@/features/business-setup/components';
import { ConfirmButton } from '@/features/business-setup/ConfirmButton';
import {
  ScheduleEditor,
  blocksToDays,
  daysToBlocks,
  validateDays,
  dayText,
} from '@/features/business-setup/ScheduleEditor';
import { WEEKDAYS, RESOURCE_COLORS } from '@/features/business-setup/constants';
import { cn } from '@/lib/utils';

const KEYS = [RESOURCES_KEY, SERVICES_KEY];
const KINDS = [
  { value: 'person', label: 'Persona' },
  { value: 'space', label: 'Espacio' },
];

export default function Team() {
  const resources = useResources();
  const services = useServices();
  const [editing, setEditing] = useState(null); // null | 'new' | recurso
  const [scheduling, setScheduling] = useState(null);

  const remove = useSetupMutation(
    (id) => api(`/business/resources/${id}`, { method: 'DELETE' }),
    [...KEYS, CLOSED_DAYS_KEY],
    { onSuccess: (r) => toast.success(r.result === 'deleted' ? 'Borrado' : 'Desactivado') },
  );

  const list = resources.data?.resources ?? [];
  const serviceList = services.data ?? [];

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <PageHeader
          title="Equipo y espacios"
          subtitle="Las personas o los lugares que tus clientes reservan, con su horario y los servicios que dan."
          actions={
            list.length > 0 && (
              <Button onClick={() => setEditing('new')}>
                <Plus /> Agregar
              </Button>
            )
          }
        />

        {resources.isLoading ? (
          <LoadingList rows={3} itemClassName="h-32" />
        ) : resources.isError ? (
          <ErrorState error={resources.error} onRetry={resources.refetch} />
        ) : list.length === 0 ? (
          <div className="space-y-4">
            <EmptyState
              icon={Users}
              title="Agrega a tu equipo o tus espacios"
              text="Por ejemplo: Juan, Pedro y Luis en una barbería, o Cancha 1 y Cancha 2. Cada uno tiene su horario y su calendario."
            />
            <div className="flex justify-center">
              <Button size="lg" onClick={() => setEditing('new')}>
                <Plus /> Agregar el primero
              </Button>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((r) => (
              <ResourceCard
                key={r.id}
                resource={r}
                services={serviceList}
                onEdit={() => setEditing(r)}
                onSchedule={() => setScheduling(r)}
                onDelete={() => remove.mutateAsync(r.id)}
                deleting={remove.isPending}
              />
            ))}
          </ul>
        )}
      </div>

      {list.length > 0 && <ClosedDays resources={list} />}

      {editing && (
        <ResourceDialog
          resource={editing === 'new' ? null : editing}
          services={serviceList}
          count={list.length}
          onClose={() => setEditing(null)}
          onCreated={(r) => setScheduling(r)}
        />
      )}
      {scheduling && <ScheduleDialog resource={scheduling} onClose={() => setScheduling(null)} />}
    </div>
  );
}

function ResourceCard({ resource: r, services, onEdit, onSchedule, onDelete, deleting }) {
  const days = blocksToDays(r.schedule);
  const given = services.filter((s) => r.serviceIds.includes(s.id));
  const KindIcon = r.kind === 'space' ? Box : User;
  return (
    <li className={cn('rounded-xl border border-border bg-white p-4', !r.active && 'bg-surface')}>
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: r.color }}
          aria-hidden
        >
          <KindIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-extrabold">{r.name}</p>
            {r.title && <span className="text-[13px] text-muted-foreground">· {r.title}</span>}
            {!r.active && <Chip size="sm">Inactivo</Chip>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {given.length ? (
              given.map((s) => (
                <Chip key={s.id} size="sm" tone={s.active ? 'primary' : 'neutral'}>
                  {s.name}
                </Chip>
              ))
            ) : (
              <Chip size="sm" tone="warn">
                Sin servicios
              </Chip>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={`Editar ${r.name}`} onClick={onEdit}>
            <Pencil />
          </Button>
          <ConfirmButton
            trigger={{
              variant: 'ghost',
              size: 'icon',
              'aria-label': `Borrar ${r.name}`,
              children: <Trash2 className="text-error" />,
            }}
            title={r.hasBookings ? `¿Desactivar a ${r.name}?` : `¿Borrar a ${r.name}?`}
            description={
              r.hasBookings
                ? 'Ya tiene reservas, así que no se borra: se desactiva y deja de recibir solicitudes nuevas.'
                : 'Se borra con su horario y sus días cerrados.'
            }
            confirmLabel={r.hasBookings ? 'Desactivar' : 'Borrar'}
            busy={deleting}
            onConfirm={onDelete}
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-surface p-3">
        {r.schedule.length === 0 ? (
          <p className="text-sm text-warning">Todavía no tiene horario.</p>
        ) : (
          <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
            {WEEKDAYS.map((d) => (
              <div key={d.value} className="flex gap-3">
                <dt className="w-9 shrink-0 font-bold">{d.short}</dt>
                <dd className={cn(!days[d.value].length && 'text-muted-foreground')}>
                  {days[d.value].length ? dayText(days[d.value]) : 'Cerrado'}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <Button variant="outline-primary" size="sm" className="mt-3" onClick={onSchedule}>
          <CalendarClock /> {r.schedule.length ? 'Cambiar horario' : 'Definir horario'}
        </Button>
      </div>
    </li>
  );
}

function ResourceDialog({ resource, services, count, onClose, onCreated }) {
  const [f, setF] = useState(() => ({
    name: resource?.name ?? '',
    title: resource?.title ?? '',
    kind: resource?.kind ?? 'person',
    color: resource?.color ?? RESOURCE_COLORS[count % RESOURCE_COLORS.length].value,
    active: resource?.active ?? true,
    serviceIds: resource?.serviceIds ?? services.filter((s) => s.active).map((s) => s.id),
  }));
  const save = useSetupMutation(
    async ({ serviceIds, ...info }) => {
      if (!resource)
        return api('/business/resources', { method: 'POST', body: { ...info, serviceIds } });
      await api(`/business/resources/${resource.id}`, { method: 'PATCH', body: info });
      return api(`/business/resources/${resource.id}/services`, {
        method: 'PUT',
        body: { serviceIds },
      });
    },
    KEYS,
    {
      onSuccess: (r) => {
        toast.success(resource ? 'Cambios guardados' : 'Agregado. Ahora define su horario.');
        onClose();
        if (!resource) onCreated(r.resource);
      },
    },
  );
  const err = save.error;
  const toggle = (id, on) =>
    setF({ ...f, serviceIds: on ? [...f.serviceIds, id] : f.serviceIds.filter((x) => x !== id) });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          onSubmit={(e) => (e.preventDefault(), save.mutate(f))}
          noValidate
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">
              {resource ? `Editar a ${resource.name}` : 'Agregar persona o espacio'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <span className="text-[13px] font-bold">Tipo</span>
            <OptionPills
              label="Tipo"
              options={KINDS}
              value={f.kind}
              onChange={(kind) => setF({ ...f, kind })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" error={fieldError(err, 'name')}>
              <Input
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
                placeholder={f.kind === 'space' ? 'Cancha 1' : 'Juan'}
              />
            </Field>
            <Field label="Puesto o detalle" optional error={fieldError(err, 'title')}>
              <Input
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
                placeholder={f.kind === 'space' ? 'Techada' : 'Barbero'}
              />
            </Field>
          </div>
          <div className="grid gap-2">
            <span className="text-[13px] font-bold">Color en la agenda y en Google Calendar</span>
            <ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} />
          </div>
          <fieldset>
            <legend className="mb-2 text-[13px] font-bold">Servicios que da</legend>
            {services.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Todavía no tienes servicios. Agrégalos en “Servicios” y después márcalos aquí.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {services.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold"
                  >
                    <Checkbox
                      checked={f.serviceIds.includes(s.id)}
                      onCheckedChange={(on) => toggle(s.id, Boolean(on))}
                    />
                    <span className="truncate">{s.name}</span>
                    {!s.active && <Chip size="sm">Desactivado</Chip>}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <label className="flex items-center gap-3 text-sm font-bold">
            <Switch checked={f.active} onCheckedChange={(active) => setF({ ...f, active })} />
            Activo (recibe solicitudes)
          </label>
          {err && !err.details && <Notice kind="error">{err.message}</Notice>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {resource ? 'Guardar cambios' : 'Agregar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({ resource, onClose }) {
  const [days, setDays] = useState(() => blocksToDays(resource.schedule));
  const [errors, setErrors] = useState({});
  const save = useSetupMutation(
    (blocks) =>
      api(`/business/resources/${resource.id}/schedule`, { method: 'PUT', body: { blocks } }),
    [RESOURCES_KEY],
    {
      onSuccess: () => {
        toast.success('Horario guardado');
        onClose();
      },
    },
  );
  const submit = (e) => {
    e.preventDefault();
    const errs = validateDays(days);
    setErrors(errs);
    if (Object.keys(errs).length === 0) save.mutate(daysToBlocks(days));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">Horario de {resource.name}</DialogTitle>
            <DialogDescription>
              Prende los días que trabaja. Si descansa a mediodía, agrega dos horarios ese día (por
              ejemplo, 09:00 a 14:00 y 15:00 a 19:00).
            </DialogDescription>
          </DialogHeader>
          <ScheduleEditor days={days} onChange={setDays} errors={errors} />
          {save.error && (
            <Notice kind="error">{save.error.details?.blocks?.[0] ?? save.error.message}</Notice>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Guardar horario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClosedDays({ resources }) {
  const q = useClosedDays();
  const [f, setF] = useState({ date: '', resourceId: '', reason: '' });
  const add = useSetupMutation(
    (body) => api('/business/closed-days', { method: 'POST', body }),
    [CLOSED_DAYS_KEY],
    {
      onSuccess: () => {
        toast.success('Día cerrado agregado');
        setF({ date: '', resourceId: f.resourceId, reason: '' });
      },
    },
  );
  const remove = useSetupMutation(
    (id) => api(`/business/closed-days/${id}`, { method: 'DELETE' }),
    [CLOSED_DAYS_KEY],
  );
  const err = add.error;
  const days = q.data ?? [];

  return (
    <Section
      title="Días cerrados"
      description="Días festivos, vacaciones o permisos. Ese día no se ofrecen horarios."
    >
      <form
        onSubmit={(e) => (
          e.preventDefault(),
          add.mutate({ date: f.date, reason: f.reason, resourceId: f.resourceId || null })
        )}
        noValidate
        className="grid items-start gap-3 md:grid-cols-[160px_1fr_1fr_auto]"
      >
        <Field label="Fecha" error={fieldError(err, 'date')}>
          <Input
            type="date"
            min={todayISO()}
            value={f.date}
            onChange={(e) => setF({ ...f, date: e.target.value })}
            className="px-3"
          />
        </Field>
        <Field label="¿Quién cierra?">
          <NativeSelect
            value={f.resourceId}
            onChange={(e) => setF({ ...f, resourceId: e.target.value })}
          >
            <option value="">Todo el negocio</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                Solo {r.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Motivo" optional error={fieldError(err, 'reason')}>
          <Input
            value={f.reason}
            onChange={(e) => setF({ ...f, reason: e.target.value })}
            placeholder="Navidad"
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="md:mt-[21px]"
          disabled={!f.date || add.isPending}
        >
          <Plus /> Agregar
        </Button>
      </form>
      {err && !err.details && (
        <Notice kind="error" className="mt-3">
          {err.message}
        </Notice>
      )}

      <div className="mt-5">
        {q.isLoading ? (
          <LoadingList rows={2} itemClassName="h-12" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={q.refetch} />
        ) : days.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarOff className="size-4" /> No hay días cerrados próximos.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {days.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{dayLong(d.date)}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {d.resourceName ? `Solo ${d.resourceName}` : 'Todo el negocio'}
                    {d.reason && ` · ${d.reason}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Quitar ${dayLong(d.date)}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(d.id)}
                >
                  <Trash2 className="text-error" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
