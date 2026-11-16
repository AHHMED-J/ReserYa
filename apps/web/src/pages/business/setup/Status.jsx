// Aviso del estado del negocio cuando no está activo (RF-73).
import { Navigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, CircleX, Ban, Mail, RefreshCw } from 'lucide-react';
import { useMe, ME_KEY } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { FullPageSpinner } from '@/components/States';
import { SUPPORT_EMAIL } from '@/features/business-setup/constants';
import { cn } from '@/lib/utils';

const STATES = {
  pending: {
    icon: Clock,
    tone: 'bg-warning-soft text-warning',
    title: 'Estamos revisando tu negocio',
    text: 'Te avisaremos por correo cuando esté aprobado. Normalmente tardamos uno o dos días hábiles.',
  },
  rejected: {
    icon: CircleX,
    tone: 'bg-error-soft text-error',
    title: 'No pudimos aprobar tu negocio',
    text: 'Revisamos tu registro y por ahora no lo podemos aprobar.',
  },
  suspended: {
    icon: Ban,
    tone: 'bg-error-soft text-error',
    title: 'Tu negocio está suspendido',
    text: 'Por ahora no apareces en las búsquedas ni recibes solicitudes nuevas.',
  },
};

export default function Status() {
  const { user, isFetching } = useMe();
  const qc = useQueryClient();
  const b = user?.business;
  if (!b) return <FullPageSpinner />;
  if (b.status === 'approved') return <Navigate to="/negocio/configuracion" replace />;

  const s = STATES[b.status] ?? STATES.pending;
  const reason =
    b.status === 'rejected'
      ? (b.rejectionReason ?? b.reasons?.rejection)
      : b.status === 'suspended'
        ? (b.suspensionReason ?? b.reasons?.suspension)
        : null;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center">
      <div className="rounded-xl border border-border bg-white p-6 text-center md:p-8">
        <div
          className={cn(
            'mx-auto mb-4 flex size-14 items-center justify-center rounded-full',
            s.tone,
          )}
        >
          <s.icon className="size-7" />
        </div>
        <p className="text-sm font-bold text-muted-foreground">{b.name}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{s.title}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{s.text}</p>

        {reason && (
          <div className="mt-5 rounded-lg bg-surface p-4 text-left">
            <p className="text-[11px] font-extrabold tracking-wider text-muted-foreground uppercase">
              Motivo
            </p>
            <p className="mt-1 text-[15px] whitespace-pre-line">{reason}</p>
          </div>
        )}

        {b.status !== 'pending' && (
          <p className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Mail className="size-4" />
            <span>
              ¿Dudas? Escríbenos a{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold text-primary">
                {SUPPORT_EMAIL}
              </a>
            </span>
          </p>
        )}

        <Button
          variant="outline"
          className="mt-6"
          onClick={() => qc.invalidateQueries({ queryKey: ME_KEY })}
          disabled={isFetching}
        >
          <RefreshCw className={cn(isFetching && 'animate-spin')} /> Revisar de nuevo
        </Button>
      </div>
    </div>
  );
}
