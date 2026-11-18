# Spec 01 (F1a): Base del proyecto, Supabase local, roles, RLS y Prisma

> **Para:** Cursor AI — Rol: Developer
> **Autor del plan:** Claude (Tech Lead)
> **Stack:** Node 22 · NestJS 11 · Prisma 6 · Supabase CLI (local, Docker) · pnpm · Jest
> **Fecha:** 14 de noviembre de 2026
> **Docs de origen:** BE-02 §5–7, BE-04 §1, §8, §11, BE-09 §3, §7–8

---

## Instrucciones para Cursor

No tomes decisiones de arquitectura por tu cuenta. Implementa este plan exactamente como está descrito.
Si algo no está especificado, pregunta antes de asumir.
Contexto a cargar: `@docs/backend/Implementacion/00_Indice_Convenciones_y_Reglas_Cursor.md` `@docs/backend/Desglose/04_Modelo_de_Datos_Diccionario_y_Persistencia.md` `@docs/backend/Desglose/09_Seguridad_Privacidad_Despliegue_y_Operacion.md`

---

## Objetivo

Crear el esqueleto del backend en `D:\PROYECTOS\GUARDMe\backend`: un único proyecto NestJS con **dos procesos** (API HTTP y worker), Supabase local como Postgres + Auth, el esquema privado `guardme` fuera de la Data API, tres roles SQL limitados (API, onboarding, worker), el mecanismo de **contexto RLS local a cada transacción**, y las tablas transversales (acciones pendientes, idempotencia, auditoría). Al terminar no hay funcionalidad de producto, pero sí la base sobre la que todos los planes siguientes construyen sin tomar decisiones de infraestructura.

---

## Archivos

| Acción | Ruta (relativa a `backend/`) | Descripción |
|--------|------------------------------|-------------|
| CREAR | `.nvmrc`, `.cursorrules`, `.gitignore`, `.env.example` | Node 22; reglas de §7 del índice; ignorar `.env`, `dist`, `coverage`, `supabase/.temp` |
| CREAR | `package.json`, `tsconfig*.json`, `nest-cli.json`, `.eslintrc.cjs`, `.prettierrc` | Proyecto Nest generado con `nest new` (pnpm, strict) y ajustado |
| CREAR | `jest.config.ts`, `jest.int.config.ts` | Unit (`src/**/*.spec.ts`) e integración (`test/**/*.int-spec.ts`, `--runInBand`) |
| CREAR | `supabase/config.toml` | Generado por `supabase init`; ajustes de §Configuración Supabase |
| CREAR | `supabase/migrations/20261114000100_guardme_schema_roles.sql` | Esquema, roles, grants, funciones de contexto |
| CREAR | `supabase/migrations/20261114000200_guardme_infra_tables.sql` | `pending_actions`, `idempotency_keys`, `audit_log` + RLS |
| CREAR | `supabase/seed.sql` | **Solo local**: `ALTER ROLE ... LOGIN PASSWORD` de los tres roles |
| CREAR | `prisma/schema.prisma` | Datasource con `schemas = ["guardme"]`; generado con `db pull` |
| CREAR | `src/main.ts` | Bootstrap API: pino, ValidationPipe global, filtro de errores, prefijo `/v1` salvo `/health` |
| CREAR | `src/worker.main.ts` | `NestFactory.createApplicationContext(WorkerModule)`; apagado ordenado con `enableShutdownHooks()` |
| CREAR | `src/app.module.ts`, `src/worker.module.ts` | Módulos raíz de cada proceso |
| CREAR | `src/config/env.config.ts` | Esquema y validación de variables (falla al arrancar si falta alguna) |
| CREAR | `src/config/policy.config.ts` | Variables `PD*` y de política del índice §6, tipadas |
| CREAR | `src/common/errors/domain-error.ts` | `DomainError` con `code` y `details` |
| CREAR | `src/common/errors/global-exception.filter.ts` | Traduce `DomainError`, errores de validación y Prisma al contrato de errores |
| CREAR | `src/common/correlation/correlation.middleware.ts` | Lee/genera `X-Correlation-Id`, lo guarda en `AsyncLocalStorage` |
| CREAR | `src/infra/db/db.module.ts`, `db.service.ts` | Tres `PrismaClient` (api, onboarding, worker) y métodos `asAccount`, `asOnboarding`, `asWorker` |
| CREAR | `src/infra/db/prisma-errors.ts` | Mapeo de `P2002` (unique) y `P2025` a errores de dominio |
| CREAR | `src/infra/clock/clock.port.ts`, `system-clock.ts`, `fake-clock.ts` | Reloj inyectable |
| CREAR | `src/modules/audit/audit.module.ts`, `audit.service.ts` | Registro de auditoría dentro de la transacción |
| CREAR | `src/modules/pending-actions/pending-actions.module.ts`, `pending-actions.service.ts` | Solo `enqueue` en este plan (el relay va en 06) |
| CREAR | `src/modules/health/health.controller.ts` | `GET /health/live` y `GET /health/ready` (ping a BD con rol API) |
| CREAR | `test/helpers/supabase-test.ts`, `test/helpers/db-reset.ts` | Crear usuarios de Auth y tokens en local; truncar tablas `guardme` entre tests |
| CREAR | `test/rls-base.int-spec.ts` | Pruebas T32, T33, T37, T38 sobre las tablas de infraestructura |

