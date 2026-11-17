// Revisar un negocio: aprobar, rechazar, suspender, reactivar o contactar (RF-11, RF-12, RF-13, RF-72).
import { useState } from 'react';
import { useParams } from 'react-router';
import { Check, X, Ban, RotateCcw, Mail, CircleCheck, Circle } from 'lucide-react';
import { fieldError } from '@/lib/api';
import { dateTimeShort, dayLong, phone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { PageHeader } from '@/components/PageHeader';
import { FullPageSpinner, ErrorState } from '@/components/States';
import { useBusiness, useBusinessAction } from '@/features/admin/api';
import { BusinessStatusChip, CategoryTile, KeyCode } from '@/features/admin/components';
import { Section } from '@/features/business-setup/components';
import { cn } from '@/lib/utils';

export default function BusinessReview() {
  const { id } = useParams();
  const q = useBusiness(id);
  const [dialog, setDialog] = useState(null); // approve | reject | suspend | reactivate | contact

  if (q.isLoading) return <FullPageSpinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const b = q.data;

  const actions = {
    pending: [
      ['approve', 'Aprobar', Check, 'default'],
      ['reject', 'Rechazar', X, 'destructive'],
    ],
    rejected: [['approve', 'Aprobar', Check, 'default']],
    approved: [['suspend', 'Suspender', Ban, 'destructive']],
    suspended: [['reactivate', 'Reactivar', RotateCcw, 'default']],
  }[b.status];

  return (
    <div className="max-w-5xl">
      <PageHeader title="Revisar negocio" back="/admin/negocios" className="mb-5" />

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-white p-5">
        <CategoryTile icon={b.category.icon} className="size-14" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-extrabold tracking-tight">{b.name}</h2>
            <BusinessStatusChip status={b.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {b.category.name} · Registrado el {dayLong(b.createdAt).toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map(([key, label, Icon, variant]) => (
            <Button key={key} variant={variant} onClick={() => setDialog(key)}>
              <Icon /> {label}
            </Button>
          ))}
          <Button variant="outline" onClick={() => setDialog('contact')}>
            <Mail /> Contactar
          </Button>
        </div>
      </div>

      {b.status === 'rejected' && b.rejectionReason && (
        <Notice kind="error" className="mb-6">
          <strong>Motivo del rechazo:</strong> {b.rejectionReason}
        </Notice>
      )}
      {b.status === 'suspended' && (
        <Notice kind="error" className="mb-6">
          <strong>Suspendido{b.suspendedAt ? ` el ${dateTimeShort(b.suspendedAt)}` : ''}.</strong>{' '}
          {b.suspensionReason && `Motivo: ${b.suspensionReason}`}
        </Notice>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Datos del negocio">
          <Rows
            rows={[
              ['Categoría', b.category.name],
              ['Dirección', b.address],
              ['Teléfono', phone(b.phone)],
              ['Descripción', b.description],
            ]}
          />
        </Section>
        <Section title="Dueño">
          <Rows
            rows={[
              ['Nombre', `${b.owner.firstName} ${b.owner.lastName}`.trim()],
              [
                'Correo',
                <a key="m" href={`mailto:${b.owner.email}`} className="font-bold text-primary">
                  {b.owner.email}
                </a>,
              ],
              ['Teléfono', phone(b.owner.phone)],
            ]}
          />
        </Section>
        <Section title="Registro">
          <Rows
            rows={[
              ['Recibido', dateTimeShort(b.createdAt)],
              ['Clave usada', <KeyCode key="k" code={b.keyCode} />],
              ['Aprobado', b.approvedAt ? dateTimeShort(b.approvedAt) : null],
            ]}
          />
        </Section>
        <Section title="Actividad">
          <Rows
            rows={[
              [
                'Reservas',
                `${b.counts.bookings} en total · ${b.counts.confirmedBookings} confirmadas o completadas`,
              ],
              ['Servicios activos', b.counts.services],
              ['Equipo y espacios', b.counts.resources],
              [
                'Calificación',
                b.ratingCount
                  ? `${Number(b.ratingAvg).toFixed(1)} (${b.ratingCount} reseñas)`
                  : 'Sin reseñas',
              ],
            ]}
          />
          {b.status === 'approved' && (
            <div className="mt-4 rounded-lg bg-surface p-3">
              <p className="mb-2 text-[13px] font-bold">
                {b.setup.ready
                  ? 'Configuración lista: aparece en búsquedas'
                  : 'Configuración pendiente: no aparece en búsquedas'}
              </p>
              <ul className="space-y-1 text-[13px]">
                {b.setup.steps.map((s) => (
                  <li
                    key={s.key}
                    className={cn('flex items-center gap-2', !s.done && 'text-muted-foreground')}
                  >
                    {s.done ? (
                      <CircleCheck className="size-4 text-success" />
                    ) : (
                      <Circle className="size-4" />
                    )}
                    {s.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      </div>

      <ActionDialog business={b} kind={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function Rows({ rows }) {
  return (
    <dl className="space-y-3 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[130px_1fr] gap-3">
          <dt className="font-semibold text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words whitespace-pre-line">
            {value === null || value === undefined || value === '' ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const DIALOGS = {
  approve: {
    title: '¿Aprobar este negocio?',
    text: 'Le enviaremos un correo con el enlace para entrar. Aparecerá en las búsquedas cuando termine su configuración.',
    confirm: 'Aprobar',
    success: 'Negocio aprobado',
  },
  reject: {
    title: 'Rechazar el registro',
    text: 'Escribe el motivo. Se lo enviaremos por correo y lo verá al entrar.',
    confirm: 'Rechazar',
    success: 'Registro rechazado',
    reason: true,
    danger: true,
  },
  suspend: {
    title: 'Suspender el negocio',
    text: 'Dejará de aparecer en las búsquedas y no recibirá solicitudes nuevas. Las reservas que ya tiene se quedan como están. El motivo se envía por correo.',
    confirm: 'Suspender',
    success: 'Negocio suspendido',
    reason: true,
    danger: true,
  },
  reactivate: {
    title: '¿Reactivar el negocio?',
    text: 'Volverá a aparecer en las búsquedas y le avisaremos por correo.',
    confirm: 'Reactivar',
    success: 'Negocio reactivado',
  },
};

function ActionDialog({ business, kind, onClose }) {
  const open = Boolean(kind);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {kind === 'contact' ? (
          <ContactForm business={business} onClose={onClose} />
        ) : kind ? (
          <StatusForm key={kind} business={business} kind={kind} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StatusForm({ business, kind, onClose }) {
  const d = DIALOGS[kind];
  const [reason, setReason] = useState('');
  const m = useBusinessAction(business.id, kind, { success: d.success, onSuccess: onClose });
  return (
    <form
      onSubmit={(e) => (e.preventDefault(), m.mutate(d.reason ? { reason } : undefined))}
      noValidate
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle className="text-lg font-extrabold">{d.title}</DialogTitle>
        <DialogDescription>
          <strong className="text-foreground">{business.name}</strong>. {d.text}
        </DialogDescription>
      </DialogHeader>
      {d.reason && (
        <Field label="Motivo" error={fieldError(m.error, 'reason')}>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              kind === 'reject'
                ? 'Por ejemplo: la dirección no corresponde a un local en Ensenada.'
                : 'Por ejemplo: recibimos varias quejas de clientes.'
            }
            autoFocus
          />
        </Field>
      )}
      {m.error && !m.error.details && <Notice kind="error">{m.error.message}</Notice>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant={d.danger ? 'destructive-solid' : 'default'}
          disabled={m.isPending || (d.reason && reason.trim().length < 5)}
        >
          {d.confirm}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ContactForm({ business, onClose }) {
  const [f, setF] = useState({ subject: '', message: '' });
  const m = useBusinessAction(business.id, 'contact', {
    success: 'Correo enviado',
    onSuccess: onClose,
  });
  const err = m.error;
  return (
    <form onSubmit={(e) => (e.preventDefault(), m.mutate(f))} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-lg font-extrabold">Contactar a {business.name}</DialogTitle>
        <DialogDescription>Se envía por correo a {business.owner.email}.</DialogDescription>
      </DialogHeader>
      <Field label="Asunto" error={fieldError(err, 'subject')}>
        <Input
          value={f.subject}
          onChange={(e) => setF({ ...f, subject: e.target.value })}
          autoFocus
        />
      </Field>
      <Field label="Mensaje" error={fieldError(err, 'message')}>
        <Textarea
          value={f.message}
          onChange={(e) => setF({ ...f, message: e.target.value })}
          className="min-h-36"
        />
      </Field>
      {err && !err.details && <Notice kind="error">{err.message}</Notice>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={m.isPending}>
          <Mail /> Enviar correo
        </Button>
      </DialogFooter>
    </form>
  );
}
