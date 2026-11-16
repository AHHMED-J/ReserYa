// Validadores de Zod que se repiten en varios módulos.
import { z } from 'zod';

export const email = z.string().trim().toLowerCase().pipe(z.email('Correo inválido'));
export const password = z.string().min(8, 'Mínimo 8 caracteres').max(100);
export const name = z.string().trim().min(1, 'Requerido').max(80);
/** Teléfono de México: se guardan solo los 10 dígitos. */
export const phone = z
  .string()
  .transform((v) => v.replace(/\D/g, '').replace(/^52(?=\d{10}$)/, ''))
  .refine((v) => v.length === 10, 'Escribe 10 dígitos');
export const uuid = z.uuid('Identificador inválido');
export const idParam = z.object({ id: uuid });
/** 'YYYY-MM-DD' */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)');
/** 'HH:mm' */
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:mm)');
/** PIN del dueño: 4 a 6 dígitos (RF-07). */
export const pin = z.string().regex(/^\d{4,6}$/, 'El PIN es de 4 a 6 dígitos');
/** Pesos con centavos → centavos enteros. Acepta 250 o 250.50 */
export const pesosToCents = z.coerce
  .number()
  .nonnegative()
  .max(1_000_000)
  .transform((v) => Math.round(v * 100));
