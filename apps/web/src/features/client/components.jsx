// Piezas reutilizadas en las pantallas del cliente.
import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Clock, Search, SlidersHorizontal } from 'lucide-react';
import { Chip, StateChip } from '@/components/Chip';
import { RatingMeta } from '@/components/Stars';
import { Photo } from '@/components/Photo';
import { DateBox } from '@/components/DateBox';
import { Notice } from '@/components/Notice';
import { money, time, dt, weekdayShort, dayNum, DateTime, TZ } from '@/lib/format';
import { cn } from '@/lib/utils';

/** "Hoy 16:00", "Mañana 10:00", "Mié 18 · 10:00" o "Sin lugar pronto". */
export function slotLabel(iso) {
  if (!iso) return null;
  const d = dt(iso);
  const today = DateTime.now().setZone(TZ).startOf('day');
  const diff = Math.round(d.startOf('day').diff(today, 'days').days);
  if (diff === 0) return `Hoy ${time(iso)}`;
  if (diff === 1) return `Mañana ${time(iso)}`;
  return `${weekdayShort(iso)} ${dayNum(iso)} · ${time(iso)}`;
}

export function isToday(iso) {
  return iso && dt(iso).hasSame(DateTime.now().setZone(TZ), 'day');
}

/** Chip verde si hay lugar hoy, gris si es otro día (RF-65). */
export function NextSlotChip({ iso, prefix, size = 'sm', className }) {
  if (iso === undefined) return null;
  if (!iso)
    return (
      <Chip tone="neutral" size={size} className={className}>
        Sin lugar pronto
      </Chip>
    );
  return (
    <Chip tone={isToday(iso) ? 'ok' : 'neutral'} size={size} className={className}>
      {prefix}
      {slotLabel(iso)}
    </Chip>
  );
}

/** Tarjeta horizontal de negocio (resultados y recomendados). */
export function BusinessRow({ b, className }) {
  return (
    <Link
      to={`/negocios/${b.id}`}
      className={cn(
        'flex items-center gap-4 rounded-xl border border-border bg-white p-2.5 pr-3 transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Photo
        url={b.photoUrl}
        icon={b.category.icon}
        className="size-[76px] shrink-0 rounded-lg"
        iconClassName="size-7"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold">{b.name}</p>
        <RatingMeta avg={b.ratingAvg} count={b.ratingCount} extra={b.category.name} />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {b.priceFromCents != null && (
            <span className="text-sm font-bold">Desde {money(b.priceFromCents)}</span>
          )}
          <NextSlotChip iso={b.nextSlot} />
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** Tarjeta vertical (Recientes). */
export function BusinessTile({ b, className }) {
  return (
    <Link
      to={`/negocios/${b.id}`}
      className={cn(
        'block rounded-xl border border-border bg-white p-2 transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Photo
        url={b.photoUrl}
        icon={b.category.icon}
        className="aspect-[4/3] w-full rounded-lg"
        iconClassName="size-7 md:size-9"
      />
      <p className="mt-2.5 truncate px-1 text-sm font-bold md:text-base">{b.name}</p>
      <p className="truncate px-1 pb-1 text-xs text-muted-foreground md:text-[13px]">
        {b.category.name}
      </p>
    </Link>
  );
}

/** Buscador de inicio y resultados. */
export function SearchBar({ initial = '', onSubmit, onFilters, filtersCount = 0, autoFocus }) {
  const [q, setQ] = useState(initial);
  const [prev, setPrev] = useState(initial);
  if (initial !== prev) {
    setPrev(initial);
    setQ(initial);
  }
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(q.trim());
      }}
      className="flex h-[52px] items-center gap-2 rounded-[14px] border border-border bg-surface pr-1.5 pl-4"
    >
      <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar negocios o servicios…"
        aria-label="Buscar negocios o servicios"
        enterKeyHint="search"
        autoFocus={autoFocus}
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
      />
      {onFilters && (
        <button
          type="button"
          onClick={onFilters}
          aria-label={filtersCount ? `Filtros (${filtersCount} activos)` : 'Filtros'}
          className="relative flex size-10 items-center justify-center rounded-[10px] bg-primary text-white hover:bg-primary-pressed focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <SlidersHorizontal className="size-5" />
          {filtersCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border-2 border-white bg-foreground text-[10px] font-extrabold">
              {filtersCount}
            </span>
          )}
        </button>
      )}
    </form>
  );
}

/** "16:00 a 16:40" */
export const timeRange = (b) => `${time(b.startsAt)} a ${time(b.endsAt)}`;

/** Tarjeta de reserva con la cajita de fecha (Mis reservas, guía de estilo). */
export function BookingRow({ b }) {
  return (
    <Link
      to={`/reservas/${b.id}`}
      className="flex gap-3.5 rounded-xl border border-border bg-white p-3 transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring"
    >
      <DateBox date={b.startsAt} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-base font-bold">{b.business.name}</p>
          <StateChip status={b.status} size="sm" className="mt-0.5" />
        </div>
        <p className="truncate text-[13px] text-muted-foreground">
          {b.service.name} · {withResource(b.resource)}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold">
          <Clock className="size-3.5 text-muted-foreground" aria-hidden />
          {weekdayShort(b.startsAt)} · {timeRange(b)}
        </p>
      </div>
    </Link>
  );
}

/** "con Juan" o "Cancha 1" según si es persona o espacio. */
export const withResource = (r) => (r.kind === 'space' ? r.name : `con ${r.name}`);

/** Barra de pasos del flujo de reservar. */
export function StepBar({ step, total }) {
  return (
    <div className="mb-4">
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn('h-1 flex-1 rounded-full', i < step ? 'bg-primary' : 'bg-border')}
          />
        ))}
      </div>
      <p className="mt-2 text-[13px] font-semibold text-muted-foreground">
        Paso {step} de {total}
      </p>
    </div>
  );
}

/** Política de cancelación del negocio (se muestra antes de enviar). */
export function PolicyNotice({ hours, kind = 'info', className }) {
  return (
    <Notice kind={kind} className={className}>
      {hours > 0
        ? `Puedes cancelar hasta ${hours} h antes de tu cita y recibir el 100% de reembolso.`
        : 'Puedes cancelar antes de tu cita y recibir el 100% de reembolso.'}
    </Notice>
  );
}

/** Abre la dirección en Google Maps (RF-68). */
export const mapsUrl = (address) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address ?? '')}`;

/** Título de sección con enlace opcional a la derecha. */
export function SectionTitle({ children, to, linkLabel = 'Ver todo', className }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between', className)}>
      <h2 className="text-lg font-extrabold tracking-tight md:text-[22px]">{children}</h2>
      {to && (
        <Link to={to} className="text-[13px] font-bold text-primary hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
