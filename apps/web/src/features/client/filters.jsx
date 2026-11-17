// Filtros de búsqueda (RF-22). Viven en la URL (search params) para poder compartir y regresar.
import { useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { useCategories } from '@/hooks/useConfig';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Field } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { dayShort, todayISO, DateTime, TZ } from '@/lib/format';
import { cn } from '@/lib/utils';

export const SORTS = [
  ['rating', 'Mejor calificados'],
  ['price', 'Menor precio'],
  ['next', 'Horario más próximo'],
];
const RATINGS = [
  ['', 'Todas'],
  ['3', '3+'],
  ['4', '4+'],
  ['4.5', '4.5+'],
];
const HOURS = Array.from({ length: 15 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);

/** Lee los filtros de la URL. */
export function readFilters(params) {
  return {
    q: params.get('q') ?? '',
    cats: params.getAll('cat'),
    service: params.get('servicio') ?? '',
    date: params.get('dia') ?? '',
    time: params.get('hora') ?? '',
    minRating: params.get('calificacion') ?? '',
    minPrice: params.get('min') ?? '',
    maxPrice: params.get('max') ?? '',
    today: params.get('hoy') === '1',
    sort: params.get('orden') ?? 'rating',
  };
}

/** Filtros → URLSearchParams (sin valores vacíos). */
export function writeFilters(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  for (const c of f.cats) p.append('cat', c);
  if (f.service) p.set('servicio', f.service);
  if (f.today) p.set('hoy', '1');
  else if (f.date) p.set('dia', f.date);
  if (f.time) p.set('hora', f.time);
  if (f.minRating) p.set('calificacion', f.minRating);
  if (f.minPrice) p.set('min', f.minPrice);
  if (f.maxPrice) p.set('max', f.maxPrice);
  if (f.sort && f.sort !== 'rating') p.set('orden', f.sort);
  return p;
}

/** Filtros → parámetros de GET /api/public/businesses. */
export function toApiQuery(f) {
  return {
    q: f.q || undefined,
    categories: f.cats.length ? f.cats.join(',') : undefined,
    service: f.service || undefined,
    date: f.today ? undefined : f.date || undefined,
    time: f.time || undefined,
    minRating: f.minRating || undefined,
    minPrice: f.minPrice || undefined,
    maxPrice: f.maxPrice || undefined,
    availableToday: f.today ? 'true' : undefined,
    sort: f.sort,
  };
}

/** Chips de los filtros activos, cada uno con su forma de quitarlo. */
export function activeChips(f, categories = []) {
  const chips = [];
  if (f.today) chips.push(['Hoy', { today: false }]);
  for (const slug of f.cats) {
    const c = categories.find((x) => x.slug === slug);
    chips.push([c?.name ?? slug, { cats: f.cats.filter((x) => x !== slug) }]);
  }
  if (f.service) chips.push([`“${f.service}”`, { service: '' }]);
  if (f.date && !f.today) chips.push([dayShort(f.date), { date: '' }]);
  if (f.time) chips.push([`Desde ${f.time}`, { time: '' }]);
  if (f.minRating) chips.push([`${f.minRating}+ ★`, { minRating: '' }]);
  if (f.minPrice || f.maxPrice) {
    const label =
      f.minPrice && f.maxPrice
        ? `$${f.minPrice} – $${f.maxPrice}`
        : f.minPrice
          ? `Desde $${f.minPrice}`
          : `Hasta $${f.maxPrice}`;
    chips.push([label, { minPrice: '', maxPrice: '' }]);
  }
  return chips;
}

export function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-primary bg-primary-soft pr-1.5 pl-3.5 text-[13px] font-bold text-primary">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar filtro ${label}`}
        className="flex size-6 items-center justify-center rounded-full hover:bg-primary-line focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" />
      </button>
    </span>
  );
}

const mql = typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)') : null;
/** true en computadora (md). */
export function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      mql?.addEventListener('change', cb);
      return () => mql?.removeEventListener('change', cb);
    },
    () => Boolean(mql?.matches),
    () => false,
  );
}

/** Hoja de filtros. onApply recibe los filtros nuevos (sin tocar q ni sort). */
export function FiltersSheet({ open, onOpenChange, value, onApply }) {
  const desktop = useIsDesktop();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? 'right' : 'bottom'}
        className={cn('gap-0 p-0', desktop ? 'w-full sm:max-w-md' : 'max-h-[92dvh] rounded-t-2xl')}
      >
        {open && <FiltersForm initial={value} onApply={onApply} />}
      </SheetContent>
    </Sheet>
  );
}

