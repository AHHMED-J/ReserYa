import { Info, CircleCheck, TriangleAlert, CircleX } from 'lucide-react';
import { cn } from '@/lib/utils';

const KINDS = {
  info: ['bg-surface text-muted-foreground', Info, 'text-muted-foreground'],
  blue: ['bg-primary-soft text-foreground', Info, 'text-primary'],
  warn: ['bg-warning-soft text-foreground', TriangleAlert, 'text-warning'],
  ok: ['bg-success-soft text-foreground', CircleCheck, 'text-success'],
  error: ['bg-error-soft text-foreground', CircleX, 'text-error'],
};

/** Aviso con ícono. kind: info | blue | warn | ok | error */
export function Notice({ kind = 'info', icon: IconOverride, className, children }) {
  const [box, Icon, iconColor] = KINDS[kind];
  const I = IconOverride ?? Icon;
  return (
    <div
      className={cn('flex gap-3 rounded-lg px-3.5 py-3 text-[13px] leading-5', box, className)}
      role="note"
    >
      <I className={cn('mt-px size-[18px] shrink-0', iconColor)} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