---

## Configuración de Supabase local

1. `pnpm dlx supabase init` dentro de `backend/` (o `pnpm supabase init` si se instaló como devDependency).
2. En `supabase/config.toml`:
   - `[api] schemas = ["public", "graphql_public"]` → **no** incluir `guardme` (Data API no lo expone, T33).
   - `[api] extra_search_path` sin `guardme`.
   - `[auth] enable_anonymous_sign_ins = true` (incorporación supervisada, plan 03).
   - `[auth] enable_signup = true`, `[auth.email] enable_confirmations = false` **solo en local** (comentario: en cloud se activa).
   - `[db.seed] enabled = true`, `sql_paths = ["./seed.sql"]`.
3. `pnpm supabase start` levanta Postgres, Auth y Studio. `pnpm supabase status -o env` entrega `API_URL`, `DB_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `JWT_SECRET`.
4. `pnpm supabase db reset` aplica migraciones + seed desde cero. Es el comando de referencia para T37.

---

## Migración 1 — `20261114000100_guardme_schema_roles.sql`

Contenido descrito (escribir SQL equivalente; no copiar de otra fuente):

### Roles

| Rol | Atributos | Uso |
|-----|-----------|-----|
| `guardme_api` | `NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT` (LOGIN y contraseña se dan en `seed.sql` local / consola en cloud) | Conexión ordinaria de la API |
| `guardme_onboarding` | Igual que arriba | Operaciones de incorporación sin acceso previo al perfil (plan 02–04) |
| `guardme_worker` | Igual que arriba | Proceso worker |

- Ninguno es propietario de tablas. Las tablas las posee el rol que ejecuta migraciones (`postgres` en local).
- Crear los roles con `DO $$ ... IF NOT EXISTS ... $$` para que `db reset` sea repetible.

### Esquema y grants

- `CREATE SCHEMA IF NOT EXISTS guardme;`
- `REVOKE ALL ON SCHEMA guardme FROM PUBLIC, anon, authenticated;`
- `GRANT USAGE ON SCHEMA guardme TO guardme_api, guardme_onboarding, guardme_worker;`
- `ALTER DEFAULT PRIVILEGES IN SCHEMA guardme REVOKE ALL ON TABLES FROM PUBLIC;` (los grants por tabla se hacen explícitos en cada migración).
- `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (para `gen_random_uuid()` si no está).

### Funciones de contexto (todas en `guardme`, `LANGUAGE sql STABLE`)

| Función | Devuelve | Comportamiento |
|---------|----------|----------------|
| `guardme.ctx_account_id()` | `uuid` | `nullif(current_setting('guardme.account_id', true), '')::uuid` |
| `guardme.ctx_auth_user_id()` | `uuid` | Igual con `guardme.auth_user_id` |
| `guardme.ctx_installation_id()` | `uuid` | Igual con `guardme.installation_id` |

Sin contexto devuelven `NULL` y toda política que las use debe evaluar a falso (deny by default).

### Trigger común

`guardme.bump_version()` — `BEFORE UPDATE`: `NEW.version := OLD.version + 1; NEW.updated_at := now();`. Se adjunta a cada tabla con `version` en su propia migración.

