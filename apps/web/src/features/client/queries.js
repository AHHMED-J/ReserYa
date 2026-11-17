// Consultas y mutaciones del área del cliente (TanStack Query).
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const keys = {
  home: ['client', 'home'],
  search: (params) => ['client', 'search', params],
  business: (id) => ['client', 'business', id],
  reviews: (id) => ['client', 'business', id, 'reviews'],
  days: (id, params) => ['client', 'business', id, 'days', params],
  slots: (id, params) => ['client', 'business', id, 'slots', params],
  bookings: ['client', 'bookings'],
  bookingList: (tab) => ['client', 'bookings', 'list', tab],
  booking: (id) => ['client', 'bookings', 'detail', id],
  rebook: ['client', 'bookings', 'rebook'],
};

export const useHome = () => useQuery({ queryKey: keys.home, queryFn: () => api('/public/home') });

/** Búsqueda paginada con "Ver más". params ya en el formato de la API. */
export const useSearch = (params) =>
  useInfiniteQuery({
    queryKey: keys.search(params),
    queryFn: ({ pageParam }) =>
      api('/public/businesses', { query: { ...params, page: pageParam } }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

export const useBusiness = (id) =>
  useQuery({
    queryKey: keys.business(id),
    queryFn: () => api(`/public/businesses/${id}`).then((r) => r.business),
    enabled: Boolean(id),
  });

export const useBusinessReviews = (id, enabled = true) =>
  useInfiniteQuery({
    queryKey: keys.reviews(id),
    queryFn: ({ pageParam }) =>
      api(`/public/businesses/${id}/reviews`, { query: { page: pageParam, pageSize: 10 } }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled,
  });

/** Días con lugar (tira de fechas). */
export const useDays = (businessId, params, enabled = true) =>
  useQuery({
    queryKey: keys.days(businessId, params),
    queryFn: () => api(`/public/businesses/${businessId}/days`, { query: params }),
    enabled: enabled && Boolean(params.serviceId),
    staleTime: 15_000,
  });

/** Horarios libres de un día. */
export const useSlots = (businessId, params, enabled = true) =>
  useQuery({
    queryKey: keys.slots(businessId, params),
    queryFn: () => api(`/public/businesses/${businessId}/availability`, { query: params }),
    enabled: enabled && Boolean(params.serviceId && params.date),
    staleTime: 15_000,
  });

export const useMyBookings = (tab) =>
  useInfiniteQuery({
    queryKey: keys.bookingList(tab),
    queryFn: ({ pageParam }) => api('/bookings', { query: { tab, page: pageParam } }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

export const useBooking = (id) =>
  useQuery({
    queryKey: keys.booking(id),
    queryFn: () => api(`/bookings/${id}`).then((r) => r.booking),
    enabled: Boolean(id),
  });

export const useRebookList = () =>
  useQuery({
    queryKey: keys.rebook,
    queryFn: () => api('/bookings/rebook').then((r) => r.items),
  });

/** Después de crear, pagar o cancelar: refresca reservas, inicio y horarios. */
export function useInvalidateBookings() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: keys.bookings });
    qc.invalidateQueries({ queryKey: keys.home });
    qc.invalidateQueries({ queryKey: ['client', 'business'] });
  };
}

export function useCancelBooking(id) {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: () => api(`/bookings/${id}/cancel`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}
