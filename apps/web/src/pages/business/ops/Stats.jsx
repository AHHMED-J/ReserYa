// Estadísticas del dueño (RF-51): ingresos por semana, servicios más vendidos y horas más ocupadas.
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartColumn, DollarSign, CalendarDays, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingList } from '@/components/States';
import { dt, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useStats } from '@/features/business-ops/hooks';
import { StatCard } from '@/features/business-ops/components';
import { ChartBox, ChartTooltip, CHART } from '@/features/business-ops/charts';

const RANGES = [4, 8, 12, 26];
// Lunes primero; el API usa 0 = domingo.
const WEEKDAYS = [
  [1, 'Lun', 'lunes'],
  [2, 'Mar', 'martes'],
  [3, 'Mié', 'miércoles'],
  [4, 'Jue', 'jueves'],
  [5, 'Vie', 'viernes'],
  [6, 'Sáb', 'sábados'],
  [0, 'Dom', 'domingos'],
];

export default function Stats() {
  const [weeks, setWeeks] = useState(8);
  const q = useStats(weeks);
  const d = q.data;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Estadísticas"
        subtitle={d ? `Desde el ${dt(d.from).toFormat("d 'de' LLLL")}` : undefined}
        actions={
          <div
            role="group"
            aria-label="Periodo"
            className="flex rounded-lg border border-border bg-surface p-0.5"
          >
            {RANGES.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={weeks === w}
                onClick={() => setWeeks(w)}
                className={cn(
                  'h-8 rounded-md px-2.5 text-[13px] font-bold',
                  weeks === w ? 'bg-white text-primary' : 'text-muted-foreground',
                )}
              >
                {w} sem
              </button>
            ))}
          </div>
        }
      />
      {q.isLoading ? (
        <LoadingList rows={3} itemClassName="h-40" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !d.totals.bookings && !d.totals.netCents ? (
        <EmptyState
          icon={ChartColumn}
          title="Todavía no hay datos"
          text="Cuando tengas citas confirmadas y cobradas, aquí verás tus ingresos y tus horas más ocupadas."
        />
      ) : (
        <div className={cn('space-y-5', q.isFetching && 'opacity-70')}>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Ingresos netos"
              value={money(d.totals.netCents)}
              icon={DollarSign}
              foot="Cobrado menos reembolsado"
            />
            <StatCard
              label="Promedio por semana"
              value={money(Math.round(d.totals.netCents / d.weeks))}
              icon={TrendingUp}
            />
            <StatCard
              label="Citas"
              value={d.totals.bookings}
              icon={CalendarDays}
              foot="Confirmadas, completadas y no asistió"
            />
          </div>
          <RevenueChart rows={d.revenueByWeek} />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <TopServices rows={d.topServices} />
            <BusyHours rows={d.busyHours} />
          </div>
        </div>
      )}
    </div>
  );
}

function RevenueChart({ rows }) {
  const data = rows.map((w) => ({
    ...w,
    label: dt(w.weekStart).toFormat('d LLL').replace('.', ''),
  }));
  return (
    <section className="rounded-xl border border-border bg-white p-5">
      <h2 className="text-lg font-extrabold">Ingresos por semana</h2>
      <p className="mb-4 text-[13px] text-muted-foreground">
        Lo cobrado menos los reembolsos. Cada barra empieza en lunes.
      </p>
      <ChartBox
        height={260}
        label={`Ingresos por semana: ${data.map((w) => `${w.label} ${money(w.netCents)}`).join(', ')}`}
      >
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: CHART.muted }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fontSize: 12, fill: CHART.muted }}
            tickFormatter={(v) => money(v)}
          />
          <Tooltip
            cursor={{ fill: CHART.cursor }}
            content={
              <ChartTooltip
                labelFormat={(label) => `Semana del ${label}`}
                format={(v, p) =>
                  `${money(v)} (cobrado ${money(p.payload.capturedCents)}, reembolsado ${money(p.payload.refundedCents)})`
                }
              />
            }
          />
          <Bar
            dataKey="netCents"
            name="Neto"
            fill={CHART.primary}
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
          />
        </BarChart>
      </ChartBox>
    </section>
  );
}

function TopServices({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded-xl border border-border bg-white p-5">
      <h2 className="mb-4 text-lg font-extrabold">Servicios más vendidos</h2>
      {rows.length ? (
        <ol className="space-y-4">
          {rows.map((r, i) => (
            <li key={r.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-bold">
                  {i + 1}. {r.name}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  <span className="font-bold text-foreground">{r.count}</span> ·{' '}
                  {money(r.revenueCents)}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-neutral-soft" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Sin citas en este periodo.</p>
      )}
    </section>
  );
}

/** Mapa de calor sencillo: un solo color (primario) de claro a oscuro según las citas. */
function BusyHours({ rows }) {
  const hoursWithData = rows.map((r) => r.hour);
  const fromH = Math.min(9, ...hoursWithData);
  const toH = Math.max(19, ...hoursWithData);
  const hours = Array.from({ length: toH - fromH + 1 }, (_, i) => fromH + i);
  const count = (wd, h) => rows.find((r) => r.weekday === wd && r.hour === h)?.count ?? 0;
  const max = Math.max(1, ...rows.map((r) => r.count));
  const top = rows.reduce((a, r) => (r.count > (a?.count ?? 0) ? r : a), null);
  const level = (c) => (c ? Math.ceil((c / max) * 4) : 0); // 0..4
  const FILL = ['bg-surface', 'bg-primary/20', 'bg-primary/45', 'bg-primary/70', 'bg-primary'];

  return (
    <section className="rounded-xl border border-border bg-white p-5">
      <h2 className="text-lg font-extrabold">Horas más ocupadas</h2>
      <p className="mb-4 text-[13px] text-muted-foreground">
        {top
          ? `Lo más lleno: los ${WEEKDAYS.find((w) => w[0] === top.weekday)[2]} a las ${top.hour}:00 (${top.count} citas).`
          : 'Sin citas en este periodo.'}
      </p>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[3px] text-[11px]">
          <caption className="sr-only">Citas por día de la semana y hora</caption>
          <thead>
            <tr>
              <th scope="col" className="w-9" />
              {hours.map((h) => (
                <th key={h} scope="col" className="min-w-7 font-semibold text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map(([wd, short, long]) => (
              <tr key={wd}>
                <th scope="row" className="pr-1 text-left font-semibold text-muted-foreground">
                  {short}
                </th>
                {hours.map((h) => {
                  const c = count(wd, h);
                  return (
                    <td
                      key={h}
                      title={`${long} ${h}:00 · ${c} ${c === 1 ? 'cita' : 'citas'}`}
                      className={cn('h-7 min-w-7 rounded', FILL[level(c)])}
                    >
                      <span className="sr-only">{c}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-hidden>
        Menos
        {FILL.map((f) => (
          <span key={f} className={cn('size-3.5 rounded', f)} />
        ))}
        Más
      </div>
    </section>
  );
}