---

## Migración 2 — `20261114000200_guardme_infra_tables.sql`

### `guardme.pending_actions`

| Columna | Tipo | Regla |
|---------|------|-------|
| `id` | uuid PK default `gen_random_uuid()` | |
| `type` | text not null | Catálogo en `PendingActionType` (ver contratos) |
| `resource_type` | text not null | `incident`, `call_attempt`, `notification`, `followup_question`, `reminder_occurrence`, … |
| `resource_id` | uuid not null | |
| `dedupe_key` | text not null **unique** | Evita encolar dos veces el mismo efecto (p. ej. `notify:incident:<id>:fall`) |
| `payload` | jsonb not null default `'{}'` | Datos mínimos + `correlationId` + `expectedVersion` cuando aplique |
| `status` | text not null default `'scheduled'` CHECK in (`scheduled`,`dispatched`,`running`,`done`,`discarded`,`failed`) | |
| `run_at` | timestamptz not null | Cuándo debe ejecutarse |
| `attempts` | int not null default 0 | |
| `max_attempts` | int not null default 5 | |
| `lease_until` | timestamptz null | Recuperación si el worker muere |
| `last_error` | text null | Código + mensaje corto, sin secretos |
| `created_at`, `updated_at` | timestamptz not null default now() | |

Índice: `(status, run_at)`; índice `(resource_type, resource_id)`.

### `guardme.idempotency_keys`

| Columna | Tipo | Regla |
|---------|------|-------|
| `account_id` | uuid not null | |
| `key` | text not null | Valor del header `Idempotency-Key` (máx. 100 chars) |
| `route` | text not null | `METHOD /ruta/plantilla` |
| `request_hash` | text not null | SHA-256 del cuerpo canónico |
| `status_code` | int not null | |
| `response_body` | jsonb not null | |
| `created_at` | timestamptz not null default now() | |
| PK | `(account_id, key)` | |

### `guardme.audit_log`

| Columna | Tipo |
|---------|------|
| `id` uuid PK · `actor_account_id` uuid null · `actor_kind` text CHECK in (`account`,`installation`,`system`,`provider`) · `profile_id` uuid null · `operation` text not null · `result` text not null CHECK in (`ok`,`denied`,`failed`) · `at` timestamptz default now() · `correlation_id` uuid null · `details` jsonb not null default `'{}'` |

### Grants y RLS de estas tablas

| Tabla | `guardme_api` | `guardme_onboarding` | `guardme_worker` |
|-------|---------------|----------------------|------------------|
| `pending_actions` | INSERT | INSERT | SELECT, UPDATE |
| `idempotency_keys` | INSERT, SELECT | — | DELETE (limpieza) |
| `audit_log` | INSERT | INSERT | INSERT |

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` en las tres.
- Políticas:
  - `idempotency_keys` para `guardme_api`: `USING/WITH CHECK (account_id = guardme.ctx_account_id())`.
  - `pending_actions` para `guardme_api` y `guardme_onboarding`: solo INSERT `WITH CHECK (true)`. La API **nunca** cancela acciones: el worker vuelve a comprobar el estado del recurso antes de ejecutar y descarta lo obsoleto (BE-07 §4). Por eso el `INSERT ... ON CONFLICT DO NOTHING` no necesita SELECT.
  - `pending_actions` para `guardme_worker`: `USING (true) WITH CHECK (true)`.
  - `audit_log`: INSERT `WITH CHECK (true)` para los tres roles; ningún SELECT para API.

### `supabase/seed.sql` (solo local)

`ALTER ROLE guardme_api LOGIN PASSWORD 'guardme_api_dev';` y equivalentes para `guardme_onboarding` y `guardme_worker`. Comentario en la cabecera: **en cloud las contraseñas se fijan desde la consola SQL y se guardan en el gestor de secretos; este archivo nunca se aplica a cloud**.

---

## Prisma (solo ORM)

- `prisma/schema.prisma`: `datasource db { provider = "postgresql"; url = env("DATABASE_URL_API"); directUrl = env("DATABASE_URL_MIGRATIONS"); schemas = ["guardme"] }`. Si la versión instalada de Prisma 6 aún exige `previewFeatures = ["multiSchema"]` en el generator, añadirlo; si no lo exige, no añadirlo.
- Flujo tras cada migración (script `pnpm db:sync`): `supabase db reset` → `prisma db pull` → renombrar modelos a PascalCase singular con `@@map` y campos a camelCase con `@map` → `prisma generate`.
- **Prohibido**: `prisma migrate *`, `prisma db push`. Añadir script `"prisma:guard": "node -e \"process.exit(1)\""` no es necesario; basta con no definir scripts de migrate y anotarlo en `.cursorrules`.

---

## Contratos de funciones

### `DbService`
```typescript
// Archivo: src/infra/db/db.service.ts
type Tx = Prisma.TransactionClient

