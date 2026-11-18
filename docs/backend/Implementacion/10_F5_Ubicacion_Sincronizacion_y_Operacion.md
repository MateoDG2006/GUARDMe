# Spec 10 (F5): Ubicación con consentimiento, sincronización incremental y operación del piloto

> **Para:** Cursor AI — Rol: Developer
> **Autor del plan:** Claude (Tech Lead)
> **Stack:** NestJS 11 · Prisma 6 · @nestjs/swagger · pg-boss · FCM (data-only)
> **Fecha:** 14 de noviembre de 2026
> **Docs de origen:** Propuesta §14, §16–17; BE-03 §10–11; BE-05 §6, §11; BE-08 §9, §11; BE-09 completo; BE-10 §6, §11
> **Prerrequisito:** planes 01–09 en verde

---

## Instrucciones para Cursor

No tomes decisiones de arquitectura por tu cuenta. Implementa este plan exactamente como está descrito.
Si algo no está especificado, pregunta antes de asumir.
Contexto a cargar: `@docs/backend/Implementacion/00_Indice_Convenciones_y_Reglas_Cursor.md` `@backend/src/modules/profiles/access.service.ts` `@backend/src/modules/incidents/incidents.service.ts` `@backend/src/infra/push/push.port.ts` `@backend/src/modules/pending-actions/maintenance.service.ts` `@docs/backend/Desglose/09_Seguridad_Privacidad_Despliegue_y_Operacion.md`

---

## Objetivo

Cerrar la primera versión del backend con tres bloques:
1. **Ubicación opcional**: consentimiento registrado (independiente del permiso de Android), autorizaciones de lectura por cuidador, **última posición** con precisión y antigüedad, sin historial de recorridos. Se puede desactivar entera con `LOCATION_ENABLED=false` y entonces se declara como no disponible.
2. **Sincronización**: `GET /v1/changes` con cursor opaco que nunca pierde cambios, siempre filtrado por accesos vigentes, más un push silencioso (`sync`) que avisa a los teléfonos de que hay cambios.
3. **Operación**: salud con modo degradado, heartbeat del worker, límites por categoría (la telemetría no ahoga una incidencia), OpenAPI exportado y el informe de aceptación T01–T38.

---

## Archivos

| Acción | Ruta (`backend/`) | Descripción |
|--------|-------------------|-------------|
| CREAR | `supabase/migrations/20261114001100_location.sql` | `location_consents`, `location_read_grants`, `location_latest`, RLS |
| CREAR | `supabase/migrations/20261114001200_change_log.sql` | `change_log`, función y triggers `log_change` |
| CREAR | `supabase/migrations/20261114001300_worker_heartbeats.sql` | `worker_heartbeats` |
| MODIFICAR | `prisma/schema.prisma` | `pnpm db:sync` |
| CREAR | `src/modules/location/location.module.ts`, `location.controller.ts`, `location.service.ts` | Consentimiento, publicación, lectura, solicitud de refresco |
| CREAR | `src/modules/sync/sync.module.ts`, `sync.controller.ts`, `sync.service.ts` | `GET /v1/changes` |
| CREAR | `src/modules/sync/sync-signal.service.ts` | `requestSyncSignal(tx, profileId, kind)` |
| CREAR | `src/modules/sync/handlers/sync-signal.handler.ts` | `SYNC_SIGNAL` → push data-only |
| MODIFICAR | `src/infra/push/push.port.ts`, `fcm-push.adapter.ts`, `fake-push.adapter.ts` | `title`/`body` opcionales → mensaje data-only |
| MODIFICAR | `src/modules/profiles/access.service.ts` | Al revocar acceso → revocar `location_read_grants` de esa cuenta + `SYNC_SIGNAL` |
| MODIFICAR | `src/modules/incidents/incidents.service.ts` | `ActivateIncidentDto.location?` → `LocationService.publishInTx` si hay consentimiento |
| MODIFICAR | `src/modules/reminders/reminders.service.ts`, `src/modules/contacts/contacts.service.ts`, `src/modules/onboarding/invitations.service.ts` | Llamar `requestSyncSignal` en cambios compartidos |
| MODIFICAR | `src/modules/identity/capabilities.service.ts` | `location` según `LOCATION_ENABLED` |
| MODIFICAR | `src/modules/onboarding/onboarding-progress.service.ts` | Paso `location_decision` derivado |
| CREAR | `src/modules/health/worker-heartbeat.service.ts` | Latido del worker cada 15 s |
| MODIFICAR | `src/modules/health/health.controller.ts` | `ready` con BD, latido, cola y detalle protegido |
| MODIFICAR | `src/app.module.ts` | Throttler por categorías; Swagger en no producción |
| CREAR | `scripts/export-openapi.ts` | Genera `openapi/guardme-v1.json` |
| CREAR | `scripts/acceptance-report.ts` | Ejecuta Jest con `--json` y produce `acceptance-report.md` T01–T38 |
| CREAR | `test/location.int-spec.ts`, `test/sync.int-spec.ts`, `test/ops.int-spec.ts` | T25, T28, T26 (backend) |

