# Spec 02 (F1b): Autenticación Supabase, cuentas de dominio e instalaciones

> **Para:** Cursor AI — Rol: Developer
> **Autor del plan:** Claude (Tech Lead)
> **Stack:** NestJS 11 · jose · Prisma 6 · Supabase Auth local
> **Fecha:** 14 de noviembre de 2026
> **Docs de origen:** BE-03 §2, §4, BE-05 §2–3, §6 (contexto de autorización), BE-09 §3
> **Prerrequisito:** plan 01 en verde

---

## Instrucciones para Cursor

No tomes decisiones de arquitectura por tu cuenta. Implementa este plan exactamente como está descrito.
Si algo no está especificado, pregunta antes de asumir.
Contexto a cargar: `@docs/backend/Implementacion/00_Indice_Convenciones_y_Reglas_Cursor.md` `@docs/backend/Implementacion/01_F1a_Base_Proyecto_Supabase_Prisma.md` `@backend/src/infra/db/db.service.ts` `@docs/backend/Desglose/03_Identidad_Usuarios_Permisos_y_Configuracion_Inicial.md`

---

## Objetivo

Toda petición protegida llega con el access token de Supabase Auth. La API verifica firma, emisor, audiencia, expiración y sujeto; comprueba que la **sesión de Auth sigue activa** y que la **instalación** no fue revocada; y resuelve la **cuenta de dominio** (`accounts.auth_user_id`). Se añaden: bootstrap idempotente de cuenta, registro/revocación de instalaciones (con token push), cierre de sesión con alcance explícito, `GET /v1/me` con capacidades, y el interceptor de idempotencia que usan los planes siguientes. El backend no valida contraseñas ni PIN.

---

## Archivos

| Acción | Ruta (`backend/`) | Descripción |
|--------|-------------------|-------------|
| CREAR | `supabase/migrations/20261114000300_accounts_installations.sql` | Tablas `accounts`, `installations`, función `resolve_principal`, RLS |
| MODIFICAR | `prisma/schema.prisma` | `pnpm db:sync` → modelos `Account`, `Installation` |
| CREAR | `src/modules/identity/identity.module.ts` | Exporta guard, decoradores y servicios |
| CREAR | `src/modules/identity/jwt-verifier.service.ts` | Verificación con `jose` (HS256 local o JWKS) |
| CREAR | `src/modules/identity/auth.guard.ts` | Guard global; resuelve `Principal` |
| CREAR | `src/modules/identity/principal.ts` | Tipo `Principal` y helper `toAccountContext()` |
| CREAR | `src/common/decorators/current-principal.decorator.ts` | `@CurrentPrincipal()` |
| CREAR | `src/common/decorators/public.decorator.ts` | `@Public()` (health, webhooks de proveedor) |
| CREAR | `src/common/decorators/allow-unbootstrapped.decorator.ts` | `@AllowUnbootstrapped()` (bootstrap, consumo de incorporación) |
| CREAR | `src/common/decorators/require-installation.decorator.ts` | `@RequireInstallation()` |
| CREAR | `src/common/idempotency/idempotent.decorator.ts`, `idempotency.interceptor.ts` | `@Idempotent()` + interceptor |
| CREAR | `src/modules/identity/accounts.controller.ts`, `accounts.service.ts` | `GET /v1/me`, `POST /v1/accounts/bootstrap` |
| CREAR | `src/modules/identity/installations.controller.ts`, `installations.service.ts` | `POST /v1/installations`, `DELETE /v1/installations/:id`, `POST /v1/session/logout` |
| CREAR | `src/modules/identity/capabilities.service.ts` | Capacidades y PD pendientes para `/v1/me` |
| CREAR | `src/modules/identity/dto/*.ts` | DTOs de este plan |
| MODIFICAR | `src/app.module.ts` | Registrar `AuthGuard` como `APP_GUARD` e `IdentityModule` |
| MODIFICAR | `src/modules/health/health.controller.ts` | Marcar con `@Public()` |
| CREAR | `test/helpers/auth-users.ts` | Crear usuario email/password y anónimo en Auth local; obtener tokens; `signOut` |
| CREAR | `test/identity.int-spec.ts` | T31, T34, T36 + bootstrap/instalaciones |

