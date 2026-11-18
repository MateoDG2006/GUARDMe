# Spec 04 (F1d): Bastones, asignaciones, pasarela única y contactos prioritarios

> **Para:** Cursor AI — Rol: Developer
> **Autor del plan:** Claude (Tech Lead)
> **Stack:** NestJS 11 · Prisma 6 · libphonenumber-js
> **Fecha:** 14 de noviembre de 2026
> **Docs de origen:** BE-03 §9; BE-04 §4–5; BE-05 §4; BE-08 §4; Propuesta §7.4
> **Prerrequisito:** planes 01–03 en verde

---

## Instrucciones para Cursor

No tomes decisiones de arquitectura por tu cuenta. Implementa este plan exactamente como está descrito.
Si algo no está especificado, pregunta antes de asumir.
Contexto a cargar: `@docs/backend/Implementacion/00_Indice_Convenciones_y_Reglas_Cursor.md` `@backend/src/modules/profiles/access.service.ts` `@backend/src/modules/identity/installations.service.ts` `@backend/src/common/secrets/secret-codes.ts` `@docs/backend/Desglose/08_Integracion_Movil_Baston_Telemetria_y_Ubicacion.md`

---

## Objetivo

**Dependencia ESP32:** la asignación remota no completa por sí sola la autorización BLE. El proceso físico y la sustitución de claves/pasarela se describen como pendientes en [ESP-04](../../ESP32/04_Contrato_BLE_Eventos_Comandos_y_Seguridad.md) y [ESP-05](../../ESP32/05_Integracion_Android_Pasarela_y_Sincronizacion.md). `PD12_CANE_PROXIMITY_PROOF_REQUIRED=false` es una limitación provisional, no una prueba de proximidad superada. Cambiar la pasarela en servidor no revoca automáticamente un vínculo BLE antiguo.

Un bastón se incorpora a un perfil demostrando posesión con un **código secreto** (la serie es pública y no basta). Cada bastón tiene como máximo **una asignación activa** y **una pasarela activa** (la instalación Android de la persona que recibe sus eventos BLE). Los cambios de asignación y de pasarela son explícitos, transaccionales y auditados, y conservan el historial. Además se gestionan los **contactos prioritarios** del perfil (prioridad 1 y 2 para la secuencia de llamadas), con teléfono normalizado y cambios de orden atómicos.

---

## Archivos

| Acción | Ruta (`backend/`) | Descripción |
|--------|-------------------|-------------|
| CREAR | `supabase/migrations/20261114000500_canes_gateways_contacts.sql` | `canes`, `cane_assignments`, `gateways`, `contacts`, columna `profiles.contacts_version`, RLS |
| MODIFICAR | `prisma/schema.prisma` | `pnpm db:sync` |
| CREAR | `scripts/register-cane.ts` | CLI de operador: registra un bastón y muestra su código de incorporación una vez |
| CREAR | `src/modules/devices/devices.module.ts` | |
| CREAR | `src/modules/devices/canes.controller.ts`, `canes.service.ts` | Reclamar, liberar, listar |
| CREAR | `src/modules/devices/gateways.service.ts` | Designar pasarela y cerrar pasarelas por instalación |
| CREAR | `src/modules/contacts/contacts.module.ts`, `contacts.controller.ts`, `contacts.service.ts` | CRUD y reordenamiento |
| CREAR | `src/modules/contacts/phone.ts` | Normalización E.164 y máscara para logs |
| MODIFICAR | `src/modules/identity/installations.service.ts` | Al revocar (incluido `replaced`) → `GatewaysService.closeForInstallations` |
| MODIFICAR | `src/modules/profiles/access.service.ts` | Al revocar acceso `user` → cerrar pasarelas de sus instalaciones en ese perfil |
| MODIFICAR | `src/modules/onboarding/enrollments.service.ts` | En `replace_user` → cerrar pasarelas de las instalaciones revocadas |
| MODIFICAR | `src/modules/onboarding/onboarding-progress.service.ts` | Pasos `cane`, `gateway`, `contacts` derivados de datos reales |
| MODIFICAR | `src/config/env.config.ts` | `DEFAULT_PHONE_REGION` (default `PA`) |
| CREAR | `test/devices-contacts.int-spec.ts` | T05 y reglas de pasarela/contactos |

---

## Modelo de datos (migración `20261114000500_canes_gateways_contacts.sql`)

### `guardme.canes`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` | uuid PK | |
| `serial` | text not null **unique** | Pública |
| `model` | text not null | |
| `firmware_version` | text null | Reportada por la pasarela (plan 05); nunca constante de demo |
| `claim_secret_hash` | text not null | HMAC del código de incorporación |
| `status` | text not null default `'available'` CHECK in (`available`,`assigned`,`retired`) | |
| `created_at`, `updated_at`, `version` | | trigger |

