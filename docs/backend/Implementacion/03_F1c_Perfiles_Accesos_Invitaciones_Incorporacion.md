# Spec 03 (F1c): Perfiles asistidos, vinculaciones, invitaciones e incorporación supervisada

> **Para:** Cursor AI — Rol: Developer
> **Autor del plan:** Claude (Tech Lead)
> **Stack:** NestJS 11 · Prisma 6 · Supabase Auth (incluye sesiones anónimas) · @nestjs/throttler
> **Fecha:** 14 de noviembre de 2026
> **Docs de origen:** BE-03 §1, §3, §5–8, §11; BE-04 §3; BE-05 §3; Propuesta §6–7
> **Prerrequisito:** planes 01–02 en verde

---

## Instrucciones para Cursor

No tomes decisiones de arquitectura por tu cuenta. Implementa este plan exactamente como está descrito.
Si algo no está especificado, pregunta antes de asumir.
Contexto a cargar: `@docs/backend/Implementacion/00_Indice_Convenciones_y_Reglas_Cursor.md` `@backend/src/infra/db/db.service.ts` `@backend/src/modules/identity/auth.guard.ts` `@backend/src/modules/identity/installations.service.ts` `@docs/backend/Desglose/03_Identidad_Usuarios_Permisos_y_Configuracion_Inicial.md`

---

## Objetivo

Separar **cuenta** (quien inicia sesión) de **perfil asistido** (quien usa el bastón) y unirlos mediante **accesos** con relación `user` o `caregiver`. Familiar y médico son una categoría descriptiva sin privilegios distintos. Se implementan: creación de perfiles sin duplicados, listado de perfiles accesibles, invitaciones de cuidador de un solo uso, retirada de accesos, incorporación supervisada del teléfono de la persona (sesión anónima de Supabase + código temporal) y el progreso reanudable de configuración. Toda lectura de un perfil exige un acceso activo comprobado por RLS.

---

## Archivos

| Acción | Ruta (`backend/`) | Descripción |
|--------|-------------------|-------------|
| CREAR | `supabase/migrations/20261114000400_profiles_access.sql` | `profiles`, `profile_access`, `invitations`, `supervised_enrollments`, `onboarding_steps`, helpers de acceso, RLS |
| MODIFICAR | `prisma/schema.prisma` | `pnpm db:sync` |
| CREAR | `src/common/secrets/secret-codes.ts` | Generar secretos/códigos y su HMAC con `SECRET_PEPPER` |
| CREAR | `src/modules/profiles/profiles.module.ts`, `profiles.controller.ts`, `profiles.service.ts` | CRUD de perfiles |
| CREAR | `src/modules/profiles/access.service.ts` | `requireAccess`, `listMembers`, `revokeAccess` (usado por todos los módulos siguientes) |
| CREAR | `src/modules/profiles/memberships.controller.ts` | Listar/retirar accesos |
| CREAR | `src/modules/onboarding/onboarding.module.ts` | |
| CREAR | `src/modules/onboarding/invitations.controller.ts`, `invitations.service.ts` | Emitir, listar, retirar, aceptar, rechazar |
| CREAR | `src/modules/onboarding/enrollments.controller.ts`, `enrollments.service.ts` | Emitir y consumir incorporación supervisada |
| CREAR | `src/modules/onboarding/onboarding-progress.controller.ts`, `onboarding-progress.service.ts` | Progreso de configuración |
| CREAR | `src/modules/*/dto/*.ts` | DTOs de este plan |
| MODIFICAR | `src/modules/identity/accounts.service.ts` | `getMe` rellena `accesses` |
| MODIFICAR | `src/modules/identity/installations.service.ts` | Extraer `registerInTx(tx, …)` reutilizable por el consumo de incorporación |
| MODIFICAR | `src/config/policy.config.ts` | `INVITATION_TTL_HOURS`, `ENROLLMENT_CODE_TTL_MIN` |
| MODIFICAR | `src/app.module.ts` | `ThrottlerModule` (solo con los límites nombrados de este plan) |
| CREAR | `test/profiles-access.int-spec.ts`, `test/onboarding.int-spec.ts` | T01, T02, T03, T28 (parte acceso), T35 |

---

