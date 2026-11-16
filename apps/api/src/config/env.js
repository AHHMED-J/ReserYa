import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgres://localhost:5432/reserya'),
  WEB_URL: z.string().default('http://localhost:5173'),
  API_URL: z.string().default('http://localhost:4000'),
  SESSION_DAYS: z.coerce.number().default(30),
  // 32 bytes en base64 para cifrar los tokens de Google (AES-256-GCM). RNF-11
  ENCRYPTION_KEY: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PUBLISHABLE_KEY: optional,
  // smtp://usuario:clave@host:puerto. Sin él, los correos se imprimen en la consola.
  SMTP_URL: optional,
  MAIL_FROM: z.string().default('ReserYa <no-reply@reserya.test>'),
  JOBS_ENABLED: z.stringbool().default(true),
  UPLOADS_DIR: z.string().default('uploads'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Variables de entorno inválidas:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  googleEnabled: Boolean(parsed.data.GOOGLE_CLIENT_ID && parsed.data.GOOGLE_CLIENT_SECRET),
  stripeEnabled: Boolean(parsed.data.STRIPE_SECRET_KEY),
};

/** Zona horaria de toda la aplicación (RNF-02). */
export const APP_TZ = 'America/Tijuana';
