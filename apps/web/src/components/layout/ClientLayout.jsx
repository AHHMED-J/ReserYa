import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useMatches, useNavigate } from 'react-router';
import { House, Search, CalendarDays, User, RotateCcw, LogOut } from 'lucide-react';
import { useMe, useLogout } from '@/hooks/useAuth';
import { Logo } from '@/components/Logo';
import { ButtonLink } from '@/components/ButtonLink';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Layout del cliente: barra inferior en celular y encabezado en computadora.
 * Una ruta puede ocultar la barra inferior con handle: { hideNav: true }
 * (por ejemplo el flujo de reservar, que tiene su propia barra de acción).
 */
export function ClientLayout() {
  const { user } = useMe();
  const matches = useMatches();
  const hideNav = matches.some((m) => m.handle?.hideNav);
  if (user?.role === 'business') return <Navigate to="/negocio" replace />;
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;
  return (
    <div className="min-h-dvh bg-background">
      <DesktopHeader user={user} />
      <main
        className={cn(
          'mx-auto w-full max-w-[1280px] px-4 pt-4 md:px-12 md:pt-6 md:pb-12',
          hideNav ? 'pb-28' : 'pb-28',
        )}
      >
        <Outlet />
      </main>
      {!hideNav && <BottomNav signedIn={Boolean(user)} />}
    </div>
  );
}

/** Sin sesión no hay Reservas ni Volver a agendar: solo Inicio, Buscar y Perfil. */
function BottomNav({ signedIn }) {
  const tab = (to, label, Icon, end) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex w-16 flex-col items-center gap-1 text-[11px]',
          isActive ? 'font-extrabold text-primary' : 'font-semibold text-muted-foreground',
        )
      }
    >
      <Icon className="size-[22px]" />
      {label}
    </NavLink>
  );
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Navegación principal"
    >
      <div className="relative mx-auto flex h-[70px] max-w-md items-center justify-around px-2">
        {tab('/', 'Inicio', House, true)}
        {tab('/buscar', 'Buscar', Search)}
        {signedIn && (
          <Link
            to="/volver-a-agendar"
            aria-label="Volver a agendar"
            className="-mt-8 flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-[0_6px_14px_rgba(10,74,107,0.25)]"
          >
            <RotateCcw className="size-6" />
          </Link>
        )}
        {signedIn && tab('/reservas', 'Reservas', CalendarDays)}
        {tab('/perfil', 'Perfil', User)}
      </div>
    </nav>
  );
}

function DesktopHeader({ user }) {
  const navigate = useNavigate();
  const logout = useLogout();
  const [q, setQ] = useState('');
  const link = ({ isActive }) =>
    cn(
      'rounded-lg px-3.5 py-2 text-[15px]',
      isActive
        ? 'bg-primary-soft font-extrabold text-primary'
        : 'font-semibold text-[#3B4856] hover:bg-surface',
    );
  return (
    <header className="sticky top-0 z-40 hidden h-[72px] border-b border-border bg-white md:block">
      <div className="mx-auto flex h-full max-w-[1280px] items-center gap-6 px-12">
        <Logo size="md" />
        <form
          className="flex h-11 max-w-[440px] flex-1 items-center gap-2 rounded-[14px] border border-border bg-surface px-4"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/buscar${q ? `?q=${encodeURIComponent(q)}` : ''}`);
          }}
          role="search"
        >
          <Search className="size-5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar negocios o servicios…"
            aria-label="Buscar negocios o servicios"
            className="h-full flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
          />
        </form>
        <nav className="ml-auto flex items-center gap-1">
          <NavLink to="/" end className={link}>
            Inicio
          </NavLink>
          {user && (
            <NavLink to="/reservas" className={link}>
              Mis reservas
            </NavLink>
          )}
        </nav>
        {user && (
          <ButtonLink to="/volver-a-agendar">
            <RotateCcw /> Volver a agendar
          </ButtonLink>
        )}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex size-[42px] items-center justify-center rounded-full bg-primary-soft text-base font-extrabold text-primary"
              aria-label="Mi cuenta"
            >
              {user.firstName?.[0]?.toUpperCase()}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate('/perfil')}>
                <User /> Mi perfil
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
              >
                <LogOut /> Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <ButtonLink to="/entrar">Iniciar sesión</ButtonLink>
        )}
      </div>
    </header>
  );
}
