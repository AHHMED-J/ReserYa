import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/** Logo + "ReserYa". tag: texto pequeño a la derecha ("negocios", "admin"). */
export function Logo({ to = '/', size = 'md', tag, className }) {
  const s = { sm: ['size-7', 'text-lg'], md: ['size-8', 'text-xl'], lg: ['size-11', 'text-2xl'] }[
    size
  ];
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2', className)}>
      <img src="/logo-mark.png" alt="" className={s[0]} />
      <span className={cn('font-extrabold tracking-tight text-foreground', s[1])}>ReserYa</span>
      {tag && (
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
          {tag}
        </span>
      )}
    </Link>
  );
}
