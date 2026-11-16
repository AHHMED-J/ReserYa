import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { MailCheck, CircleCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useMe, ME_KEY, homeFor } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ButtonLink';
import { Notice } from '@/components/Notice';
import { Spinner } from '@/components/States';

/**
 * Sin token: "Revisa tu correo" con botón para reenviar.
 * Con ?token=: confirma el correo (RF-02).
 */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  return token ? <Confirm token={token} /> : <CheckInbox />;
}

function Confirm({ token }) {
  const qc = useQueryClient();
  const { user } = useMe();
  const [state, setState] = useState('loading');
  const [error, setError] = useState(null);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api('/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => {
        setState('ok');
        qc.invalidateQueries({ queryKey: ME_KEY });
      })
      .catch((e) => {
        setError(e.message);
        setState('error');
      });
  }, [token, qc]);

  if (state === 'loading') return <Spinner className="mx-auto" />;
  if (state === 'error')
    return (
      <div>
        <h1 className="text-2xl font-extrabold">No se pudo verificar</h1>
        <Notice kind="error" className="mt-4">
          {error ?? 'El enlace no es válido o ya venció.'}
        </Notice>
        <ButtonLink to="/verificar-correo" variant="outline" className="mt-5 w-full">
          Pedir un enlace nuevo
        </ButtonLink>
      </div>
    );
  return (
    <div className="text-center">
      <CircleCheck className="mx-auto size-14 text-success" />
      <h1 className="mt-4 text-2xl font-extrabold">¡Correo verificado!</h1>
      <p className="mt-2 text-muted-foreground">Ya puedes reservar.</p>
      <ButtonLink to={user ? homeFor(user) : '/entrar'} size="lg" className="mt-6 w-full">
        {user ? 'Continuar' : 'Iniciar sesión'}
      </ButtonLink>
    </div>
  );
}

function CheckInbox() {
  const { user } = useMe();
  const [params] = useSearchParams();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const resend = async () => {
    setBusy(true);
    try {
      await api('/auth/resend-verification', { method: 'POST' });
      setSent(true);
    } finally {
      setBusy(false);
    }
  };
  const next = params.get('next') ?? '/';
  return (
    <div className="text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <MailCheck className="size-8" />
      </div>
      <h1 className="mt-4 text-2xl font-extrabold">Revisa tu correo</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        Te enviamos un enlace a <b className="text-foreground">{user?.email ?? 'tu correo'}</b> para
        confirmar tu cuenta. Necesitas confirmarlo antes de reservar.
      </p>
      {user?.emailVerified ? (
        <ButtonLink to={next} size="lg" className="mt-6 w-full">
          Continuar
        </ButtonLink>
      ) : (
        <>
          {sent && (
            <Notice kind="ok" className="mt-5 text-left">
              Listo, te enviamos otro enlace.
            </Notice>
          )}
          {user && (
            <Button
              variant="outline"
              size="lg"
              className="mt-6 w-full"
              onClick={resend}
              disabled={busy}
            >
              Reenviar correo
            </Button>
          )}
          <Link to="/" className="mt-4 inline-block text-sm font-bold text-primary">
            Explorar negocios mientras tanto
          </Link>
        </>
      )}
    </div>
  );
}
