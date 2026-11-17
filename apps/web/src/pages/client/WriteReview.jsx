// Calificar una cita completada (RF-48).
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, fieldError } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Photo } from '@/components/Photo';
import { Stars } from '@/components/Stars';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { EmptyState, ErrorState, FullPageSpinner } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { dayLong } from '@/lib/format';
import { useBooking, useInvalidateBookings } from '@/features/client/queries';
import { withResource } from '@/features/client/components';

const MAX = 500;
const WORDS = ['', 'Mala', 'Regular', 'Buena', 'Muy buena', 'Excelente'];

export default function WriteReview() {
  const { id } = useParams();
  const q = useBooking(id);
  if (q.isLoading) return <FullPageSpinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} className="mt-6" />;
  if (!q.data.canReview)
    return (
      <EmptyState
        title={q.data.review ? 'Ya calificaste esta cita' : 'Esta cita no se puede calificar'}
        text="Solo se califican citas completadas, una vez por cita."
        action={{ label: 'Ver la reserva', to: `/reservas/${id}` }}
        className="mx-auto mt-6 max-w-xl"
      />
    );
  return <Form b={q.data} />;
}

function Form({ b }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const invalidate = useInvalidateBookings();
  const initial = Number(params.get('calificacion'));
  const [rating, setRating] = useState(initial >= 1 && initial <= 5 ? initial : 0);
  const [comment, setComment] = useState('');
  const m = useMutation({
    mutationFn: () =>
      api('/reviews', { method: 'POST', body: { bookingId: b.id, rating, comment } }),
    onSuccess: () => {
      invalidate();
      toast.success('¡Gracias por tu reseña!');
      navigate(`/reservas/${b.id}`, { replace: true });
    },
  });

  return (
    <form
      className="mx-auto max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        if (rating) m.mutate();
      }}
      noValidate
    >
      <PageHeader title="Califica tu cita" back />
      <div className="flex items-center gap-3 rounded-xl border border-border p-3.5">
        <Photo
          url={b.business.photoUrl}
          icon={b.business.category.icon}
          className="size-12 shrink-0 rounded-lg"
          iconClassName="size-5"
        />
        <div className="min-w-0">
          <p className="truncate font-bold">{b.business.name}</p>
          <p className="truncate text-[13px] text-muted-foreground">
            {b.service.name} · {withResource(b.resource)} · {dayLong(b.startsAt)}
          </p>
        </div>
      </div>

      <fieldset className="mt-6 text-center">
        <legend className="mb-3 w-full text-base font-extrabold">¿Cómo te fue?</legend>
        <Stars value={rating} onChange={setRating} size="size-10" className="justify-center" />
        <p className="mt-2 h-5 text-sm font-semibold text-muted-foreground" aria-live="polite">
          {WORDS[rating]}
        </p>
      </fieldset>

      <Field
        label="Comentario"
        optional
        className="mt-4"
        error={fieldError(m.error, 'comment')}
        hint={`${comment.length}/${MAX}`}
      >
        <Textarea
          value={comment}
          maxLength={MAX}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Cuéntale a otros clientes cómo te atendieron"
          rows={4}
        />
      </Field>
      {m.error && !m.error.details && (
        <Notice kind="error" className="mt-4">
          {m.error.message}
        </Notice>
      )}
      <Button type="submit" size="lg" className="mt-6 w-full" disabled={!rating || m.isPending}>
        Publicar reseña
      </Button>
    </form>
  );
}
