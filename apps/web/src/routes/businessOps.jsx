// Operación diaria del negocio y agenda en vivo. Dueño: módulo de operación.
import Requests from '@/pages/business/ops/Requests';
import Agenda from '@/pages/business/ops/Agenda';
import Bookings from '@/pages/business/ops/Bookings';
import Dashboard from '@/pages/business/ops/Dashboard';
import Stats from '@/pages/business/ops/Stats';
import Payments from '@/pages/business/ops/Payments';
import LiveLinks from '@/pages/business/ops/LiveLinks';
import LiveScreen from '@/pages/live/LiveScreen';

/** Rutas públicas sin layout. */
export const liveRoutes = [{ path: '/en-vivo/:token', element: <LiveScreen /> }];
/** Rutas dentro de /negocio (recepción). */
export const receptionRoutes = [
  { path: 'solicitudes', element: <Requests /> },
  { path: 'agenda', element: <Agenda /> },
  { path: 'reservas', element: <Bookings /> },
];
/** Rutas dentro de /negocio/dueno (con PIN). */
export const ownerOpsRoutes = [
  { index: true, element: <Dashboard /> },
  { path: 'estadisticas', element: <Stats /> },
  { path: 'pagos', element: <Payments /> },
  { path: 'link-en-vivo', element: <LiveLinks /> },
];
