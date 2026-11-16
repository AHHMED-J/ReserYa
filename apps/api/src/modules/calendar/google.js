// Capa delgada sobre Google Calendar API v3 (RF-39 a RF-43).
// Todo pasa por un OAuth2Client de google-auth-library (no usamos el paquete googleapis).
// En las pruebas se inyecta un cliente falso con setGoogleClientFactory().
import { OAuth2Client } from 'google-auth-library';
import { env, APP_TZ } from '../../config/env.js';

const BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Permisos mínimos: el correo para mostrar qué cuenta se conectó y
 * calendar.app.created, que solo deja crear calendarios secundarios y manejar los eventos
 * de esos calendarios (no ve el calendario personal del dueño).
 */
export const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.app.created'];
export const CALENDAR_SCOPE = SCOPES[2];

export const redirectUri = () => `${env.API_URL}/api/calendar/callback`;

const defaultFactory = () =>
  new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri());

let factory = defaultFactory;

/** Para pruebas: fn() debe devolver algo con la forma de OAuth2Client. null restaura el real. */
export function setGoogleClientFactory(fn) {
  factory = fn ?? defaultFactory;
}

const newClient = () => factory();

// ---------- errores ----------

/** El sync token ya no sirve (410 Gone): hay que sincronizar completo. */
export class SyncTokenExpiredError extends Error {
  constructor() {
    super('El sync token venció (410)');
    this.name = 'SyncTokenExpiredError';
  }
}

/** Código HTTP de un error de gaxios (o del cliente falso). */
export const errorStatus = (e) =>
  e?.status ?? e?.response?.status ?? (typeof e?.code === 'number' ? e.code : undefined);

/** El refresh token ya no sirve: lo revocaron, venció o cambió la contraseña. */
export const isInvalidGrant = (e) =>
  e?.response?.data?.error === 'invalid_grant' || /invalid_grant/.test(String(e?.message));

/** Mensaje corto para guardar en lastError. */
export const errorText = (e) => {
  const status = errorStatus(e);
  const apiMsg = e?.response?.data?.error?.message ?? e?.response?.data?.error_description;
  return [status, apiMsg ?? e?.message ?? String(e)].filter(Boolean).join(' ').slice(0, 300);
};

// ---------- OAuth ----------

/** URL de consentimiento. access_type=offline + prompt=consent para recibir refresh token. */
export function authUrl(state) {
  return newClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: SCOPES,
    state,
  });
}

/**
 * Cambia el código de la redirección por los tokens.
 * @returns {{ refreshToken: string|null, email: string|null, scopes: string[] }}
 */
export async function exchangeCode(code) {
  const client = newClient();
  const { tokens } = await client.getToken(code);
  let email = null;
  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    email = ticket.getPayload()?.email ?? null;
  }
  return {
    refreshToken: tokens.refresh_token ?? null,
    email,
    scopes: String(tokens.scope ?? '')
      .split(/\s+/)
      .filter(Boolean),
  };
}

/** Revoca el permiso en Google. No lanza error: si falla, igual desconectamos. */
export async function revoke(refreshToken) {
  try {
    await newClient().revokeToken(refreshToken);
    return true;
  } catch {
    return false;
  }
}

// ---------- Calendar API ----------

/**
 * Cliente de Calendar con el refresh token del negocio. google-auth-library pide y renueva
 * el access token solo (refrescar token); si Google responde invalid_grant, el error sube.
 */