---

## Modelo de datos

### `20261114001100_location.sql`

`guardme.location_consents`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `profile_id` FK | | unique parcial `(profile_id) WHERE revoked_at IS NULL` |
| `granted_by_account_id` uuid FK · `granted_at` timestamptz default now() | | Quién autorizó y cuándo |
| `revoked_at` timestamptz null · `revoked_by_account_id` uuid null | | |
| `version` int default 1 | | trigger |

`guardme.location_read_grants`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `consent_id` FK · `account_id` FK | | unique parcial `(consent_id, account_id) WHERE revoked_at IS NULL` |
| `granted_at` · `revoked_at` timestamptz | | |

`guardme.location_latest`
| Columna | Tipo | Regla |
|---------|------|-------|
| `profile_id` uuid PK FK | | Una posición vigente; sin histórico |
| `lat` double precision CHECK (-90..90) · `lng` double precision CHECK (-180..180) | | Nunca 0,0 por defecto |
| `accuracy_m` real not null CHECK (> 0) | | |
| `captured_at` timestamptz not null · `received_at` timestamptz not null | | |
| `installation_id` uuid not null | | Fuente |

Grants `guardme_api`: SELECT/INSERT/UPDATE en las tres; DELETE en `location_latest`. Políticas:
- `location_consents`, `location_latest`: `has_profile_access(profile_id)` para escribir; **lectura de `location_latest`**: `USING (guardme.profile_relation(profile_id) = 'user' OR guardme.can_read_location(profile_id))`.
- Función `guardme.can_read_location(p_profile uuid)` SECURITY DEFINER: existe consentimiento sin revocar para el perfil **y** grant sin revocar para `ctx_account_id()` **y** acceso activo. RLS aplica la regla aunque el servicio fallara (T25).
- `location_read_grants`: vía `location_consents`.

### `20261114001200_change_log.sql`

`guardme.change_log`
| Columna | Tipo | Regla |
|---------|------|-------|
| `seq` bigserial PK | | |
| `txid` xid8 not null default `pg_current_xact_id()` | | Para cursor seguro |
| `profile_id` uuid not null | | |
| `resource_type` text not null · `resource_id` uuid not null | | |
| `op` text not null CHECK in (`upsert`,`delete`) | | Borrado lógico → `delete` |
| `version` int null · `at` timestamptz default now() | | |

Índice `(txid, seq)`; índice `(profile_id, txid, seq)`.

Función trigger `guardme.log_change()` (SECURITY DEFINER, `search_path=''`), `AFTER INSERT OR UPDATE`, resuelve `profile_id` según `TG_TABLE_NAME`:
| Tabla | `resource_type` | `profile_id` | `op = 'delete'` cuando |
|-------|-----------------|--------------|------------------------|
| `profiles` | `profile` | `id` | `status='archived'` |
| `profile_access` | `membership` | `profile_id` | `status='revoked'` |
| `contacts` | `contact` | `profile_id` | `status='removed'` |
| `cane_assignments` | `cane` | `profile_id` | `ended_at IS NOT NULL` |
| `gateways` | `gateway` | vía `cane_assignments` | `ended_at IS NOT NULL` |
| `incidents` | `incident` | `profile_id` | nunca |
| `reminders` | `reminder` | `profile_id` | `status='inactive'` |
| `reminder_occurrences` | `occurrence` | vía `reminders` | `status='canceled'` |
| `followups` | `followup` | `profile_id` | nunca |
| `location_consents` | `location_consent` | `profile_id` | `revoked_at IS NOT NULL` |

Grants: `SELECT` en `change_log` a `guardme_api` con política `USING (guardme.has_profile_access(profile_id))`; `DELETE` a `guardme_worker` (limpieza).

### `20261114001300_worker_heartbeats.sql`
`guardme.worker_heartbeats(worker_id text PK, started_at timestamptz, last_beat_at timestamptz, version text)`. `guardme_worker` INSERT/UPDATE; `guardme_api` SELECT (`USING (true)`, no contiene datos personales).

---

## Contratos de funciones

