// Alta y configuración del negocio (RF-10, RF-14 a RF-20, RF-71). Montado en /api/business.
// Comparte el prefijo con business-ops: cada parte va en su propia subruta y aplica sus
// middlewares por ruta, sin router.use() global.
import { Router } from 'express';
import { requireActiveBusiness } from '../../middleware/auth.js';
import { setupChecklist } from '../../lib/businessReady.js';
import { router as registerRouter } from './register.js';
import { profileRouter, photosRouter } from './profile.js';
import { router as servicesRouter } from './services.js';
import { router as resourcesRouter } from './resources.js';
import { rulesRouter, closedDaysRouter } from './rules.js';

export const router = Router();

router.use('/register', registerRouter);

/** Lista de pasos de configuración (RF-71). */
router.get('/setup', requireActiveBusiness, async (req, res) => {
  res.json(await setupChecklist(req.business.id));
});

router.use('/profile', profileRouter);
router.use('/photos', photosRouter);
router.use('/services', servicesRouter);
router.use('/resources', resourcesRouter);
router.use('/closed-days', closedDaysRouter);
router.use('/rules', rulesRouter);