## Modelo de datos (migración `20261114000400_profiles_access.sql`)

### `guardme.profiles`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` | uuid PK | |
| `display_name` | text not null | 1..80 |
| `time_zone` | text not null default `'America/Panama'` | Validar IANA en la API con `Intl.supportedValuesOf('timeZone')` |
| `status` | text not null default `'active'` CHECK in (`active`,`archived`) | |
| `created_by_account_id` | uuid not null FK `accounts` | |
| `created_at`, `updated_at`, `version` | | trigger `bump_version` |

### `guardme.profile_access`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` | uuid PK | |
| `account_id` | uuid not null FK `accounts` | |
| `profile_id` | uuid not null FK `profiles` | |
| `relation` | text not null CHECK in (`user`,`caregiver`) | |
| `caregiver_category` | text null CHECK in (`family`,`medical`) | CHECK: `(relation = 'caregiver') = (caregiver_category IS NOT NULL)` |
| `status` | text not null default `'active'` CHECK in (`active`,`revoked`) | |
| `granted_at` | timestamptz default now() | |
| `granted_via` | text not null CHECK in (`profile_creation`,`invitation`,`enrollment`) | |
| `revoked_at` | timestamptz null | |
| `revoked_by_account_id` | uuid null | |
| `version` | int default 1 | trigger |

Índices: unique parcial `(account_id, profile_id) WHERE status='active'`; unique parcial `(profile_id) WHERE relation='user' AND status='active'` (una sola identidad “usuario” activa por perfil; la reincorporación la reemplaza explícitamente); índice `(account_id) WHERE status='active'`.

### `guardme.invitations`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `profile_id` FK · `issued_by_account_id` FK | | |
| `secret_hash` | text not null unique | HMAC-SHA256(pepper, secreto) en hex |
| `recipient_hint` | text null | Nota libre del emisor (p. ej. “Dra. López”); **no** se usa para autorizar |
| `status` | text not null default `'pending'` CHECK in (`pending`,`accepted`,`withdrawn`,`expired`,`rejected`) | `expired` se calcula también al leer (`expires_at < now()`) |
| `expires_at` | timestamptz not null | |
| `consumed_by_account_id` | uuid null · `consumed_at` timestamptz null · `created_access_id` uuid null | |
| `created_at` | timestamptz default now() | |

### `guardme.supervised_enrollments`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `profile_id` FK · `issued_by_account_id` FK | | |
| `purpose` | text not null CHECK in (`initial`,`replace_user`) | Lo decide el cuidador al emitir |
| `code_hash` | text not null unique | HMAC del código normalizado |
| `status` | text not null default `'pending'` CHECK in (`pending`,`consumed`,`withdrawn`,`expired`) | |
| `expires_at` | timestamptz not null | |
| `consumed_by_account_id` uuid null · `consumed_by_installation_id` uuid null · `consumed_at` timestamptz null | | |
| `created_at` | timestamptz default now() | |

### `guardme.onboarding_steps`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `account_id` FK · `profile_id` uuid null FK | | |
| `step` | text not null CHECK in (`intent_selected`,`pin_set`,`permissions_granted`,`end_to_end_test`) | Solo pasos **locales** que reporta Android |
| `status` | text not null CHECK in (`done`,`blocked`,`skipped`) | |
| `reason` | text null CHECK in (`permission_denied`,`cane_not_found`,`invitation_pending`,`provider_not_integrated`,`user_skipped`) | |
| `updated_at` | timestamptz default now() | |

Unique `(account_id, profile_id, step) NULLS NOT DISTINCT`.

### Funciones auxiliares (SECURITY DEFINER, `SET search_path = ''`, STABLE)

| Función | Devuelve | Lógica |
|---------|----------|--------|
| `guardme.has_profile_access(p_profile uuid)` | boolean | Existe `profile_access` activo para `(ctx_account_id(), p_profile)` |
| `guardme.profile_relation(p_profile uuid)` | text | `relation` del acceso activo del contexto o `NULL` |
| `guardme.shares_profile_with(p_account uuid)` | boolean | La cuenta del contexto y `p_account` tienen acceso activo a un mismo perfil |

`GRANT EXECUTE` solo a `guardme_api`. Son SECURITY DEFINER para evitar recursión de RLS sobre `profile_access` (BE-04 §8).

