// Piezas que comparten las rutas de configuración del negocio.
import { Router } from 'express';
import { requireActiveBusiness, requireOwnerMode } from '../../middleware/auth.js';

/** Paleta fija de colores sólidos para los recursos (RF-40: un color por calendario). */
export const RESOURCE_COLORS = [
  '#0A7DB2', // azul
  '#1F8F78', // verde
  '#A35F00', // ámbar
  '#8360C4', // morado
  '#C24F78', // rosa
  '#C23A3A', // rojo
  '#3D5A80', // azul marino
  '#4A5967', // gris
];

/** Valores permitidos de las reglas (RF-19). La anticipación mínima también tiene un check en la base. */
export const MIN_NOTICE_OPTIONS = [30, 60, 180, 300, 720, 1440];
export const SLOT_INTERVAL_OPTIONS = [10, 15, 20, 30, 60];

/** Lectura: negocio aprobado (recepción o dueño). */
export const readAccess = [requireActiveBusiness];
/** Escritura: negocio aprobado con el modo dueño desbloqueado. */
export const ownerAccess = [requireActiveBusiness, requireOwnerMode];

/** Sub-Router propio para montar en una subruta sin afectar a las rutas de business-ops. */
export const subRouter = () => Router({ mergeParams: true });

/** '09:00:00' → '09:00' */
export const hhmmOf = (t) => (t ? String(t).slice(0, 5) : t);
