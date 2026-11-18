# Plan de cambios del backend: Better Auth, Supabase solo DB, FCM sin firebase-admin y limpieza de ENV

> **Estado: implementado** (noviembre 2026). Este archivo es registro histórico del plan; la identidad viva es Better Auth + PostgreSQL.

Fecha: 2026-11-17 · Estado: **propuesta, sin implementar** · Alcance: `backend/`

Este documento describe los cambios que salen de la auditoría del backend. No se modificó código. Cada sección dice qué se cambia, en qué archivos y cómo se verifica.

---

## 1. Resumen

| # | Cambio | Resultado |
|---|---|---|
| 1 | Supabase local queda solo con el contenedor `db` | De 11 contenedores a 1 |
| 2 | GoTrue (Supabase Auth) se reemplaza por **Better Auth** dentro de la API | Usuarios y sesiones en nuestra propia base; sin `kong` ni `auth` |
| 3 | Las migraciones se borran y se regeneran con **Prisma Migrate** (`schema.prisma` es la fuente de verdad) | El esquema funciona en cualquier Postgres 17 y se aplica con los comandos de Prisma |
| 4 | Se quita `firebase-admin`; el push usa la API HTTP v1 de FCM con `jose` + `fetch` | -1 dependencia pesada |
| 5 | Limpieza de variables de entorno | -12 variables, +3 |
| 6 | Mecanismos que faltan, según la auditoría | La API arranca en producción, se rechazan secretos de ejemplo, el proveedor real se guarda en la base, hay una sola lista de colas y un README real |
| 7 | Seed con 3 usuarios demo + app Android conectada a la API + emparejamiento BLE (viene del plan de Cursor, sección 11) | La app abre en login y deja de usar datos de demostración |

