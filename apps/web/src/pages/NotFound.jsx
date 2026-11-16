import { ButtonLink } from '@/components/ButtonLink';
import { Logo } from '@/components/Logo';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo size="lg" />
      <h1 className="mt-8 text-2xl font-extrabold">No encontramos esta página</h1>
      <p className="mt-2 text-muted-foreground">
        Puede que el enlace esté mal escrito o ya no exista.
      </p>
      <ButtonLink to="/" className="mt-6">
        Ir al inicio
      </ButtonLink>
    </div>
  );
}
