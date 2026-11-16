// Panel del administrador. Dueño: módulo de administración.
import { Navigate } from 'react-router';
import Pending from '@/pages/admin/Pending';
import Businesses from '@/pages/admin/Businesses';
import BusinessReview from '@/pages/admin/BusinessReview';
import Keys from '@/pages/admin/Keys';

/** Rutas dentro de /admin. */
export const adminRoutes = [
  { index: true, element: <Navigate to="/admin/pendientes" replace /> },
  { path: 'pendientes', element: <Pending /> },
  { path: 'negocios', element: <Businesses /> },
  { path: 'negocios/:id', element: <BusinessReview /> },
  { path: 'claves', element: <Keys /> },
];
