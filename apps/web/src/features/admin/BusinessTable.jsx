// Tabla de negocios del admin (pantalla 11). En celular se vuelve una lista de tarjetas.
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { agoText, dt, phone } from '@/lib/format';
import { ButtonLink } from '@/components/ButtonLink';
import { cn } from '@/lib/utils';
import { BusinessStatusChip, CategoryTile, KeyCode } from './components';

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "Hace 2 h" en naranja si lleva más de 2 días esperando. */
function Received({ at, pending }) {
  const old = pending && -dt(at).diffNow('days').days > 2;
  return (
    <span className={cn('font-semibold', old ? 'text-warning' : 'text-foreground')}>
      {cap(agoText(at))}
    </span>
  );
}

/** mode: 'pending' (columna Recibido) o 'all' (columna Estado). */
export function BusinessTable({ businesses, mode = 'all' }) {
  const pending = mode === 'pending';
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <table className="hidden w-full text-left text-sm lg:table">
        <thead>
          <tr className="border-b border-border text-[11px] font-extrabold tracking-wider text-muted-foreground uppercase">
            <th className="px-6 py-4 font-extrabold">Negocio</th>
            <th className="px-4 py-4 font-extrabold">Categoría</th>
            <th className="px-4 py-4 font-extrabold">Contacto</th>
            <th className="px-4 py-4 font-extrabold">Clave usada</th>
            <th className="px-4 py-4 font-extrabold">{pending ? 'Recibido' : 'Estado'}</th>
            <th className="px-6 py-4">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {businesses.map((b) => (
            <tr key={b.id} className="border-b border-border last:border-0">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <CategoryTile icon={b.category.icon} />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold">{b.name}</p>
                    <p className="max-w-56 truncate text-xs text-muted-foreground">
                      {b.address ?? 'Ensenada'}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4 font-semibold">{b.category.name}</td>
              <td className="px-4 py-4">
                <p className="font-semibold">{b.email}</p>
                <p className="text-xs text-muted-foreground">{phone(b.phone)}</p>
              </td>
              <td className="px-4 py-4">
                <KeyCode code={b.keyCode} />
              </td>
              <td className="px-4 py-4">
                {pending ? (
                  <Received at={b.createdAt} pending />
                ) : (
                  <BusinessStatusChip status={b.status} />
                )}
              </td>
              <td className="px-6 py-4 text-right">
                <ButtonLink
                  to={`/admin/negocios/${b.id}`}
                  variant={pending ? 'default' : 'outline'}
                >
                  {pending ? 'Revisar' : 'Ver'}
                </ButtonLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-border lg:hidden">
        {businesses.map((b) => (
          <li key={b.id}>
            <Link
              to={`/admin/negocios/${b.id}`}
              className="flex items-center gap-3 px-4 py-4 hover:bg-surface"
            >
              <CategoryTile icon={b.category.icon} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[15px] font-bold">{b.name}</p>
                  {!pending && <BusinessStatusChip status={b.status} size="sm" />}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {b.category.name} · {b.email}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <KeyCode code={b.keyCode} className="h-6 px-2 text-[11px]" />
                  {pending && <Received at={b.createdAt} pending />}
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