**Decisiones ya tomadas por el equipo**
- Las migraciones actuales se **borran y se regeneran con Prisma Migrate** (la base no está desplegada). Prisma deja de usarse con `db pull`.
- **pg-boss se queda** (el hallazgo #9 de la auditoría queda fuera). Solo se unifica la lista de colas.

**Fuera de alcance:** rediseñar el modelo de dominio. Las tablas de `guardme.*` se mantienen igual porque todo el código usa SQL directo sobre ellas.

---

## 2. Supabase: solo el contenedor de base de datos

Una vez que Better Auth reemplaza a GoTrue, el backend solo usa Postgres. Ningún código usa Realtime, Storage, Edge Functions, PostgREST, Studio, Analytics ni Mailpit. Esto se comprobó en la auditoría: no hay ningún `.from()`, `.rpc()`, `.storage` ni `.channel()`.

### `supabase/config.toml`

Poner `enabled = false` en:

```toml
[api]            # PostgREST
[realtime]
[studio]         # también apaga postgres-meta
[local_smtp]     # mailpit
[storage]
[auth]           # GoTrue: lo reemplaza Better Auth
[edge_runtime]
[analytics]      # logflare + vector (vector suele fallar en Windows)
```

Además, borrar los bloques que quedan sin uso: `[auth.*]`, `[storage.*]` y `[experimental]` (S3). Poner `[db.migrations] enabled = false` y `[db.seed] enabled = false`: las migraciones y el seed pasan a Prisma (sección 3).

### `package.json`

```jsonc
"db:start": "supabase start -x kong",   // kong no depende de [api]; se excluye explícitamente
```

```jsonc
"db:reset": "prisma migrate reset --force",   // migraciones + prisma/seed.ts (roles, pg-boss, demo)
"db:migrate": "prisma migrate dev",
"db:deploy": "prisma migrate deploy",
"prisma": { "seed": "tsx prisma/seed.ts" }
```

Se borran `db:sync` y `queue:install` (los absorbe `prisma/seed.ts`; `scripts/pgboss-install.ts` se sigue usando desde ahí).

**Verificación:** `pnpm db:start` y luego `docker ps --filter name=supabase_` → solo `supabase_db_backend`.

**Nota:** con Prisma a cargo de migraciones y seed, la CLI de Supabase queda solo como lanzador del contenedor de Postgres. El paso natural siguiente es reemplazarla por un `docker-compose.yml` con `postgres:17`: un contenedor, sin el esquema `auth` propio de Supabase y sin la CLI como dependencia. No se hace en este cambio.

---

## 3. Base de datos: Prisma como fuente de verdad del esquema

### 3.1 Enfoque

- **`prisma/schema.prisma` es la fuente de verdad.** `prisma migrate dev` genera las migraciones en `prisma/migrations/`. Se aplican con `prisma migrate reset` en local y con `prisma migrate deploy` en CI y en la nube.
- Se borran `supabase/migrations/` y `supabase/seed.sql`. La CLI de Supabase pasa a ser solo el lanzador de Postgres (sección 2).
- Desaparecen `prisma db pull` y el script `db:sync`. Ya no se lee el esquema desde la base: se escribe en Prisma.
- Lo que el lenguaje de Prisma no expresa (roles, RLS, políticas, grants, funciones, triggers, CHECK, índices parciales) va **dentro de las migraciones de Prisma** como SQL. Es el mecanismo oficial de Prisma para personalizar migraciones: se crea la migración con `prisma migrate dev --create-only`, se completa el SQL y recién después se aplica.

### 3.2 Qué genera Prisma y qué se escribe a mano

| Lo genera Prisma desde `schema.prisma` | Se escribe en SQL dentro de la migración (cantidades de hoy) |
|---|---|
| Las 36 tablas de `guardme` y las 4 de Better Auth (`identity`) | 5 roles sin BYPASSRLS |
| Columnas, tipos, defaults | 36 `ENABLE ROW LEVEL SECURITY` |
| PK, FK y `onDelete` | 109 políticas RLS |
| Índices comunes y únicos completos | 125 `GRANT`/`REVOKE` |
| Los esquemas `guardme` e `identity` (`schemas = [...]`) | 139 `CHECK` |
| | 13 funciones (`ctx_*`, `bump_version`, `resolve_principal`, …) y 13 triggers |
| | 16 índices parciales (13 de ellos únicos) |

La columna derecha es el modelo de seguridad: lo que impide que una cuenta lea perfiles ajenos. Por eso no es opcional ni se puede borrar.

### 3.3 Migraciones resultantes

```
prisma/migrations/
  20261117000000_init/migration.sql          ← generada por Prisma (tablas, FK, índices)
  20261117000100_roles_context/migration.sql ← --create-only: roles, ctx_*, bump_version
  20261117000200_identity/migration.sql      ← --create-only: grants de identity
  20261117000300_accounts_installations/     ← --create-only: CHECK, triggers, RLS, políticas, índices parciales, resolve_principal
  20261117000400_profiles_access/            ← ídem, un archivo por dominio
  …                                          ← mismo orden que las migraciones de hoy (000400 a 001300)
  migration_lock.toml
```

Las migraciones `--create-only` copian el SQL de las migraciones actuales **menos el `CREATE TABLE`**, que ya lo generó `init`. Se mantiene la división por dominio para que cada archivo se pueda revisar.

**Regla para el futuro:** toda tabla nueva lleva, en la **misma** migración, su `ENABLE ROW LEVEL SECURITY`, sus políticas y sus grants. Si faltan, los roles de la API no tienen permisos y reciben `permission denied`: falla cerrado, no expone datos.

### 3.4 Cambios en `prisma/schema.prisma`

1. **Datasource:** `schemas = ["guardme", "identity"]`. `directUrl = env("DATABASE_URL_MIGRATIONS")` se queda: es la conexión que usa `prisma migrate`.
2. **Modelos de Better Auth:** se generan con su CLI y su adaptador de Prisma: `npx @better-auth/cli generate --config src/modules/identity/better-auth.ts`. Después se ajustan a mano:
   - nombres: `User`, `Session`, `AuthAccount` (para no chocar con el `Account` de dominio) y `Verification`;
   - `@@schema("identity")` y `@@map("users" | "sessions" | "accounts" | "verifications")`;
   - `id String @id @db.Uuid`, y los campos con `@map("snake_case")`.
3. **`Account` (dominio):** la FK pasa a estar declarada en Prisma: `authUser User @relation(fields: [authUserId], references: [id], onDelete: Restrict)`. Se borra el comentario que decía que `auth.users` no entraba en Prisma.
4. **Índices parciales (hay que corregirlo).** `db pull` convirtió los 13 índices `UNIQUE … WHERE status = 'active'` en `@@index` comunes. Por ejemplo, `installations_active_client_idx` (`schema.prisma:97`) en la base garantiza una instalación activa por cliente, pero en el schema figura como un índice común. Si `init` se genera así, **se pierden esas 13 garantías de unicidad**. Qué hacer:
   - si la versión instalada de Prisma soporta índices con `where` (en algunas versiones es una función preview), se modelan ahí;
   - si no, se sacan esos 13 `@@index` del schema y se crean en SQL en la migración de su dominio. Como Prisma no los conoce, cada migración nueva que genere `migrate dev --create-only` puede traer `DROP INDEX` de esos índices, y **hay que borrar esas líneas al revisarla**.
   - En los dos casos se verifica con el comando de drift de 3.7.

### 3.5 Roles y shadow database

`prisma migrate dev` aplica todas las migraciones en una base temporal ("shadow database") del mismo servidor, y los roles son de todo el servidor, no de una base. Por eso:

- `CREATE ROLE` se queda dentro del bloque `DO … IF NOT EXISTS`, como hoy, y se suma `guardme_auth` a la lista: `guardme_api`, `guardme_onboarding`, `guardme_worker`, `guardme_ingest`, `guardme_auth`.
- `GRANT CONNECT ON DATABASE postgres` (hoy el nombre está fijo) pasa a `EXECUTE format('GRANT CONNECT ON DATABASE %I TO …', current_database())`. Así también funciona en la shadow database.
- **Las contraseñas no van en migraciones.** En local las fija `prisma/seed.ts` (3.7), que se niega a correr con `NODE_ENV=production`. En la nube se fijan a mano y se guardan en el gestor de secretos, igual que hoy.

### 3.6 Esquema `identity` (Better Auth)

- Las tablas las crea `init`, a partir de los modelos de 3.4.
- La migración `identity` agrega a mano `REVOKE ALL ON SCHEMA identity FROM PUBLIC`, `GRANT USAGE` y CRUD solo a `guardme_auth`. Ningún rol de dominio recibe permisos sobre `identity`.
- **Por qué `identity` y no `auth`:** la imagen `supabase/postgres` ya trae un esquema `auth` propio.
- `resolve_principal` deja de revisar la sesión, porque eso lo hace Better Auth en el guard (4.4). Pasa a recibir 2 parámetros:

```sql
CREATE FUNCTION guardme.resolve_principal(p_auth_user_id uuid, p_installation_id uuid)
RETURNS TABLE (account_id uuid, account_status text,
               installation_account_id uuid, installation_status text,
               installation_session_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id, a.status, i.account_id, i.status, i.auth_session_id
  FROM (SELECT 1) AS anchor
  LEFT JOIN guardme.accounts AS a ON a.auth_user_id = p_auth_user_id
  LEFT JOIN guardme.installations AS i ON i.id = p_installation_id;
$$;
```

### 3.7 Comandos

| Tarea | Comando |
|---|---|
| Cambiar el esquema | Editar `schema.prisma` → `prisma migrate dev --create-only --name <cambio>` → revisar el SQL (agregar RLS y grants si hay tabla nueva; borrar `DROP INDEX` de los parciales) → `prisma migrate dev` |
| Reset local | `pnpm db:reset` = `prisma migrate reset --force`. Aplica las migraciones y ejecuta `prisma/seed.ts` |
| Deploy | `prisma migrate deploy` con `DATABASE_URL_MIGRATIONS` |
| Verificar drift | `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <url> --exit-code`, que debe salir vacío. Va también en CI |

`prisma/seed.ts` se registra en `package.json` (`"prisma": { "seed": "tsx prisma/seed.ts" }`) y hace, en este orden:
1. fija las contraseñas de los 5 roles (solo si no es producción);
2. instala pg-boss (lo que hoy hace `queue:install`);
3. carga los datos demo (11.3).

**Verificación del paso:** `pnpm db:reset` sin errores → el comando de drift sale vacío → `pnpm test:int` pasa (incluye `rls-base.int-spec.ts`, que prueba el aislamiento por RLS).

**Pendientes de verificar al implementar:**
- que `prisma migrate reset` sobre la imagen de Supabase solo borre los esquemas de `schemas` y no toque los propios de Supabase;
- que el esquema `pgboss` sobreviva al reset, o que `seed.ts` lo vuelva a crear.

---

## 4. Better Auth

### 4.1 Dependencias

| Acción | Paquete | Motivo |
|---|---|---|
| + | `better-auth` (versión fija; hoy `latest` = 1.7.25, revisar que tenga más de 2 semanas) | Usuarios y sesiones |
| − | `@supabase/supabase-js` (dev) | Ya no se usa en los tests |
| − | `supabase` CLI | **Se queda** (sigue levantando `db`) |

Se usa el **adaptador de Prisma** de Better Auth (`better-auth/adapters/prisma`). Como `schema.prisma` es la fuente de verdad (sección 3), las tablas de Better Auth están modeladas ahí y no hace falta `pg` ni un segundo mecanismo de acceso a datos. El choque de nombres con el `Account` de dominio se resuelve con el modelo `AuthAccount` (3.4). Better Auth usa su propio `PrismaClient`, conectado con el rol `guardme_auth` (`DATABASE_URL_AUTH`), así que no comparte permisos con la API.

**Riesgo a verificar primero:** que `better-auth` se pueda importar desde un proyecto CommonJS (Nest + ts-jest). Revisar `exports` en su `package.json` después de instalarlo. Si solo publica ESM, hay que usar `await import()` dentro del factory, o configurar `transformIgnorePatterns` en Jest.

### 4.2 Configuración (`src/modules/identity/better-auth.ts`, archivo nuevo)

```ts
export const AUTH = Symbol('AUTH');

export function createAuth(config: ConfigService) {
  return betterAuth({
    secret: config.getOrThrow('BETTER_AUTH_SECRET'),
    baseURL: config.getOrThrow('BETTER_AUTH_URL'),
    basePath: '/v1/auth',
    database: prismaAdapter(
      new PrismaClient({ datasourceUrl: config.getOrThrow('DATABASE_URL_AUTH') }),
      { provider: 'postgresql' },
    ),
    account: { modelName: 'authAccount' },   // modelo AuthAccount; User, Session y Verification usan su nombre por defecto
    advanced: { database: { generateId: () => randomUUID() } },
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    plugins: [
      bearer(),                                          // la app Android manda Authorization: Bearer
      anonymous({ disableDeleteAnonymousUser: true }),   // la incorporación supervisada usa usuarios anónimos con guardme.accounts (FK RESTRICT)
    ],
  });
}
```

- **`disableDeleteAnonymousUser: true` es obligatorio.** `enrollments.service.ts:324` crea un `guardme.accounts` para el usuario anónimo. Si Better Auth intenta borrar ese usuario al vincularlo, la FK `RESTRICT` falla.
- Se registra como provider `AUTH` en `IdentityModule` (`useFactory: createAuth`, `inject: [ConfigService]`) y se exporta.
- El `$disconnect()` de ese `PrismaClient` va en `onModuleDestroy`.
- Los nombres de campo que espera Better Auth (`userId`, `expiresAt`, …) son los de los modelos de Prisma. Las columnas pueden ir en snake_case con `@map` (3.4).

### 4.3 Montaje del handler HTTP

El handler de Better Auth lee el body crudo de la petición. Por eso tiene que registrarse en Express **antes** del body parser de Nest. Nest registra el parser en `app.init()`, así que alcanza con hacerlo antes de `listen()`/`init()`.

Función compartida `mountAuth(app)` en `better-auth.ts`, llamada desde `src/main.ts` y desde `test/helpers/api-app.ts`:

```ts
export function mountAuth(app: INestApplication): void {
  const auth = app.get(AUTH);
  app.getHttpAdapter().getInstance().all('/v1/auth/*splat', toNodeHandler(auth));
}
```

Rutas que pasa a usar la app móvil, en lugar de las de Supabase:

| Antes (GoTrue) | Después (Better Auth) |
|---|---|
| `POST /auth/v1/signup` | `POST /v1/auth/sign-up/email` |
| `POST /auth/v1/token?grant_type=password` | `POST /v1/auth/sign-in/email` |
| `POST /auth/v1/signup` (anónimo) | `POST /v1/auth/sign-in/anonymous` |
| `POST /auth/v1/logout` | `POST /v1/auth/sign-out` |
| refresh token | no hace falta: la sesión se renueva sola (`updateAge`) |

El token llega en el header `set-auth-token` (plugin `bearer`) y también en el campo `token` del body. La app Android **no usa Supabase hoy** (se buscó en `GuardMeMobile/` y no aparece), así que no hay código cliente que migrar. Solo hay que documentar el contrato en el OpenAPI.

El `AuthGuard` global y el throttler no se aplican a estas rutas, porque no pasan por Nest. Better Auth trae su propio rate limit, activo en producción y guardado en memoria; hay que revisarlo junto con el atajo del throttler (plan 10) si se agrega una segunda instancia de la API.

### 4.4 Guard (`auth.guard.ts`)

Reemplaza a `JwtVerifierService`. El archivo `jwt-verifier.service.ts` y su spec se borran.

```ts
const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
if (!session) throw new DomainError('UNAUTHENTICATED');
const verified = {
  sub: session.user.id,
  sessionId: session.session.id,
  isAnonymous: session.user.isAnonymous === true,
};
// resolve_principal(sub, installationId) y el resto del guard siguen igual,
// sin la rama session_active.
```

**Cambio de contrato:** un token de una sesión cerrada (sign-out) ahora da **401 `UNAUTHENTICATED`**, no `SESSION_REVOKED`. Better Auth borra la sesión, así que no se puede distinguir de un token inventado. `SESSION_REVOKED` se sigue usando para cuenta bloqueada e instalación revocada. Para la app, los dos significan "volver a iniciar sesión".

`getSession` hace 1 consulta por petición, además de `resolve_principal`. Hay que actualizar el comentario `shortcut:` del guard: son 2 consultas por petición; la mejora es activar `session.cookieCache`/caché de ≤30 s si la latencia lo pide.

### 4.5 Logout

Queda como antes: el cliente llama a `POST /v1/auth/sign-out` (cierra la sesión) y a `POST /v1/session/logout` (revoca instalaciones). No se mezclan en este cambio.

---

## 5. Quitar `firebase-admin` (FCM HTTP v1 directo)

`firebase-admin` solo se usa en `src/infra/push/fcm-push.adapter.ts`, para `messaging().send()`. Firebase Auth no se usa. Se reemplaza con `jose` (ya instalado) y `fetch` (nativo en Node 24):

1. **Token OAuth:** firmar un JWT RS256 con la cuenta de servicio (`iss = client_email`, `scope = https://www.googleapis.com/auth/firebase.messaging`, `aud = https://oauth2.googleapis.com/token`, `exp = +3600`). Luego `POST https://oauth2.googleapis.com/token` con `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`. El token se **cachea en memoria** hasta 60 s antes de vencer.
2. **Envío:** `POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send` con:

```json
{ "message": {
  "token": "...", "data": { ... }, "notification": { "title": "...", "body": "..." },
  "android": { "priority": "HIGH|NORMAL", "ttl": "3600s", "collapse_key": "...",
               "notification": { "tag": "..." } } } }
```

   La respuesta trae `name` → `providerRef`.

3. **Errores:** reemplazar `mapFcmError` por un mapeo sobre `error.details[].errorCode` (o `error.status`) y el código HTTP:

| FCM HTTP v1 | `PushResult` |
|---|---|
| `UNREGISTERED`, `INVALID_ARGUMENT` | `token_invalid` (igual que hoy con `registration-token-not-registered` / `invalid-argument`) |
| `UNAVAILABLE`, `INTERNAL`, `QUOTA_EXCEEDED`, HTTP 429/5xx, error de red | `retryable` |
| `SENDER_ID_MISMATCH`, `THIRD_PARTY_AUTH_ERROR`, otros | `failed` |

   Diferencia con hoy: un error de red pasa de `failed` a `retryable`. Es más seguro para una alerta de caída.

4. El constructor valida en el arranque que el JSON tenga `project_id`, `client_email` y `private_key`, en vez de fallar en el primer envío.
5. Actualizar `fcm-push.adapter.spec.ts`: probar el mapeo nuevo y el armado del body con un `fetch` falso. Es la lógica con riesgo.
6. `pnpm remove firebase-admin`.

---

## 6. Variables de entorno

### 6.1 Se eliminan (12)

| Variable | Motivo |
|---|---|
| `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_JWKS_URL`, `SUPABASE_JWT_AUDIENCE` | Ya no se verifica JWT de GoTrue |
| `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Solo las usaban los tests vía supabase-js |
| `PD04_MIN_CONTACTS_POLICY` | Solo admite `run_available` |
| `PD03_ON_UNCONFIRMED_ANSWER` | Solo admite `continue` (`human-confirm-timeout.handler.ts:27`) |
| `PD05_FALL_PUSH_RECIPIENTS` | Solo admite `all_caregivers` |
| `PD05_POSTPONE_COLLECTIVE_RECIPIENTS` | Solo admite `all_caregivers` (`postpone.handlers.ts:144`) |
| `PD07_CAREGIVER_RECIPIENT` | Solo admite `closing_caregiver` (`publish-question.handler.ts:125`) |
| `PD07_LAST_RECIPIENT` | Solo admite `user` (`followups.service.ts:376`, `publish-question.handler.ts:100`) |

Las 6 variables PD de un solo valor pasan a ser constantes en `policy.config.ts`, con el mismo comentario `// PD-xx pendiente`. Los getters se quedan (devuelven la constante), así los handlers no cambian y la variable se puede volver a agregar cuando exista un segundo valor.

### 6.2 Deja de validarse en la app (1)

`DATABASE_URL_MIGRATIONS` es la cuenta superusuario. Hoy `env.config.ts` la exige en la API y en el worker, aunque `.env.example` dice "nunca en runtime de la API". Se saca de `EnvironmentVariables`. La siguen leyendo con `process.env` los scripts, los tests y `prisma` (`directUrl`). Hay que actualizar `env.config.spec.ts`.

### 6.3 Se agregan (3)

| Variable | Validación |
|---|---|
| `BETTER_AUTH_SECRET` | `@MinLength(32)` + `@NotContains('replace-with')` |
| `BETTER_AUTH_URL` | `@IsUrl({ require_tld: false })`, por ejemplo `http://localhost:3000` |
| `DATABASE_URL_AUTH` | `postgresql://guardme_auth:guardme_auth_dev@127.0.0.1:54322/postgres` |

### 6.4 Cambian

| Variable | Cambio |
|---|---|
| `TELEPHONY_PROVIDER` | `@IsIn(['fake', 'none'])` (ver 7.1) |
| `SECRET_PEPPER`, `FAKE_TELEPHONY_WEBHOOK_SECRET` | Se agrega `@NotContains('replace-with')` |
| `HEALTH_DETAILS_TOKEN` | En `.env.example` queda **vacío** con el comentario "16+ caracteres aleatorios"; hoy trae `health-details-token`, que pasa la validación |
| `FAKE_TELEPHONY_WEBHOOK_SECRET` | Pasa a ser obligatoria solo si `TELEPHONY_PROVIDER=fake` (`@ValidateIf`) |

Balance: de 56 a 47 variables en `.env.example`.

---

## 7. Mecanismos que faltan (de la auditoría)

### 7.1 La API y el worker no arrancan en producción (auditoría #1)

- `src/infra/telephony/none-telephony.adapter.ts` (nuevo, ~20 líneas): `provider = 'none'`, `createCall` devuelve `{ status: 'rejected', error: 'not_enabled' }`, `findCallByAttempt` devuelve `null`, `cancelCall` no hace nada, `verifyAndParseWebhook` lanza `UNAUTHENTICATED`.
- `telephony.module.ts`: si es `'none'`, crea `NoneTelephonyAdapter`; si no, `FakeTelephonyAdapter`. `assertTelephonyAllowed` no cambia: sigue prohibiendo `fake` en producción.
- `capabilities.service.ts`: `telephony` sale de `TELEPHONY_PROVIDER` (`fake` → `'fake'`, `none` → `'not_enabled'`) y no de `NODE_ENV`.
- Con `none`, el plan de llamadas sigue su curso: cada intento queda rechazado y la incidencia termina en escalamiento, igual que hoy cuando el proveedor rechaza.
- **Test:** levantar `AppModule` con `NODE_ENV=production` y `TELEPHONY_PROVIDER=none` sin errores, y verificar que la capacidad diga `not_enabled`.

### 7.2 Secretos de ejemplo (auditoría #2)

Cubierto en 6.3 y 6.4. **Test** en `env.config.spec.ts`: `SECRET_PEPPER='replace-with-32-byte-random-secret-value'` tiene que fallar la validación.

### 7.3 Proveedor real en `call_attempts` (auditoría #4)

`call-plan.service.ts`: inyectar `TelephonyPort` y cambiar el literal `'fake'` de la línea 120 por `${this.telephony.provider}`. `policy_version` queda `v1:run_available`, ahora sacado de la constante PD-04 (6.1).

### 7.4 Una sola lista de colas (auditoría #6)

- `src/modules/pending-actions/queues.ts` (nuevo, sin imports de Nest, para que `tsx` lo cargue desde el script):

```ts
export const PENDING_ACTION_TYPES = ['NOTIFY_INCIDENT', /* … 15 … */] as const;
export type PendingActionType = (typeof PENDING_ACTION_TYPES)[number];
export const MAINTENANCE_TASKS = [{ name: 'cleanup-event-receipts', cron: '0 3 * * *' }, /* … */] as const;
```

- Lo importan `pending-actions.service.ts` (re-exporta el tipo), `dispatcher.service.ts` (borra `ACTION_TYPES`), `maintenance.service.ts` (borra `TASKS`) y `scripts/pgboss-install.ts` (borra `QUEUES`).

### 7.5 Helpers de test (auditoría #7)

Se borran `test/helpers/supabase-test.ts` y `test/helpers/auth-users.ts` y se crea un solo `test/helpers/auth-sessions.ts` sobre Better Auth. Usa `createAuth()` con la misma configuración, sin HTTP:

```ts
createEmailSession(email, password) // auth.api.signUpEmail → { userId, accessToken: token, sessionToken }
createAnonymousSession()            // auth.api.signInAnonymous
signOut(session)                    // auth.api.signOut({ headers: { authorization: `Bearer ${token}` } })
```

`TestSession` deja de tener `client` (supabase-js). Hay que cambiar 15 archivos de test: solo el import y `signOut(session)` en lugar de `signOut(session.client)`.

### 7.6 README del backend (auditoría #8)

Reemplazar el README de ejemplo de Nest por:

1. Requisitos: Node (`.nvmrc`), pnpm, Docker.
2. `cp .env.example .env` y completar los secretos.
3. `pnpm db:start` (solo Postgres) y `pnpm db:reset` (`prisma migrate reset`: migraciones + roles + pg-boss + demo). Para cambios de esquema: `pnpm db:migrate` y la regla de 3.7.
4. `pnpm dev:api` y `pnpm dev:worker`.
5. `pnpm test` y `pnpm test:int`.
6. Roles de base de datos y qué proceso usa cada uno (`api`, `onboarding`, `ingest`, `worker`, `auth`).
7. Rutas de autenticación (tabla de 4.3).

---

## 8. Tests afectados

| Test | Cambio |
|---|---|
| `test/identity.int-spec.ts` | Borrar `SignJWT` y los casos de JWT manipulado (firma, issuer, audience, sin `session_id`): el token ya no es JWT. Reemplazarlos por "token inexistente → 401 `UNAUTHENTICATED`". El caso de sign-out (línea ~311) pasa a esperar **`UNAUTHENTICATED`**. El de instalación revocada (~342) sigue esperando `SESSION_REVOKED`. |
| `test/rls-base.int-spec.ts` | Usar `createEmailSession` |
| Los 13 `*.int-spec.ts` restantes | Cambiar el import a `./helpers/auth-sessions` |
| `test/helpers/db-reset.ts` | Agregar `TRUNCATE identity.users CASCADE` (después de `guardme.accounts`, por la FK RESTRICT) |
| `test/helpers/api-app.ts` | Llamar a `mountAuth(app)` antes de `app.init()` |
| `src/modules/identity/jwt-verifier.service.spec.ts` | Se borra |
| `src/modules/identity/auth.guard.spec.ts` | Simular `AUTH.api.getSession` en lugar del verificador |
| `src/infra/push/fcm-push.adapter.spec.ts` | Mapeo nuevo (sección 5) |
| `src/config/env.config.spec.ts` | Variables nuevas y quitadas; prueba de secreto de ejemplo |
| Nuevo | Producción arranca con `TELEPHONY_PROVIDER=none` (7.1) |

---

## 9. Orden de implementación

Cada paso deja el repo compilando y con los tests pasando.

1. **ENV y mecanismos independientes:** 6.1 (PD), 6.2, 7.1, 7.2, 7.3 y 7.4. → `pnpm test`, `pnpm test:int` (todavía con GoTrue).
2. **FCM sin firebase-admin** (sección 5). → `pnpm test`. Probar a mano un envío real con un token de dispositivo de prueba.
3. **Instalar `better-auth`** y confirmar que se carga en CJS/Jest (riesgo de 4.1). Si falla, frenar acá y decidir.
4. **Migraciones con Prisma** (sección 3): borrar `supabase/migrations` y `seed.sql`; ajustar `schema.prisma` (modelos de Better Auth, FK, índices parciales); `prisma migrate dev --create-only --name init`; crear las migraciones SQL por dominio; `prisma/seed.ts`; `.env` (`DATABASE_URL_AUTH`, `BETTER_AUTH_*`). → `pnpm db:reset` y el comando de drift (3.7) sale vacío.
5. **Better Auth en la API** (4.2 a 4.4) y helpers de test (7.5). → `pnpm test:int` completo.
6. **Apagar contenedores** (sección 2). → `supabase stop && pnpm db:start`, `docker ps`, `pnpm db:reset`, `pnpm test:int`.
7. **Limpieza:** `pnpm remove @supabase/supabase-js firebase-admin`, README (7.6), `pnpm openapi:export` con las rutas de auth documentadas.
8. **Seed demo** (11.3), sobre Better Auth ya funcionando. → `pnpm db:reset` deja las 3 cuentas.
9. **App Android, en este orden:** sesión y login (11.4), Persona, Cuidador, BLE (11.6), limpieza de demo y tests (11.7). → APK debug compila y se cumplen los criterios de 11.8.

Los pasos 1 y 2 no bloquean a la app. El paso 5 (contrato de auth) sí: la app no puede hacer login hasta que existan las rutas `/v1/auth/*`. La parte BLE de 11.6 solo usa `canes/claim` y `canes/{id}/gateway`, que ya existen, así que se puede empezar en paralelo.

## 10. Riesgos y pendientes

- **Better Auth en CJS:** no se verificó si se puede importar con `require` (paso 3).
- **Esquema exacto de Better Auth:** hay que contrastar 3.3 con la salida de `@better-auth/cli generate` de la versión instalada.
- **Contrato de error:** sign-out → `UNAUTHENTICATED` en vez de `SESSION_REVOKED` (4.4). La app Android tiene que tratar los dos igual.
- **Rate limit de Better Auth en memoria:** con más de una instancia de la API hay que pasarlo a un almacenamiento compartido, igual que el throttler de Nest.
- **FCM:** el armado del mensaje HTTP v1 (enums `HIGH`/`NORMAL`, `ttl` como `"Ns"`) hay que validarlo con un envío real antes del piloto.
- **No se verificó:** que `supabase start -x kong` con todo lo demás apagado deje un único contenedor en la versión instalada de la CLI (2.122.1).
- **Better Auth desde Android:** Better Auth revisa el header `Origin` para protegerse de CSRF. Las peticiones de la app no lo mandan. Hay que confirmar que sign-in/sign-up desde OkHttp no se rechazan; si se rechazan, configurar `trustedOrigins` (11.4).
- **Token en el teléfono:** guardarlo en DataStore sin cifrar es aceptable solo para el piloto (11.4).
- **Sin push en la app:** la app no tiene FCM. Las alertas a cuidadores llegan consultando `GET /v1/notifications` y `GET /v1/changes` hasta que se integre FCM en Android.

---

## 11. Integración del plan móvil (Cursor: "Mobile API BLE seed")

Origen: `c:\Users\mateo\.cursor\plans\mobile_api_ble_seed_d92868e1.plan.md`. Se incorpora entero. **Donde choca con este documento, manda este documento.**

### 11.1 Qué se cambia del plan de Cursor y por qué

| Plan de Cursor | Queda así | Motivo |
|---|---|---|
| Login con **Supabase Auth** (`signInWithPassword`, SDK Supabase Auth Kotlin) | Login por HTTP a **Better Auth**: `POST /v1/auth/sign-in/email` | GoTrue se elimina (sección 4). Así no hace falta ningún SDK de Supabase en la app |
| `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `local.properties`/`BuildConfig` | Solo `GUARDME_API_BASE_URL` | La auth vive en la misma API (`/v1/auth`) |
| Seed de usuarios "vía Admin Auth" | `auth.api.signUpEmail` de Better Auth (11.3) | Igual que los helpers de test (7.5) |
| Membresías Ana/Pérez "ya activas" escritas directo en la base | Se crean con el flujo real: Rosa invita → Ana y Pérez aceptan | Sin datos que se saltean auditoría, `change_log` ni reglas de acceso |
| Diagrama: `LoginScreen → Supabase Auth` | `LoginScreen → POST /v1/auth/sign-in/email` | — |
| "No crear markdown nuevo" | Las credenciales demo quedan en este documento y en el comentario del script | Este documento ya existe |

Lo demás queda como lo propone Cursor: los 3 usuarios, el alcance BLE "A" (sin GATT), quitar toda la data demo, no inventar valores donde no hay API, y los criterios de aceptación.

### 11.2 Arquitectura objetivo

```mermaid
flowchart TD
  Login["LoginScreen"] --> Auth["POST /v1/auth/sign-in/email (Better Auth)"]
  Auth --> Bootstrap["POST /v1/accounts/bootstrap"]
  Bootstrap --> Install["POST /v1/installations"]
  Install --> Me["GET /v1/me"]
  Me -->|relation user| Persona["PersonaApp"]
  Me -->|relation caregiver| Cuidador["CuidadorApp"]
  Persona --> Api["GuardMeApiClient (Bearer + X-Installation-Id)"]
  Cuidador --> Api
  Persona --> Ble["CaneBleScanner"]
  Ble -->|conectado| Claim["POST /v1/canes/claim → POST /v1/canes/{id}/gateway"]
  Api --> Nest["NestJS /v1"]
```

### 11.3 Seed demo (`backend/scripts/seed-demo-users.ts`)

**Cuentas** (como en Cursor; las contraseñas cumplen el mínimo de 8 de 4.2):

| Cuenta | Email | Password | `onboardingKind` | Acceso al perfil de Rosa |
|---|---|---|---|---|
| Rosa | `rosa@guardme.local` | `GuardMe!rosa` | `self` | `user` |
| Ana | `ana@guardme.local` | `GuardMe!ana` | `caregiver` | `caregiver` / `family` |
| Dr. Pérez | `perez@guardme.local` | `GuardMe!perez` | `caregiver` | `caregiver` / `medical` |

**Cómo se siembra.** Se reusa lo que ya existe y no se escribe SQL de dominio a mano:

1. **Usuarios:** `createAuth(config).api.signUpEmail(...)` para cada uno. Se obtiene `token` y `userId`.
2. **Dominio:** el script levanta `AppModule` en el mismo proceso (`NestFactory.create` + `mountAuth` + `listen(0)`) y llama a la API con `fetch`, igual que los tests de integración:
   - las 3 cuentas: `POST /v1/accounts/bootstrap`;
   - Rosa: `POST /v1/profiles` (`Rosa Del Giudice`, `America/Panama`) y `POST /v1/installations`;
   - contactos: `POST /v1/profiles/{id}/contacts` (Ana prioridad 1, Luis prioridad 2, Dr. Pérez, Marta, Carmen; los teléfonos de `demoContacts` en Android);
   - recordatorios: `POST /v1/profiles/{id}/reminders` (Losartán 08:00/20:00, Metformina 13:00);
   - membresías: Rosa `POST /v1/profiles/{id}/invitations` ×2, Ana y Pérez `POST /v1/invitations/accept`.
3. **Bastón:** la misma inserción que `scripts/register-cane.ts`, pero con un código fijo: serial `GM-DEMO-001`, modelo `proto-esp32`, claim code **`GMDEM-00001`** (alfabeto Crockford válido). Para no duplicar código, `register-cane.ts` pasa a aceptar `--code` opcional y el seed lo reusa. No se crea assignment ni gateway: Rosa los completa desde la app (11.6).
4. **Protecciones:** el script se niega a correr si `NODE_ENV=production`. Si `rosa@guardme.local` ya existe, termina sin hacer nada (se puede correr dos veces).

**Scripts de `package.json`:**

```jsonc
"seed:demo": "node --env-file=.env --import tsx scripts/seed-demo-users.ts"
```

`prisma/seed.ts` lo llama como último paso (3.7), así que `pnpm db:reset` (`prisma migrate reset --force`) deja la base con los datos demo.

**Verificación:** después de `pnpm db:reset`, `SELECT count(*) FROM identity.users` da 3 y `guardme.profile_access` tiene 3 filas activas sobre el perfil de Rosa.

### 11.4 App Android: datos, sesión y configuración

**Dependencias** (`GuardMeMobile/app/build.gradle.kts`): OkHttp, kotlinx.serialization y DataStore. **No** se agregan el SDK de Supabase ni Ktor (alcanza con OkHttp).

| Paquete (`com.example.guardmemobile`) | Rol |
|---|---|
| `data/auth` | `AuthRepository`: `signIn`/`signOut` contra `/v1/auth/*`. Guarda `token` y `clientInstallationId` (UUID creado una vez por instalación) |
| `data/api` | `GuardMeApiClient`: base URL de `BuildConfig.GUARDME_API_BASE_URL`, agrega `Authorization: Bearer` y `X-Installation-Id`, y traduce el sobre de error `{ error: { code } }` |
| `data/repos` | Un repositorio por dominio, según `backend/openapi` |
| `session` | `SessionViewModel`: login → bootstrap → installation → `GET /v1/me` → destino según `relation` |
| `ble`, `onboarding` | Sección 11.6 |

**Reglas de sesión** (salen de 4.4):
- `401 UNAUTHENTICATED` o `401 SESSION_REVOKED` → borrar el token y volver a `login`. Las dos significan lo mismo para la app.
- `403 ACCOUNT_NOT_BOOTSTRAPPED` → llamar a `POST /v1/accounts/bootstrap` y reintentar.
- Logout: `POST /v1/session/logout` (revoca instalaciones) y después `POST /v1/auth/sign-out` (cierra la sesión).

**Configuración:**
- `local.properties` → `BuildConfig.GUARDME_API_BASE_URL`. En el emulador: `http://10.0.2.2:3000`; en un teléfono físico, la IP LAN del host.
- HTTP sin TLS solo en debug (`network_security_config` del build debug).
- Backend: `BETTER_AUTH_URL` tiene que ser la misma URL base que usa la app. Si Better Auth rechaza peticiones sin `Origin` (riesgo de la sección 10), agregar `trustedOrigins` con esa URL.
- El token va en DataStore. Comentario en el código: `shortcut: token en claro en almacenamiento privado de la app; cifrar con Android Keystore antes de producción`.

### 11.5 Mapeo pantalla → API

Las rutas se verificaron contra los controllers el 2026-11-17.

| Pantalla / acción | API |
|---|---|
| Login | `POST /v1/auth/sign-in/email`; `POST /v1/accounts/bootstrap`; `POST /v1/installations`; `GET /v1/me` |
| Perfil | `GET /v1/profiles`, `GET/PATCH /v1/profiles/{id}` |
| Contactos | `GET/POST/PATCH /v1/profiles/{id}/contacts`, `DELETE /v1/profiles/{id}/contacts/{contactId}` |
| Recordatorios | `GET/POST /v1/profiles/{id}/reminders`, `PATCH/DELETE /v1/reminders/{id}` |
| Dosis del día | `GET /v1/profiles/{id}/occurrences`, `POST /v1/occurrences/{id}/responses` |
| Notificaciones del cuidador | `GET /v1/notifications`, `POST /v1/notifications/{id}/acknowledgements` |
| Equipo | `GET/DELETE /v1/profiles/{id}/memberships[/{accessId}]`; `POST/GET /v1/profiles/{id}/invitations`; `DELETE /v1/invitations/{id}`; `POST /v1/invitations/accept` y `/reject` |
| Bastón | `GET /v1/profiles/{id}/canes`, `POST /v1/canes/claim`, `POST /v1/canes/{id}/gateway`, `POST /v1/canes/{id}/release` |
| Incidentes | `GET /v1/profiles/{id}/incidents`, `GET /v1/incidents/{id}`, `POST /v1/incidents/{id}/decisions`, `GET /v1/incidents/{id}/calls` |
| Falsas alarmas | `GET /v1/profiles/{id}/false-alarms` |
| Seguimientos | `GET /v1/followups/pending`, `POST /v1/followup-questions/{id}/responses` |
| Ubicación | `GET/PUT /v1/profiles/{id}/location-consent`, `GET/POST /v1/profiles/{id}/location` |
| Sync | `GET /v1/changes` |
| Onboarding | `GET /v1/onboarding`, `POST /v1/onboarding/steps` |

**Donde no hay API, no se inventa** (igual que en Cursor): pasos, km y calorías → "sin datos". La ficha médica se reduce a `displayName` y zona horaria. "Hacer sonar el bastón" → estado "pendiente de protocolo".

**Llamadas:** la app decide con `GET /v1/me → capabilities.telephony`. Si es `not_enabled` (producción con `TELEPHONY_PROVIDER=none`, 7.1), usa `ACTION_DIAL` del sistema. Si es `fake`, muestra un aviso de "no integrado". Nunca simula que alguien contestó.

### 11.6 Bluetooth (alcance A, sin GATT de producto)

**Permisos** (`minSdk = 24`, `targetSdk = 37`):
- `INTERNET`;
- `BLUETOOTH` y `BLUETOOTH_ADMIN` con `maxSdkVersion="30"`;
- `ACCESS_FINE_LOCATION` con `maxSdkVersion="30"`, porque el escaneo BLE lo pide hasta Android 11;
- `BLUETOOTH_SCAN` con `usesPermissionFlags="neverForLocation"` y `BLUETOOTH_CONNECT` (Android 12+);
- `<uses-feature android:name="android.hardware.bluetooth_le" android:required="true"/>`.

**Flujo "Configurar bastón"** (solo Persona):
1. pedir permisos → escanear → listar los dispositivos que se llaman `GUARDMe`;
2. conectar por GATT genérico: solo conectar y descubrir servicios, sin leer frames;
3. formulario con serial + claim code → `POST /v1/canes/claim` (`profileId` de Rosa) → `POST /v1/canes/{id}/gateway` con la instalación actual. El backend exige que el gateway sea el teléfono del usuario (`gateway_must_be_user_phone`);
4. guardar en DataStore el MAC/device id; la pestaña Bastón muestra conectado/desconectado;
5. errores: Bluetooth apagado, permiso negado, no encontrado (mensajes de FE-D03). `PD12_CANE_PROXIMITY_PROOF_REQUIRED=false`, así que no se manda `proximityProof`.

Queda fuera, igual que en Cursor: fragmentación BLE, `cancel_fall`, Indicate y bonding avanzado.

### 11.7 Limpieza de demo en Android

Como en Cursor:
- `GuardMeRoot.kt` arranca en `login` y elimina `DemoGate` y las rutas `persona/{scenario}` y `cuidador/{role}/{scenario}`;
- se borran `demo/DemoHub.kt`, `PersonaScenario`, `CareScenario`, `PersonaState.demo()` y todos los `demo*`;
- se ajustan los textos de `strings.xml`;
- los tests de reducer pasan a usar fixtures mínimos y un `GuardMeApiClient` falso. Se borran los tests que solo validaban data ficticia.

### 11.8 Criterios de aceptación (unificados)

1. `pnpm db:reset` deja exactamente 3 usuarios en `identity.users`, el perfil de Rosa con 5 contactos, 3 recordatorios, Ana y Pérez como cuidadores activos y `GM-DEMO-001` disponible para reclamar.
2. La app abre en login. Rosa entra a Persona; Ana y Pérez entran a Cuidador sobre Rosa.
3. Contactos, recordatorios, notificaciones, equipo e incidentes salen de la API. No queda ningún `demo*()` en runtime.
4. Rosa da permisos de Bluetooth, escanea, conecta a un periférico `GUARDMe`, reclama `GM-DEMO-001` con `GMDEM-00001` y queda como gateway.
5. Cerrar sesión lleva a login. Reusar el token viejo devuelve 401.
6. Compila el APK debug y pasan los unit tests de Android, `pnpm test` y `pnpm test:int`.
