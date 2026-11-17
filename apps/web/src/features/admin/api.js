// Consultas y mutaciones del panel del administrador (/api/admin/...).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';

/** Misma llave que usa AdminLayout para el contador del menú. */
export const SUMMARY_KEY = ['admin', 'summary'];
export const KEYS_KEY = ['admin', 'keys'];
export const BUSINESSES_KEY = ['admin', 'businesses'];
export const businessKey = (id) => ['admin', 'business', id];

export const useSummary = () =>
  useQuery({ queryKey: SUMMARY_KEY, queryFn: () => api('/admin/summary') });

export const useKeys = () =>
  useQuery({ queryKey: KEYS_KEY, queryFn: () => api('/admin/keys').then((r) => r.keys) });

export const useBusinesses = (query = {}) =>
  useQuery({
    queryKey: [...BUSINESSES_KEY, query],
    queryFn: () => api('/admin/businesses', { query }).then((r) => r.businesses),
    placeholderData: (prev) => prev,
  });

export const useBusiness = (id) =>
  useQuery({
    queryKey: businessKey(id),
    queryFn: () => api(`/admin/businesses/${id}`).then((r) => r.business),
  });

/** Genera claves y refresca la lista y el resumen. */
export function useGenerateKeys(options = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (count) => api('/admin/keys', { method: 'POST', body: { count } }),
    ...options,
    onSuccess: (data, ...rest) => {
      qc.setQueryData(KEYS_KEY, data.keys);
      qc.invalidateQueries({ queryKey: SUMMARY_KEY });
      options.onSuccess?.(data, ...rest);
    },
  });
}

/** Acción sobre un negocio (aprobar, rechazar...). Refresca su detalle, las listas y el resumen. */
export function useBusinessAction(id, action, { success, ...options } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api(`/admin/businesses/${id}/${action}`, { method: 'POST', body }),
    ...options,
    onSuccess: async (data, ...rest) => {
      if (data?.business) qc.setQueryData(businessKey(id), data.business);
      await Promise.all([
        qc.invalidateQueries({ queryKey: BUSINESSES_KEY }),
        qc.invalidateQueries({ queryKey: SUMMARY_KEY }),
        qc.invalidateQueries({ queryKey: KEYS_KEY }),
      ]);
      if (success) toast.success(success);
      options.onSuccess?.(data, ...rest);
    },
  });
}

/** Copia texto al portapapeles con aviso. */
export async function copyText(text, label = 'Copiado') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error('No se pudo copiar. Selecciona el texto y cópialo a mano.');
  }
}
