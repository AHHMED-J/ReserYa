# ReserYa

Plataforma web para reservar en negocios locales de Ensenada: barberías, canchas, consultorios, veterinarias y más. Proyecto final de Aplicaciones Web (UABC).

- **Clientes:** buscan un negocio, eligen servicio, persona o espacio y horario, y pagan con tarjeta. El monto solo se aparta; se cobra cuando el negocio acepta.
- **Negocios:** reciben solicitudes, ven su agenda y la sincronizan con Google Calendar. Las funciones privadas (estadísticas, pagos, configuración) se desbloquean con un PIN de dueño.
- **Administrador:** genera claves de registro y aprueba negocios.

## Tecnologías

| Parte            | Herramientas                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Web (`apps/web`) | React 19, Vite, React Router, TanStack Query, Tailwind CSS 4, shadcn/ui (Base UI), Stripe Elements |
| API (`apps/api`) | Node.js 22+, Express 5, Drizzle ORM, zod, Stripe, Google APIs, Nodemailer                          |
| Base de datos    | PostgreSQL 15+ (con la extensión `btree_gist`)                                                     |

## Cómo correrlo

Requisitos: Node 22 o más reciente, pnpm 10 o más reciente y PostgreSQL.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # y llena ENCRYPTION_KEY (ver abajo)
createdb reserya
createdb reserya_test                        # solo para las pruebas
pnpm db:migrate
pnpm db:seed                                 # datos de demostración
pnpm dev                                     # API en :4000 y web en :5173
```

`ENCRYPTION_KEY` se genera con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Para borrar todo y volver a sembrar: `pnpm db:reset`.

### Servicios externos (opcionales)

Sin llaves, la app funciona en modo local:

| Variable                                                               | Sin configurar                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Pagos simulados: un botón "Pagar (prueba)" sustituye el formulario de tarjeta. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                             | No aparece "Continuar con Google" ni la conexión con Google Calendar.          |
| `SMTP_URL`                                                             | Los correos se imprimen en la consola de la API.                               |

Con Stripe en modo prueba, usa la tarjeta `4242 4242 4242 4242` con cualquier fecha futura y cualquier CVC. Para recibir webhooks en local: `stripe listen --forward-to localhost:4000/api/webhooks/stripe`.

En Google Cloud, registra estas URI de redirección:

- `http://localhost:4000/api/auth/google/callback`
- `http://localhost:4000/api/calendar/callback`

## Cuentas de demostración

Contraseña de todas: `demo1234`. PIN de dueño: `1234`.

| Rol                          | Correo                |
| ---------------------------- | --------------------- |
| Cliente                      | `ana@reserya.test`    |
| Negocio (Barbería El Patrón) | `patron@reserya.test` |
| Administrador                | `admin@reserya.test`  |

La semilla crea 18 negocios aprobados (2 por categoría), 3 pendientes, 1 suspendido, 12 clientes y alrededor de 230 reservas con reseñas.

## Scripts

| Comando            | Qué hace                                                   |
| ------------------ | ---------------------------------------------------------- |
| `pnpm dev`         | API y web con recarga automática                           |
| `pnpm test`        | Pruebas de la API contra `reserya_test`                    |
| `pnpm lint`        | ESLint en las dos apps                                     |
| `pnpm build`       | Compila la web en `apps/web/dist`                          |
| `pnpm db:generate` | Crea una migración a partir de `apps/api/src/db/schema.js` |

## Estructura

```
apps/
  api/
    src/
      config/      variables de entorno
      db/          esquema, migraciones y semilla
      lib/         sesión, correo, pagos, fechas, cifrado
      middleware/  autenticación, validación y errores
      modules/     un router por área (auth, admin, business-setup, business-ops, public, bookings, ...)
      jobs/        tareas periódicas (vencimientos, recordatorios, Google Calendar)
    test/          pruebas con node:test y supertest
  web/
    src/
      components/  ui/ (shadcn) + componentes propios + layouts
      pages/       una carpeta por área
      routes/      rutas de cada área
      lib/         cliente de la API y formatos de fecha y dinero
docs/              modelo de datos, guía de estilo y pantallas de alta fidelidad
```

Todas las fechas se guardan en UTC y se muestran en la zona `America/Tijuana`.