### Grants y RLS

| Tabla | `guardme_api` | `guardme_onboarding` | `guardme_worker` |
|-------|---------------|----------------------|------------------|
| `profiles` | SELECT, UPDATE | SELECT, INSERT | SELECT |
| `profile_access` | SELECT, UPDATE(`status`,`revoked_at`,`revoked_by_account_id`) | SELECT, INSERT, UPDATE | SELECT |
| `invitations` | SELECT, INSERT, UPDATE(`status`) | SELECT, UPDATE | — |
| `supervised_enrollments` | SELECT, INSERT, UPDATE(`status`) | SELECT, UPDATE | — |
| `onboarding_steps` | SELECT, INSERT, UPDATE | — | — |

Políticas `guardme_api`:
- `profiles`: `USING (guardme.has_profile_access(id))`.
- `profile_access`, `invitations`, `supervised_enrollments`: `USING (guardme.has_profile_access(profile_id))` / `WITH CHECK` igual.
- `onboarding_steps`: `account_id = guardme.ctx_account_id()`.
- `accounts` (nueva política SELECT adicional): `USING (guardme.shares_profile_with(id))` — permite ver nombres de co-miembros.
- `guardme_onboarding` y `guardme_worker`: `USING (true)` en sus tablas.

---

## Contratos de funciones

### Secretos
```typescript
// src/common/secrets/secret-codes.ts
function newInvitationSecret(): string           // 32 bytes aleatorios, base64url
function newEnrollmentCode(): string             // 10 caracteres Crockford Base32, formato XXXXX-XXXXX
function normalizeEnrollmentCode(raw: string): string  // mayúsculas, sin guiones/espacios, O→0, I/L→1
function hashSecret(value: string): string       // HMAC-SHA256(SECRET_PEPPER, value) hex
```
Usar `crypto.randomBytes` y `crypto.createHmac`. Nunca loguear ni auditar el valor en claro.

### `AccessService` (lo usan todos los módulos posteriores)
```typescript
// src/modules/profiles/access.service.ts
type Relation = 'user' | 'caregiver'
interface ProfileAccessView { accessId: string; profileId: string; relation: Relation; caregiverCategory: 'family' | 'medical' | null }

class AccessService {
  requireAccess(tx: Tx, profileId: string): Promise<ProfileAccessView>   // NOT_FOUND si no hay acceso activo
  listActiveAccounts(tx: Tx, profileId: string, relation?: Relation): Promise<Array<{ accountId: string; relation: Relation }>>
  listMembers(p: Principal, profileId: string): Promise<MemberView[]>
  revokeAccess(p: Principal, profileId: string, accessId: string, opts: { confirmLast: boolean }): Promise<void>
}
```
- `requireAccess` es la puerta de entrada de cualquier operación por perfil: se llama dentro del `asAccount` antes de leer/escribir. La categoría **nunca** se usa para decidir permisos.
- `revokeAccess`:
  1. `requireAccess` del solicitante. Cualquier acceso activo del perfil puede retirar a otro o a sí mismo (matriz BE-03 §3).
  2. Si el acceso a retirar es el último activo del perfil y `confirmLast=false` → `INCOMPATIBLE_STATE` con `details.reason = 'last_access'` (propuesta BE-03 §11).
  3. Marca `revoked`, audita `access.revoke` con `profileId`.
  4. Si la relación era `user` → revoca además las instalaciones de esa cuenta que sean pasarela de bastones del perfil (el plan 04 añade este paso; dejar `// plan 04: cerrar pasarelas`).
  5. El plan 10 añade: revocar `location_read_grants` de esa cuenta en el perfil.

### `ProfilesService`
```typescript
class ProfilesService {
  create(p: Principal, input: CreateProfileDto): Promise<ProfileView>       // @Idempotent en el controller
  list(p: Principal): Promise<ProfileSummaryView[]>
  get(p: Principal, profileId: string): Promise<ProfileView>
  update(p: Principal, profileId: string, input: UpdateProfileDto): Promise<ProfileView>
}
```
- `create` con `asOnboarding` (el creador aún no tiene acceso): inserta perfil + acceso del creador (`granted_via='profile_creation'`) en una transacción. `relation='user'` solo si la cuenta fue `onboarding_kind='self'`; `relation='caregiver'` exige `caregiverCategory`. Audita `profile.create`.
- Evitar duplicados por reenvío: `@Idempotent()` obligatorio en la ruta (BE-05 §3).
- `update`: `UPDATE ... WHERE id=? AND version=?`; 0 filas → si existe → `VERSION_CONFLICT` con `details.current`, si no → `NOT_FOUND`.

