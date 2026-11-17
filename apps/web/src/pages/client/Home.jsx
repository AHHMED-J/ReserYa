// Inicio del cliente (pantalla 02): RF-58, RF-59, RF-61, RF-62.
import { Link, useNavigate } from 'react-router';
import { CalendarCheck, Search } from 'lucide-react';
import { useMe } from '@/hooks/useAuth';
import { Logo } from '@/components/Logo';
import { Photo } from '@/components/Photo';
import { Stars, RatingMeta } from '@/components/Stars';
import { Chip } from '@/components/Chip';
import { ButtonLink } from '@/components/ButtonLink';
import { ErrorState, LoadingList } from '@/components/States';
import { Skeleton } from '@/components/ui/skeleton';
import { money, relativeDay, time } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useHome } from '@/features/client/queries';
import {
  BusinessRow,
  BusinessTile,
  NextSlotChip,
  SearchBar,
  SectionTitle,
  isToday,
  slotLabel,
} from '@/features/client/components';

export default function Home() {
  const { user } = useMe();
  const navigate = useNavigate();
  const home = useHome();
  const data = home.data;
  const returning = Boolean(user && data?.hasBookings);

  return (
    <div className="space-y-7">
      <header>
        <div className="mb-4 flex items-center justify-between md:hidden">
          <Logo size="md" />
          {!user && (
            <ButtonLink to="/entrar" size="sm">
              Iniciar sesión
            </ButtonLink>
          )}
        </div>
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight md:text-[30px]">
          ¿Qué quieres reservar hoy?
        </h1>
        <div className="mt-4 md:hidden">
          <SearchBar
            onSubmit={(q) => navigate(q ? `/buscar?q=${encodeURIComponent(q)}` : '/buscar')}
            onFilters={() => navigate('/buscar?filtros=1')}
          />
        </div>
      </header>

      {home.isLoading && <HomeSkeleton />}
      {home.isError && <ErrorState error={home.error} onRetry={home.refetch} />}

      {data && (
        <>
          {returning && data.nextBooking && <NextBookingBanner b={data.nextBooking} />}

          {returning ? (
            data.recent.length > 0 && (
              <section>
                <SectionTitle to="/buscar">Recientes</SectionTitle>
                <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-4 md:gap-5 md:overflow-visible md:px-0">
                  {data.recent.slice(0, 8).map((b, i) => (
                    <BusinessTile
                      key={b.id}
                      b={b}
                      className={cn(
                        'w-[150px] shrink-0 snap-start md:w-auto',
                        i >= 4 && 'md:hidden',
                      )}
                    />
                  ))}
                </div>
              </section>
            )
          ) : (
            <Welcome />
          )}

          {returning && data.reviewPrompt ? (
            <section className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_2fr] md:gap-5">
              <ReviewPrompt p={data.reviewPrompt} />
              {data.featured && <Featured b={data.featured} />}
            </section>
          ) : (
            data.featured && (
              <section>
                <Featured b={data.featured} />
              </section>
            )
          )}

          {data.recommended.length > 0 && (
            <section>
              <SectionTitle to="/buscar?sort=rating">
                {returning ? 'Negocios recomendados' : 'Los mejor calificados'}
              </SectionTitle>
              <div className="grid gap-3 md:grid-cols-3 md:gap-5">
                {data.recommended.map((b) => (
                  <BusinessRow key={b.id} b={b} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** RF-62: sin sesión o sin reservas todavía. */
function Welcome() {
  return (
    <section className="rounded-xl border border-primary-line bg-primary-soft p-5 md:flex md:items-center md:justify-between md:gap-6 md:p-7">
      <div>
        <p className="text-[11px] font-extrabold tracking-wide text-primary uppercase">
          Bienvenido a ReserYa
        </p>
        <h2 className="mt-1 text-lg font-extrabold md:text-[22px]">
          Reserva en negocios de Ensenada en minutos
        </h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Barberías, canchas, consultorios, masajes y más. Elige el servicio, la persona y la hora
          que te acomode; el negocio confirma tu cita.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 md:mt-0 md:shrink-0">
        <ButtonLink to="/buscar">
          <Search /> Buscar negocios
        </ButtonLink>
      </div>
    </section>
  );
}

function NextBookingBanner({ b }) {
  return (
    <Link
      to={`/reservas/${b.id}`}
      className="flex items-center gap-3 rounded-xl border border-primary-line bg-primary-soft px-4 py-3 hover:bg-primary-line/60"
    >
      <CalendarCheck className="size-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-bold">Tu próxima cita:</span> {b.businessName} ·{' '}
        {relativeDay(b.startsAt)} {time(b.startsAt)}
      </p>
      <span className="text-[13px] font-bold text-primary">Ver</span>
    </Link>
  );
}

/** RF-61: pide calificar la última cita completada. */
function ReviewPrompt({ p }) {
  const navigate = useNavigate();
  const go = (rating) =>
    navigate(`/reservas/${p.bookingId}/resena${rating ? `?calificacion=${rating}` : ''}`);
  return (
    <div className="flex flex-col rounded-xl border border-primary-line bg-primary-soft p-3.5 md:p-6">
      <p className="text-[11px] font-extrabold tracking-wide text-primary uppercase">Dar reseña</p>
      <p className="mt-1 text-[15px] leading-snug font-bold md:text-xl">
        ¿Qué tal tu cita en {p.businessName}?
      </p>
      <Stars onChange={go} size="size-5 md:size-6" className="mt-3" />
      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={() => go()}
          className="h-8 rounded-lg bg-foreground px-3.5 text-[13px] font-bold text-white hover:bg-foreground/90 md:h-10 md:px-4 md:text-sm"
        >
          Calificar
        </button>
      </div>
    </div>
  );
}

/** RF-59: negocio destacado. */
function Featured({ b, className }) {
  return (
    <Link
      to={`/negocios/${b.id}`}
      className={cn(
        'group block rounded-xl border border-border bg-white p-2.5 hover:bg-surface md:flex md:gap-6 md:p-3.5',
        className,
      )}
    >
      <div className="relative md:w-[44%] md:shrink-0">
        <Photo
          url={b.photoUrl}
          icon={b.category.icon}
          className="aspect-[16/10] w-full rounded-lg md:aspect-auto md:h-full md:min-h-44"
          iconClassName="size-8 md:size-14"
        />
        <Chip tone="solid" size="sm" className="absolute top-2 left-2 md:hidden">
          Recomendado
        </Chip>
      </div>
      <div className="mt-2.5 min-w-0 px-1 md:mt-0 md:flex md:flex-col md:justify-center md:py-2">
        <Chip tone="solid" size="sm" className="mb-2 hidden w-fit md:inline-flex">
          Recomendado
        </Chip>
        <p className="truncate text-base font-bold md:text-[26px] md:font-extrabold">{b.name}</p>
        <RatingMeta avg={b.ratingAvg} count={b.ratingCount} extra={b.category.name} />
        <div className="mt-2 hidden flex-wrap items-center gap-2 md:flex">
          {b.priceFromCents != null && (
            <span className="text-base font-bold">Desde {money(b.priceFromCents)}</span>
          )}
          {b.nextSlot && (
            <Chip tone={isToday(b.nextSlot) ? 'ok' : 'neutral'}>
              {isToday(b.nextSlot) ? `Disponible hoy ${time(b.nextSlot)}` : slotLabel(b.nextSlot)}
            </Chip>
          )}
        </div>
        <span className="mt-4 hidden h-11 w-fit items-center rounded-lg bg-primary px-5 text-sm font-bold text-white group-hover:bg-primary-pressed md:inline-flex">
          Ver negocio
        </span>
        <div className="mt-1 md:hidden">
          <NextSlotChip iso={b.nextSlot} />
        </div>
      </div>
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="flex gap-3 overflow-hidden md:grid md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-[150px] shrink-0 rounded-xl md:w-auto" />
        ))}
      </div>
      <LoadingList rows={3} itemClassName="h-24" />
    </div>
  );
}
