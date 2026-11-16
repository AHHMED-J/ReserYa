import { ZodError, z } from 'zod';
import { HttpError } from '../lib/errors.js';

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'validation',
      message: 'Revisa los datos enviados',
      details: z.flattenError(err).fieldErrors,
    });
  }
  const pgCode = err.code ?? err.cause?.code;
  if (pgCode === '23P01') {
    return res
      .status(409)
      .json({ error: 'slot_taken', message: 'Ese horario ya no está disponible' });
  }
  if (pgCode === '23505') {
    return res.status(409).json({ error: 'duplicate', message: 'Ese dato ya existe' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'bad_json', message: 'JSON inválido' });
  }
  console.error(err);
  res.status(500).json({ error: 'internal', message: 'Ocurrió un error inesperado' });
}
