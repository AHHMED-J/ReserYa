// Perfil del negocio (pantalla 04): RF-23, RF-49, RF-65. Visible sin sesión.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Images,
  MapPin,
  MessageSquare,
  Phone,
} from 'lucide-react';
import { Photo } from '@/components/Photo';
import { RatingMeta, Stars } from '@/components/Stars';
import { ButtonLink } from '@/components/ButtonLink';
import { EmptyState, ErrorState, FullPageSpinner, Spinner } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { agoText, duration, money, moneyMXN, phone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useBusiness, useBusinessReviews } from '@/features/client/queries';
import { NextSlotChip, PolicyNotice, mapsUrl, slotLabel } from '@/features/client/components';

const WEEK = [
  [1, 'Lunes'],
  [2, 'Martes'],
  [3, 'Miércoles'],
  [4, 'Jueves'],
  [5, 'Viernes'],
  [6, 'Sábado'],
  [0, 'Domingo'],
];
const h = (hhmm) => hhmm.replace(/^0/, '');
const rangesText = (ranges) => ranges.map(([s, e]) => `${h(s)} a ${h(e)}`).join(' y ');

export default function BusinessProfile() {
  const { id } = useParams();
  const q = useBusiness(id);
  if (q.isLoading) return <FullPageSpinner />;
  if (q.isError)
    return q.error.status === 404 ? (
      <EmptyState
        title="Este negocio no está disponible"
        text="Puede que ya no reciba reservas. Busca otro negocio parecido."
        action={{ label: 'Buscar negocios', to: '/buscar' }}
        className="mt-6"
      />
    ) : (
      <ErrorState error={q.error} onRetry={q.refetch} className="mt-6" />
    );
  return <Profile b={q.data} />;
}

