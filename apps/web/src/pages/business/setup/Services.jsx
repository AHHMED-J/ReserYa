// Servicios del negocio (RF-15, RF-17). Modo dueño.
import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Scissors, Clock, Users } from 'lucide-react';
import { api, fieldError } from '@/lib/api';
import { money, duration } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
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
  useSetupMutation,
  SERVICES_KEY,
  RESOURCES_KEY,
} from '@/features/business-setup/api';
import { ConfirmButton } from '@/features/business-setup/ConfirmButton';
import { cn } from '@/lib/utils';

const KEYS = [SERVICES_KEY, RESOURCES_KEY];

export default function Services() {
  const services = useServices();
  const resources = useResources();
  const [editing, setEditing] = useState(null); // null | 'new' | servicio

  const toggle = useSetupMutation(
    ({ id, active }) => api(`/business/services/${id}`, { method: 'PATCH', body: { active } }),
    KEYS,
  );
  const remove = useSetupMutation(
    (id) => api(`/business/services/${id}`, { method: 'DELETE' }),
    KEYS,
    {
      onSuccess: (r) =>
        toast.success(r.result === 'deleted' ? 'Servicio borrado' : 'Servicio desactivado'),
    },
  );

  const list = services.data ?? [];
  const resourceList = resources.data?.resources ?? [];

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Servicios"
        subtitle="Lo que tus clientes pueden reservar. El precio es el mismo con cualquier persona y a cualquier hora."
        actions={
          list.length > 0 && (
            <Button onClick={() => setEditing('new')}>
              <Plus /> Nuevo servicio
            </Button>
          )
        }
      />

      {services.isLoading ? (
        <LoadingList rows={4} itemClassName="h-20" />
      ) : services.isError ? (
        <ErrorState error={services.error} onRetry={services.refetch} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="Todavía no tienes servicios"
          text="Agrega lo que ofreces con su duración y precio. Si un servicio tiene variantes (por ejemplo, corte corto y largo), créalas como servicios separados."
        />
      ) : (
        <ul className="space-y-3">
          {list.map((s) => {
            const who = resourceList.filter((r) => s.resourceIds.includes(r.id));
            return (
              <li
                key={s.id}
                className={cn(
                  'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-white p-4',
                  !s.active && 'bg-surface',
                )}
              >
                <div className="min-w-0 flex-1 basis-60">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-extrabold">{s.name}</p>
                    {!s.active && <Chip size="sm">Desactivado</Chip>}
                  </div>
                  {s.description && (
                    <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">
                      {s.description}
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" /> {duration(s.durationMin)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" />
                      {who.length ? who.map((r) => r.name).join(', ') : 'Nadie lo da todavía'}
                    </span>
                  </p>
                </div>
                <p className="text-lg font-extrabold">{money(s.priceCents)}</p>
                <div className="flex items-center gap-1">
                  <label className="mr-2 flex items-center gap-2 text-[13px] font-bold">
                    <Switch
                      checked={s.active}
                      onCheckedChange={(active) => toggle.mutate({ id: s.id, active })}
                      aria-label={`${s.name} activo`}
                    />
                    Activo
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${s.name}`}
                    onClick={() => setEditing(s)}
                  >
                    <Pencil />
                  </Button>
                  <ConfirmButton
                    trigger={{
                      variant: 'ghost',
                      size: 'icon',
                      'aria-label': `Borrar ${s.name}`,
                      children: <Trash2 className="text-error" />,
                    }}
                    title={s.hasBookings ? `¿Desactivar ${s.name}?` : `¿Borrar ${s.name}?`}
                    description={
                      s.hasBookings
                        ? 'Este servicio ya tiene reservas, así que no se borra: se desactiva y deja de aparecer para tus clientes.'
                        : 'Se borra para siempre.'
                    }
                    confirmLabel={s.hasBookings ? 'Desactivar' : 'Borrar'}
                    busy={remove.isPending}
                    onConfirm={() => remove.mutateAsync(s.id)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!services.isLoading && list.length === 0 && (
        <div className="mt-4 flex justify-center">
          <Button size="lg" onClick={() => setEditing('new')}>
            <Plus /> Agregar mi primer servicio
          </Button>
        </div>
      )}

      {editing && (
        <ServiceDialog
          service={editing === 'new' ? null : editing}
          resources={resourceList}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ServiceDialog({ service, resources, onClose }) {
  const [f, setF] = useState(() => ({
    name: service?.name ?? '',
    description: service?.description ?? '',
    durationMin: service ? String(service.durationMin) : '30',
    price: service ? String(service.priceCents / 100) : '',
    active: service?.active ?? true,
    // Un servicio nuevo lo dan todos por omisión; el dueño quita a quien no.
    resourceIds: service?.resourceIds ?? resources.filter((r) => r.active).map((r) => r.id),
  }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = useSetupMutation(
    (body) =>
      service
        ? api(`/business/services/${service.id}`, { method: 'PATCH', body })
        : api('/business/services', { method: 'POST', body }),
    KEYS,
    {
      onSuccess: () => {
        toast.success(service ? 'Servicio guardado' : 'Servicio agregado');
        onClose();
      },
    },
  );
  const err = save.error;
  const toggleResource = (id, on) =>
    setF({
      ...f,
      resourceIds: on ? [...f.resourceIds, id] : f.resourceIds.filter((x) => x !== id),
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          onSubmit={(e) => (
            e.preventDefault(),
            save.mutate({
              name: f.name,
              description: f.description,
              durationMin: f.durationMin,
              price: f.price === '' ? undefined : f.price,
              active: f.active,
              resourceIds: f.resourceIds,
            })
          )}
          noValidate
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">
              {service ? 'Editar servicio' : 'Nuevo servicio'}
            </DialogTitle>
          </DialogHeader>
          <Field label="Nombre" error={fieldError(err, 'name')}>
            <Input value={f.name} onChange={set('name')} placeholder="Corte de cabello" />
          </Field>
          <Field label="Descripción" optional error={fieldError(err, 'description')}>
            <Textarea
              value={f.description}
              onChange={set('description')}
              placeholder="Incluye lavado y peinado"
              className="min-h-16"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duración (min)" error={fieldError(err, 'durationMin')}>
              <Input
                type="number"
                inputMode="numeric"
                min={5}
                max={600}
                step={5}
                value={f.durationMin}
                onChange={set('durationMin')}
              />
            </Field>
            <Field label="Precio (MXN)" error={fieldError(err, 'price')}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] font-bold text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={f.price}
                  onChange={set('price')}
                  placeholder="200"
                  className="pl-8"
                />
              </div>
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-[13px] font-bold">¿Quién lo da?</legend>
            {resources.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Todavía no tienes equipo ni espacios. Después de guardar, agrégalos en “Equipo y
                espacios”.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {resources.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold"
                  >
                    <Checkbox
                      checked={f.resourceIds.includes(r.id)}
                      onCheckedChange={(on) => toggleResource(r.id, Boolean(on))}
                    />
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: r.color }}
                      aria-hidden
                    />
                    <span className="truncate">{r.name}</span>
                    {!r.active && <Chip size="sm">Inactivo</Chip>}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <label className="flex items-center gap-3 text-sm font-bold">
            <Switch checked={f.active} onCheckedChange={(active) => setF({ ...f, active })} />
            Activo (los clientes lo pueden reservar)
          </label>
          {err && !err.details && <Notice kind="error">{err.message}</Notice>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {service ? 'Guardar cambios' : 'Agregar servicio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
