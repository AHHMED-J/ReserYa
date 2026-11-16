import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Inbox,
  CalendarDays,
  List,
  LayoutDashboard,
  ChartColumn,
  DollarSign,
  Scissors,
  Users,
  SlidersHorizontal,
  Store,
  CalendarSync,
  Link2,
  Lock,
} from 'lucide-react';
import { useMe, useLogout, ME_KEY } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { Button } from '@/components/ui/button';
import { SideLayout } from './SideLayout';

/** Rutas del negocio que se ven aunque no esté aprobado. */
const OPEN_WHEN_INACTIVE = ['/negocio/estado'];

export function BusinessLayout() {
  return (
    <RequireAuth roles={['business']}>
      <BusinessShell />
    </RequireAuth>
  );
}

function BusinessShell() {
  const { user } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useLogout();
  const business = user.business;
  const ownerMode = business?.ownerMode;
  const active = business?.status === 'approved';

  // Contador de solicitudes pendientes (lo da el módulo de operación).
  const summary = useQuery({
    queryKey: ['business', 'summary'],
    queryFn: () => api('/business/summary'),
    enabled: active,
    refetchInterval: 30_000,
    retry: false,
  });

  // El modo dueño se vuelve a bloquear solo a los 5 minutos (RF-07).
  useEffect(() => {
    if (!business?.ownerModeUntil) return;
    const ms = new Date(business.ownerModeUntil).getTime() - Date.now();
    const t = setTimeout(() => qc.invalidateQueries({ queryKey: ME_KEY }), Math.max(ms, 0) + 500);
    return () => clearTimeout(t);
  }, [business?.ownerModeUntil, qc]);

  if (!active && !OPEN_WHEN_INACTIVE.includes(location.pathname)) {
    return <Navigate to="/negocio/estado" replace />;
  }

  const lock = async () => {
    await api('/business/owner/lock', { method: 'POST' });
    await qc.invalidateQueries({ queryKey: ME_KEY });
    navigate('/negocio/solicitudes');
  };

  const groups = active
    ? [
        {
          label: 'Recepción',
          items: [
            {
              to: '/negocio/solicitudes',
              label: 'Solicitudes',
              icon: Inbox,
              count: summary.data?.pendingRequests,
            },
            { to: '/negocio/agenda', label: 'Agenda', icon: CalendarDays },
            { to: '/negocio/reservas', label: 'Reservas', icon: List },
          ],
        },
        {
          label: 'Modo dueño',
          locked: !ownerMode,
          items: [
            { to: '/negocio/dueno', label: 'Panel', icon: LayoutDashboard, end: true },
            { to: '/negocio/dueno/estadisticas', label: 'Estadísticas', icon: ChartColumn },
            { to: '/negocio/dueno/pagos', label: 'Pagos y reembolsos', icon: DollarSign },
            { to: '/negocio/dueno/servicios', label: 'Servicios', icon: Scissors },
            { to: '/negocio/dueno/equipo', label: 'Equipo y espacios', icon: Users },
            { to: '/negocio/dueno/reglas', label: 'Reglas de reserva', icon: SlidersHorizontal },
            { to: '/negocio/dueno/perfil', label: 'Perfil público', icon: Store },
            { to: '/negocio/dueno/google', label: 'Google Calendar', icon: CalendarSync },
            { to: '/negocio/dueno/link-en-vivo', label: 'Link en vivo', icon: Link2 },
          ],
        },
      ]
    : [];

  return (
    <SideLayout
      tag="negocios"
      home="/negocio"
      groups={groups}
      topRight={
        ownerMode && (
          <Button variant="outline" size="sm" onClick={lock}>
            <Lock /> Salir
          </Button>
        )
      }
      footer={{
        icon: Store,
        title: business?.name ?? 'Mi negocio',
        onLogout: () => logout.mutate(undefined, { onSuccess: () => navigate('/entrar') }),
      }}
    />
  );
}

/** Botón "Salir del modo dueño" para usar en las páginas del modo dueño. */
export function useOwnerLock() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await api('/business/owner/lock', { method: 'POST' });
    await qc.invalidateQueries({ queryKey: ME_KEY });
    navigate('/negocio/solicitudes');
  };
}
