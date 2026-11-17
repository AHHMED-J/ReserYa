// Rutas del cliente (dentro de ClientLayout). Dueño: módulo de cliente.
import { RequireAuth } from '@/components/RequireAuth';
import Home from '@/pages/client/Home';
import Search from '@/pages/client/Search';
import BusinessProfile from '@/pages/client/BusinessProfile';
import BookingFlow from '@/pages/client/BookingFlow';
import BookingSent from '@/pages/client/BookingSent';
import MyBookings from '@/pages/client/MyBookings';
import BookingDetail from '@/pages/client/BookingDetail';
import WriteReview from '@/pages/client/WriteReview';
import Rebook from '@/pages/client/Rebook';
import Profile from '@/pages/client/Profile';

const client = (el) => <RequireAuth roles={['client']}>{el}</RequireAuth>;

export const clientRoutes = [
  { index: true, element: <Home /> },
  { path: 'buscar', element: <Search /> },
  // El perfil tiene su propia barra de "Reservar" abajo (pantalla 04).
  { path: 'negocios/:id', element: <BusinessProfile />, handle: { hideNav: true } },
  { path: 'negocios/:id/reservar', element: client(<BookingFlow />), handle: { hideNav: true } },
  { path: 'reservas', element: client(<MyBookings />) },
  { path: 'reservas/:id', element: client(<BookingDetail />) },
  { path: 'reservas/:id/enviada', element: client(<BookingSent />), handle: { hideNav: true } },
  { path: 'reservas/:id/resena', element: client(<WriteReview />) },
  { path: 'volver-a-agendar', element: client(<Rebook />) },
  { path: 'perfil', element: client(<Profile />) },
];
