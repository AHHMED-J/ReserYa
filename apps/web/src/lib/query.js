import { QueryClient } from '@tanstack/react-query';
import { onApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => (err?.status && err.status < 500 ? false : count < 2),
      refetchOnWindowFocus: false,
    },
  },
});

// Si la sesión venció o el modo dueño se volvió a bloquear, se recarga el usuario actual
// y los layouts redirigen o muestran el PIN.
onApiError((err) => {
  if (err.status === 401 || err.code === 'owner_mode_locked') {
    queryClient.invalidateQueries({ queryKey: ['me'] });
  }
});
