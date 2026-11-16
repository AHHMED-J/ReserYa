import { CircleAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonLink } from './ButtonLink';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Varias barras grises mientras carga. */
export function LoadingList({ rows = 3, className, itemClassName = 'h-24' }) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('w-full rounded-xl', itemClassName)} />
      ))}
    </div>
  );
}

export function Spinner({ className }) {
  return (
    <Loader2 className={cn('size-5 animate-spin text-primary', className)} aria-label="Cargando" />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="size-7" />
    </div>
  );
}

/** Mensaje cuando no hay nada que mostrar (RF-63). action: { label, to } */
export function EmptyState({ icon: Icon, title, text, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-xl border border-dashed border-field bg-surface px-6 py-10 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-white text-primary">
          <Icon className="size-6" />
        </div>
      )}
      <p className="text-base font-extrabold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && (
        <ButtonLink to={action.to} className="mt-4">
          {action.label}
        </ButtonLink>
      )}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-xl bg-error-soft px-6 py-8 text-center',
        className,
      )}
    >
      <CircleAlert className="mb-2 size-6 text-error" />
      <p className="font-bold">No se pudo cargar</p>
      <p className="mt-1 text-sm text-muted-foreground">{error?.message ?? 'Intenta de nuevo.'}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => onRetry()}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
