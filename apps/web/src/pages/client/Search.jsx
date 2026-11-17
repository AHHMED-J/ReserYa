// Resultados de búsqueda (pantalla 03): RF-21, RF-22, RF-64, RF-65.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ChevronLeft, SearchX, SlidersHorizontal } from 'lucide-react';
import { useCategories } from '@/hooks/useConfig';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingList, Spinner } from '@/components/States';
import { useSearch } from '@/features/client/queries';
import { BusinessRow, SearchBar } from '@/features/client/components';
import {
  FilterChip,
  FiltersSheet,
  SORTS,
  activeChips,
  readFilters,
  toApiQuery,
  writeFilters,
} from '@/features/client/filters';

export default function Search() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: categories = [] } = useCategories();
  const f = readFilters(params);
  const [open, setOpen] = useState(params.get('filtros') === '1');
  const results = useSearch(toApiQuery(f));
  const pages = results.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const total = pages[0]?.total ?? 0;
  const chips = activeChips(f, categories);

  const update = (patch) => setParams(writeFilters({ ...f, ...patch }), { replace: true });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Regresar"
          className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface md:hidden"
        >
          <ChevronLeft className="size-6" />
        </button>
        <div className="min-w-0 flex-1 md:hidden">
          <SearchBar
            initial={f.q}
            onSubmit={(q) => update({ q })}
            onFilters={() => setOpen(true)}
            filtersCount={chips.length}
          />
        </div>
        <div className="hidden min-w-0 flex-1 items-center justify-between gap-4 md:flex">
          <h1 className="truncate text-[26px] font-extrabold tracking-tight">
            {f.q ? `Resultados para “${f.q}”` : 'Buscar negocios'}
          </h1>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <SlidersHorizontal /> Filtros{chips.length ? ` (${chips.length})` : ''}
          </Button>
        </div>
      </div>

      {chips.length > 0 && (
        <div
          className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
          aria-label="Filtros activos"
        >
          {chips.map(([label, patch]) => (
            <FilterChip key={label} label={label} onRemove={() => update(patch)} />
          ))}
        </div>
      )}

      <div className="mt-4 mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground" aria-live="polite">
          {results.isSuccess && `${total} resultado${total === 1 ? '' : 's'}`}
        </p>
        <label className="flex items-center gap-1 text-sm font-bold text-primary">
          <span className="sr-only">Ordenar por</span>
          <select
            value={f.sort}
            onChange={(e) => update({ sort: e.target.value })}
            className="cursor-pointer rounded-md bg-transparent py-1 pr-1 text-right font-bold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SORTS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {results.isLoading && <LoadingList rows={5} itemClassName="h-[98px]" />}
      {results.isError && <ErrorState error={results.error} onRetry={results.refetch} />}
      {results.isSuccess && items.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="No encontramos negocios"
          text="Prueba con otras palabras o quita algunos filtros."
          className="mt-2"
        />
      )}
      {items.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {items.map((b) => (
            <BusinessRow key={b.id} b={b} />
          ))}
        </div>
      )}
      {results.hasNextPage && (
        <div className="mt-5 flex justify-center">
          <Button
            variant="outline"
            onClick={() => results.fetchNextPage()}
            disabled={results.isFetchingNextPage}
          >
            {results.isFetchingNextPage ? <Spinner className="size-4" /> : null}
            Ver más
          </Button>
        </div>
      )}

      <FiltersSheet
        open={open}
        onOpenChange={setOpen}
        value={f}
        onApply={(next) => {
          setParams(writeFilters(next), { replace: true });
          setOpen(false);
        }}
      />
    </div>
  );
}
