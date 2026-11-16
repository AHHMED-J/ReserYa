// Lista de reservas con filtros y detalle (recepción).
import { useEffect, useState } from 'react';
import { List, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { StateChip } from '@/components/Chip';
import { EmptyState, ErrorState, LoadingList } from '@/components/States';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { dateTimeShort, money, time } from '@/lib/format';
import { useBookings } from '@/features/business-ops/hooks';
import { BookingSheet, NativeSelect } from '@/features/business-ops/components';

const STATUS_OPTIONS = [
  ['', 'Todos los estados'],
  ['confirmed', 'Confirmadas'],
  ['pending', 'Solicitudes pendientes'],
  ['completed', 'Completadas'],
  ['no_show', 'No asistió'],
  ['cancelled', 'Canceladas'],
  ['rejected', 'Rechazadas'],
  ['expired', 'Vencidas'],
];
const PAGE_SIZE = 20;

export default function Bookings() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);

  // Espera a que deje de escribir para buscar.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = { q, status, from, to, page, pageSize: PAGE_SIZE };
  const list = useBookings(params);
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filtered = Boolean(q || status || from || to);
  const set = (fn) => (e) => {
    fn(e.target.value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Reservas" subtitle="Todas las citas y solicitudes de tu negocio." />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
        <label className="relative">
          <span className="sr-only">Buscar cliente</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, correo o teléfono"
            className="h-10 pl-9 text-sm"
          />
        </label>
        <NativeSelect value={status} onChange={set(setStatus)} aria-label="Estado">
          {STATUS_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          Desde
          <Input type="date" value={from} onChange={set(setFrom)} className="h-10 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          Hasta
          <Input type="date" value={to} onChange={set(setTo)} className="h-10 text-sm" />
        </label>
      </div>

      {list.isLoading ? (
        <LoadingList rows={6} itemClassName="h-14" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : !data.items.length ? (
        <EmptyState
          icon={List}
          title={filtered ? 'No hay reservas con esos filtros' : 'Todavía no hay reservas'}
          text={
            filtered
              ? 'Prueba con otro estado, fechas o nombre.'
              : 'Cuando aceptes solicitudes, tus citas aparecerán aquí.'
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border md:block">
            <Table>
              <TableHeader className="bg-surface">
                <TableRow>
                  <TableHead className="px-4">Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Con</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="px-4">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((b) => (
                  <TableRow key={b.id} className="cursor-pointer" onClick={() => setOpenId(b.id)}>
                    <TableCell className="px-4 font-semibold">
                      <button
                        type="button"
                        className="text-left outline-none focus-visible:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(b.id);
                        }}
                      >
                        {dateTimeShort(b.startsAt)}
                      </button>
                    </TableCell>
                    <TableCell>
                      {b.client.firstName} {b.client.lastName}
                    </TableCell>
                    <TableCell>{b.service.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: b.resource.color }}
                        />
                        {b.resource.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {money(b.payment?.amountCents ?? b.priceCents)}
                    </TableCell>
                    <TableCell className="px-4">
                      <StateChip status={b.status} size="sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {data.items.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(b.id)}
                  className="w-full rounded-xl border border-border bg-white p-4 text-left"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-bold">{b.client.shortName}</span>
                    <StateChip status={b.status} size="sm" />
                  </span>
                  <span className="mt-1 block text-[13px] text-muted-foreground">
                    {dateTimeShort(b.startsAt)} a {time(b.endsAt)} · {b.service.name} · con{' '}
                    {b.resource.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {data.total} {data.total === 1 ? 'reserva' : 'reservas'}
            </span>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </Button>
                <span className="font-semibold">
                  {page} de {pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <BookingSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