### `InvitationsService`
```typescript
class InvitationsService {
  issue(p: Principal, profileId: string, input: IssueInvitationDto): Promise<{ invitationId: string; secret: string; expiresAt: string }>
  listPending(p: Principal, profileId: string): Promise<InvitationView[]>
  withdraw(p: Principal, invitationId: string): Promise<void>
  accept(p: Principal, input: AcceptInvitationDto): Promise<{ access: ProfileAccessView; replay: boolean }>
  reject(p: Principal, input: RejectInvitationDto): Promise<void>
}
```
- `issue`: `asAccount` + `requireAccess`. `expires_at = now + INVITATION_TTL_HOURS`. El secreto se devuelve **una sola vez**. Android lo comparte como deep link/QR (fuera del backend; no se envían correos).
- `accept` (`asOnboarding`; el invitado no tiene acceso todavía; anónimos → `FORBIDDEN_ACTION`):
  1. Buscar por `secret_hash` con `SELECT ... FOR UPDATE`. No existe → `NOT_FOUND` (respuesta discreta, sin pistas).
  2. Si `status='accepted'` y `consumed_by_account_id = p.accountId` → devolver acceso existente con `replay=true` (idempotente, BE-03 §8). Si lo consumió otra cuenta → `NOT_FOUND`.
  3. `withdrawn`/`rejected`/expirada → `INCOMPATIBLE_STATE` con `details.status`.
  4. Si la cuenta ya tiene acceso activo a ese perfil → marcar invitación `accepted` apuntando a ese acceso (no crear otro).
  5. Si no → crear `profile_access` (`relation='caregiver'`, `caregiver_category` del DTO, `granted_via='invitation'`), marcar invitación. Audita `invitation.accept`.
- `reject`: igual búsqueda; solo `pending` → `rejected`.

### `EnrollmentsService`
```typescript
class EnrollmentsService {
  issue(p: Principal, profileId: string, input: IssueEnrollmentDto): Promise<{ enrollmentId: string; code: string; expiresAt: string }>
  withdraw(p: Principal, enrollmentId: string): Promise<void>
  consume(p: Principal, input: ConsumeEnrollmentDto): Promise<ConsumeEnrollmentResult>
}
```
- `issue`: `asAccount` + `requireAccess` con `relation='caregiver'` (el teléfono de la persona no se auto-emite códigos). `expires_at = now + ENROLLMENT_CODE_TTL_MIN`. Retira (`withdrawn`) códigos `pending` anteriores del mismo perfil.
- `consume` (`@AllowUnbootstrapped`, `asOnboarding`, una transacción):
  1. Buscar por `hashSecret(normalizeEnrollmentCode(code))` `FOR UPDATE`; inexistente/expirado/usado → `NOT_FOUND` (sin distinguir, BE-09 §2).
  2. Resolver cuenta: si `p.accountId` existe, usarla; si no, crear cuenta con `onboarding_kind='supervised'` y `auth_user_id = p.authUserId` (válido tanto para anónimos como para cuentas propias que aún no hicieron bootstrap).
  3. Si la cuenta ya tiene acceso `caregiver` a ese perfil → `INCOMPATIBLE_STATE` (`details.reason='already_caregiver'`).
  4. Acceso `user` activo existente de otra cuenta: si `purpose='replace_user'` → revocarlo (`revoked_by_account_id = issued_by_account_id`) y revocar las instalaciones activas de esa cuenta (`revoke_reason='replaced'`); si `purpose='initial'` → `INCOMPATIBLE_STATE` (`details.reason='user_already_linked'`).
  5. Crear acceso `relation='user'`, `granted_via='enrollment'`.
  6. `InstallationsService.registerInTx(tx, …)` con los datos del DTO.
  7. Marcar enrollment `consumed`. Auditar `enrollment.consume` (actor = cuenta nueva, `details.purpose`).
  8. Devolver cuenta, acceso e instalación. Android reintenta con el mismo código si se cortó: el paso 1 devuelve `NOT_FOUND` porque ya está consumido → para no dejar al teléfono bloqueado, **antes** del paso 1 comprobar si existe enrollment `consumed` con ese hash y `consumed_by_account_id` = cuenta del principal → devolver el resultado existente (replay).