### `LocationService`
```typescript
interface LocationView { available: true; lat: number; lng: number; accuracyM: number; capturedAt: string; receivedAt: string; ageSeconds: number; source: 'phone' }
type LocationUnavailable = { available: false; reason: 'no_data' | 'not_enabled' }

class LocationService {
  setConsent(p: Principal, profileId: string, input: LocationConsentDto): Promise<LocationConsentView>
  getConsent(p: Principal, profileId: string): Promise<LocationConsentView>
  publish(p: Principal, profileId: string, input: PublishLocationDto): Promise<{ applied: boolean }>      // @RequireInstallation
  publishInTx(tx: Tx, p: Principal, profileId: string, input: PublishLocationDto): Promise<{ applied: boolean }>
  getLatest(p: Principal, profileId: string): Promise<LocationView | LocationUnavailable>
  requestRefresh(p: Principal, profileId: string): Promise<{ status: 'requested' }>
}
```
- Todas: `LOCATION_ENABLED=false` → `CAPABILITY_NOT_ENABLED` (y `getLatest` → `{ available: false, reason: 'not_enabled' }`). Nunca coordenadas de demostración.
- `setConsent` (`asAccount` + `requireAccess`): `enabled=true` → si no hay consentimiento vigente se crea; los grants se **reemplazan** por `readers` (cada uno debe tener acceso `caregiver` activo; si no → `VALIDATION_FAILED`). `enabled=false` → revocar consentimiento y grants y **borrar `location_latest`** (minimización). Audita `location.consent`. `SYNC_SIGNAL`. No se activa por defecto en la incorporación.
- `publish`: el principal debe tener relación `user` (la fuente es el teléfono de la persona) → si no `FORBIDDEN_ACTION`. Sin consentimiento vigente → `FORBIDDEN_ACTION` `details.reason='no_consent'` y no se guarda. `captured_at` ≤ existente → `{ applied: false }` (una muestra atrasada no reemplaza una reciente). `captured_at` en el futuro (> now + 60 s) → `VALIDATION_FAILED`.
- `getLatest`: `user` → su propia posición; `caregiver` → requiere `can_read_location` → si no, `FORBIDDEN_ACTION` `details.reason='no_consent'`. Sin fila → `{ available: false, reason: 'no_data' }`. Siempre con `ageSeconds`.
- `requestRefresh`: `caregiver` con permiso de lectura → `SYNC_SIGNAL` `kind='location_refresh'` a las instalaciones `user` del perfil; respuesta `requested` (no garantiza captura, BE-08 §11).
- Logs: nunca `lat`/`lng` (ya en `redact`).

### `SyncService`
```typescript
interface ChangeItem { profileId: string; resourceType: string; resourceId: string; op: 'upsert' | 'delete'; version: number | null }
interface ChangesPage { changes: ChangeItem[]; accessibleProfileIds: string[]; nextCursor: string; hasMore: boolean; resetRequired: boolean }
class SyncService { getChanges(p: Principal, q: { cursor?: string; limit?: number }): Promise<ChangesPage> }
```
- Cursor = base64url de `{ x: txid, s: seq }`. Sin cursor o cursor inválido → `resetRequired: true`, `changes: []`, `nextCursor` = posición actual (Android hace descarga completa por REST y luego sigue incrementalmente).
- Consulta (`asAccount`): `(txid, seq) > (cursor.x, cursor.s) AND txid < pg_snapshot_xmin(pg_current_snapshot())` ordenado por `(txid, seq)`, `LIMIT limit+1` (default 200, máx. 500). La condición de `xmin` garantiza que ninguna transacción todavía abierta pueda confirmar después con una posición ya pasada (no se pierden cambios).
- RLS filtra por accesos **actuales**: un cuidador retirado deja de recibir cambios aunque conserve un cursor antiguo (T28). `accessibleProfileIds` permite a Android purgar perfiles a los que ya no tiene acceso (BE-05 §11).
- Varios cambios del mismo recurso se devuelven tal cual (Android aplica el último por `version`).

### `SyncSignalService` y `SyncSignalHandler`
```typescript
class SyncSignalService {
  requestSyncSignal(tx: Tx, profileId: string, kind: 'changes' | 'location_refresh'): Promise<void>
  // enqueue SYNC_SIGNAL con dedupeKey `sync:<profileId>:<kind>:<epochSegundos div 10>` y runAt now+5s → agrupa ráfagas
}
```
Handler: instalaciones activas con token de las cuentas con acceso activo al perfil (`location_refresh` → solo relación `user`); push **data-only** `{ type: 'sync', kind, profileId }`, prioridad `normal`, TTL 300 s. Sin filas `notifications` (no es un aviso visible). Fallos → `retry` acotado.