---

## Modelo de datos (migración `20261114000300_accounts_installations.sql`)

### `guardme.accounts`

| Columna | Tipo | Regla |
|---------|------|-------|
| `id` | uuid PK default `gen_random_uuid()` | ID de dominio |
| `auth_user_id` | uuid not null **unique** references `auth.users(id)` **ON DELETE RESTRICT** | Comentario SQL: “la política de borrado/anonimización se define antes del piloto (BE-04 §8); RESTRICT evita cascadas que destruyan historial” |
| `display_name` | text not null default `''` | máx. 80 |
| `onboarding_kind` | text not null CHECK in (`self`,`caregiver`,`supervised`) | Cómo se incorporó; **no** concede permisos |
| `status` | text not null default `'active'` CHECK in (`active`,`blocked`,`anonymized`) | |
| `created_at`, `updated_at` | timestamptz default now() | |
| `version` | int not null default 1 | trigger `bump_version` |

### `guardme.installations`

| Columna | Tipo | Regla |
|---------|------|-------|
| `id` | uuid PK | ID que el servidor devuelve; Android lo envía como `X-Installation-Id` |
| `account_id` | uuid not null FK `accounts(id)` | |
| `client_installation_id` | uuid not null | UUID que Android genera una vez y conserva |
| `auth_session_id` | uuid not null | `session_id` del JWT al registrar/actualizar |
| `platform` | text not null CHECK in (`android`) | |
| `app_version` | text not null | |
| `push_token` | text null | Nunca se devuelve en respuestas ni se loguea |
| `push_token_updated_at` | timestamptz null | |
| `status` | text not null default `'active'` CHECK in (`active`,`revoked`) | |
| `revoked_at` | timestamptz null | |
| `revoke_reason` | text null CHECK in (`logout`,`logout_all`,`user_revoked`,`replaced`,`invalid_push_token`) | |
| `last_seen_at` | timestamptz not null default now() | |
| `created_at` | timestamptz default now() | |

Índices: unique parcial `(account_id, client_installation_id) WHERE status = 'active'`; unique parcial `(push_token) WHERE status = 'active' AND push_token IS NOT NULL`.

### Función `guardme.resolve_principal`

