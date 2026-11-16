import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** { paymentMode: 'stripe'|'fake', stripePublishableKey, googleLogin } */
export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: () => api('/config'), staleTime: Infinity });
}

/** Las 9 categorías: [{ id, name, slug, icon }] */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api('/categories').then((r) => r.categories),
    staleTime: Infinity,
  });
}
