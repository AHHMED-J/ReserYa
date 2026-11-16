import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const ME_KEY = ['me'];

/** Usuario actual (o null). user.role: client | business | admin. */
export function useMe() {
  const q = useQuery({ queryKey: ME_KEY, queryFn: () => api('/auth/me'), staleTime: 60_000 });
  return { ...q, user: q.data?.user ?? null };
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api('/auth/login', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(ME_KEY, { user: null });
    },
  });
}

/** Ruta a la que va cada rol al entrar. */
export const homeFor = (user) =>
  !user ? '/' : user.role === 'admin' ? '/admin' : user.role === 'business' ? '/negocio' : '/';
