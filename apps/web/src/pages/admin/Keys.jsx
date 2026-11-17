// Claves de registro de un solo uso (RF-09).
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { dayShort } from '@/lib/format';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/Chip';
import { PageHeader } from '@/components/PageHeader';
import { LoadingList, ErrorState, EmptyState } from '@/components/States';
import { useKeys, useGenerateKeys, copyText, KEYS_KEY, SUMMARY_KEY } from '@/features/admin/api';
import { NewKeysDialog } from '@/features/admin/components';
import { NativeSelect, OptionPills } from '@/features/business-setup/components';
import { ConfirmButton } from '@/features/business-setup/ConfirmButton';

const FILTERS = [
  { value: 'free', label: 'Sin usar' },
  { value: 'used', label: 'Usadas' },
  { value: 'all', label: 'Todas' },
];

export default function Keys() {
  const q = useKeys();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('free');
  const [count, setCount] = useState(1);
  const [created, setCreated] = useState(null);
  const gen = useGenerateKeys({
    onSuccess: (data) => setCreated(data.created),
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id) => api(`/admin/keys/${id}`, { method: 'DELETE' }),
    onSuccess: (data) => {
      qc.setQueryData(KEYS_KEY, data.keys);
      qc.invalidateQueries({ queryKey: SUMMARY_KEY });
      toast.success('Clave borrada');
    },
  });

  const keys = q.data ?? [];
  const shown = keys.filter((k) =>
    filter === 'all' ? true : filter === 'used' ? k.usedAt : !k.usedAt,
  );
  const freeCount = keys.filter((k) => !k.usedAt).length;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Claves de registro"
        subtitle="Cada clave sirve una sola vez para que un negocio se registre."
      />

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4">
        <label className="grid gap-2 text-[13px] font-bold">
          Cuántas
          <NativeSelect
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-10 w-24"
          >
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button onClick={() => gen.mutate(count)} disabled={gen.isPending}>
          <Plus /> Generar {count === 1 ? 'clave' : `${count} claves`}
        </Button>
        <p className="ml-auto text-sm text-muted-foreground">
          {freeCount === 1 ? '1 clave sin usar' : `${freeCount} claves sin usar`}
        </p>
      </div>

      <OptionPills
        label="Filtrar claves"
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        className="mb-4"
      />

      {q.isLoading ? (
        <LoadingList rows={4} itemClassName="h-14" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={filter === 'used' ? 'Ninguna clave usada todavía' : 'No hay claves sin usar'}
          text={filter === 'used' ? undefined : 'Genera una para dársela a un negocio.'}
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
          {shown.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="w-32 font-mono text-[15px] font-extrabold tracking-widest">
                {k.code}
              </span>
              {k.usedAt ? <Chip tone="neutral">Usada</Chip> : <Chip tone="ok">Libre</Chip>}
              <div className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                {k.usedAt ? (
                  <>
                    Usada el {dayShort(k.usedAt)}
                    {k.business && (
                      <>
                        {' por '}
                        <Link
                          to={`/admin/negocios/${k.business.id}`}
                          className="font-bold text-primary"
                        >
                          {k.business.name}
                        </Link>
                      </>
                    )}
                  </>
                ) : (
                  `Generada el ${dayShort(k.createdAt)}`
                )}
              </div>
              {!k.usedAt && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => copyText(k.code, `Clave ${k.code} copiada`)}
                  >
                    <Copy /> Copiar
                  </Button>
                  <ConfirmButton
                    trigger={{
                      variant: 'ghost',
                      size: 'icon-sm',
                      'aria-label': `Borrar la clave ${k.code}`,
                      children: <Trash2 className="text-error" />,
                    }}
                    title={`¿Borrar la clave ${k.code}?`}
                    description="Ya no se podrá usar para registrar un negocio."
                    confirmLabel="Borrar"
                    busy={remove.isPending}
                    onConfirm={() => remove.mutateAsync(k.id)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <NewKeysDialog keys={created} onClose={() => setCreated(null)} />
    </div>
  );
}