### Operación
```typescript
class WorkerHeartbeatService implements OnApplicationBootstrap, OnApplicationShutdown {}   // upsert last_beat_at cada 15 s (worker)

// GET /health/ready (público)
interface ReadyResponse { status: 'ok' | 'degraded' | 'down'; checks: { db: 'up' | 'down'; worker: 'up' | 'stale'; queue: 'ok' | 'backlog'; push: 'ok' | 'failing' } }
// Detalle numérico solo con header `x-health-token: HEALTH_DETAILS_TOKEN`:
interface ReadyDetails { workerLastBeatAgeSec: number; oldestDueActionAgeSec: number; failedActionsLast24h: number; deliveriesFailedLast1h: number; uncertainCallAttempts: number }
```
- `down` solo si la BD no responde (503). `degraded` (200) si: latido > 60 s, acción vencida más antigua > 60 s, o > 20 % entregas fallidas en 1 h. Así la API puede seguir guardando incidencias con FCM caído mientras se ve el modo degradado (BE-09 §9). Umbrales en config, valores provisionales a medir en el piloto.
- Log estructurado `metric.notification_latency_ms` = `delivery.accepted_at - incident.received_at` en `SendNotificationHandler` (sin datos personales).

### Límites por categoría (`ThrottlerModule`)
| Nombre | Clave | Límite | Rutas |
|--------|-------|--------|-------|
| `urgent` | instalación | 60/min | `POST /v1/incidents`, decisiones |
| `telemetry` | instalación | 120/min | `POST /v1/gateway-events`, `POST .../location` |
| `default` | cuenta | 300/min | resto |
| `secrets` | auth user | 5/min, 30/día | (plan 03, sin cambios) |

Cubos separados: agotar `telemetry` no afecta a `urgent`. `// shortcut: almacenamiento en memoria; con >1 instancia de API mover a un almacenamiento compartido (p. ej. tabla en PostgreSQL) antes de escalar.`

### OpenAPI
- `@nestjs/swagger` con `DocumentBuilder` (título “GuardMe API”, versión `v1`, esquema `bearer` + header `X-Installation-Id`). Decorar DTOs con `@ApiProperty` donde class-validator no baste.
- `/docs` solo si `NODE_ENV !== 'production'`.
- `pnpm openapi:export` → `openapi/guardme-v1.json` (se versiona en git; es el contrato para el equipo Android).

### Informe de aceptación
- Convención: cada test de integración que cubre un caso lleva el prefijo `[Txx]` en su nombre.
- `pnpm acceptance:report`: ejecuta `jest -c jest.int.config.ts --json`, cruza con la lista T01–T38 y escribe `acceptance-report.md` con columnas *Caso, Estado (aprobado / fallido / no ejecutado), Tests, Fecha, Commit*.
- Casos que requieren bastón o teléfonos reales se marcan **no ejecutado – requiere hardware/dispositivo**: T04, T06, T07, T24 (parte física), T26 (parte Android). “Pendiente por integración” nunca cuenta como aprobado (BE-10 §6).

---

## Endpoints y DTOs

| Método y ruta | Guard | Body / Query | Respuesta |
|---------------|-------|--------------|-----------|
| `GET /v1/profiles/:id/location-consent` | — | — | `LocationConsentView { enabled; grantedBy; grantedAt; readers: Array<{ accountId; displayName }>; version }` |
| `PUT /v1/profiles/:id/location-consent` | — | `LocationConsentDto { enabled: boolean; readers: string[]; expectedVersion?: number }` | `LocationConsentView` |
| `POST /v1/profiles/:id/location` | `@RequireInstallation()` `@Throttle('telemetry')` | `PublishLocationDto { lat; lng; accuracyM; capturedAt }` | `{ applied }` |
| `GET /v1/profiles/:id/location` | — | — | `LocationView \| LocationUnavailable` |
| `POST /v1/profiles/:id/location/refresh-requests` | — | — | 202 `{ status: 'requested' }` |
| `GET /v1/changes` | — | `cursor?`, `limit?` | `ChangesPage` |
| `GET /health/ready` | `@Public()` | header opcional `x-health-token` | `ReadyResponse` (+ `details`) |

`ActivateIncidentDto` (plan 05) añade `location?: PublishLocationDto`; su ausencia no bloquea la incidencia.

---

## Dependencias

| Paquete | Versión | Comando |
|---------|---------|---------|
| `@nestjs/swagger` | ^11 | `pnpm add @nestjs/swagger` |

Variables nuevas: `LOCATION_ENABLED` (default `true` en local), `HEALTH_DETAILS_TOKEN`, umbrales `HEALTH_*`.

---

