import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Clock, Store, KeyRound, User } from 'lucide-react';
import { useLogout } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { SideLayout } from './SideLayout';

export function AdminLayout() {
  return (
    <RequireAuth roles={['admin']}>
      <AdminShell />
    </RequireAuth>
  );
}

function AdminShell() {
  const navigate = useNavigate();
  const logout = useLogout();
  // { pendingCount } lo da el módulo de administración.
  const summary = useQuery({
    queryKey: ['admin', 'summary'],
    queryFn: () => api('/admin/summary'),
    retry: false,
    refetchInterval: 60_000,
  });
  return (
    <SideLayout
      tag="admin"
      home="/admin"
      groups={[
        {
          label: 'Administración',
          items: [
            {
              to: '/admin/pendientes',
              label: 'Pendientes',
              icon: Clock,
              count: summary.data?.pendingCount,
            },
            { to: '/admin/negocios', label: 'Negocios', icon: Store },
            { to: '/admin/claves', label: 'Claves de registro', icon: KeyRound },
          ],
        },
      ]}
      footer={{
        icon: User,
        title: 'Administrador',
        onLogout: () => logout.mutate(undefined, { onSuccess: () => navigate('/entrar') }),
      }}
    />
  );
}