- Antes de vincular, una sesión anónima no ve nada: todas las demás rutas responden `ACCOUNT_NOT_BOOTSTRAPPED` (T35).

### `OnboardingProgressService`
```typescript
type FlowKind = 'self' | 'caregiver'
interface OnboardingStepView { step: string; status: 'pending' | 'done' | 'blocked' | 'skipped'; reason: string | null; source: 'server' | 'device' }
class OnboardingProgressService {
  get(p: Principal, profileId: string | null): Promise<{ flow: FlowKind; steps: OnboardingStepView[] }>
  report(p: Principal, input: ReportStepDto): Promise<OnboardingStepView>
}
```
- Pasos derivados del servidor (`source='server'`), **nunca** marcados por el cliente: `account` (cuenta existe), `profile` (acceso activo), `cane` (asignación activa, plan 04), `gateway` (pasarela activa con instalación del usuario, plan 04), `contacts` (≥1 contacto con prioridad, plan 04), `caregivers` (otro acceso activo o invitación pendiente), `location_decision` (consentimiento registrado o paso `skipped`, plan 10).
- Pasos `source='device'` que reporta Android: `intent_selected`, `pin_set`, `permissions_granted`, `end_to_end_test`.
- Hasta que existan los planes 04/10, los pasos que dependen de ellos devuelven `pending` con `reason='provider_not_integrated'`; **no** `done`.
- Orden de pasos según `flow` (BE-03 §5–6). `flow = 'self'` si la cuenta tiene relación `user` con el perfil; si no `caregiver`.

---

## Endpoints y DTOs

| Método y ruta | Guard extra | Body / Query | Respuesta |
|---------------|-------------|--------------|-----------|
| `POST /v1/profiles` | `@Idempotent()` | `CreateProfileDto { displayName; timeZone?; relation: 'user'\|'caregiver'; caregiverCategory?: 'family'\|'medical' }` | 201 `ProfileView` |
| `GET /v1/profiles` | — | — | `ProfileSummaryView[]` (`id, displayName, relation, caregiverCategory`) |
| `GET /v1/profiles/:id` | — | — | `ProfileView { id, displayName, timeZone, status, version, myRelation }` |
| `PATCH /v1/profiles/:id` | — | `UpdateProfileDto { displayName?; timeZone?; expectedVersion }` | `ProfileView` |
| `GET /v1/profiles/:id/memberships` | — | — | `MemberView[] { accessId, accountId, displayName, relation, caregiverCategory, grantedAt }` |
| `DELETE /v1/profiles/:id/memberships/:accessId` | — | query `confirmLast=true` opcional | 204 |
| `POST /v1/profiles/:id/invitations` | `@Throttle('invitations')` | `IssueInvitationDto { recipientHint? }` | 201 `{ invitationId, secret, expiresAt }` |
| `GET /v1/profiles/:id/invitations` | — | — | `InvitationView[] { id, recipientHint, status, expiresAt, createdAt }` |
| `DELETE /v1/invitations/:id` | — | — | 204 |
| `POST /v1/invitations/accept` | `@Throttle('secrets')` | `AcceptInvitationDto { secret; caregiverCategory }` | 201 (o 200 replay) `ProfileAccessView` |
| `POST /v1/invitations/reject` | `@Throttle('secrets')` | `RejectInvitationDto { secret }` | 204 |
| `POST /v1/profiles/:id/enrollments` | — | `IssueEnrollmentDto { purpose: 'initial'\|'replace_user' }` | 201 `{ enrollmentId, code, expiresAt }` |
| `DELETE /v1/enrollments/:id` | — | — | 204 |
| `POST /v1/enrollments/consume` | `@AllowUnbootstrapped()` `@Throttle('secrets')` | `ConsumeEnrollmentDto { code; clientInstallationId; appVersion; pushToken? }` | 201 (o 200 replay) `{ account, access, installation }` |
| `GET /v1/onboarding` | — | query `profileId?` | `{ flow, steps }` |
| `POST /v1/onboarding/steps` | — | `ReportStepDto { profileId?; step; status; reason? }` | `OnboardingStepView` |

