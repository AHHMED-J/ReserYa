import { createBrowserRouter, Navigate, Outlet, ScrollRestoration } from 'react-router';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { BusinessLayout } from '@/components/layout/BusinessLayout';
import { OwnerGate } from '@/components/layout/OwnerGate';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { clientRoutes } from '@/routes/client';
import {
  businessPublicRoutes,
  businessSetupRoutes,
  ownerSetupRoutes,
} from '@/routes/businessSetup';
import { receptionRoutes, ownerOpsRoutes, liveRoutes } from '@/routes/businessOps';
import { ownerCalendarRoutes } from '@/routes/calendar';
import { adminRoutes } from '@/routes/admin';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import CompleteProfile from '@/pages/auth/CompleteProfile';
import VerifyEmail from '@/pages/auth/VerifyEmail';
import ForgotPassword from '@/pages/auth/ForgotPassword';
import ResetPassword from '@/pages/auth/ResetPassword';
import Legal from '@/pages/legal/Legal';
import NotFound from '@/pages/NotFound';

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <ClientLayout />, children: clientRoutes },
      {
        element: <AuthLayout />,
        children: [
          { path: '/entrar', element: <Login /> },
          { path: '/registro', element: <Register /> },
          { path: '/completar-perfil', element: <CompleteProfile /> },
          { path: '/verificar-correo', element: <VerifyEmail /> },
          { path: '/recuperar', element: <ForgotPassword /> },
          { path: '/restablecer', element: <ResetPassword /> },
          ...businessPublicRoutes,
        ],
      },
      {
        element: <ClientLayout />,
        children: [
          { path: '/privacidad', element: <Legal doc="privacidad" /> },
          { path: '/terminos', element: <Legal doc="terminos" /> },
        ],
      },
      {
        path: '/negocio',
        element: <BusinessLayout />,
        children: [
          { index: true, element: <Navigate to="/negocio/solicitudes" replace /> },
          ...businessSetupRoutes,
          ...receptionRoutes,
          {
            path: 'dueno',
            element: <OwnerGate />,
            children: [...ownerOpsRoutes, ...ownerSetupRoutes, ...ownerCalendarRoutes],
          },
        ],
      },
      { path: '/admin', element: <AdminLayout />, children: adminRoutes },
      ...liveRoutes,
      { path: '*', element: <NotFound /> },
    ],
  },
]);