interface AccountContext {
  accountId: string | null      // null solo durante bootstrap
  authUserId: string
  installationId: string | null
}

class DbService implements OnModuleDestroy {
  asAccount<T>(ctx: AccountContext, fn: (tx: Tx) => Promise<T>, opts?: { isolation?: 'ReadCommitted' | 'Serializable' }): Promise<T>
  asOnboarding<T>(ctx: AccountContext, fn: (tx: Tx) => Promise<T>): Promise<T>
  asWorker<T>(fn: (tx: Tx) => Promise<T>): Promise<T>
  pingApi(): Promise<void>
}
```
**Responsabilidad:**
- Mantiene tres `PrismaClient` con `DATABASE_URL_API`, `DATABASE_URL_ONBOARDING`, `DATABASE_URL_WORKER`. El proceso API instancia api + onboarding; el worker solo worker (inyectar por token según módulo raíz).
- `asAccount`/`asOnboarding` abren `$transaction(async tx => …)` interactiva y **como primera sentencia** ejecutan `SELECT set_config('guardme.account_id', $1, true), set_config('guardme.auth_user_id', $2, true), set_config('guardme.installation_id', $3, true)` con parámetros (`$executeRaw` con template, nunca concatenación). El tercer argumento `true` hace el valor local a la transacción (T38).
- Prohibido usar `SET` de sesión o `$executeRawUnsafe` con valores del usuario.
- Timeout de transacción: 10 s (opción de Prisma). Ninguna llamada externa (FCM, telefonía) dentro de `fn`.

### `ClockPort`
```typescript
// src/infra/clock/clock.port.ts
abstract class ClockPort { abstract now(): Date }
// system-clock.ts → new Date()
// fake-clock.ts  → set(date), advance(ms) — solo tests
```

### `PendingActionsService`
```typescript
// src/modules/pending-actions/pending-actions.service.ts
type PendingActionType =
  | 'NOTIFY_INCIDENT' | 'NOTIFY_INCIDENT_UPDATE' | 'START_NEXT_CALL_ATTEMPT' | 'RECONCILE_CALL_ATTEMPT'
  | 'CANCEL_ACTIVE_CALL' | 'HUMAN_CONFIRM_TIMEOUT' | 'APPLY_PROVIDER_EVENT'
  | 'POSTPONE_REMINDER' | 'POSTPONE_COLLECTIVE'
  | 'FOLLOWUP_PUBLISH_QUESTION' | 'FOLLOWUP_QUESTION_DEADLINE'
  | 'SEND_NOTIFICATION' | 'SYNC_SIGNAL'
// Android es el único disparador físico de las ocurrencias de agenda (plan 08): no existe una acción de push por ocurrencia.

interface EnqueueInput {
  type: PendingActionType
  resourceType: string
  resourceId: string
  dedupeKey: string
  runAt: Date
  payload?: Record<string, unknown>
  maxAttempts?: number
}

