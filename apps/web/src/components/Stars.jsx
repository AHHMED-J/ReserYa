import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/** ★ 4.8 (120) · Barbería */
export function RatingMeta({ avg, count, extra, className }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-[13px] text-muted-foreground', className)}
    >
      <Star className="size-3.5 fill-star text-star" />
      {count > 0 ? (
        <>
          <b className="font-bold text-foreground">{Number(avg).toFixed(1)}</b> ({count})
        </>
      ) : (
        <span>Nuevo</span>
      )}
      {extra && <span>· {extra}</span>}
    </span>
  );
}

/** Estrellas para mostrar (value) o para elegir (onChange). */
export function Stars({ value = 0, onChange, size = 'size-6', className }) {
  return (
    <div
      className={cn('flex gap-1', className)}
      role={onChange ? 'radiogroup' : undefined}
      aria-label="Calificación"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        const icon = (
          <Star className={cn(size, on ? 'fill-star text-star' : 'text-field')} strokeWidth={1.6} />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
            onClick={() => onChange(n)}
            className="rounded-md focus-visible:ring-2 focus-visible:ring-ring"
          >
            {icon}
          </button>
        ) : (
          <span key={n}>{icon}</span>
        );
      })}
    </div>
  );
}