### `guardme.cane_assignments`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `cane_id` FK · `profile_id` FK | | |
| `started_at` timestamptz default now() · `ended_at` timestamptz null | | |
| `assigned_by_account_id` uuid FK · `ended_by_account_id` uuid null | | |
| Índice | unique parcial `(cane_id) WHERE ended_at IS NULL` | Sin dos asignaciones activas |

### `guardme.gateways`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `cane_id` FK · `cane_assignment_id` FK · `installation_id` FK `installations` | | |
| `started_at` timestamptz default now() · `ended_at` timestamptz null | | |
| `end_reason` | text null CHECK in (`replaced`,`installation_revoked`,`access_revoked`,`cane_released`) | |
| `last_event_at` | timestamptz null | Lo actualiza el plan 05 al recibir eventos |
| Índice | unique parcial `(cane_id) WHERE ended_at IS NULL` | Una pasarela activa por bastón (política del piloto) |

### `guardme.contacts`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `profile_id` FK | | |
| `display_name` | text not null (1..80) | |
| `phone_e164` | text not null | Validado; nunca en logs completo |
| `priority` | smallint null CHECK in (1, 2) | Solo 1 y 2 participan en llamadas |
| `linked_account_id` | uuid null FK `accounts` | Opcional; **no** concede lectura |
| `status` | text not null default `'active'` CHECK in (`active`,`removed`) | |
| `created_at`, `updated_at`, `version` | | trigger |
| Índice | unique parcial `(profile_id, priority) WHERE status='active' AND priority IS NOT NULL` | |

### `guardme.profiles` (ALTER)
- Añadir `contacts_version int not null default 1`. Se incrementa en servicio (no por trigger) en cada cambio del conjunto de contactos.

### Grants y RLS

| Tabla | `guardme_api` | `guardme_onboarding` | `guardme_worker` |
|-------|---------------|----------------------|------------------|
| `canes` | SELECT | SELECT, UPDATE(`status`) | SELECT, UPDATE(`firmware_version`) |
| `cane_assignments` | SELECT, UPDATE(`ended_at`,`ended_by_account_id`) | SELECT, INSERT | SELECT |
| `gateways` | SELECT, INSERT, UPDATE(`ended_at`,`end_reason`) | SELECT, UPDATE(`ended_at`,`end_reason`) | SELECT, UPDATE(`last_event_at`) |
| `contacts` | SELECT, INSERT, UPDATE | — | SELECT |

Políticas `guardme_api`:
- `cane_assignments`: `USING (guardme.has_profile_access(profile_id))`.
- `canes`: `USING (EXISTS (SELECT 1 FROM guardme.cane_assignments a WHERE a.cane_id = canes.id AND a.ended_at IS NULL AND guardme.has_profile_access(a.profile_id)))`. El cuidador anterior deja de ver el bastón al cambiar la asignación (BE-03 §9).
- `gateways`: SELECT `USING (EXISTS (SELECT 1 FROM guardme.cane_assignments a WHERE a.id = gateways.cane_assignment_id AND guardme.has_profile_access(a.profile_id)))`; INSERT `WITH CHECK (installation_id = guardme.ctx_installation_id() AND <mismo EXISTS>)`.
- `contacts`: `USING/WITH CHECK (guardme.has_profile_access(profile_id))`.
- `guardme_onboarding`/`guardme_worker`: `USING (true)`.

---

## Contratos de funciones

### Script de operador
```typescript
// scripts/register-cane.ts  →  pnpm cane:register --serial GM-0001 --model proto-esp32
// Usa DATABASE_URL_MIGRATIONS. Genera código con newEnrollmentCode(), guarda hashSecret(code),
// imprime el código UNA vez en stdout. Si la serie existe → error, sin sobrescribir.
```