```
guardme.resolve_principal(p_auth_user_id uuid, p_session_id uuid, p_installation_id uuid NULL)
  RETURNS TABLE (account_id uuid, account_status text, session_active boolean,
                 installation_account_id uuid, installation_status text, installation_session_id uuid)
  SECURITY DEFINER, SET search_path = '' , STABLE
```
- `session_active` = existe fila en `auth.sessions` con `id = p_session_id AND user_id = p_auth_user_id AND (not_after IS NULL OR not_after > now())`.
- Devuelve siempre una fila (campos `NULL` si no hay cuenta/instalación).
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC; GRANT EXECUTE ... TO guardme_api;`
- No devuelve ningún otro dato de `auth.*`.

### Grants y RLS

| Tabla | `guardme_api` | `guardme_onboarding` | `guardme_worker` |
|-------|---------------|----------------------|------------------|
| `accounts` | SELECT, UPDATE(`display_name`) | SELECT, INSERT, UPDATE | SELECT |
| `installations` | SELECT, UPDATE(`status`,`revoked_at`,`revoke_reason`,`last_seen_at`) | SELECT, INSERT, UPDATE | SELECT, UPDATE(`push_token`,`status`,`revoked_at`,`revoke_reason`) |

Políticas:
- `accounts` / `guardme_api`: SELECT `USING (id = guardme.ctx_account_id())`; UPDATE mismo predicado. (El plan 03 añade la política para ver nombres de co-miembros.)
- `installations` / `guardme_api`: SELECT y UPDATE `USING (account_id = guardme.ctx_account_id())`.
- `guardme_onboarding` y `guardme_worker`: `USING (true) WITH CHECK (true)` en ambas tablas.

---

## Contratos de funciones

### `JwtVerifierService`
```typescript
// src/modules/identity/jwt-verifier.service.ts
interface VerifiedToken {
  sub: string            // auth.users.id
  sessionId: string      // claim session_id
  isAnonymous: boolean   // claim is_anonymous (false si falta)
  exp: number
}
class JwtVerifierService {
  verify(bearer: string): Promise<VerifiedToken>   // lanza DomainError('UNAUTHENTICATED')
}
```
- Si `SUPABASE_JWT_SECRET` está definido → `jwtVerify` con clave simétrica HS256. Si no → `createRemoteJWKSet(SUPABASE_JWKS_URL)` (cacheado por `jose`).
- Opciones obligatorias: `issuer = ${SUPABASE_URL}/auth/v1`, `audience = SUPABASE_JWT_AUDIENCE`, `algorithms` explícitos (`['HS256']` o `['ES256','RS256']`), `clockTolerance: 5`.
- Rechazar si falta `sub` o `session_id`, o si `role !== 'authenticated'`.
- Nunca usar `decodeJwt` como sustituto.

### `Principal`
```typescript
// src/modules/identity/principal.ts
interface Principal {
  authUserId: string
  sessionId: string
  isAnonymous: boolean
  accountId: string | null        // null solo en rutas @AllowUnbootstrapped
  installationId: string | null   // presente si llegó X-Installation-Id válido
}
function toAccountContext(p: Principal): AccountContext
```

### `AuthGuard` (global)
```typescript
class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): Promise<boolean>
}
```
Algoritmo:
1. Si la ruta tiene `@Public()` → permitir.
2. Leer `Authorization: Bearer <token>`; si falta → `UNAUTHENTICATED`.
3. `JwtVerifierService.verify`.
4. Leer `X-Installation-Id` (UUID o ausente; formato inválido → `VALIDATION_FAILED`).
5. Llamar `guardme.resolve_principal(sub, sessionId, installationId)` con el cliente API **fuera** de transacción (`$queryRaw` parametrizado).
6. `session_active = false` → `SESSION_REVOKED`.
7. `account_id = null` → permitir solo si la ruta tiene `@AllowUnbootstrapped()`; si no → `ACCOUNT_NOT_BOOTSTRAPPED`. `account_status != 'active'` → `SESSION_REVOKED`.
8. Si se envió `X-Installation-Id`: `installation_account_id != account_id` → `INSTALLATION_MISMATCH`; `installation_status = 'revoked'` → `SESSION_REVOKED`; `installation_session_id != sessionId` → `INSTALLATION_MISMATCH` (Android debe re-registrar tras un nuevo inicio de sesión).
9. Si la ruta tiene `@RequireInstallation()` y no hay instalación válida → `INSTALLATION_MISMATCH`.
10. Adjuntar `Principal` a `request.principal`.

`// shortcut: una consulta extra por petición (resolve_principal), sin caché; añadir caché de ≤30 s si la latencia lo exige en el piloto.`

### `AccountsService`
```typescript
class AccountsService {
  bootstrap(p: Principal, input: BootstrapAccountDto): Promise<{ account: AccountView; created: boolean }>
  getMe(p: Principal): Promise<MeView>
}
```
- `bootstrap`: si `p.isAnonymous` → `FORBIDDEN_ACTION` (las identidades anónimas solo se incorporan con `POST /v1/enrollments/consume`, plan 03). Con `asOnboarding`: `INSERT ... ON CONFLICT (auth_user_id) DO NOTHING`, luego `SELECT`. `created=false` → HTTP 200; `true` → 201. Audita `account.bootstrap`.
- `getMe`: con `asAccount`. Devuelve `MeView` (abajo). En este plan `accesses: []`; el plan 03 lo rellena.

