import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Enlace con apariencia de botón: <ButtonLink to="/buscar" variant="outline">Buscar</ButtonLink> */
export function ButtonLink({ to, variant, size, className, children, ...props }) {
  return (
    <Link to={to} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </Link>
  );
}