function Profile({ b }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('services');
  const bookUrl = (serviceId) =>
    `/negocios/${b.id}/reservar${serviceId ? `?serviceId=${serviceId}` : ''}`;

  return (
    <div className="mx-auto max-w-[1184px]">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 hidden items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground md:inline-flex"
      >
        <ChevronLeft className="size-4" /> Volver
      </button>
      <Gallery b={b} />

      <div className="relative -mx-4 -mt-5 rounded-t-[20px] bg-white px-4 pt-5 md:mx-0 md:mt-5 md:grid md:grid-cols-[1fr_392px] md:gap-8 md:rounded-none md:px-0 md:pt-0">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-tight md:text-[32px]">
            {b.name}
          </h1>
          <RatingMeta
            avg={b.ratingAvg}
            count={b.ratingCount}
            extra={b.category.name}
            className="mt-1.5 text-sm"
          />
          {b.ratingCount > 0 && (
            <span className="sr-only">
              {b.ratingCount} reseña{b.ratingCount === 1 ? '' : 's'}
            </span>
          )}
          <div className="mt-2 flex flex-col gap-1.5 text-sm text-muted-foreground md:flex-row md:flex-wrap md:gap-x-6">
            {b.address && (
              <a
                href={mapsUrl(b.address)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 hover:text-foreground"
              >
                <MapPin className="size-4 shrink-0" /> {b.address}
              </a>
            )}
            <span className="inline-flex items-center gap-2">
              <Clock className={cn('size-4', b.today.openNow ? 'text-success' : '')} />
              {b.today.ranges.length ? (
                <>
                  <b className={b.today.openNow ? 'text-success' : 'text-foreground'}>
                    {b.today.openNow ? 'Abierto' : 'Cerrado ahora'}
                  </b>
                  · hoy de {rangesText(b.today.ranges)}
                </>
              ) : (
                <b className="text-foreground">Cerrado hoy</b>
              )}
            </span>
          </div>
          {b.description && (
            <p className="mt-3 text-[15px] leading-6 text-foreground/90">{b.description}</p>
          )}

          <Tabs value={tab} onValueChange={setTab} className="mt-5 gap-0">
            <TabsList
              variant="line"
              className="-mx-4 h-auto! w-auto justify-start gap-0 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0"
            >
              {[
                ['services', 'Servicios'],
                ['team', b.resources.some((r) => r.kind === 'person') ? 'Equipo' : 'Espacios'],
                ['hours', 'Horario'],
                ['reviews', `Reseñas${b.ratingCount ? ` (${b.ratingCount})` : ''}`],
              ].map(([v, label]) => (
                <TabsTrigger
                  key={v}
                  value={v}
                  className="h-11 flex-none rounded-none px-3.5 text-[15px] font-semibold text-muted-foreground after:bottom-0! after:bg-primary data-active:font-extrabold data-active:text-primary"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="services">
              <ul className="divide-y divide-border">
                {b.services.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={bookUrl(s.id)}
                      className="flex items-center gap-3 py-3.5 hover:bg-surface md:px-1"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold">{s.name}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                          <Clock className="size-3.5" /> {duration(s.durationMin)}
                          {s.description && <span className="truncate">· {s.description}</span>}
                        </p>
                      </div>
                      <span className="text-base font-bold">{money(s.priceCents)}</span>
                      <ChevronRight
                        className="size-5 text-muted-foreground md:hidden"
                        aria-hidden
                      />
                      <span className="hidden h-10 items-center rounded-lg border border-field px-4 text-sm font-bold md:inline-flex">
                        Elegir
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <PolicyNotice hours={b.rules.cancellationLimitHours} className="mt-4 md:hidden" />
            </TabsContent>
            <TabsContent value="team">
              <ul className="divide-y divide-border">
                {b.resources.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-3.5">
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-base font-extrabold text-white"
                      style={{ backgroundColor: r.color }}
                      aria-hidden
                    >
                      {r.name[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{r.name}</p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {[
                          r.title,
                          `${r.serviceIds.length} servicio${r.serviceIds.length === 1 ? '' : 's'}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="hours">
              <dl className="divide-y divide-border">
                {WEEK.map(([wd, name]) => {
                  const ranges = b.week.find((d) => d.weekday === wd)?.ranges ?? [];
                  return (
                    <div key={wd} className="flex justify-between gap-4 py-3 text-[15px]">
                      <dt className="font-semibold">{name}</dt>
                      <dd className={ranges.length ? '' : 'text-muted-foreground'}>
                        {ranges.length ? rangesText(ranges) : 'Cerrado'}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {b.phone && (
                <a
                  href={`tel:${b.phone}`}
                  className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary"
                >
                  <Phone className="size-4" /> {phone(b.phone)}
                </a>
              )}
            </TabsContent>
            <TabsContent value="reviews">
              <Reviews b={b} active={tab === 'reviews'} />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="hidden md:block">
          <div className="sticky top-24 rounded-xl border border-border p-6">
            {b.priceFromCents != null && (
              <>
                <p className="text-[13px] text-muted-foreground">Desde</p>
                <p className="text-[28px] font-extrabold tracking-tight">
                  {moneyMXN(b.priceFromCents)}
                </p>
              </>
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-[13px] text-muted-foreground">Siguiente horario libre</span>
              <NextSlotChip iso={b.nextSlot} size="md" />
            </div>
            <ButtonLink to={bookUrl()} size="lg" className="mt-5 w-full">
              Reservar
            </ButtonLink>
            <PolicyNotice hours={b.rules.cancellationLimitHours} className="mt-4" />
            <p className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
              <Check className="size-4 text-success" />
              {b.autoAccept
                ? 'Confirmación inmediata al pagar'
                : 'El negocio confirma en menos de 12 h'}
            </p>
          </div>
        </aside>
      </div>

      {/* Barra de reservar en celular */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            {b.priceFromCents != null && (
              <p className="text-lg font-extrabold">Desde {money(b.priceFromCents)}</p>
            )}
            <p className="truncate text-[13px] font-semibold text-success">
              {b.nextSlot ? `Siguiente libre: ${slotLabel(b.nextSlot).toLowerCase()}` : ''}
            </p>
          </div>
          <ButtonLink to={bookUrl()} size="lg" className="w-40">
            Reservar
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

function Gallery({ b }) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const photos = b.photos;
  const n = photos.length;
  const placeholder = (cls, icon) => (
    <Photo icon={b.category.icon} className={cls} iconClassName={icon} />
  );
  return (
    <>
      {/* Celular: carrusel a todo lo ancho */}
      <div className="relative -mx-4 -mt-4 md:hidden">
        <div
          className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
          {n
            ? photos.map((p, i) => (
                <img
                  key={p.id}
                  src={p.url}
                  alt={`Foto ${i + 1} de ${b.name}`}
                  className="h-full w-full shrink-0 snap-center object-cover"
                />
              ))
            : placeholder('h-full w-full', 'size-24 max-h-24 max-w-24')}
        </div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Regresar"
          className="absolute top-4 left-4 flex size-10 items-center justify-center rounded-full bg-white text-foreground"
        >
          <ChevronLeft className="size-6" />
        </button>
        {n > 1 && (
          <span className="absolute right-4 bottom-8 rounded-full bg-foreground px-2.5 py-1 text-xs font-bold text-white">
            {index + 1} / {n}
          </span>
        )}
      </div>

      {/* Computadora: foto grande y dos chicas */}
      <div className="hidden h-[300px] grid-cols-[2fr_1fr] gap-3 md:grid">
        {n ? (
          <img src={photos[0].url} alt={b.name} className="h-full w-full rounded-xl object-cover" />
        ) : (
          placeholder('h-full w-full rounded-xl', 'size-24 max-h-24 max-w-24')
        )}
        <div className="relative grid min-h-0 grid-rows-2 gap-3">
          {[1, 2].map((i) =>
            photos[i] ? (
              <img
                key={i}
                src={photos[i].url}
                alt=""
                className="h-full min-h-0 w-full rounded-xl object-cover"
              />
            ) : (
              <div key={i} className="min-h-0">
                {placeholder('h-full w-full rounded-xl', 'size-10')}
              </div>
            ),
          )}
          {n > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="absolute right-3 bottom-3"
              onClick={() => setOpen(true)}
            >
              <Images /> Ver las {n} fotos
            </Button>
          )}
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogTitle>Fotos de {b.name}</DialogTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {photos.map((p, i) => (
              <img
                key={p.id}
                src={p.url}
                alt={`Foto ${i + 1}`}
                className="w-full rounded-lg object-cover"
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Reviews({ b, active }) {
  const q = useBusinessReviews(b.id, active);
  const items = q.data?.pages.flatMap((p) => p.items) ?? b.reviews;
  if (!b.ratingCount)
    return (
      <EmptyState
        icon={MessageSquare}
        title="Todavía no hay reseñas"
        text="Las reseñas las dejan clientes que ya tuvieron su cita."
        className="mt-4"
      />
    );
  return (
    <div className="pt-4">
      <div className="flex items-center gap-4 rounded-xl bg-surface p-4">
        <p className="text-4xl font-extrabold">{Number(b.ratingAvg).toFixed(1)}</p>
        <div>
          <Stars value={Math.round(b.ratingAvg)} size="size-5" />
          <p className="mt-1 text-[13px] text-muted-foreground">
            {b.ratingCount} reseña{b.ratingCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <ul className="mt-2 divide-y divide-border">
        {items.map((r) => (
          <li key={r.id} className="py-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">{r.clientName}</p>
              <span className="text-xs text-muted-foreground">{agoText(r.createdAt)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Stars value={r.rating} size="size-4" />
              <span className="truncate text-xs text-muted-foreground">{r.serviceName}</span>
            </div>
            {r.comment && <p className="mt-2 text-[15px] leading-6">{r.comment}</p>}
          </li>
        ))}
      </ul>
      {q.isFetching && !q.isFetchingNextPage && !q.data && <Spinner />}
      {q.hasNextPage && (
        <Button
          variant="outline"
          className="mt-2 w-full"
          onClick={() => q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
        >
          Ver más reseñas
        </Button>
      )}
    </div>
  );
}