function FiltersForm({ initial, onApply }) {
  const { data: categories = [] } = useCategories();
  const [f, setF] = useState(initial);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const toggleCat = (slug) =>
    set({ cats: f.cats.includes(slug) ? f.cats.filter((c) => c !== slug) : [...f.cats, slug] });
  const tomorrow = DateTime.now().setZone(TZ).plus({ days: 1 }).toISODate();
  const clear = () =>
    setF({
      ...f,
      cats: [],
      service: '',
      date: '',
      time: '',
      minRating: '',
      minPrice: '',
      maxPrice: '',
      today: false,
    });

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(f);
      }}
    >
      <SheetHeader className="border-b border-border px-5 py-4">
        <SheetTitle className="text-lg font-extrabold">Filtros</SheetTitle>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <fieldset>
          <legend className="mb-2.5 text-sm font-extrabold">Categorías</legend>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const on = f.cats.includes(c.slug);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCat(c.slug)}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold focus-visible:ring-2 focus-visible:ring-ring',
                    on
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-field bg-white text-foreground hover:bg-surface',
                  )}
                >
                  <CategoryIcon icon={c.icon} className="size-4" />
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field label="Tipo de servicio" hint="Por ejemplo: corte, manicure, limpieza dental">
          <Input
            value={f.service}
            onChange={(e) => set({ service: e.target.value })}
            placeholder="¿Qué servicio buscas?"
            maxLength={80}
          />
        </Field>

        <fieldset className="space-y-3">
          <legend className="mb-2.5 text-sm font-extrabold">Día y hora</legend>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <span className="text-sm font-semibold">Disponible hoy</span>
            <Switch checked={f.today} onCheckedChange={(v) => set({ today: v, date: '' })} />
          </label>
          {!f.today && (
            <div className="flex flex-wrap items-center gap-2">
              {[
                ['', 'Cualquier día'],
                [tomorrow, 'Mañana'],
              ].map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={f.date === v}
                  onClick={() => set({ date: v })}
                  className={cn(
                    'h-9 rounded-full border px-3.5 text-[13px] font-bold focus-visible:ring-2 focus-visible:ring-ring',
                    f.date === v
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-field bg-white hover:bg-surface',
                  )}
                >
                  {label}
                </button>
              ))}
              <Input
                type="date"
                aria-label="Elegir día"
                min={todayISO()}
                value={f.date}
                onChange={(e) => set({ date: e.target.value })}
                className="h-9 w-auto px-3 text-[13px]"
              />
            </div>
          )}
          <Field label="Hora">
            <select
              value={f.time}
              onChange={(e) => set({ time: e.target.value })}
              className="h-12 w-full rounded-lg border border-field bg-white px-3 text-[15px] font-medium outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
            >
              <option value="">Cualquier hora</option>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  A partir de las {h}
                </option>
              ))}
            </select>
          </Field>
        </fieldset>

        <fieldset>
          <legend className="mb-2.5 text-sm font-extrabold">Calificación mínima</legend>
          <div className="flex flex-wrap gap-2">
            {RATINGS.map(([v, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={f.minRating === v}
                onClick={() => set({ minRating: v })}
                className={cn(
                  'h-9 min-w-14 rounded-full border px-3.5 text-[13px] font-bold focus-visible:ring-2 focus-visible:ring-ring',
                  f.minRating === v
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-field bg-white hover:bg-surface',
                )}
              >
                {label}
                {v && ' ★'}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2.5 text-sm font-extrabold">Precio (MXN)</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mínimo">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="$0"
                value={f.minPrice}
                onChange={(e) => set({ minPrice: e.target.value })}
              />
            </Field>
            <Field label="Máximo">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="Sin límite"
                value={f.maxPrice}
                onChange={(e) => set({ maxPrice: e.target.value })}
              />
            </Field>
          </div>
        </fieldset>
      </div>
      <SheetFooter className="flex-row border-t border-border px-5 py-4">
        <Button type="button" variant="ghost" size="lg" onClick={clear}>
          Limpiar
        </Button>
        <Button type="submit" size="lg" className="flex-1">
          Ver resultados
        </Button>
      </SheetFooter>
    </form>
  );
}
