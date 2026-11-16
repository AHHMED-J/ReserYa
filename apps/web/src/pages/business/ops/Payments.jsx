// Historial de cobros, liberaciones y reembolsos (RF-52, RF-69).
import { useState } from 'react';
import { DollarSign, Receipt, RotateCcw, Wallet, Hourglass } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { EmptyState, ErrorState, LoadingList } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { dateTimeShort, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePayments } from '@/features/business-ops/hooks';
import {
  BookingSheet,
  NativeSelect,
  PaymentChip,
  StatCard,
} from '@/features/business-ops/components';

const STATUS = [
  ['', 'Todos'],
  ['captured', 'Cobrados'],
  ['refunded', 'Reembolsados'],
  ['released', 'Liberados'],
  ['authorized', 'Apartados'],
];
const PAGE_SIZE = 25;

export default function Payments() {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const q = usePayments({ status, from, to, page, pageSize: PAGE_SIZE });
  const d = q.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / PAGE_SIZE)) : 1;
  const set = (fn) => (e) => {
    fn(e.target.value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Pagos y reembolsos" subtitle="Registro de lo cobrado a tus clientes." />
      <Notice kind="blue" className="mb-5">
        Los pagos entran a la cuenta de ReserYa en Stripe. Aquí ves el registro de cada cobro,
        liberación y reembolso.
      </Notice>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <NativeSelect value={status} onChange={set(setStatus)} aria-label="Estado del pago">
          {STATUS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          Desde
          <Input type="date" value={from} onChange={set(setFrom)} className="h-10 w-auto text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          Hasta
          <Input type="date" value={to} onChange={set(setTo)} className="h-10 w-auto text-sm" />
        </label>
      </div>

      {q.isLoading ? (
        <LoadingList rows={5} itemClassName="h-14" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Cobrado" value={money(d.totals.capturedCents)} icon={DollarSign} />
            <StatCard label="Reembolsado" value={money(d.totals.refundedCents)} icon={RotateCcw} />
            <StatCard
              label="Neto"
              value={money(d.totals.netCents)}
              icon={Wallet}
              foot="Cobrado menos reembolsado"
            />
            <StatCard
              label="Apartado sin cobrar"
              value={money(d.totals.authorizedCents)}
              icon={Hourglass}
              foot="Solicitudes por responder"
            />
          </div>

          {!d.items.length ? (
            <EmptyState
              icon={Receipt}
              title="Sin movimientos"
              text="No hay pagos con esos filtros."
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
                      <TableHead>Cita</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="px-4">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.items.map((p) => (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer"
                        onClick={() => setOpenId(p.bookingId)}
                      >
                        <TableCell className="px-4 font-semibold">
                          <button
                            type="button"
                            className="text-left outline-none focus-visible:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenId(p.bookingId);
                            }}
                          >
                            {dateTimeShort(p.date)}
                          </button>
                        </TableCell>
                        <TableCell>{p.client.name}</TableCell>
                        <TableCell>{p.serviceName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {dateTimeShort(p.booking.startsAt)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-bold',
                            p.status === 'refunded' && 'text-error',
                            p.status === 'released' && 'text-muted-foreground line-through',
                          )}
                        >
                          {p.status === 'refunded' ? '−' : ''}
                          {money(p.amountCents)}
                        </TableCell>
                        <TableCell className="px-4">
                          <PaymentChip status={p.status} size="sm" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="space-y-2 md:hidden">
                {d.items.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(p.bookingId)}
                      className="w-full rounded-xl border border-border bg-white p-4 text-left"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-bold">{p.client.shortName}</span>
                        <span className="font-extrabold">
                          {p.status === 'refunded' ? '−' : ''}
                          {money(p.amountCents)}
                        </span>
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
                        <span className="truncate">
                          {p.serviceName} · {dateTimeShort(p.date)}
                        </span>
                        <PaymentChip status={p.status} size="sm" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {pages > 1 && (
                <div className="mt-4 flex items-center justify-end gap-2 text-sm">
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
            </>
          )}
        </>
      )}
      <BookingSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