### `CanesService`
```typescript
interface CaneView {
  id: string; serial: string; model: string; firmwareVersion: string | null
  assignment: { id: string; profileId: string; startedAt: string }
  gateway: { installationId: string; isThisInstallation: boolean; startedAt: string; lastEventAt: string | null } | null
  linkState: 'linked_no_gateway' | 'gateway_set' // "conectado" requiere telemetría reciente (plan 05)
}
class CanesService {
  claim(p: Principal, input: ClaimCaneDto): Promise<{ cane: CaneView; replay: boolean }>
  release(p: Principal, caneId: string): Promise<void>
  listForProfile(p: Principal, profileId: string): Promise<CaneView[]>
}
```
- `claim` (`asOnboarding`, transacción):
  1. Verificar que el principal tiene acceso activo a `profileId` (consulta explícita a `profile_access`, porque el rol onboarding no aplica RLS de acceso).
  2. `SELECT ... FROM canes WHERE serial = ? FOR UPDATE`. No existe o `retired` → `NOT_FOUND`.
  3. Comparar `hashSecret(normalizeEnrollmentCode(claimCode))` con `claim_secret_hash` usando `crypto.timingSafeEqual`. Distinto → `NOT_FOUND` (no revelar que la serie existe) + auditar `cane.claim` `denied`.
  4. `PD12_CANE_PROXIMITY_PROOF_REQUIRED=true` y falta `proximityProof` → `CAPABILITY_NOT_ENABLED` (el contrato BLE no existe todavía). Con `false`, el campo se ignora. `// PD-12 pendiente`.
  5. Asignación activa al mismo perfil → `replay=true`. A otro perfil → `INCOMPATIBLE_STATE` `details.reason='assigned_elsewhere'` (debe liberarse desde ese perfil).
  6. Crear asignación, `canes.status='assigned'`, auditar `cane.claim` `ok`.
- `release` (`asAccount` + `requireAccess`): cierra asignación (`ended_at`) y su pasarela (`end_reason='cane_released'`), `canes.status='available'` vía `asOnboarding` en la misma operación (dos transacciones no; usar `asOnboarding` completo con verificación explícita de acceso, igual que `claim`). Audita.
- `listForProfile`: `asAccount` + `requireAccess`.

### `GatewaysService`
```typescript
class GatewaysService {
  setGateway(p: Principal, caneId: string): Promise<CaneView>                 // @RequireInstallation
  closeForInstallations(tx: Tx, installationIds: string[], reason: 'installation_revoked' | 'access_revoked'): Promise<number>
}
```
- `setGateway` (`asAccount`, transacción):
  1. Asignación activa del bastón visible por RLS → si no, `NOT_FOUND`.
  2. El principal debe tener relación `user` con ese perfil (`AccessService.requireAccess`) → si es `caregiver` → `FORBIDDEN_ACTION` `details.reason='gateway_must_be_user_phone'` (BE-03 §6: debe ser el teléfono que lleva la persona).
  3. `SELECT ... FROM cane_assignments WHERE id=? FOR UPDATE` (serializa carreras).
  4. Si la pasarela activa ya es esta instalación → devolver sin cambios.
  5. Cerrar la activa (`end_reason='replaced'`), insertar nueva con `installation_id = p.installationId`. La unique parcial protege contra dos activas.
  6. Audita `gateway.set`.
- `closeForInstallations`: actualiza `ended_at`/`end_reason` de pasarelas activas de esas instalaciones. Se llama desde `InstallationsService` (revocación y `replaced`), `AccessService.revokeAccess` (si la relación era `user`) y `EnrollmentsService` (`replace_user`).

### `ContactsService`
```typescript
interface ContactView { id: string; displayName: string; phoneE164: string; priority: 1 | 2 | null; linkedAccountId: string | null; version: number }
interface ContactListView { contactsVersion: number; items: ContactView[] }

class ContactsService {
  list(p: Principal, profileId: string): Promise<ContactListView>
  create(p: Principal, profileId: string, input: CreateContactDto): Promise<ContactListView>
  replaceOrder(p: Principal, profileId: string, input: UpdateContactsDto): Promise<ContactListView>
  remove(p: Principal, profileId: string, contactId: string, expectedContactsVersion: number): Promise<ContactListView>
}
```
- Todas: `asAccount` + `requireAccess`; luego `SELECT contacts_version FROM profiles WHERE id=? FOR UPDATE`; si `expectedContactsVersion` (obligatorio en `create`/`replaceOrder`/`remove`) no coincide → `VERSION_CONFLICT` con la lista actual en `details.current`.
- `replaceOrder` (cambio de conjunto atómico, BE-05 §4): en la misma transacción poner `priority = NULL` a todos los contactos activos del perfil y luego aplicar las prioridades del DTO. Validar en el DTO que no hay prioridades repetidas.
- `linkedAccountId`, si viene, debe tener acceso activo `caregiver` al perfil → si no, `VALIDATION_FAILED` `details.field='linkedAccountId'`.
- Teléfono: `parsePhoneNumberFromString(raw, DEFAULT_PHONE_REGION)`; inválido → `VALIDATION_FAILED`.
- `contacts_version += 1` en cada cambio. Audita `contacts.change` con `details.priorities` (IDs y prioridades, teléfonos enmascarados).
- El plan de llamadas (plan 07) copia los contactos activos con prioridad 1 y 2 al iniciar un episodio; editar después no altera ese plan.