### `InstallationsService`
```typescript
class InstallationsService {
  register(p: Principal, input: RegisterInstallationDto): Promise<InstallationView>
  revoke(p: Principal, installationId: string, reason: 'user_revoked'): Promise<void>
  logout(p: Principal, scope: 'installation' | 'all'): Promise<{ revokedInstallations: number }>
}
```
- `register` (`asOnboarding`, transacción única):
  1. Buscar instalación activa `(account_id, client_installation_id)`. Si existe → actualizar `auth_session_id`, `app_version`, `last_seen_at` y, si viene, `push_token` + `push_token_updated_at`. Si no → insertar.
  2. Si `push_token` viene y está activo en **otra** instalación (cualquier cuenta) → esa otra pasa a `revoked` con `revoke_reason='replaced'` (mismo teléfono, otra cuenta).
  3. Audita `installation.register`.
  4. El plan 04 añadirá: al revocar por `replaced`, cerrar pasarelas de esa instalación.
- `revoke`: con `asAccount`; solo instalaciones propias (RLS) → si 0 filas → `NOT_FOUND`. Idempotente si ya revocada.
- `logout`: `installation` → revoca `p.installationId` (requiere instalación); `all` → revoca todas las activas de la cuenta. **No** llama a Supabase Admin: Android ejecuta `supabase.auth.signOut({ scope: 'local' | 'global' })` por su cuenta; la comprobación de sesión del guard cubre el resto (BE-03 §2).

### `CapabilitiesService`
```typescript
interface Capabilities {
  telephony: 'fake' | 'enabled' | 'not_enabled'   // 'fake' solo si NODE_ENV != production
  push: 'fake' | 'fcm'
  emergencyAutoCall: 'not_enabled'                 // fijo hasta validar PD-02 (BE-R13)
  voiceInApp: 'not_enabled'                        // PD-01
  location: 'enabled' | 'not_enabled'              // plan 10
  pendingPolicies: string[]                        // p. ej. ['PD-03','PD-04','PD-05','PD-06','PD-07','PD-08','PD-10','PD-12']
}
class CapabilitiesService { get(): Capabilities }
```

### `IdempotencyInterceptor` + `@Idempotent()`
```typescript
// src/common/idempotency/
function Idempotent(): MethodDecorator        // marca la ruta
class IdempotencyInterceptor implements NestInterceptor
```
- Solo actúa en rutas `@Idempotent()`. Exige header `Idempotency-Key` (1–100 chars `[A-Za-z0-9_-]`); falta → `VALIDATION_FAILED`.
- Antes del handler: `SELECT` en `idempotency_keys` (`asAccount`). Si existe con mismo `route` y `request_hash` → devolver `status_code` + `response_body` con header `X-Idempotent-Replay: true`. Si `request_hash` difiere → `IDEMPOTENCY_KEY_REUSED`.
- Tras éxito (2xx) → `INSERT ... ON CONFLICT DO NOTHING`.
- `// shortcut: la clave se guarda después del handler, no en su transacción; dos peticiones simultáneas con la misma clave pueden ejecutar el handler dos veces. Los handlers que lo usan deben ser seguros por sus propias restricciones únicas/bloqueos. Mover al mismo tx si aparece un caso real.`
- Las rutas con clave natural (eventos con `sourceEventId`) **no** usan este interceptor.

---

## DTOs y respuestas

```typescript
// POST /v1/accounts/bootstrap   @AllowUnbootstrapped()
class BootstrapAccountDto {
  onboardingKind: 'self' | 'caregiver'     // supervised NO se acepta aquí
  displayName?: string                     // 1..80
}
interface AccountView { id: string; displayName: string; onboardingKind: string; status: string; version: number }

// GET /v1/me
interface MeView {
  account: AccountView
  installation: { id: string; status: string; appVersion: string; hasPushToken: boolean } | null
  accesses: Array<{ accessId: string; profileId: string; profileName: string; relation: 'user' | 'caregiver'; caregiverCategory: 'family' | 'medical' | null }>
  capabilities: Capabilities
}

// POST /v1/installations
class RegisterInstallationDto {
  clientInstallationId: string   // UUID
  platform: 'android'
  appVersion: string             // 1..40
  pushToken?: string             // 1..4096
}
interface InstallationView { id: string; status: string; appVersion: string; hasPushToken: boolean }

// DELETE /v1/installations/:id   → 204
// POST /v1/session/logout        → 200 { revokedInstallations: number }
class LogoutDto { scope: 'installation' | 'all' }
```

---

