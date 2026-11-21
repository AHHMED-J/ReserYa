# ReserYa · Diseño de la base de datos (borrador)

Estado: **modelo implementado** con Drizzle en `apps/api/src/db/schema.js`. Los cambios que se hicieron al construirlo están en la sección 8. El diagrama está en [reserya-base-de-datos.mdj](reserya-base-de-datos.mdj) (se abre con OpenUML) y en [reserya-base-de-datos.svg](reserya-base-de-datos.svg) para verlo rápido.

Basado en los requerimientos RF-01 a RF-74 y RNF-01 a RNF-23 de [ReserYa - Requerimientos](https://docs.google.com/document/d/1sVQjgROe-PpVyUZo8RpXvWsD48Ap8enAWa7ZGCXBfOs/edit).

## 1. Decisiones generales (propuestas)

| Tema | Propuesta | Por qué |
|---|---|---|
| Motor | PostgreSQL | Restricción de exclusión para evitar reservas encimadas (RNF-15) |
| Llaves primarias | `uuid` | No se adivinan en URLs ni en links públicos |
| Dinero | enteros en centavos (`price_cents`, `amount_cents`) + moneda fija MXN | Evita errores de redondeo |
| Fechas y horas | `timestamptz` en UTC; la app muestra America/Tijuana (RNF-02) | Un solo criterio para todo |
| Horarios semanales | `time` local del negocio (sin zona) | "Abre a las 9:00" no cambia con el horario de verano |
| Borrado | No se borra: se desactiva (`active`, `status`) | Las reservas pasadas deben conservar su servicio, precio y negocio |
| Precio en la reserva | Se copia al reservar (`price_cents`, `duration_min`) | Si el negocio cambia el precio, la reserva vieja no cambia |
| Sesiones | Tabla `sessions` con cookie httpOnly (RNF-08) | Se puede cerrar una sesión desde el servidor |
| Secretos | Tokens de Google cifrados; contraseñas y PIN con hash (RNF-07, RNF-11) | |

## 2. Resumen de tablas

| Grupo | Tablas |
|---|---|
| Cuentas | `users`, `sessions`, `auth_tokens` |
| Negocios | `categories`, `businesses`, `registration_keys`, `business_photos` |
| Catálogo | `services`, `resources`, `resource_services`, `resource_schedules`, `closed_days` |
| Reservas y pagos | `bookings`, `payments`, `stripe_events` |
| Después de la cita | `reviews`, `business_views` |
| Calendario y agenda | `calendar_sync_jobs`, `external_busy_blocks`, `live_links` |
| Avisos | `email_log` |

## 3. Tablas y columnas

Convenciones: `PK` llave primaria, `FK` llave foránea, `UQ` único, `?` admite nulo. Todas llevan `created_at` y `updated_at` (se omiten abajo).

### 3.1 Cuentas

**users** (RF-01, RF-04, RF-06, RF-66, RF-67)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| role | enum `client`, `business`, `admin` | RF-04 |
| email | text UQ | |
| password_hash | text? | Nulo si entró solo con Google. Define si se muestra "Cambiar contraseña" (RF-67) |
| google_id | text? UQ | |
| email_verified_at | timestamptz? | RF-02. Con Google viene verificado |
| first_name, last_name | text | Del negocio: nombre del contacto |
| phone | text? | Obligatorio para clientes (RF-01); nulo mientras no complete el perfil |
| active | boolean | |

**sessions** (RNF-08): `id` PK, `user_id` FK, `token_hash` UQ, `expires_at`, `ip`?, `user_agent`?.

**auth_tokens** (RF-02, RF-03, RF-08): `id` PK, `user_id` FK, `type` enum (`verify_email`, `reset_password`, `reset_pin`), `token_hash` UQ, `expires_at`, `used_at`?.

### 3.2 Negocios

**categories** (RF-14): `id` PK, `name` UQ, `slug` UQ, `sort_order`. Son las 9 fijas.

**businesses** (RF-06, RF-07, RF-08, RF-10, RF-12, RF-14, RF-19, RF-20, RF-39)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK UQ | La cuenta compartida (dueño + recepción). Un negocio = una cuenta |
| category_id | FK categories | Una sola categoría (RF-14) |
| name, description, address, phone | text | Perfil público |
| status | enum `pending`, `approved`, `suspended`, `rejected` | RF-10, RF-11, RF-12, RF-73 |
| rejection_reason | text? | Motivo al rechazar; se envía por correo (RF-72) |
| suspension_reason, suspended_at | text?, timestamptz? | Motivo y fecha al suspender (RF-72) |
| pin_changed_at | timestamptz? | Cuándo el dueño cambió su PIN (RF-74) |
| registration_key_id | FK UQ | Con qué clave se registró. UQ = cada clave sirve una sola vez |
| owner_pin_hash | text? | RF-07 |
| pin_failed_attempts | int | RF-08 |
| pin_locked_until | timestamptz? | RF-08 |
| auto_accept | boolean | RF-20 |
| cancellation_limit_hours | int | RF-19 |
| min_notice_minutes | int | 30, 60, 180, 300, 720 o 1440 (RF-19) |
| max_advance_days | int | RF-19 |
| slot_interval_minutes | int | Intervalo de horarios (RF-19) |
| buffer_minutes | int | Tiempo entre citas (RF-19) |
| google_refresh_token_enc | text? | Cifrado (RNF-11) |
| google_connected_at | timestamptz? | RF-39 |
| rating_avg, rating_count | numeric, int | Caché para ordenar y mostrar (RF-49, RF-64); se recalcula al publicar una reseña |

Un negocio aparece en búsquedas solo si `status = approved` y tiene al menos un servicio activo, un recurso con horario y las reglas completas (RF-71). Es una consulta, no una columna.

**registration_keys** (RF-09, RF-10): `id` PK, `code` UQ, `created_by` FK users (admin), `used_at`?. Un solo uso: qué negocio la usó se sabe por `businesses.registration_key_id` (UQ), así la relación no se guarda dos veces.

**business_photos** (RF-14): `id` PK, `business_id` FK, `storage_key` (ruta o identificador del archivo, no una URL fija), `sort_order`. La app arma la URL según el almacenamiento configurado (decisión D2).

### 3.3 Catálogo

**services** (RF-15, RF-17): `id` PK, `business_id` FK, `name`, `description`?, `duration_min` int, `price_cents` int, `active` boolean. Las variantes son servicios separados. El precio no depende del recurso ni de la hora.

**resources** (RF-16, RF-40): `id` PK, `business_id` FK, `name`, `kind` enum (`person`, `space`), `color`, `google_calendar_id`?, `active`.

**resource_services** (RF-16): `resource_id` FK, `service_id` FK, PK compuesta. Qué servicios da cada recurso.

**resource_schedules** (RF-18): `id` PK, `resource_id` FK, `weekday` smallint (0 a 6), `start_time`, `end_time`. Varias filas por día permiten horario partido (por ejemplo 9 a 14 y 16 a 20).

**closed_days** (RF-18): `id` PK, `business_id` FK, `resource_id` FK? (nulo = todo el negocio), `date`, `reason`?.

### 3.4 Reservas y pagos

**bookings** (RF-25 a RF-38, RF-60)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| client_id | FK users | |
| business_id | FK businesses | |
| service_id | FK services | |
| resource_id | FK resources | Siempre se llena: si el cliente elige "cualquiera", el sistema asigna el primer recurso libre al enviar la solicitud (decisión D1) |
| starts_at, ends_at | timestamptz | |
| status | enum, ver abajo | |
| price_cents, duration_min | int | Copia al reservar |
| hold_expires_at | timestamptz? | Aceptación automática: aparta 10 min (RF-32) |
| respond_by | timestamptz? | Vence a las 12 h o 1 h antes de la cita, lo primero (RF-31) |
| decided_at | timestamptz? | Cuándo aceptó, rechazó o venció |
| cancelled_at, cancelled_by | timestamptz?, enum (`client`, `business`) | RF-35, RF-36 |
| cancellation_reason | text? | Motivo que escribe el negocio al cancelar (RF-36) |
| completed_at | timestamptz? | RF-37 |
| google_event_id | text? | RF-41 |
| rebooked_from_id | FK bookings? | Si vino de "Volver a agendar" (RF-60). Opcional |

Estados (`status`): `pending`, `hold`, `confirmed`, `rejected`, `expired`, `cancelled`, `completed`, `no_show`.

Reglas que se quieren en la base de datos:
- **Restricción de exclusión** (RNF-15, RF-33): no puede haber dos reservas con el mismo `resource_id` y rangos `[starts_at, ends_at)` que se enciman cuando `status` es `hold` o `confirmed`. Necesita la extensión `btree_gist`. Las `pending` no bloquean (RF-27).
- Máximo 3 solicitudes pendientes por cliente (RF-27): se valida en la API (una restricción no lo expresa bien).
- Índices: `(business_id, starts_at)`, `(client_id, starts_at)`, `(status, respond_by)` para los vencimientos.

**payments** (RF-26, RF-29, RF-30, RF-35, RF-52)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| booking_id | FK UQ | Un pago por reserva |
| stripe_payment_intent_id | text UQ | |
| amount_cents | int | |
| status | enum `authorized`, `captured`, `released`, `refunded`, `failed` | Autorizar, cobrar, liberar o reembolsar |
| authorized_at, captured_at, released_at, refunded_at | timestamptz? | Para el historial del dueño (RF-52) |

No se guarda ningún dato de tarjeta (RNF-10).

**stripe_events** (RNF-16): `id` text PK (el id del evento de Stripe), `type`, `processed_at`. Si llega repetido, ya existe y se ignora.

### 3.5 Después de la cita

**reviews** (RF-48, RF-49, RF-61): `id` PK, `booking_id` FK UQ (una por reserva), `client_id` FK, `business_id` FK, `rating` smallint 1 a 5, `comment`?. Solo se crea si la reserva está `completed` (no `no_show`).

**business_views** (RF-58, "Recientes"): `user_id` FK, `business_id` FK, `last_viewed_at`, PK compuesta. Se actualiza cada vez que el cliente abre un negocio.

### 3.6 Calendario y agenda en vivo

**calendar_sync_jobs** (RNF-17, RF-41, RF-43): `id` PK, `booking_id` FK, `action` enum (`create`, `delete`, `update`), `status` enum (`pending`, `done`, `failed`), `attempts` int, `next_attempt_at`, `last_error`?. Si Google falla, la reserva sigue válida y se reintenta.

**external_busy_blocks** (RF-42, RF-43; sincronización A, decisión D7): `id` PK, `resource_id` FK, `google_event_id`, `starts_at`, `ends_at`, `updated_at`; UQ (`resource_id`, `google_event_id`). Caché de los eventos personales de Google Calendar que bloquean horarios. Se llena revisando cambios cada 30 a 60 s. En `resources` se agrega `google_calendar_id` y `google_sync_token` (nulos hasta conectar Google).

**live_links** (RF-45, RF-46, RF-47): `id` PK, `business_id` FK, `resource_id` FK? (nulo = negocio completo), `token_hash` UQ, `revoked_at`?. Al regenerar se revoca el anterior y se crea uno nuevo.

### 3.7 Avisos

**email_log** (RF-13, RF-50): `id` PK, `to_user_id` FK?, `to_email`, `template`, `booking_id` FK?, `status`, `sent_at`?. Sirve para no repetir recordatorios y para el correo del administrador al negocio.

## 4. Relaciones principales

```
users 1──0..1 businesses            (cuenta del negocio)
users 1──* bookings                 (cliente)
users 1──* sessions, auth_tokens, reviews, business_views
users 1──* registration_keys        (created_by, el admin)
users 0..1──* email_log
categories 1──* businesses
businesses 1──* services, resources, closed_days, business_photos, live_links
businesses 1──* bookings, reviews, business_views
resources *──* services             (resource_services)
resources 1──* resource_schedules, external_busy_blocks
resources 0..1──* closed_days, live_links   (nulo = todo el negocio)
services 1──* bookings
resources 1──* bookings
bookings 1──0..1 payments
bookings 1──0..1 reviews
bookings 1──* calendar_sync_jobs
bookings 0..1──* email_log
bookings 0..1──* bookings           (rebooked_from_id)
registration_keys 1──0..1 businesses
```

El diagrama de clases (archivo `.mdj`) muestra estas mismas relaciones con su multiplicidad, más los 9 enums. `rebooked_from_id` no se dibuja como línea: se explica en la nota del diagrama para no saturarlo.

## 5. Cómo cubre cada requerimiento complicado

| Requerimiento | Dónde |
|---|---|
| RF-24 horarios libres | Se calculan en la API con `resource_schedules`, `closed_days`, reglas del negocio, `bookings` en `hold`/`confirmed` y los eventos de Google (RF-42) |
| RF-27 solicitudes que no bloquean | Solo `hold` y `confirmed` entran en la restricción de exclusión |
| RF-28 cola por horario | Consulta de `pending` agrupadas por recurso y rango, ordenadas por `created_at` |
| RF-29 aceptar | Transacción: `payments.status = captured`, `bookings.status = confirmed`, las demás `pending` que se enciman pasan a `rejected` y su pago a `released`, y se crean los trabajos de Google |
| RF-31 vencimiento | Tarea periódica sobre `(status, respond_by)` |
| RF-38 lista por pestañas | Próximas = `confirmed` futuras; Pendientes = `pending`; Pasadas = `completed`, `no_show`; Canceladas = `cancelled`, `rejected`, `expired` |
| RF-60 volver a agendar | Consulta de las últimas `completed` del cliente, una por servicio + recurso |
| RF-64 ordenar | `businesses.rating_avg`, precio mínimo de `services`, siguiente horario calculado |
| RF-65 siguiente horario libre | Se calcula; si pesa mucho se guarda en caché corta |

## 6. Decisiones tomadas y pendientes

### Decididas

| # | Tema | Decisión |
|---|---|---|
| D1 | "Cualquiera disponible" | Al enviar la solicitud el sistema escoge el primer recurso libre y lo guarda en `bookings.resource_id` (nunca es nulo). Así la restricción de exclusión funciona desde el inicio. |
| D2 | Fotos | La base solo guarda `storage_key`. En desarrollo los archivos van a una carpeta local de la API; al pasar a la nube se cambia a un servicio de imágenes (Cloudinary u otro) con una variable de entorno, sin tocar la base (RNF-21). |
| D3 | Reseñas | El negocio **no** responde reseñas. `reviews` queda sin columnas de respuesta. |
| D4 | Sucursales | Un negocio por cuenta (`users` 1 a 0..1 `businesses`). |
| D5 | Dinero | Los cobros entran a la cuenta de ReserYa en Stripe; el pago a negocios es fuera de la app (RF-69). `payments` solo registra cobros y reembolsos, sin tabla de liquidaciones. |
| D6 | Citas manuales | Las citas por llamada o en persona no se guardan en ReserYa; recepción las pone en Google Calendar y entran como `external_busy_blocks` (RF-70). |
| D7 | Sincronización con Google Calendar | Opción A: revisar cambios cada 30 a 60 s con `syncToken`, sin URL pública (RNF-06). Se guarda en `external_busy_blocks` y en `resources.google_sync_token`. |
| D8 | Clientes que no asisten | La reserva pasa a `no_show`. No hay cargo extra ni penalización; el pago ya cobrado no se reembolsa (RF-37). |
| D9 | Recordatorio | Un correo 24 h antes de la cita (RF-50). Se registra en `email_log` para no repetirlo. |
| D10 | Recomendados | Por calificación (`rating_avg`), con uno destacado (RF-59). No se guardan coordenadas. |
| D11 | Historial del dueño | Sale de `payments` (fechas de autorización, cobro, liberación y reembolso) unida con `bookings`. No hace falta otra tabla (RF-52). |

No quedan decisiones pendientes.

## 7. Siguiente paso

La explicación del diagrama con capturas está en el Doc [ReserYa - Diagrama de clases](https://docs.google.com/document/d/1tcAODGlil4GxMmSTHB7FCPa-akYMLFI4oXkEa7rkaQM/edit). La base de datos se crea con `pnpm db:reset` (migraciones de Drizzle y datos de demostración).

## 8. Cambios hechos al implementar

El esquema real sigue el modelo de arriba. Estas son las diferencias, para que el diagrama y el código coincidan.

| Tabla | Cambio | Motivo |
|---|---|---|
| `sessions` | Columna nueva `owner_unlocked_until` | Guarda hasta cuándo está desbloqueado el modo dueño y se renueva con cada uso (RF-07) |
| `categories` | Columna nueva `icon` | Nombre del ícono que usa la web para cada categoría |
| `businesses` | Columnas nuevas `approved_at` y `google_email` | Fecha de aprobación (se muestra al administrador) y cuenta de Google conectada (sirve para detectar si el dueño reconecta otra cuenta o si se perdió la conexión) |
| `resources` | Columna nueva `title` | Rol o descripción corta del recurso ("Barbero", "Cancha techada") |
| `bookings` | Columna nueva `submitted_at` | Momento en que el pago queda autorizado y la solicitud entra a la cola del negocio |
| `payments` | Estado nuevo `pending` | El cliente todavía no termina de pagar y no hay autorización |
| `live_links` | `token` en lugar de `token_hash` | El dueño vuelve a copiar el link, así que el token se guarda tal cual. Regenerar revoca el anterior |
| `external_busy_blocks` | Columna nueva `title` | Nombre del evento personal de Google que bloquea el horario |
| `users` | `last_name` obligatorio con valor vacío por omisión | Las cuentas de Google a veces no traen apellido |

**Borradores de reserva.** Al elegir horario se crea la reserva en `pending` (o `hold` con aceptación automática) con el pago en `pending`. Mientras `submitted_at` esté vacío es un borrador: no aparece en la cola del negocio. Al autorizarse el pago se llena `submitted_at` y `respond_by` y entra a la cola (RF-26, RF-31).

**Anticipación de 90 minutos (RF-75).** Una solicitud que el negocio debe aceptar a mano vence una hora antes de la cita. Por eso se exige al menos 90 minutos de anticipación aunque `min_notice_minutes` sea menor. Con aceptación automática se usa `min_notice_minutes` tal cual. La constante está en `apps/api/src/modules/public/availability.js`.

**Restricción de exclusión.** Drizzle no expresa `EXCLUDE USING gist`, así que vive en la migración `0001_exclusion.sql` junto con la extensión `btree_gist` (RNF-15).

**Datos fijos.** El correo de contacto que ve un negocio rechazado o suspendido es `soporte@reserya.test`, una constante en `apps/api/src/modules/admin/routes.js`.
