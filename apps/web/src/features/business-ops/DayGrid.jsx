// Cuadrícula de un día con una columna por recurso (RF-44, RF-46). La usan la agenda de la app
// y el modo pantalla del link en vivo (con letra más grande).
import { CalendarX2 } from 'lucide-react';
import { dt, time } from '@/lib/format';
import { cn } from '@/lib/utils';

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Minutos desde la medianoche del día `date` (se recorta al día). */
export function minuteOfDay(value, date) {
  const d = dt(value);
  const start = dt(`${date}T00:00`);
  const m = Math.round(d.diff(start, 'minutes').minutes);
  return Math.max(0, Math.min(24 * 60, m));
}

/** Fondo suave del color del recurso (color sólido con transparencia, sin degradados). */
export const tint = (hex, alpha = '1F') => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${alpha}` : hex);

/**
 * resources: [{ id, name, title, color, schedule, closed, bookings, busy, requests }]
 * range: { start: 'HH:mm', end: 'HH:mm' }
 * big: letra grande para el modo pantalla.
 */
export function DayGrid({
  date,
  range,
  resources,
  nowMs,
  isToday,
  big = false,
  showRequests = false,
  onBookingClick,
  onRequestClick,
}) {
  const startMin = toMin(range.start);
  const endMin = range.end === '24:00' ? 24 * 60 : toMin(range.end);
  const pxPerMin = big ? 1.6 : 1.2;
  const height = (endMin - startMin) * pxPerMin;
  const y = (min) => (min - startMin) * pxPerMin;
  const hours = [];
  for (let h = Math.ceil(startMin / 60); h * 60 < endMin; h++) hours.push(h);
  const nowMin = isToday && nowMs ? minuteOfDay(nowMs, date) : null;
  const showNow = nowMin !== null && nowMin >= startMin && nowMin <= endMin;

  const block = (x) => {
    const top = y(Math.max(startMin, minuteOfDay(x.startsAt, date)));
    const bottom = y(Math.min(endMin, minuteOfDay(x.endsAt, date)));
    return { top, height: Math.max(bottom - top, big ? 28 : 20) };
  };

  return (
    <div className="flex" style={{ height }}>
      <div className={cn('relative shrink-0 border-r border-border', big ? 'w-20' : 'w-14')}>
        {hours.map((h) => (
          <span
            key={h}
            className={cn(
              'absolute right-2 -translate-y-1/2 font-semibold text-muted-foreground',
              big ? 'text-lg' : 'text-xs',
            )}
            style={{ top: y(h * 60) + (h * 60 === startMin ? 10 : 0) }}
          >
            {h}:00
          </span>
        ))}
      </div>
      <div className="relative flex min-w-0 flex-1">
        {hours.map((h) => (
          <div
            key={h}
            className="pointer-events-none absolute inset-x-0 border-t border-border"
            style={{ top: y(h * 60) }}
            aria-hidden
          />
        ))}
        {resources.map((r) => (
          <div
            key={r.id}
            className="relative min-w-0 flex-1 border-r border-border bg-surface last:border-r-0"
          >
            {/* Horario de trabajo en blanco; fuera de horario queda gris. */}
            {!r.closed &&
              r.schedule.map((s) => (
                <div
                  key={s.start}
                  className="absolute inset-x-0 bg-white"
                  style={{
                    top: y(Math.max(startMin, toMin(s.start))),
                    height:
                      y(Math.min(endMin, toMin(s.end))) - y(Math.max(startMin, toMin(s.start))),
                  }}
                  aria-hidden
                />
              ))}
            {r.closed && (
              <p className="absolute inset-x-0 top-6 text-center text-sm font-semibold text-muted-foreground">
                Cerrado{r.closed.reason ? ` · ${r.closed.reason}` : ''}
              </p>
            )}
            {r.busy.map((x, i) => (
              <div
                key={x.id ?? i}
                className={cn(
                  'absolute inset-x-1 overflow-hidden rounded-md border border-dashed border-disabled bg-neutral-soft px-2 py-1 text-muted-foreground',
                  big ? 'text-base' : 'text-xs',
                )}
                style={block(x)}
              >
                <span className="flex items-center gap-1 font-bold">
                  <CalendarX2 className="size-3.5 shrink-0" />
                  {x.title || 'Ocupado'}
                </span>
                {!big && <span className="block truncate">Ocupado en Google Calendar</span>}
              </div>
            ))}
            {r.bookings.map((b) => (
              <BookingBlock
                key={b.id}
                b={b}
                color={r.color}
                style={block(b)}
                big={big}
                onClick={onBookingClick ? () => onBookingClick(b) : undefined}
              />
            ))}
            {showRequests &&
              r.requests.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onRequestClick?.(b)}
                  className="absolute right-1 left-1/2 overflow-hidden rounded-md border border-dashed border-warning bg-warning-soft/80 px-2 py-0.5 text-left text-[11px] leading-4 text-warning hover:bg-warning-soft"
                  style={block(b)}
                  title={`Solicitud de ${b.clientName}: ${b.serviceName} ${time(b.startsAt)} a ${time(b.endsAt)}`}
                >
                  <span className="font-bold">Solicitud</span> · {b.clientName}
                </button>
              ))}
          </div>
        ))}
        {showNow && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-error"
            style={{ top: y(nowMin) }}
            data-now
            aria-label={`Ahora, ${time(nowMs)}`}
          >
            <span className="absolute -top-[5px] -left-[5px] size-2 rounded-full bg-error" />
          </div>
        )}
      </div>
    </div>
  );
}

function BookingBlock({ b, color, style, big, onClick }) {
  const short = style.height < (big ? 56 : 40);
  const muted = b.status === 'no_show';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] px-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
        big ? 'py-1.5' : 'py-1',
        onClick && 'cursor-pointer hover:brightness-95',
        b.status === 'hold' && 'border border-l-[3px] border-dashed',
      )}
      style={{
        ...style,
        borderColor: color,
        backgroundColor: muted ? 'var(--color-neutral-soft)' : tint(color),
      }}
    >
      <span
        className={cn(
          'block truncate',
          big ? 'text-xl leading-7' : 'text-[13px] leading-4',
          muted && 'text-muted-foreground line-through',
        )}
      >
        <span className="font-bold">{b.clientName}</span>
        {short && (
          <span className="text-muted-foreground">
            {' '}
            · {b.serviceName} · {time(b.startsAt)}
          </span>
        )}
      </span>
      {!short && (
        <span
          className={cn(
            'block truncate text-muted-foreground',
            big ? 'text-base' : 'text-[11px] leading-4',
          )}
        >
          {b.serviceName} · {time(b.startsAt)} a {time(b.endsAt)}
          {b.status === 'hold' && ' · apartada'}
          {b.status === 'no_show' && ' · no asistió'}
        </span>
      )}
    </Tag>
  );
}
