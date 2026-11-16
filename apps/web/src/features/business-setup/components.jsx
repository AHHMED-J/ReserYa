// Controles pequeños que usan varias pantallas de configuración del negocio.
import { Check } from 'lucide-react';
import { useCategories } from '@/hooks/useConfig';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { RESOURCE_COLORS } from './constants';

/**
 * Grupo de opciones como botones (role="radio"). Flechas izquierda/derecha cambian la opción.
 * options: [{ value, label }]
 */
export function OptionPills({ label, options, value, onChange, className, id }) {
  const move = (e, i) => {
    const d =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!d) return;
    e.preventDefault();
    const next = options[(i + d + options.length) % options.length];
    onChange(next.value);
    e.currentTarget.parentElement?.children[(i + d + options.length) % options.length]?.focus();
  };
  const selectedIndex = options.findIndex((o) => o.value === value);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      id={id}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (selectedIndex === -1 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => move(e, i)}
            className={cn(
              'h-10 min-w-14 rounded-lg border px-3 text-sm font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
              on
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-field bg-white text-foreground hover:bg-surface',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Selector de las 9 categorías con su ícono (RF-14). */
export function CategoryPicker({ value, onChange, invalid }) {
  const { data: categories, isLoading } = useCategories();
  if (isLoading)
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-xl" />
        ))}
      </div>
    );
  return (
    <div
      role="radiogroup"
      aria-label="Categoría"
      aria-invalid={invalid || undefined}
      className="grid grid-cols-3 gap-2"
    >
      {(categories ?? []).map((c) => {
        const on = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(c.id)}
            className={cn(
              'relative flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs leading-tight font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
              on
                ? 'border-primary bg-primary-soft text-primary'
                : invalid
                  ? 'border-error bg-white text-foreground'
                  : 'border-border bg-white text-foreground hover:bg-surface',
            )}
          >
            {on && <Check className="absolute top-1.5 right-1.5 size-3.5" aria-hidden />}
            <CategoryIcon
              icon={c.icon}
              className={cn('size-6', on ? 'text-primary' : 'text-photo-icon')}
            />
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

/** Paleta fija de 8 colores sólidos para los recursos. */
export function ColorPicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
      {RESOURCE_COLORS.map((c) => {
        const on = c.value.toUpperCase() === value?.toUpperCase();
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={c.label}
            title={c.label}
            onClick={() => onChange(c.value)}
            className={cn(
              'flex size-9 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
              on && 'ring-2 ring-foreground ring-offset-2',
            )}
            style={{ backgroundColor: c.value }}
          >
            {on && <Check className="size-4 text-white" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/** <select> nativo con el estilo de los campos (accesible y fácil en celular). */
export function NativeSelect({ className, children, ...props }) {
  return (
    <select
      className={cn(
        'h-12 w-full rounded-lg border border-field bg-white px-3 text-[15px] font-medium text-foreground outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary aria-invalid:border-error',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/** Tarjeta con borde (sin sombra) y título opcional. */
export function Section({ title, description, actions, className, children }) {
  return (
    <section className={cn('rounded-xl border border-border bg-white p-4 md:p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-lg font-extrabold">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
