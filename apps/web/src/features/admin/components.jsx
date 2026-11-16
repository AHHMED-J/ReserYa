// Piezas del panel del administrador.
import { useState } from 'react';
import { Copy, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Chip } from '@/components/Chip';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Notice } from '@/components/Notice';
import { cn } from '@/lib/utils';
import { useGenerateKeys, copyText } from './api';

export const BUSINESS_STATES = {
  pending: ['Pendiente', 'warn'],
  approved: ['Activo', 'ok'],
  rejected: ['Rechazado', 'error'],
  suspended: ['Suspendido', 'error'],
};

export function BusinessStatusChip({ status, size }) {
  const [label, tone] = BUSINESS_STATES[status] ?? [status, 'neutral'];
  return (
    <Chip tone={tone} size={size}>
      {label}
    </Chip>
  );
}

/** Clave de registro en letra monoespaciada. */
export function KeyCode({ code, className }) {
  if (!code) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center rounded-full bg-surface px-3 font-mono text-xs font-bold tracking-wide',
        className,
      )}
    >
      {code}
    </span>
  );
}

/** Cuadro con el ícono de la categoría (como en la pantalla 11). */
export function CategoryTile({ icon, className }) {
  return (
    <span
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-lg bg-photo text-photo-icon',
        className,
      )}
      aria-hidden
    >
      <CategoryIcon icon={icon} className="size-5" strokeWidth={1.8} />
    </span>
  );
}

/** Tarjeta de un número del resumen. */
export function StatCard({ label, value, note, noteTone, icon: Icon }) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        {Icon && (
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Icon className="size-[18px]" />
          </span>
        )}
      </div>
      <p className="mt-1 text-3xl font-extrabold tracking-tight">{value ?? '—'}</p>
      {note && (
        <p
          className={cn(
            'mt-2 text-xs font-semibold',
            noteTone === 'warn' ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          {note}
        </p>
      )}
    </div>
  );
}

/** Botón "Generar clave": genera una y la muestra para copiarla. */
export function GenerateKeyButton({ variant = 'outline', count = 1, label = 'Generar clave' }) {
  const [created, setCreated] = useState(null);
  const gen = useGenerateKeys({
    onSuccess: (data) => setCreated(data.created),
    onError: (e) => toast.error(e.message),
  });
  return (
    <>
      <Button variant={variant} onClick={() => gen.mutate(count)} disabled={gen.isPending}>
        <Plus /> {label}
      </Button>
      <NewKeysDialog keys={created} onClose={() => setCreated(null)} />
    </>
  );
}

/** Muestra las claves recién creadas con botón para copiar. */
export function NewKeysDialog({ keys, onClose }) {
  const open = Boolean(keys?.length);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">
            {keys?.length === 1 ? 'Clave generada' : `${keys?.length ?? 0} claves generadas`}
          </DialogTitle>
          <DialogDescription>
            Compártela con el negocio. Sirve una sola vez para registrarse en /negocio/registro.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {(keys ?? []).map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
            >
              <span className="font-mono text-lg font-extrabold tracking-widest">{k.code}</span>
              <Button
                variant="soft"
                size="sm"
                onClick={() => copyText(k.code, `Clave ${k.code} copiada`)}
              >
                <Copy /> Copiar
              </Button>
            </li>
          ))}
        </ul>
        {keys?.length > 1 && (
          <Button
            variant="outline"
            onClick={() => copyText(keys.map((k) => k.code).join('\n'), 'Claves copiadas')}
          >
            <Copy /> Copiar todas
          </Button>
        )}
        <Notice kind="info">La ves también en “Claves de registro”.</Notice>
        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
