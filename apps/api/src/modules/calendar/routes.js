// Google Calendar del negocio (RF-39 a RF-43). Montado en /api/calendar. Solo modo dueño.
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { requireActiveBusiness, requireOwnerMode } from '../../middleware/auth.js';
import { badRequest } from '../../lib/errors.js';
import { randomToken } from '../../lib/crypto.js';
import { authUrl, exchangeCode, CALENDAR_SCOPE } from './google.js';
import {
  disconnect,
  enqueueMissingEvents,
  ensureCalendars,
  saveConnection,
  statusFor,
  syncNow,
} from './sync.js';

export const router = Router();

const owner = [requireActiveBusiness, requireOwnerMode];
const STATE_COOKIE = 'rsy_gcal';
const COOKIE_PATH = '/api/calendar';
const GOOGLE_PAGE = () => `${env.WEB_URL}/negocio/dueno/google`;

/** Estado de la conexión, calendarios por recurso y trabajos pendientes o fallidos. */
router.get('/status', owner, async (req, res) => {
  res.json(await statusFor(req.business.id));
});

/** Manda al consentimiento de Google. Es una navegación normal (no fetch). */
router.get('/connect', owner, (req, res) => {
  if (!env.googleEnabled)
    throw badRequest('google_disabled', 'Google Calendar no está configurado en el servidor');
  const state = randomToken(24);
  res.cookie(STATE_COOKIE, JSON.stringify({ state, businessId: req.business.id }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    path: COOKIE_PATH,
    maxAge: 10 * 60 * 1000,
  });
  res.redirect(authUrl(state));
});

const callbackQuery = z.object({
  code: z.string().max(2000).optional(),
  state: z.string().max(200).optional(),
  error: z.string().max(200).optional(),
});

/** Google regresa aquí. Guarda el token cifrado y crea un calendario por recurso. */
router.get('/callback', async (req, res) => {
  const back = (query) => res.redirect(`${GOOGLE_PAGE()}?${query}`);
  let saved = {};
  try {
    saved = JSON.parse(req.cookies?.[STATE_COOKIE] ?? '{}');
  } catch {
    /* cookie dañada */
  }
  res.clearCookie(STATE_COOKIE, { path: COOKIE_PATH });
  if (!env.googleEnabled) return back('error=google_disabled');
  const parsed = callbackQuery.safeParse(req.query);
  if (!parsed.success) return back('error=google_failed');
  const q = parsed.data;
  if (q.error)
    return back(`error=${q.error === 'access_denied' ? 'access_denied' : 'google_failed'}`);
  // El state debe ser el que guardamos y la sesión debe ser del mismo negocio.
  if (!q.code || !saved.state || q.state !== saved.state) return back('error=invalid_state');
  const business = req.business;
  if (!business || business.id !== saved.businessId || business.status !== 'approved')
    return back('error=invalid_state');

  let result;
  try {
    result = await exchangeCode(q.code);
  } catch {
    return back('error=google_failed');
  }
  if (!result.scopes.includes(CALENDAR_SCOPE)) return back('error=missing_scope');
  if (!result.refreshToken) return back('error=no_refresh_token');

  await saveConnection(business, result);
  try {
    await ensureCalendars(business.id);
    await enqueueMissingEvents(business.id);
  } catch {
    // Si Google falla aquí, la cola vuelve a intentar crear los calendarios.
  }
  back('connected=1');
});

/** Desconecta: revoca el permiso, borra el token y los bloques de Google. */
router.post('/disconnect', owner, async (req, res) => {
  const { revoked } = await disconnect(req.business.id);
  res.json({ ok: true, revoked });
});

/** Fuerza una pasada: reintenta lo fallido, manda lo pendiente y lee los cambios. */
router.post('/sync-now', owner, async (req, res) => {
  if (!env.googleEnabled)
    throw badRequest('google_disabled', 'Google Calendar no está configurado en el servidor');
  if (!req.business.googleRefreshTokenEnc)
    throw badRequest('not_connected', 'Primero conecta Google Calendar');
  const result = await syncNow(req.business.id);
  res.json({ ok: true, ...result, status: await statusFor(req.business.id) });
});
