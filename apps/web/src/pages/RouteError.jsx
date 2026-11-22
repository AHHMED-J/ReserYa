import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ButtonLink';
import { Logo } from '@/components/Logo';

/**
 * Pantalla de error general del router. Se muestra si una pantalla falla al dibujarse
 * (un error de código) en lugar de dejar la pantalla de error por defecto de React Router.
 */
export default function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  if (!notFound) console.error(error);

  return (
    <div
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center px-4 text-center"
    >
      <Logo size="lg" />
      <h1 className="mt-8 text-2xl font-extrabold">
        {notFound ? 'No encontramos esta página' : 'Algo salió mal'}
      </h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        {notFound
          ? 'Puede que el enlace esté mal escrito o ya no exista.'
          : 'Ocurrió un error inesperado en esta pantalla. Puedes volver a intentarlo o regresar al inicio.'}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {!notFound && (
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
        )}
        <ButtonLink to="/">Ir al inicio</ButtonLink>
      </div>
    </div>
  );
}
