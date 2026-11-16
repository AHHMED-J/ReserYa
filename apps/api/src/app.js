import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { sessionMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { notFound } from './lib/errors.js';
import { uploadsDir } from './lib/storage.js';
import { router as authRouter, meRouter } from './modules/auth/routes.js';
import { router as catalogRouter } from './modules/catalog/routes.js';
import { router as ownerRouter } from './modules/owner/routes.js';
import { router as adminRouter } from './modules/admin/routes.js';
import { router as businessSetupRouter } from './modules/business-setup/routes.js';
import { router as businessOpsRouter } from './modules/business-ops/routes.js';
import { router as publicRouter } from './modules/public/routes.js';
import { router as bookingsRouter } from './modules/bookings/routes.js';
import { router as reviewsRouter } from './modules/reviews/routes.js';
import { router as webhooksRouter } from './modules/webhooks/routes.js';
import { router as liveRouter } from './modules/live/routes.js';
import { router as calendarRouter } from './modules/calendar/routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.WEB_URL, credentials: true }));

  // Stripe necesita el cuerpo crudo para verificar la firma: va antes de express.json().
  app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhooksRouter);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));
  app.use(sessionMiddleware);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', catalogRouter); // /api/config, /api/categories
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/business/owner', ownerRouter);
  app.use('/api/business', businessSetupRouter);
  app.use('/api/business', businessOpsRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/live', liveRouter);
  app.use('/api/calendar', calendarRouter);

  app.use('/api', (_req, _res, next) => next(notFound('Ruta no encontrada')));
  app.use(errorHandler);
  return app;
}