Límites de `ThrottlerModule` (por `authUserId`, no por IP): `secrets` = 5/min y 30/día; `invitations` = 20/día. `// shortcut: almacenamiento en memoria del throttler; con más de una instancia de API mover a almacenamiento compartido (plan 10).`

---

## Dependencias

| Paquete | Versión | Comando |
|---------|---------|---------|
| `@nestjs/throttler` | ^6 | `pnpm add @nestjs/throttler` |

---

## Edge cases y manejo de errores

- **Cuidador consulta perfil ajeno con ID correcto** → `NOT_FOUND` (RLS devuelve 0 filas; no revelar existencia).
- **Segundo cuidador se suma** → nuevo acceso sobre el mismo perfil; nunca un perfil nuevo (T01).
- **Familiar vs médico** → mismas respuestas en todas las rutas; test parametrizado por categoría (T02).
- **Invitación reutilizada por otra cuenta** → `NOT_FOUND`; por la misma cuenta → replay 200.
- **Invitación caducada** → `INCOMPATIBLE_STATE` `details.status='expired'` (y se persiste `expired` al detectarlo).
- **Código de incorporación mal tecleado** → normalización (O/0, I/1, guiones) antes del HMAC.
- **Sesión anónima sin código** → todas las rutas de datos → 403 `ACCOUNT_NOT_BOOTSTRAPPED` (T35).
- **Pérdida de la sesión anónima** → el cuidador emite `purpose='replace_user'`; el consumo revoca acceso e instalaciones anteriores y la autoría histórica se conserva (filas no se borran).
- **Retirar el último acceso** → exige `confirmLast=true`.
- **Retirado con notificación/cursor antiguo** → sus peticiones posteriores al perfil → `NOT_FOUND` (T28, parte de acceso).
- **Reanudar configuración** → `GET /v1/onboarding` recompone el estado; repetir `POST /v1/profiles` con la misma `Idempotency-Key` no duplica (T03).

---

## Orden de implementación

1. Migración `...000400`; `pnpm db:reset && pnpm db:sync`.
2. `secret-codes.ts` + unit tests (formato, normalización, HMAC estable).
3. `AccessService` (`requireAccess`, `listActiveAccounts`) + `ProfilesService` + controller.
4. `accounts.service.getMe` rellena `accesses`.
5. `MembershipsController` + `revokeAccess`.
6. `InvitationsService` + controller.
7. Refactor `InstallationsService.registerInTx`.
8. `EnrollmentsService` + controller.
9. `OnboardingProgressService` + controller.
10. `ThrottlerModule` con los límites nombrados y `ThrottlerGuard` que use `principal.authUserId` como tracker.
11. Tests de integración.

---

## Criterios de aceptación

- [ ] T01: cuidador A crea perfiles P1 y P2; invita a B a P1; B acepta → B ve solo P1, A ve P1 y P2; existe un único registro de P1.
- [ ] T02: repetir T01 con B `family` y con B `medical` → respuestas idénticas en todas las rutas de este plan.
- [ ] T03: flujo `self` y flujo `caregiver` devuelven pasos distintos; tras cerrar y volver, `GET /v1/onboarding` conserva lo hecho; ningún paso `server` aparece `done` sin datos que lo respalden.
- [ ] T35: (a) sesión anónima sin consumir código → `GET /v1/profiles` 403; (b) consumir código → acceso `user` al perfil correcto; (c) reutilizar el código desde otra identidad → 404; (d) `replace_user` → acceso e instalación anteriores revocados, perfil idéntico, la sesión del cuidador nunca sale de su teléfono.
- [ ] Retirar a B → la siguiente `GET /v1/profiles/P1` de B → 404.
- [ ] Ninguna fila de `audit_log` contiene secretos o códigos en claro (test busca el valor generado en `details`).
- [ ] `pnpm lint`, `pnpm test`, `pnpm test:int` en verde.