## Dependencias

| Paquete | Versión | Comando |
|---------|---------|---------|
| `jose` | ^5 (CommonJS compatible) | `pnpm add jose` |

Nada más. **No** instalar `@supabase/supabase-js` como dependencia de runtime.

---

## Edge cases y manejo de errores

- **JWT de otro proyecto/entorno** (otro secreto o emisor) → `UNAUTHENTICATED` (T31).
- **JWT expirado** → `UNAUTHENTICATED` (Android renueva con el SDK y reintenta).
- **JWT válido tras `signOut`** → `auth.sessions` ya no tiene la fila → `SESSION_REVOKED` (T36).
- **Instalación revocada con JWT vigente** → `SESSION_REVOKED` (T36).
- **Nuevo inicio de sesión en el mismo teléfono** → `session_id` cambia → `INSTALLATION_MISMATCH` hasta que Android llama `POST /v1/installations` (upsert actualiza `auth_session_id`).
- **Bootstrap repetido / concurrente** → unique `auth_user_id` + `ON CONFLICT DO NOTHING` → una sola cuenta.
- **Usuario anónimo llama bootstrap** → `FORBIDDEN_ACTION`.
- **Mismo push token en dos cuentas** → la anterior queda `revoked/replaced`; no recibe avisos de la nueva.
- **Body con `accountId`/`role`** → `forbidNonWhitelisted` → `VALIDATION_FAILED`.
- Ninguna respuesta incluye `push_token`, `auth_session_id` ni claims crudos.

---

## Orden de implementación

1. Migración `...000300`; `pnpm db:reset && pnpm db:sync`.
2. `JwtVerifierService` + unit tests (token HS256 firmado en el test con secreto correcto/incorrecto, emisor incorrecto, expirado, sin `session_id`).
3. Decoradores (`@Public`, `@AllowUnbootstrapped`, `@RequireInstallation`, `@CurrentPrincipal`).
4. `AuthGuard` como `APP_GUARD`; `@Public()` en health.
5. `CapabilitiesService`.
6. `AccountsService` + controller (`bootstrap`, `me`).
7. `InstallationsService` + controller (`register`, `revoke`, `logout`).
8. `IdempotencyInterceptor` registrado como `APP_INTERCEPTOR` (inactivo salvo `@Idempotent()`); unit test del cálculo de hash canónico (orden de claves estable).
9. `test/helpers/auth-users.ts` (usa `@supabase/supabase-js` con `SERVICE_ROLE_KEY` local para `auth.admin.createUser`, y `signInWithPassword`/`signInAnonymously`/`signOut` con `ANON_KEY`).
10. `test/identity.int-spec.ts`.

---

## Criterios de aceptación

- [ ] T31: tokens firmados con otro secreto, con emisor distinto, expirados o sin `session_id` → 401 `UNAUTHENTICATED` antes de tocar `guardme` (verificar con spy que `resolve_principal` no se llama).
- [ ] T36: usuario hace login → bootstrap → registra instalación → `GET /v1/me` 200 → `signOut()` desde el SDK → mismo JWT → 401 `SESSION_REVOKED`. Segundo caso: `DELETE /v1/installations/:id` → siguiente petición con ese `X-Installation-Id` → 401 `SESSION_REVOKED`.
- [ ] T34: test que recorre `src/` y falla si aparece `SERVICE_ROLE` o `service_role`; ninguna respuesta de `/v1/me` contiene `push_token`, `key` o `secret`.
- [ ] Bootstrap dos veces en paralelo → una fila en `accounts`; respuestas 201 y 200.
- [ ] Usuario anónimo → `POST /v1/accounts/bootstrap` → 403 `FORBIDDEN_ACTION`; `GET /v1/me` → 403 `ACCOUNT_NOT_BOOTSTRAPPED`.
- [ ] Registrar la misma `clientInstallationId` dos veces → una sola instalación activa.
- [ ] `GET /v1/me` muestra `capabilities.emergencyAutoCall = 'not_enabled'` y la lista de PD pendientes.
- [ ] `pnpm lint`, `pnpm test`, `pnpm test:int` en verde.
