// Links de la agenda en vivo (RF-45): del negocio completo o de una persona o espacio.
import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, ExternalLink, Link2, MessageCircle, RefreshCw, Store, Trash2 } from 'lucide-react';
import { useMe } from '@/hooks/useAuth';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { ErrorState, LoadingList } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { agoText } from '@/lib/format';
import { useLiveLinkAction, useLiveLinks } from '@/features/business-ops/hooks';
import { ConfirmDialog } from '@/features/business-ops/components';

export default function LiveLinks() {
  const q = useLiveLinks();
  const { user } = useMe();
  const businessName = user?.business?.name ?? 'mi negocio';
  const links = q.data?.links ?? [];
  const whole = links.find((l) => !l.resourceId);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Link en vivo"
        subtitle="Comparte la agenda del día con tu equipo o ponla en una pantalla del local."
      />
      <Notice kind="blue" className="mb-5">
        Quien tenga el link ve la agenda del día con el nombre corto del cliente, el servicio y la
        hora. Nunca ve teléfonos ni precios. Si el link se compartió de más, regenéralo y el
        anterior deja de funcionar.
      </Notice>

      {q.isLoading ? (
        <LoadingList rows={3} itemClassName="h-28" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <div className="space-y-5">
          <LinkCard
            title="Negocio completo"
            text="Todas las columnas: ideal para la pantalla de recepción."
            icon={<Store className="size-5" />}
            link={whole}
            resourceId={null}
            shareName={businessName}
          />
          <section>
            <h2 className="mb-3 text-lg font-extrabold">Por persona o espacio</h2>
            {q.data.resources.length ? (
              <div className="space-y-3">
                {q.data.resources.map((r) => (
                  <LinkCard
                    key={r.id}
                    title={r.name}
                    text={`Solo la agenda de ${r.name}.`}
                    icon={
                      <span className="size-3 rounded-full" style={{ backgroundColor: r.color }} />
                    }
                    link={links.find((l) => l.resourceId === r.id)}
                    resourceId={r.id}
                    shareName={`${r.name} en ${businessName}`}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Agrega a tu equipo o tus espacios para crear un link de cada uno.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function LinkCard({ title, text, icon, link, resourceId, shareName }) {
  const action = useLiveLinkAction();
  const [confirm, setConfirm] = useState(null); // 'regenerate' | 'delete'
  const url = link?.url ?? '';

  const run = (kind) =>
    action.mutate(
      { action: kind, id: link?.id, resourceId },
      {
        onSuccess: () => {
          toast.success(
            {
              create: 'Link creado',
              regenerate: 'Link nuevo listo. El anterior ya no funciona.',
              delete: 'Link borrado. Ya no funciona.',
            }[kind],
          );
          setConfirm(null);
        },
        onError: (err) => {
          toast.error(err.message);
          setConfirm(null);
        },
      },
    );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar. Selecciona el link y cópialo a mano.');
    }
  };
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Agenda en vivo de ${shareName}: ${url}`)}`;

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold">{title}</h3>
          <p className="text-[13px] text-muted-foreground">{text}</p>
        </div>
        {!link && (
          <Button onClick={() => run('create')} disabled={action.isPending}>
            <Link2 /> Crear link
          </Button>
        )}
      </div>
      {link && (
        <>
          <div className="mt-4 flex gap-2">
            <Input
              readOnly
              value={url}
              aria-label={`Link en vivo de ${title}`}
              onFocus={(e) => e.target.select()}
              className="h-10 font-mono text-[13px]"
            />
            <Button variant="outline" onClick={copy} aria-label="Copiar link">
              <Copy /> <span className="hidden sm:inline">Copiar</span>
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-field bg-white px-3 text-[13px] font-bold hover:bg-surface"
            >
              <MessageCircle className="size-4" /> WhatsApp
            </a>
            <a
              href={`/en-vivo/${link.token}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-field bg-white px-3 text-[13px] font-bold hover:bg-surface"
            >
              <ExternalLink className="size-4" /> Modo pantalla
            </a>
            <Button variant="outline" size="sm" onClick={() => setConfirm('regenerate')}>
              <RefreshCw /> Regenerar
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirm('delete')}>
              <Trash2 /> Borrar
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Creado {agoText(link.createdAt)}
            </span>
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirm === 'regenerate'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="¿Regenerar el link?"
        description="Se crea un link nuevo y el actual deja de funcionar. Tendrás que compartir el nuevo."
        confirmLabel="Regenerar"
        busy={action.isPending}
        onConfirm={() => run('regenerate')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="¿Borrar el link?"
        description="Las pantallas que lo tengan abierto dejarán de ver la agenda."
        confirmLabel="Borrar"
        destructive
        busy={action.isPending}
        onConfirm={() => run('delete')}
      />
    </div>
  );
}
