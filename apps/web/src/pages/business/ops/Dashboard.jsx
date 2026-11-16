// Panel del dueño (pantalla 10): ingresos, reservas, calificación, solicitudes y próximas citas.
import { useState } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import {
  CalendarDays,
  ChevronRight,
  DollarSign,
  Inbox,
  Lock,
  Scissors,
  SlidersHorizontal,
  Star,
  CalendarSync,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingList } from '@/components/States';
import { Notice } from '@/components/Notice';
import { Button } from '@/components/ui/button';
import { useOwnerLock } from '@/components/layout/BusinessLayout';
import { dt, money, relativeDay, time, todayISO, weekdayShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/features/business-ops/hooks';
import { BookingSheet, StatCard } from '@/features/business-ops/components';
import { ChartBox, ChartTooltip, CHART } from '@/features/business-ops/charts';

export default function Dashboard() {
  const q = useDashboard();
  const lock = useOwnerLock();
  const [openId, setOpenId] = useState(null);
  const d = q.data;
  const monthName = d ? dt(d.month).toFormat('LLLL') : '';
  const prevMonthName = d ? dt(d.month).minus({ months: 1 }).toFormat('LLLL') : '';

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Panel del dueño"
        subtitle={d ? `Resumen de ${monthName}` : undefined}
        actions={
          <Button variant="outline" onClick={lock}>
            <Lock /> <span className="hidden sm:inline">Salir del modo dueño</span>
          </Button>
        }
      />
      {q.isLoading ? (
        <LoadingList rows={3} itemClassName="h-32" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Ingresos del mes"
              value={money(d.revenue.monthCents)}
              icon={DollarSign}
              {...growth(d.revenue.monthCents, d.revenue.prevMonthCents, prevMonthName)}
            />
            <StatCard
              label="Reservas del mes"
              value={d.monthBookings}
              icon={CalendarDays}
              foot={`${d.monthCancelled} ${d.monthCancelled === 1 ? 'cancelada' : 'canceladas'}`}
            />
            <StatCard
              label="Calificación"
              value={d.rating.count ? d.rating.avg.toFixed(1) : '—'}
              icon={Star}
              foot={
                d.rating.count
                  ? `${d.rating.newThisMonth} ${d.rating.newThisMonth === 1 ? 'reseña nueva' : 'reseñas nuevas'} · ${d.rating.count} en total`
                  : 'Aún sin reseñas'
              }
            />
            <StatCard
              label="Solicitudes"
              value={d.pendingRequests}
              icon={Inbox}
              foot={d.pendingRequests ? 'Por responder' : 'Todo al día'}
              footTone={d.pendingRequests ? 'warn' : 'ok'}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <WeekChart d={d} />
            <section className="rounded-xl border border-border bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-extrabold">Próximas citas</h2>
                <Link to="/negocio/agenda" className="text-[13px] font-bold text-primary">
                  Ver agenda
                </Link>
              </div>
              {d.upcoming.length ? (
                <ul className="space-y-2">
                  {d.upcoming.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => setOpenId(b.id)}
                        className="flex w-full items-center gap-3 rounded-lg p-1 text-left hover:bg-surface"
                      >
                        <span className="flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-soft text-primary">
                          <span className="text-sm font-extrabold">{time(b.startsAt)}</span>
                          {relativeDay(b.startsAt) !== 'Hoy' && (
                            <span className="text-[10px] font-bold">{relativeDay(b.startsAt)}</span>
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{b.clientName}</span>
                          <span className="block truncate text-[13px] text-muted-foreground">
                            {b.serviceName} · con {b.resource.name}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No hay citas confirmadas próximas.
                </p>
              )}
            </section>
          </div>

          <section>
            <h2 className="mb-3 text-lg font-extrabold">Atajos</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Shortcut
                to="/negocio/dueno/servicios"
                icon={Scissors}
                title="Servicios"
                text={`${d.setup.activeServices} ${d.setup.activeServices === 1 ? 'servicio activo' : 'servicios activos'}`}
              />
              <Shortcut
                to="/negocio/dueno/equipo"
                icon={Users}
                title="Equipo y espacios"
                text={`${d.setup.activeResources} activos`}
              />
              <Shortcut
                to="/negocio/dueno/reglas"
                icon={SlidersHorizontal}
                title="Reglas de reserva"
                text={
                  d.setup.cancellationLimitHours != null
                    ? `Cancelación: ${d.setup.cancellationLimitHours} h`
                    : 'Sin definir'
                }
              />
              <Shortcut
                to="/negocio/dueno/google"
                icon={CalendarSync}
                title="Google Calendar"
                text={d.setup.googleConnected ? 'Conectado' : 'Sin conectar'}
                tone={d.setup.googleConnected ? 'ok' : 'muted'}
              />
            </div>
          </section>

          {!d.setup.googleConnected && (
            <Notice kind="blue">
              Conecta Google Calendar para que cada cita aceptada aparezca en el calendario de quien
              atiende y tus eventos personales bloqueen esos horarios.
            </Notice>
          )}
        </div>
      )}
      <BookingSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

/** "+12% vs. octubre" con su color. */
function growth(current, prev, prevName) {
  if (!prev) return { foot: `Sin ingresos en ${prevName} para comparar` };
  const pct = Math.round(((current - prev) / prev) * 100);
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return {
    foot: (
      <span className="inline-flex items-center gap-1">
        <Icon className="size-3.5" /> {up ? '+' : ''}
        {pct}% vs. {prevName}
      </span>
    ),
    footTone: up ? 'ok' : 'error',
  };
}

function WeekChart({ d }) {
  const today = todayISO();
  const data = d.bookingsByDay.map((x) => ({
    ...x,
    day: weekdayShort(x.date),
    isToday: x.date === today,
  }));
  const from = dt(d.weekStart);
  const to = from.plus({ days: 6 });
  return (
    <section className="rounded-xl border border-border bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold">Reservas por día</h2>
          <p className="text-[13px] text-muted-foreground">
            Semana del {from.toFormat('d')} al {to.toFormat("d 'de' LLLL")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[13px] text-muted-foreground">Ingresos de la semana</p>
          <p className="text-lg font-extrabold">{money(d.revenue.weekCents)}</p>
        </div>
      </div>
      <ChartBox
        height={230}
        label={`Reservas por día: ${data.map((x) => `${x.day} ${x.count}`).join(', ')}`}
      >
        <BarChart data={data} margin={{ top: 20, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={({ x, y, payload, index }) => (
              <text
                x={x}
                y={y + 12}
                textAnchor="middle"
                fontSize={12}
                fontWeight={data[index]?.isToday ? 800 : 500}
                fill={data[index]?.isToday ? CHART.primary : CHART.muted}
              >
                {payload.value}
              </text>
            )}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: CHART.muted }}
          />
          <Tooltip
            cursor={{ fill: CHART.cursor }}
            content={<ChartTooltip format={(v) => `${v} ${v === 1 ? 'reserva' : 'reservas'}`} />}
          />
          <Bar dataKey="count" name="Reservas" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((x) => (
              <Cell key={x.date} fill={x.isToday ? CHART.primary : CHART.soft} />
            ))}
            <LabelList dataKey="count" position="top" fontSize={12} fill={CHART.text} />
          </Bar>
        </BarChart>
      </ChartBox>
    </section>
  );
}

function Shortcut({ to, icon: Icon, title, text, tone = 'muted' }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border bg-white p-4 hover:bg-surface"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{title}</span>
        <span
          className={cn(
            'block truncate text-[13px]',
            tone === 'ok' ? 'font-semibold text-success' : 'text-muted-foreground',
          )}
        >
          {text}
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  );
}