class PendingActionsService {
  enqueue(tx: Tx, input: EnqueueInput): Promise<void>               // INSERT ... ON CONFLICT (dedupe_key) DO NOTHING (raw SQL, sin RETURNING)
}
```
No existe `cancel`: cada handler del worker (plan 06+) valida estado/versión del recurso y marca la acción `discarded` si ya no aplica.
El `payload.correlationId` se rellena automáticamente desde `AsyncLocalStorage`.

### `AuditService`
```typescript
class AuditService {
  record(tx: Tx, entry: { operation: string; result: 'ok' | 'denied' | 'failed'; profileId?: string; actorAccountId?: string | null; actorKind: 'account' | 'installation' | 'system' | 'provider'; details?: Record<string, unknown> }): Promise<void>
}
```
`details` nunca contiene secretos, PIN, tokens, coordenadas ni teléfono completo (máscara `+507****1234`).

### `DomainError` y filtro
```typescript
class DomainError extends Error {
  constructor(public code: ErrorCode, message?: string, public details?: Record<string, unknown>)
}
type ErrorCode = 'UNAUTHENTICATED' | 'SESSION_REVOKED' | 'INSTALLATION_MISMATCH' | 'ACCOUNT_NOT_BOOTSTRAPPED'
  | 'NOT_FOUND' | 'FORBIDDEN_ACTION' | 'VALIDATION_FAILED' | 'VERSION_CONFLICT' | 'INCOMPATIBLE_STATE'
  | 'IDEMPOTENCY_KEY_REUSED' | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'CAPABILITY_NOT_ENABLED'
```
`GlobalExceptionFilter`: mapea `code → HTTP` según la tabla del índice §4; Prisma `P2025` → `NOT_FOUND`; `P2002` → re-lanzar como error interno salvo que el servicio lo haya capturado (los servicios deciden la semántica de cada unique). Error desconocido → 500 con `code: "INTERNAL"` y sin stack en la respuesta.

---

## Variables de entorno (`.env.example`)

| Variable | Ejemplo local | Uso |
|----------|---------------|-----|
| `NODE_ENV` | `development` | |
| `PORT` | `3000` | API |
| `SUPABASE_URL` | `http://127.0.0.1:54321` | Emisor esperado = `${SUPABASE_URL}/auth/v1` |
| `SUPABASE_JWT_SECRET` | (de `supabase status`) | Solo si el proyecto firma HS256 (local). Vacío → usar JWKS |
| `SUPABASE_JWKS_URL` | `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` | Proyectos con claves asimétricas |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` | |
| `DATABASE_URL_API` | `postgresql://guardme_api:guardme_api_dev@127.0.0.1:54322/postgres` | |
| `DATABASE_URL_ONBOARDING` | idem con `guardme_onboarding` | |
| `DATABASE_URL_WORKER` | idem con `guardme_worker` | Conexión directa/sesión (pg-boss, plan 06) |
| `DATABASE_URL_MIGRATIONS` | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | Solo `db pull` y tests de helpers; nunca en runtime |
| `SECRET_PEPPER` | 32+ bytes aleatorios | HMAC de secretos (plan 03/04) |
| `PUSH_PROVIDER` | `fake` | `fake` \| `fcm` (plan 06) |
| `TELEPHONY_PROVIDER` | `fake` | Solo `fake` hasta cerrar PD-01 (plan 07) |
| `PD*`, `FOLLOWUP_*`, `DEFAULT_PROFILE_TIME_ZONE` | ver índice §6 | |
| `SUPABASE_SERVICE_ROLE_KEY` | (de `supabase status`) | **Solo en tests** (`test/helpers`), nunca leída por `src/` |

`env.config.ts` valida con `class-validator` + `plainToInstance` al arrancar y aborta con mensaje claro.

---

## Dependencias

