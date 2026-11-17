// Consultas y acciones de la operación del negocio (recepción y modo dueño).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ME_KEY } from '@/hooks/useAuth';

/** Todo lo del negocio cuelga de esta llave (BusinessLayout usa ['business', 'summary']). */
const B = 'business';
export const keys = {
  requests: [B, 'requests'],
  agenda: (date) => [B, 'agenda', date],
  bookings: (params) => [B, 'bookings', params],
  booking: (id) => [B, 'booking', id],
  dashboard: [B, 'dashboard'],
  stats: (weeks) => [B, 'stats', weeks],
  payments: (params) => [B, 'payments', params],
  liveLinks: [B, 'live-links'],
};

/** Tras aceptar, rechazar o cancelar se refresca todo lo del negocio (cola, agenda, contador...). */
const useInvalidateBusiness = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [B] });
};

export const useRequests = () =>
  useQuery({
    queryKey: keys.requests,
    queryFn: () => api('/business/requests'),
    refetchInterval: 30_000,
  });

export function useDecideRequest() {
  const invalidate = useInvalidateBusiness();
  return useMutation({
    mutationFn: ({ id, action }) => api(`/business/requests/${id}/${action}`, { method: 'POST' }),
    onSettled: invalidate,
  });
}

export const useAgenda = (date) =>
  useQuery({
    queryKey: keys.agenda(date),
    queryFn: () => api('/business/agenda', { query: { date } }),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

export const useBookings = (params) =>
  useQuery({
    queryKey: keys.bookings(params),
    queryFn: () => api('/business/bookings', { query: params }),
    placeholderData: keepPreviousData,
  });

export const useBooking = (id) =>
  useQuery({
    queryKey: keys.booking(id),
    queryFn: () => api(`/business/bookings/${id}`).then((r) => r.booking),
    enabled: Boolean(id),
  });

export function useNoShow() {
  const invalidate = useInvalidateBusiness();
  return useMutation({
    mutationFn: (id) => api(`/business/bookings/${id}/no-show`, { method: 'POST' }),
    onSettled: invalidate,
  });
}

/** Cancela como dueño. Si recepción escribe el PIN en el mismo diálogo, primero se desbloquea. */
export function useCancelBooking() {
  const qc = useQueryClient();
  const invalidate = useInvalidateBusiness();
  return useMutation({
    mutationFn: async ({ id, reason, pin }) => {
      if (pin) {
        await api('/business/owner/unlock', { method: 'POST', body: { pin } });
        await qc.invalidateQueries({ queryKey: ME_KEY });
      }
      return api(`/business/bookings/${id}/cancel`, { method: 'POST', body: { reason } });
    },
    onSettled: invalidate,
  });
}

export const useDashboard = () =>
  useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api('/business/dashboard'),
    refetchInterval: 60_000,
  });

export const useStats = (weeks) =>
  useQuery({
    queryKey: keys.stats(weeks),
    queryFn: () => api('/business/stats', { query: { weeks } }),
    placeholderData: keepPreviousData,
  });

export const usePayments = (params) =>
  useQuery({
    queryKey: keys.payments(params),
    queryFn: () => api('/business/payments', { query: params }),
    placeholderData: keepPreviousData,
  });

export const useLiveLinks = () =>
  useQuery({ queryKey: keys.liveLinks, queryFn: () => api('/business/live-links') });

export function useLiveLinkAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, id, resourceId }) => {
      if (action === 'create')
        return api('/business/live-links', { method: 'POST', body: { resourceId } });
      if (action === 'regenerate')
        return api(`/business/live-links/${id}/regenerate`, { method: 'POST' });
      return api(`/business/live-links/${id}`, { method: 'DELETE' });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.liveLinks }),
  });
}

/** Hora actual que se actualiza cada `everyMs` (para "vence en" y la línea de ahora). */
export function useNow(everyMs = 30_000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return t;
}

/** true si la pantalla es al menos de computadora (lg, 1024 px). */
export function useIsDesktop(query = '(min-width: 1024px)') {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}
