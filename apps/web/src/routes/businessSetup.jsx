// Alta y configuración del negocio. Dueño: módulo de configuración del negocio.
import RegisterBusiness from '@/pages/business/setup/RegisterBusiness';
import Status from '@/pages/business/setup/Status';
import Setup from '@/pages/business/setup/Setup';
import ResetPin from '@/pages/business/setup/ResetPin';
import Services from '@/pages/business/setup/Services';
import Team from '@/pages/business/setup/Team';
import Rules from '@/pages/business/setup/Rules';
import PublicProfile from '@/pages/business/setup/PublicProfile';

/** Rutas públicas (sin el menú del negocio). */
export const businessPublicRoutes = [
  { path: '/negocio/registro', element: <RegisterBusiness /> },
  { path: '/negocio/restablecer-pin', element: <ResetPin /> },
];
/** Rutas dentro de /negocio (recepción, sin PIN). */
export const businessSetupRoutes = [
  { path: 'estado', element: <Status /> },
  { path: 'configuracion', element: <Setup /> },
];
/** Rutas dentro de /negocio/dueno (con PIN). */
export const ownerSetupRoutes = [
  { path: 'servicios', element: <Services /> },
  { path: 'equipo', element: <Team /> },
  { path: 'reglas', element: <Rules /> },
  { path: 'perfil', element: <PublicProfile /> },
];