| Paquete | Versión | Comando |
|---------|---------|---------|
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` | ^11 | incluido por `nest new` |
| `@nestjs/config` | ^4 | `pnpm add @nestjs/config` |
| `prisma` (dev), `@prisma/client` | ^6 | `pnpm add @prisma/client && pnpm add -D prisma` |
| `class-validator`, `class-transformer` | ^0.14 / ^0.5 | `pnpm add class-validator class-transformer` |
| `nestjs-pino`, `pino-http`, `pino` | ^4 / ^10 / ^9 | `pnpm add nestjs-pino pino-http pino` |
| `pino-pretty` (dev) | ^13 | `pnpm add -D pino-pretty` |
| `supabase` (dev, CLI) | ^2 | `pnpm add -D supabase` |
| `@supabase/supabase-js` (dev, solo tests) | ^2 | `pnpm add -D @supabase/supabase-js` |
| `jest`, `ts-jest`, `@types/jest`, `supertest`, `@types/supertest` (dev) | incluidos por `nest new` | |

Al instalar, fijar versiones exactas resueltas en `package.json` (sin `^`) y anotarlas en el PR.

Scripts de `package.json`:
`start:api` (`nest start`), `start:worker` (`node dist/worker.main.js`), `dev:api` (`nest start --watch`), `dev:worker` (`nest start --watch --entryFile worker.main`), `db:start`, `db:reset`, `db:sync`, `lint`, `test`, `test:int` (`jest -c jest.int.config.ts --runInBand`).

---

## Edge cases y manejo de errores

- **Variable de entorno ausente** → el proceso no arranca; mensaje con el nombre de la variable.
- **Contexto RLS ausente** (alguien usa el cliente sin `asAccount`) → las políticas devuelven 0 filas; el test T32 lo verifica. No “arreglarlo” con grants más amplios.
- **Pool reutilizado** → `set_config(..., true)` garantiza que la siguiente transacción del mismo backend de conexión no herede el contexto (T38).
- **`db reset` repetido** → creación de roles idempotente.
- **Prisma `db pull` sobre roles sin permisos** → `db pull` usa `DATABASE_URL_MIGRATIONS` (`directUrl`), no el rol API.
- **Health ready con BD caída** → `503` con `{ status: "degraded", checks: { db: "down" } }`; `live` sigue en `200`.

---

## Orden de implementación

1. `nest new backend --package-manager pnpm --strict` en `D:\PROYECTOS\GUARDMe`. Borrar `app.controller.ts`/`app.service.ts` de ejemplo.
2. Crear `.nvmrc`, `.cursorrules` (contenido del índice §7), `.env.example`, scripts de `package.json`.
3. `supabase init`, ajustar `config.toml`, `supabase start`.
4. Escribir migraciones 1 y 2 y `seed.sql`; `supabase db reset` sin errores.
5. Configurar Prisma con `schemas = ["guardme"]`, `db pull`, renombrar modelos (`PendingAction`, `IdempotencyKey`, `AuditLog`), `generate`.
6. `env.config.ts` y `policy.config.ts` con `@nestjs/config` (`isGlobal: true`, `validate`).
7. `ClockPort` + implementaciones; proveer `SystemClock` en ambos módulos raíz.
8. `DbService` con los tres clientes y `asAccount`/`asOnboarding`/`asWorker`.
9. `DomainError`, `GlobalExceptionFilter`, `CorrelationMiddleware`, pino con `redact`.
10. `AuditService`, `PendingActionsService` (`enqueue`).
11. `HealthController` (`/health/live`, `/health/ready`), excluido del prefijo `/v1`.
12. `main.ts` y `worker.main.ts` (el worker por ahora solo arranca, loguea “worker ready” y responde a SIGTERM).
13. Helpers de test y `test/rls-base.int-spec.ts`.
14. `pnpm lint && pnpm test && pnpm test:int` en verde.

---

## Criterios de aceptación

- [ ] `pnpm db:reset` aplica las dos migraciones y el seed desde cero sin errores, dos veces seguidas (T37).
- [ ] `pnpm dev:api` responde `GET /health/live` → 200 y `GET /health/ready` → 200 con BD arriba, 503 con `supabase stop`.
- [ ] `pnpm dev:worker` arranca y termina limpio con Ctrl+C.
- [ ] T32: con el rol `guardme_api` y sin contexto, `SELECT` sobre `idempotency_keys` devuelve 0 filas aunque existan filas; con contexto de la cuenta A solo ve filas de A.
- [ ] T33: con la `ANON_KEY` y un JWT `authenticated`, `GET {SUPABASE_URL}/rest/v1/pending_actions` con `Accept-Profile: guardme` falla (esquema no expuesto).
- [ ] T38: test que ejecuta 50 transacciones alternadas A/B con `Promise.all` sobre un pool de tamaño 2 y verifica que cada una solo lee su propio `account_id` vía `ctx_account_id()`.
- [ ] `guardme_api` no es propietario de ninguna tabla ni tiene `BYPASSRLS` (consulta a `pg_roles`/`pg_tables` en test).
- [ ] `grep -r "prisma migrate" backend/` no devuelve nada fuera de `.cursorrules`.
- [ ] `tsc --noEmit` limpio; `pnpm lint` limpio.
