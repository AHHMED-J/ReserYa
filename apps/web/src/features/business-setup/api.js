// Consultas y mutaciones de la configuración del negocio (/api/business/...).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const SETUP_KEY = ['business', 'setup'];
export const PROFILE_KEY = ['business', 'profile'];
export const SERVICES_KEY = ['business', 'services'];
export const RESOURCES_KEY = ['business', 'resources'];
export const CLOSED_DAYS_KEY = ['business', 'closed-days'];
export const RULES_KEY = ['business', 'rules'];

/** Lista de pasos (RF-71): { steps: [{ key, label, done }], ready } */
export const useSetup = (options = {}) =>
  useQuery({ queryKey: SETUP_KEY, queryFn: () => api('/business/setup'), ...options });

export const useProfile = () =>
  useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => api('/business/profile').then((r) => r.profile),
  });

export const useServices = () =>
  useQuery({
    queryKey: SERVICES_KEY,
    queryFn: () => api('/business/services').then((r) => r.services),
  });

export const useResources = () =>
  useQuery({
    queryKey: RESOURCES_KEY,
    queryFn: () => api('/business/resources'),
  });

export const useClosedDays = () =>
  useQuery({
    queryKey: CLOSED_DAYS_KEY,
    queryFn: () => api('/business/closed-days').then((r) => r.closedDays),
  });

export const useRules = () =>
  useQuery({ queryKey: RULES_KEY, queryFn: () => api('/business/rules') });

/**
 * Mutación que al terminar refresca las consultas indicadas y la lista de pasos.
 * Las consultas del negocio que usan otras áreas (perfil público, agenda) también se marcan viejas.
 */
export function useSetupMutation(mutationFn, keys = [], options = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      await Promise.all([...keys, SETUP_KEY].map((queryKey) => qc.invalidateQueries({ queryKey })));
      await options.onSuccess?.(data, vars, ctx);
    },
  });
}