## Edge cases y manejo de errores

- **Publicar sin consentimiento** → 403 `no_consent`, nada guardado (T25).
- **Muestra antigua tras una reciente** → `applied: false`; la reciente se conserva (T25).
- **Revocar consentimiento** → `location_latest` borrada, lecturas posteriores 403; Android recibe `sync` y elimina su copia (el servidor no garantiza borrar copias offline).
- **Retirar a un cuidador** → sus grants se revocan en la misma tx; `GET /v1/changes` deja de devolver ese perfil y `accessibleProfileIds` ya no lo incluye (T28).
- **Transacción larga abierta mientras se lee `/v1/changes`** → sus cambios se entregan en la siguiente lectura, nunca se saltan.
- **FCM caído** → `ready` = `degraded`, las incidencias se siguen registrando.
- **Worker detenido** → `worker: 'stale'`, `degraded`.
- **Teléfono sin BLE o sin internet** (T26) → el backend solo muestra antigüedad (`ageSeconds`, `linkState='stale'`); los iconos y la cola local son de Android.

---

## Orden de implementación

1. Migraciones `...001100`, `...001200`, `...001300`; `pnpm db:reset && pnpm db:sync`.
2. `LocationService` + controller + `can_read_location`; hooks en `AccessService` e `IncidentsService`.
3. `PushPort` data-only; `SyncSignalService` + handler; llamadas desde recordatorios, contactos, accesos, invitaciones y consentimiento.
4. `SyncService` + controller (test específico de transacción concurrente abierta).
5. `WorkerHeartbeatService`, `HealthController.ready`.
6. Throttler por categorías.
7. Swagger + `scripts/export-openapi.ts`.
8. `scripts/acceptance-report.ts`; renombrar tests existentes con prefijos `[Txx]`.
9. Tests de integración.

---

## Criterios de aceptación

- [ ] T25: (a) publicar sin consentimiento → 403 y sin fila; (b) con consentimiento → cuidador con grant lee `ageSeconds`; (c) cuidador sin grant → 403; (d) muestra más antigua → `applied:false`; (e) revocar → lectura 403 y fila borrada. Además, con el rol `guardme_api` y contexto del cuidador sin grant, `SELECT` directo a `location_latest` → 0 filas.
- [ ] T28: retirar al cuidador B → con su cursor antiguo `GET /v1/changes` no devuelve cambios del perfil y `accessibleProfileIds` no lo incluye; `GET /v1/profiles/:id/location` → 404.
- [ ] Sincronización: abrir una tx que inserta un contacto sin confirmar, leer `/v1/changes` (no aparece), confirmar, leer de nuevo con el cursor devuelto → aparece.
- [ ] Ráfaga de 20 cambios de agenda en 3 s → un solo push `sync` por instalación.
- [ ] `/health/ready` → `degraded` con el worker detenido > 60 s; `down` (503) con la BD caída; detalles solo con token.
- [ ] Agotar `telemetry` de una instalación → `POST /v1/incidents` desde la misma instalación sigue respondiendo 201.
- [ ] `pnpm openapi:export` genera un JSON válido con todas las rutas `/v1`.
- [ ] `pnpm acceptance:report` produce la tabla con los 38 casos; los de hardware aparecen como “no ejecutado”.
- [ ] `pnpm lint`, `pnpm test`, `pnpm test:int` en verde.

---

## Puerta de piloto (checklist fuera de código, BE-09 §13)

No marcar el backend como listo para piloto hasta tener evidencia de:
- [ ] Proyecto Supabase cloud por entorno (dev / integración / piloto) con Auth, claves y BD separadas; un JWT de dev rechazado en piloto (T31 en cloud).
- [ ] Roles `guardme_api`, `guardme_onboarding`, `guardme_worker`, `guardme_ingest` creados en cloud con contraseñas en gestor de secretos; Data API sin `guardme`; T32/T33/T38 repetidos en cloud con conexiones reales (pooler de Supabase: usuario `rol.<project-ref>`).
- [ ] Worker con conexión directa o modo sesión (pg-boss); API con pooler transaccional verificado (T38).
- [ ] Restauración de copia ensayada y tiempo medido; reconciliación revisada tras restaurar (BE-09 §11).
- [ ] FCM real (`PUSH_PROVIDER=fcm`) probado entre dos teléfonos.
- [ ] PD-01/PD-03 cerradas y adaptador de telefonía real implementado (spec aparte); hasta entonces el producto se presenta sin llamadas automáticas.
- [ ] PD-02 (911): validación específica coordinada o alcance parcial documentado.
- [ ] PD-11: tamaño del piloto para dimensionar límites y umbrales.
