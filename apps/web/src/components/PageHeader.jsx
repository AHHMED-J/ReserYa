import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Encabezado con flecha atrás (celular) y título. back: ruta o true para ir atrás. */
export function PageHeader({ title, subtitle, back, actions, className }) {
  const navigate = useNavigate();
  return (
    <div className={cn('mb-4 flex items-start gap-2', className)}>
      {back && (
        <button
          type="button"
          onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
          className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface"
          aria-label="Regresar"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      <div className={cn('min-w-0 flex-1', back && 'pt-1.5')}>
        <h1
          className={cn(
            'font-extrabold tracking-tight',
            back ? 'text-lg' : 'text-2xl md:text-[26px]',
          )}
        >
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
