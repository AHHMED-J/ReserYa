// Consultas de Google Calendar del negocio (solo modo dueño).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const CALENDAR_STATUS_KEY = ['calendar', 'status'];

/** Estado de la conexión. No se consulta en intervalos: cada consulta renueva el modo dueño. */
export function useCalendarStatus(options = {}) {
  return useQuery({
    queryKey: CALENDAR_STATUS_KEY,
    queryFn: () => api('/calendar/status'),
    ...options,
  });
}

export function useSyncNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/calendar/sync-now', { method: 'POST' }),
    onSuccess: (data) => qc.setQueryData(CALENDAR_STATUS_KEY, data.status),
  });
}

export function useDisconnectCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/calendar/disconnect', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CALENDAR_STATUS_KEY }),
  });
}

/** El botón de conectar es un enlace normal: la API redirige a Google. */
export const CONNECT_URL = '/api/calendar/connect';

/** Mensajes para ?error= de la redirección de regreso. */
export const CONNECT_ERRORS = {
  access_denied: 'No diste permiso en Google. Puedes intentarlo de nuevo cuando quieras.',
  invalid_state: 'La conexión tardó demasiado o no coincide. Vuelve a intentarlo.',
  missing_scope:
    'Google no dio permiso para administrar calendarios. Al conectar, deja marcada esa casilla.',
  no_refresh_token:
    'Google no envió un permiso permanente. Quita ReserYa de las apps con acceso en tu cuenta de Google y vuelve a conectar.',
  google_disabled: 'Google Calendar no está configurado en el servidor.',
  google_failed: 'No se pudo conectar con Google. Intenta de nuevo.',
};