export function calendarApi(refreshToken) {
  const client = newClient();
  client.setCredentials({ refresh_token: refreshToken });
  // gaxios reintenta solo 429/5xx; nuestro propio reintento vive en la cola.
  const call = async (method, path, { params, data } = {}) => {
    const res = await client.request({ url: `${BASE}${path}`, method, params, data });
    return res?.data;
  };
  const enc = encodeURIComponent;

  return {
    /** Obtiene un access token nuevo con el refresh token (sirve para validar la conexión). */
    async refreshAccessToken() {
      const { token } = await client.getAccessToken();
      return token;
    },

    /** calendars.insert → { id } */
    createCalendar({ summary, description }) {
      return call('POST', '/calendars', { data: { summary, description, timeZone: APP_TZ } });
    },

    /** calendars.delete (no se usa al desconectar: los calendarios son del usuario). */
    async deleteCalendar(calendarId) {
      try {
        await call('DELETE', `/calendars/${enc(calendarId)}`);
      } catch (e) {
        if (![404, 410].includes(errorStatus(e))) throw e;
      }
    },

    /** calendarList.patch para ponerle color al calendario en la lista del usuario (RF-40). */
    setCalendarColor(calendarId, colorId) {
      return call('PATCH', `/users/me/calendarList/${enc(calendarId)}`, { data: { colorId } });
    },

    /** events.insert. Si el id ya existe (409), lo actualiza: así reintentar no duplica. */
    async insertEvent(calendarId, event) {
      try {
        return await call('POST', `/calendars/${enc(calendarId)}/events`, { data: event });
      } catch (e) {
        if (errorStatus(e) !== 409 || !event.id) throw e;
        return call('PATCH', `/calendars/${enc(calendarId)}/events/${enc(event.id)}`, {
          data: { ...event, status: 'confirmed' },
        });
      }
    },

    /** events.patch. Devuelve null si el evento ya no existe. */
    async patchEvent(calendarId, eventId, patch) {
      try {
        return await call('PATCH', `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
          data: patch,
        });
      } catch (e) {
        if ([404, 410].includes(errorStatus(e))) return null;
        throw e;
      }
    },

    /** events.delete. Si ya estaba borrado (404/410) no es error. */
    async deleteEvent(calendarId, eventId) {
      try {
        await call('DELETE', `/calendars/${enc(calendarId)}/events/${enc(eventId)}`);
      } catch (e) {
        if (![404, 410].includes(errorStatus(e))) throw e;
      }
    },

    /**
     * events.list de una página. Con syncToken trae solo lo que cambió (incluye borrados);
     * sin él es una sincronización completa desde timeMin. 410 → SyncTokenExpiredError.
     */
    async listEvents(calendarId, { syncToken, pageToken, timeMin } = {}) {
      const params = { showDeleted: true, singleEvents: true, maxResults: 250 };
      if (syncToken) params.syncToken = syncToken;
      else if (timeMin) params.timeMin = timeMin;
      if (pageToken) params.pageToken = pageToken;
      try {
        return await call('GET', `/calendars/${enc(calendarId)}/events`, { params });
      } catch (e) {
        if (errorStatus(e) === 410) throw new SyncTokenExpiredError();
        throw e;
      }
    },
  };
}

const MAX_PAGES = 40;

/**
 * Todos los cambios de un calendario desde el último syncToken, recorriendo páginas.
 * Si el token venció, hace la sincronización completa desde timeMin.
 * @returns {{ items: object[], nextSyncToken: string|null, full: boolean }}
 */
export async function listChanges(api, calendarId, { syncToken, timeMin }) {
  const run = async (token) => {
    const items = [];
    let pageToken;
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await api.listEvents(calendarId, { syncToken: token, pageToken, timeMin });
      items.push(...(r?.items ?? []));
      if (r?.nextPageToken) {
        pageToken = r.nextPageToken;
        continue;
      }
      return { items, nextSyncToken: r?.nextSyncToken ?? null, full: !token };
    }
    // Demasiadas páginas: procesamos lo leído y la siguiente vez empezamos completo.
    return { items, nextSyncToken: null, full: !token };
  };
  if (!syncToken) return run(null);
  try {
    return await run(syncToken);
  } catch (e) {
    if (e instanceof SyncTokenExpiredError) return run(null);
    throw e;
  }
}

// ---------- colores ----------

/** Paleta de calendarios de Google (colors.get → calendar). El id es el colorId. */
export const CALENDAR_COLORS = {
  1: '#ac725e',
  2: '#d06b64',
  3: '#f83a22',
  4: '#fa573c',
  5: '#ff7537',
  6: '#ffad46',
  7: '#42d692',
  8: '#16a765',
  9: '#7bd148',
  10: '#b3dc6c',
  11: '#fbe983',
  12: '#fad165',
  13: '#92e1c0',
  14: '#9fe1e7',
  15: '#9fc6e7',
  16: '#4986e7',
  17: '#9a9cff',
  18: '#b99aff',
  19: '#c2c2c2',
  20: '#cabdbf',
  21: '#cca6ac',
  22: '#f691b2',
  23: '#cd74e6',
  24: '#a47ae2',
};

const rgb = (hex) => {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.padEnd(6, '0');
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
};

/** colorId de Google más parecido al color del recurso (distancia RGB ponderada). */
export function nearestCalendarColor(hex) {
  const [r, g, b] = rgb(hex);
  let best = '16';
  let bestD = Infinity;
  for (const [id, c] of Object.entries(CALENDAR_COLORS)) {
    const [r2, g2, b2] = rgb(c);
    const d = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
