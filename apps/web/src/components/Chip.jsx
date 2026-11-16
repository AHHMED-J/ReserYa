import { cn } from '@/lib/utils';

const TONES = {
  ok: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning',
  error: 'bg-error-soft text-error',
  neutral: 'bg-neutral-soft text-neutral-strong',
  primary: 'bg-primary-soft text-primary',
  white: 'bg-white text-primary',
  solid: 'bg-primary text-white uppercase tracking-wide text-[10px] font-extrabold',
};

/** Etiqueta redonda. tone: ok | warn | error | neutral | primary | white | solid */
export function Chip({ tone = 'neutral', size = 'md', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-bold whitespace-nowrap',
        size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Estados de una reserva con su color (guía de estilo). */
export const BOOKING_STATES = {
  pending: ['Pendiente', 'warn'],
  hold: ['Apartada', 'warn'],
  confirmed: ['Confirmada', 'ok'],
  completed: ['Completada', 'primary'],
  cancelled: ['Cancelada', 'error'],
  rejected: ['Rechazada', 'error'],
  expired: ['Vencida', 'neutral'],
  no_show: ['No asistió', 'neutral'],
};

export function StateChip({ status, size, className }) {
  const [label, tone] = BOOKING_STATES[status] ?? [status, 'neutral'];
  return (
    <Chip tone={tone} size={size} className={className}>
      {label}
    </Chip>
  );
}
