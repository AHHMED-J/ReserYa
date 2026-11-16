import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => (err?.status && err.status < 500 ? false : count < 2),
      refetchOnWindowFocus: false,
    },
  },
});
