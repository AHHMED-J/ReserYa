// Borra todo el esquema public (solo para desarrollo). Luego se corren migraciones y seed.
import { env } from '../config/env.js';
import { pool } from './index.js';

if (env.isProd) {
  console.error('db:reset no se permite en producción');
  process.exit(1);
}
await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
console.log('Base de datos vacía');
await pool.end();
