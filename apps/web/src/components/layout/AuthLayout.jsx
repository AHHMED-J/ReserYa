import { Outlet } from 'react-router';
import { Logo } from '@/components/Logo';

/** Pantallas de acceso: columna angosta centrada. */
export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-white md:bg-surface">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-4 py-8 md:my-10 md:flex-none md:rounded-2xl md:border md:border-border md:bg-white md:px-10 md:py-10">
        <Logo size="lg" className="mb-8" />
        <Outlet />
      </div>
    </div>
  );
}
