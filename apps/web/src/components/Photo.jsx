import { cn } from '@/lib/utils';
import { CategoryIcon } from './CategoryIcon';

/**
 * Foto del negocio. Sin foto real se usa un cuadro de color sólido con el ícono de la categoría
 * (guía de estilo). className define tamaño y esquinas.
 */
export function Photo({ url, icon, alt = '', className, iconClassName }) {
  if (url)
    return <img src={url} alt={alt} className={cn('object-cover', className)} loading="lazy" />;
  return (
    <div
      className={cn('flex items-center justify-center bg-photo text-photo-icon', className)}
      aria-hidden
    >
      <CategoryIcon
        icon={icon}
        className={cn('size-1/3 max-h-16 max-w-16', iconClassName)}
        strokeWidth={1.6}
      />
    </div>
  );
}
