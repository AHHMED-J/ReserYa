import { Navigate, useLocation } from 'react-router';
import { useMe, homeFor } from '@/hooks/useAuth';
import { FullPageSpinner } from './States';

/**
 * Protege una ruta. roles: ['client'] etc. Sin sesión manda a /entrar?next=...
 * Con otro rol manda a la página de inicio de su rol.
 */
export function RequireAuth({ roles, children }) {
  const { user, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <FullPageSpinner />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/entrar?next=${next}`} replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}
