// Cliente de la API propia (RNF-14). Siempre manda la cookie de sesión.
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? `Error ${status}`);
    this.status = status;
    this.code = body?.error ?? 'unknown';
    this.details = body?.details;
  }
}

/**
 * api('/bookings', { method: 'POST', body: {...}, query: {...} })
 * Devuelve el JSON de la respuesta o lanza ApiError.
 */
export async function api(path, { method = 'GET', body, query, signal } = {}) {
  let url = `/api${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
      else qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: 'include',
    signal,
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    for (const fn of errorListeners) fn(err);
    throw err;
  }
  return data;
}

const errorListeners = new Set();
/** Para reaccionar en un solo lugar a errores como 401 o modo dueño bloqueado. */
export const onApiError = (fn) => {
  errorListeners.add(fn);
  return () => errorListeners.delete(fn);
};

/** Mensajes de error de un campo: error.details?.campo?.[0] */
export const fieldError = (error, field) => error?.details?.[field]?.[0];
