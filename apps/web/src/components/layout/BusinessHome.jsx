import { Navigate } from 'react-router';
import { useSetup } from '@/features/business-setup/api';
import { FullPageSpinner } from '@/components/States';

/** Al entrar, el negocio ve sus pasos pendientes si aún no termina la configuración (RF-71). */
export function BusinessHome() {
  const { data, isLoading, isError } = useSetup();
  if (isLoading) return <FullPageSpinner />;
  const ready = isError || data?.ready;
  return <Navigate to={ready ? '/negocio/solicitudes' : '/negocio/configuracion'} replace />;
}