### `phone.ts`
```typescript
function normalizePhone(raw: string, region: CountryCode): string | null   // E.164 o null
function maskPhone(e164: string): string                                   // '+507****1234'
```

---

## Endpoints y DTOs

| Método y ruta | Guard extra | Body | Respuesta |
|---------------|-------------|------|-----------|
| `POST /v1/canes/claim` | `@Throttle('secrets')` | `ClaimCaneDto { serial; claimCode; profileId; proximityProof?: string }` | 201 / 200 replay `CaneView` |
| `POST /v1/canes/:id/release` | — | — | 204 |
| `POST /v1/canes/:id/gateway` | `@RequireInstallation()` | — | `CaneView` |
| `GET /v1/profiles/:id/canes` | — | — | `CaneView[]` |
| `GET /v1/profiles/:id/contacts` | — | — | `ContactListView` |
| `POST /v1/profiles/:id/contacts` | — | `CreateContactDto { displayName; phone; priority?: 1\|2; linkedAccountId?; expectedContactsVersion }` | 201 `ContactListView` |
| `PATCH /v1/profiles/:id/contacts` | — | `UpdateContactsDto { expectedContactsVersion; items: Array<{ id; displayName?; phone?; priority: 1\|2\|null }> }` | `ContactListView` |
| `DELETE /v1/profiles/:id/contacts/:contactId` | — | query `expectedContactsVersion` | `ContactListView` |

---

## Dependencias

| Paquete | Versión | Comando |
|---------|---------|---------|
| `libphonenumber-js` | ^1 | `pnpm add libphonenumber-js` |
| `tsx` (dev, para scripts) | ^4 | `pnpm add -D tsx` |

---

## Edge cases y manejo de errores

- **Reclamar por serie sin código o con código incorrecto** → `NOT_FOUND`, sin crear asignación (T05).
- **Bastón ya asignado a otro perfil** → `INCOMPATIBLE_STATE`; la persona nueva no hereda eventos ni ubicación (los eventos se atribuyen por asignación, plan 05).
- **Dos teléfonos designándose pasarela a la vez** → `FOR UPDATE` sobre la asignación + unique parcial → uno gana, el otro reemplaza después de forma explícita; nunca dos activas.
- **Cuidador intenta ser pasarela** → `FORBIDDEN_ACTION`.
- **Instalación revocada / teléfono perdido** → su pasarela se cierra en la misma transacción de la revocación.
- **Dos ediciones simultáneas de contactos** → la segunda recibe `VERSION_CONFLICT` con la lista vigente.
- **Prioridades repetidas en el DTO** → `VALIDATION_FAILED`.
- **Cero o un contacto con prioridad** → se permite guardar; el paso derivado `contacts` de `GET /v1/onboarding` se devuelve `blocked` con `reason='missing_priority_contacts'` (valor solo de la vista derivada, no se guarda en `onboarding_steps`). La política de llamadas con menos de dos contactos es PD-04 (plan 07).

---

## Orden de implementación

1. Migración `...000500`; `pnpm db:reset && pnpm db:sync`.
2. `scripts/register-cane.ts` + script `cane:register` en `package.json`.
3. `phone.ts` + unit tests (formato panameño local, internacional, inválido, máscara).
4. `CanesService` (`claim`, `release`, `listForProfile`) + controller.
5. `GatewaysService` + endpoint; integrar `closeForInstallations` en instalaciones, accesos e incorporación.
6. `ContactsService` + controller.
7. Actualizar `OnboardingProgressService` (`cane`, `gateway`, `contacts`).
8. Tests de integración.

---

## Criterios de aceptación

- [ ] T05: `POST /v1/canes/claim` con serie válida y código incorrecto → 404 y sin asignación; con código correcto → asignación creada; repetir → 200 replay.
- [ ] Reclamar desde otro perfil mientras está asignado → 409 `assigned_elsewhere`; tras `release` desde el primer perfil → se puede reclamar; el primer perfil ya no ve el bastón.
- [ ] `setGateway` desde instalación con relación `caregiver` → 403; desde la del usuario → 200; desde una segunda instalación del usuario → la anterior queda `ended_at` con `replaced`; nunca hay dos pasarelas activas (consulta directa en test).
- [ ] Revocar la instalación pasarela → la pasarela queda cerrada con `installation_revoked`.
- [ ] Contactos: crear 2 con prioridades 1 y 2; intercambiar con un solo `PATCH` → OK sin violar la unique; `PATCH` con versión antigua → 409 con lista actual.
- [ ] `linkedAccountId` de una cuenta sin acceso al perfil → 400.
- [ ] Logs y `audit_log` no contienen teléfonos completos.
- [ ] `pnpm lint`, `pnpm test`, `pnpm test:int` en verde.
