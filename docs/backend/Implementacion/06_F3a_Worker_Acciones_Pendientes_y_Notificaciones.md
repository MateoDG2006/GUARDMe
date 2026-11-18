# Spec 06 (F3a): Worker, relay de acciones pendientes, pg-boss y notificaciones push

> **Para:** Cursor AI — Rol: Developer
> **Autor del plan:** Claude (Tech Lead)
> **Stack:** NestJS 11 (application context) · pg-boss · firebase-admin (FCM) · Prisma 6
> **Fecha:** 14 de noviembre de 2026
> **Docs de origen:** Propuesta §8.3, §13; BE-02 §6; BE-07 §2–6; BE-09 §8–10
> **Prerrequisito:** planes 01–05 en verde

---

## Instrucciones para Cursor

No tomes decisiones de arquitectura por tu cuenta. Implementa este plan exactamente como está descrito.
Si algo no está especificado, pregunta antes de asumir.
Contexto a cargar: `@docs/backend/Implementacion/00_Indice_Convenciones_y_Reglas_Cursor.md` `@backend/src/worker.module.ts` `@backend/src/modules/pending-actions/pending-actions.service.ts` `@backend/src/modules/incidents/incidents.service.ts` `@docs/backend/Desglose/07_Notificaciones_Tareas_Recordatorios_y_Seguimientos.md`

---

## Objetivo

Dar vida al proceso worker. Las filas de `guardme.pending_actions` (escritas en la misma transacción que el cambio de dominio) son el **registro duradero**; un **relay** las toma cuando vencen y las publica en **pg-boss**, que las reparte a los manejadores. Cada manejador vuelve a comprobar el estado actual del recurso y es idempotente (pg-boss entrega *al menos una vez*). Se implementa el primer efecto externo: **notificaciones push** con modelo de *notificación lógica* por destinatario y *entregas* por instalación, separando aceptación de FCM, recepción, apertura y atención. FCM es real detrás de `PUSH_PROVIDER=fcm`; por defecto se usa un adaptador falso. Reiniciar el worker no pierde trabajo.

---

## Archivos

| Acción | Ruta (`backend/`) | Descripción |
|--------|-------------------|-------------|
| CREAR | `supabase/migrations/20261114000700_notifications.sql` | `notifications`, `notification_deliveries`, grants, RLS |
| MODIFICAR | `prisma/schema.prisma` | `pnpm db:sync` |
| CREAR | `scripts/pgboss-install.ts` | Instala/actualiza el esquema `pgboss` con el rol de migraciones y concede DML a `guardme_worker` |
| CREAR | `src/infra/queue/queue.module.ts`, `pgboss.provider.ts` | Instancia de pg-boss del worker (`migrate: false`) |
| CREAR | `src/modules/pending-actions/action-handler.ts` | Interfaz `ActionHandler` y token `ACTION_HANDLERS` |
| CREAR | `src/modules/pending-actions/relay.service.ts` | Bucle relay: reclama vencidas y publica en pg-boss |
| CREAR | `src/modules/pending-actions/dispatcher.service.ts` | Suscribe colas pg-boss y ejecuta el manejador; aplica resultado |
| CREAR | `src/modules/pending-actions/maintenance.service.ts` | Tareas programadas de limpieza |
| CREAR | `src/infra/push/push.port.ts`, `fake-push.adapter.ts`, `fcm-push.adapter.ts`, `push.module.ts` | Puerto y adaptadores |
| CREAR | `src/modules/notifications/notifications.module.ts` | |
| CREAR | `src/modules/notifications/notification-texts.ts` | Textos breves por tipo (sin ubicación ni medicación) |
| CREAR | `src/modules/notifications/notifications.service.ts` | `createForRecipients(tx, …)`, consultas y acuses |
| CREAR | `src/modules/notifications/notifications.controller.ts` | `GET /v1/notifications`, `POST /v1/notifications/:id/acknowledgements` |
| CREAR | `src/modules/notifications/handlers/notify-incident.handler.ts` | `NOTIFY_INCIDENT`, `NOTIFY_INCIDENT_UPDATE` |
| CREAR | `src/modules/notifications/handlers/send-notification.handler.ts` | `SEND_NOTIFICATION` |
| MODIFICAR | `src/worker.module.ts` | `QueueModule`, `PushModule`, handlers, relay, dispatcher, maintenance |
| MODIFICAR | `src/worker.main.ts` | Arranque/parada ordenada del relay y pg-boss |
| MODIFICAR | `src/modules/incidents/incidents.service.ts` | `getDetail` incluye resumen de evidencias de notificación |
| CREAR | `test/helpers/worker-harness.ts` | Levanta `WorkerModule` con `FakePushAdapter` y `FakeClock`; `drain()` ejecuta relay+dispatch hasta vaciar |
| CREAR | `test/worker-notifications.int-spec.ts` | T27, T29, revocación, token inválido |

---

## Modelo de datos (migración `20261114000700_notifications.sql`)

### `guardme.notifications` (aviso lógico, uno por destinatario)
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK | | |
| `type` | text not null CHECK in (`incident_fall`,`incident_manual`,`incident_delayed`,`incident_update`,`postpone_reminder`,`postpone_collective`,`followup_question`,`reminder_occurrence`) | |
| `profile_id` uuid not null FK | | |
| `recipient_account_id` uuid not null FK | | |
| `resource_type` text not null · `resource_id` uuid not null · `resource_version` int not null | | |
| `dedupe_key` | text not null **unique** | p. ej. `incident:<id>:activated:<accountId>` |
| `status` | text not null default `'pending'` CHECK in (`pending`,`dispatched`,`no_destination`,`expired`,`discarded`) | Estado lógico, independiente de cada entrega |
| `priority` | text not null CHECK in (`urgent`,`attention`,`agenda`,`operational`) | BE-07 §5 |
| `expires_at` | timestamptz not null | |
| `created_at` | timestamptz default now() | |

Índice `(recipient_account_id, created_at DESC, id)`.

### `guardme.notification_deliveries` (una por instalación)
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `notification_id` FK · `installation_id` FK | | unique `(notification_id, installation_id)` |
| `channel` | text not null default `'fcm'` CHECK in (`fcm`,`fake`) | |
| `provider_ref` | text null | message id de FCM |
| `status` | text not null CHECK in (`pending`,`accepted`,`failed`,`token_invalid`) | |
| `accepted_at` · `received_at` · `opened_at` | timestamptz null | Evidencias separadas (BE-R24) |
| `attempts` int default 0 · `error_code` text null | | |

### Grants y RLS
| Tabla | `guardme_api` | `guardme_worker` |
|-------|---------------|------------------|
| `notifications` | SELECT | SELECT, INSERT, UPDATE(`status`) |
| `notification_deliveries` | SELECT, UPDATE(`received_at`,`opened_at`) | SELECT, INSERT, UPDATE |

Políticas `guardme_api`:
- `notifications` SELECT: `USING (guardme.has_profile_access(profile_id))`. Cualquier miembro del perfil ve las evidencias de los avisos de ese perfil (detalle de incidencia); un acceso retirado deja de verlas. `GET /v1/notifications` filtra además por `recipient_account_id = principal.accountId` en la consulta.
- `notification_deliveries` SELECT: `USING (EXISTS (SELECT 1 FROM guardme.notifications n WHERE n.id = notification_id AND guardme.has_profile_access(n.profile_id)))`.
- `notification_deliveries` UPDATE: `USING (installation_id = guardme.ctx_installation_id() AND EXISTS (SELECT 1 FROM guardme.notifications n WHERE n.id = notification_id AND n.recipient_account_id = guardme.ctx_account_id()))` — solo el destinatario, desde su instalación, acusa.

---

## pg-boss

- Esquema técnico `pgboss`, **no** expuesto en `config.toml` (`[api] schemas` no lo incluye).
- `scripts/pgboss-install.ts` (`pnpm queue:install`): `new PgBoss({ connectionString: DATABASE_URL_MIGRATIONS, schema: 'pgboss' })` → `start()` (crea/migra) → `stop()`. Luego `GRANT USAGE ON SCHEMA pgboss`, `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES`, `USAGE ON ALL SEQUENCES`, `EXECUTE ON ALL FUNCTIONS` a `guardme_worker`. Se ejecuta tras `db:reset` (añadir al script `db:reset`) y en cada despliegue antes del worker.
- Worker: `new PgBoss({ connectionString: DATABASE_URL_WORKER, schema: 'pgboss', migrate: false, supervise: true, schedule: true })`. Si la versión instalada no admite `migrate: false`, **detenerse y preguntar** (BE-04 §11: el worker no ejecuta DDL).
- Una cola por `PendingActionType` (`createQueue` al arrancar, si la versión lo requiere). Opciones de envío: `{ retryLimit: 0 }` — los reintentos los gobierna `pending_actions`, no pg-boss, para tener un único contador.
- Concurrencia por cola: `WORKER_CONCURRENCY` (default 4). Colas de llamadas (plan 07) con concurrencia 1.

---

## Contratos de funciones

### `ActionHandler`
```typescript
// src/modules/pending-actions/action-handler.ts
interface PendingActionRow { id: string; type: PendingActionType; resourceType: string; resourceId: string; payload: Record<string, unknown>; attempts: number; maxAttempts: number; runAt: Date }

type HandlerResult =
  | { outcome: 'done' }
  | { outcome: 'discarded'; reason: string }          // estado obsoleto / destinatario revocado
  | { outcome: 'retry'; error: string; retryInSec?: number }
  | { outcome: 'failed'; error: string }              // no recuperable

interface ActionHandler {
  readonly types: PendingActionType[]
  handle(action: PendingActionRow): Promise<HandlerResult>
}
const ACTION_HANDLERS = Symbol('ACTION_HANDLERS')    // multi-provider: array de ActionHandler
```
Reglas para todo manejador (este plan y los siguientes):
1. Releer el recurso con `asWorker` y comprobar estado/versión esperada (`payload.expectedVersion`, `payload.expectedStatus`). Si ya no aplica → `discarded`.
2. Ningún efecto externo dentro de una transacción de BD. Patrón: tx corta (verificar + marcar intención) → llamada externa → tx corta (registrar resultado).
3. Repetir el manejador no repite el efecto: usar claves únicas (`dedupe_key`, `unique(notification_id, installation_id)`, `provider_ref`).

### `RelayService`
```typescript
class RelayService implements OnApplicationBootstrap, OnApplicationShutdown {
  tick(): Promise<number>      // público para tests; devuelve cuántas publicó
}
```
- Cada `RELAY_INTERVAL_MS` (default 1000, `setTimeout` encadenado, nunca solapado):
  1. `asWorker`: `SELECT ... FROM guardme.pending_actions WHERE (status='scheduled' AND run_at <= now()) OR (status IN ('dispatched','running') AND lease_until < now()) ORDER BY run_at LIMIT 100 FOR UPDATE SKIP LOCKED`; `UPDATE` a `dispatched`, `lease_until = now + ACTION_LEASE_SEC` (default 120).
  2. Tras confirmar, `boss.send(type, { actionId })` por cada fila. Si `send` falla, la fila queda `dispatched` y el lease vencido la recupera (sin pérdida).
- Al arrancar, el primer `tick` recupera lo vencido durante la caída (T29).
- Usa `now()` de PostgreSQL para vencimientos (no el reloj del proceso), salvo en tests donde `FakeClock` se pasa como parámetro SQL `$now`. Decisión: **todas** las consultas de vencimiento reciben `ClockPort.now()` como parámetro, para que los tests controlen el tiempo.

### `DispatcherService`
```typescript
class DispatcherService implements OnApplicationBootstrap {
  runOne(actionId: string): Promise<void>     // público para tests
}
```
1. `asWorker`: `UPDATE pending_actions SET status='running', attempts=attempts+1, lease_until=now+lease WHERE id=? AND status='dispatched' RETURNING *`. Sin fila → otro proceso la tiene o ya terminó → salir.
2. Buscar manejador por `type` (sin manejador → `failed` `no_handler`).
3. Ejecutar con timeout `ACTION_TIMEOUT_SEC` (default 60).
4. Aplicar resultado: `done`/`discarded` → estado final + `last_error = reason`; `retry` → si `attempts < max_attempts`: `scheduled`, `run_at = now + (retryInSec ?? min(5 * 2^attempts, 300))`; si no → `failed`. Excepción no controlada → tratar como `retry`.
5. `failed` → log `error` con `actionId`, `type`, `resourceId`, `correlationId` (cola de errores visible, BE-07 §4).

### `MaintenanceService` (pg-boss `schedule`)
| Nombre | Cron | Acción |
|--------|------|--------|
| `cleanup-event-receipts` | `0 3 * * *` | Borrar `event_receipts` con `occurred_at` < now − `PD10_EVENT_RECEIPT_RETENTION_DAYS` |
| `cleanup-idempotency-keys` | `15 3 * * *` | Borrar `idempotency_keys` > `IDEMPOTENCY_KEY_RETENTION_DAYS` (default 7) |
| `expire-notifications` | `*/5 * * * *` | `pending`/`dispatched` con `expires_at < now` → `expired` |

### `PushPort`
```typescript
// src/infra/push/push.port.ts
interface PushMessage {
  token: string
  notificationId: string
  type: NotificationType
  priority: 'high' | 'normal'
  ttlSeconds: number
  collapseKey: string                 // resource_id: Android actualiza en vez de duplicar
  title: string
  body: string
  data: Record<string, string>        // notificationId, type, resourceType, resourceId, resourceVersion, profileId
}
type PushResult =
  | { status: 'accepted'; providerRef: string }
  | { status: 'token_invalid' }
  | { status: 'retryable'; error: string }
  | { status: 'failed'; error: string }

abstract class PushPort { abstract send(msg: PushMessage): Promise<PushResult> }
```
- `FakePushAdapter`: guarda mensajes en memoria (`sent: PushMessage[]`), permite programar respuestas (`failNext(status)`), `providerRef = 'fake-' + uuid`. Solo se registra si `PUSH_PROVIDER=fake`. En `NODE_ENV=production` con `fake` → el worker no arranca.
- `FcmPushAdapter`: `firebase-admin` `initializeApp({ credential: cert(JSON.parse(FCM_SERVICE_ACCOUNT_JSON)) })`; `messaging().send({ token, notification: { title, body }, data, android: { priority, ttl: ttlSeconds * 1000, collapseKey, notification: { tag: collapseKey } } })`. Mapear errores: `messaging/registration-token-not-registered`, `messaging/invalid-registration-token`, `messaging/invalid-argument` (token) → `token_invalid`; `messaging/unavailable`, `messaging/internal-error`, `messaging/quota-exceeded` → `retryable`; resto → `failed`.
- Prioridad: `high` solo para `urgent`; el resto `normal` (BE-07 §5: no forzar urgente a toda sincronización).

### `NotificationsService`
```typescript
class NotificationsService {
  createForRecipients(tx: Tx, input: {
    type: NotificationType; profileId: string; recipientAccountIds: string[]
    resourceType: string; resourceId: string; resourceVersion: number
    dedupeScope: string                 // p. ej. 'incident:<id>:activated'
    priority: NotificationPriority; expiresAt: Date
  }): Promise<string[]>                 // IDs creados (ON CONFLICT dedupe_key DO NOTHING) + encola SEND_NOTIFICATION por cada uno
  listMine(p: Principal, q: { cursor?: string; limit?: number }): Promise<{ items: NotificationView[]; nextCursor: string | null }>
  acknowledge(p: Principal, notificationId: string, kind: 'received' | 'opened'): Promise<DeliveryEvidenceView>
  evidenceForResource(tx: Tx, resourceType: string, resourceId: string): Promise<RecipientEvidenceView[]>
}
interface RecipientEvidenceView { recipientAccountId: string; displayName: string; status: string; acceptedAt: string | null; receivedAt: string | null; openedAt: string | null }
```
- `acknowledge` (`asAccount`, `@RequireInstallation`): solo la entrega `(notificationId, p.installationId)` del destinatario. Sin entrega → `NOT_FOUND`. `received_at`/`opened_at` se fijan solo si son `NULL` (idempotente). `opened` implica `received` si faltaba. **No** cambia el estado de la incidencia (abrir ≠ atender).

### Manejadores
`NotifyIncidentHandler` (`NOTIFY_INCIDENT`, `NOTIFY_INCIDENT_UPDATE`):
1. Leer incidencia. `NOTIFY_INCIDENT` y la incidencia ya `closed_assisted` → `discarded`.
2. Destinatarios según `PD05_FALL_PUSH_RECIPIENTS=all_caregivers`: cuentas con acceso activo `caregiver` al perfil. `// PD-05 pendiente`.
3. Tipo: `incident_fall` / `incident_manual` / `incident_delayed` (según `origin` e `is_delayed`); para `_UPDATE` → `incident_update`.
4. `priority='urgent'` salvo `incident_delayed` e `incident_update` (`attention`). `expiresAt = now + INCIDENT_NOTIFICATION_TTL_SEC` (default 3600).
5. `createForRecipients(...)` → `done`. Sin destinatarios → evento de incidencia `notification_scheduled` con `context.recipients=0` y `done`.

`SendNotificationHandler` (`SEND_NOTIFICATION`):
1. Leer notificación; `expired`/`discarded` → `discarded`. `expires_at < now` → marcar `expired`, `discarded`.
2. Verificar que el destinatario conserva acceso activo al perfil; si no → `discarded` + notificación `discarded` (T28).
3. Instalaciones activas del destinatario con `push_token`. Ninguna → notificación `no_destination`, `done`.
4. Por cada instalación: `INSERT delivery ... ON CONFLICT DO NOTHING`; saltar las ya `accepted`. `PushPort.send`. Registrar resultado. `token_invalid` → `installations.push_token = NULL` y entrega `token_invalid`.
5. Si alguna `retryable` → `retry`. Si no → notificación `dispatched`, `done`.

---

## Endpoints y DTOs

| Método y ruta | Guard | Body / Query | Respuesta |
|---------------|-------|--------------|-----------|
| `GET /v1/notifications` | — | `cursor?`, `limit?` | `{ items: NotificationView[]; nextCursor }` |
| `POST /v1/notifications/:id/acknowledgements` | `@RequireInstallation()` | `AcknowledgeDto { kind: 'received' \| 'opened' }` | `DeliveryEvidenceView { acceptedAt, receivedAt, openedAt }` |

```typescript
interface NotificationView { id: string; type: NotificationType; profileId: string; resourceType: string; resourceId: string; resourceVersion: number; status: string; createdAt: string; expiresAt: string; myDelivery: { acceptedAt: string | null; receivedAt: string | null; openedAt: string | null } | null }
```
`IncidentDetailView` gana `notifications: RecipientEvidenceView[]`.

---

## Dependencias

| Paquete | Versión | Comando |
|---------|---------|---------|
| `pg-boss` | ^10 | `pnpm add pg-boss` |
| `firebase-admin` | ^13 | `pnpm add firebase-admin` |

Variables nuevas: `PUSH_PROVIDER`, `FCM_SERVICE_ACCOUNT_JSON` (solo si `fcm`), `RELAY_INTERVAL_MS`, `ACTION_LEASE_SEC`, `ACTION_TIMEOUT_SEC`, `WORKER_CONCURRENCY`, `INCIDENT_NOTIFICATION_TTL_SEC`, `IDEMPOTENCY_KEY_RETENTION_DAYS`.

---

## Edge cases y manejo de errores

- **Worker muere tras reclamar** → lease vence → relay re-despacha → manejador idempotente (T29).
- **pg-boss entrega dos veces el mismo job** → `UPDATE ... WHERE status='dispatched'` deja pasar uno; aun si pasaran dos, `unique(notification_id, installation_id)` y la comprobación `accepted` evitan doble push.
- **FCM caído** → entregas `retryable`, notificación sigue `pending`; la incidencia ya está persistida (modo degradado, BE-09 §10).
- **FCM acepta pero el teléfono nunca acusa** → `acceptedAt` con `receivedAt = null`; el detalle no muestra “leído” ni “atendido” (T27).
- **Cuidador retirado entre creación y envío** → `discarded`; no recibe el aviso (T28).
- **Token inválido** → se borra el token de esa instalación; Android lo vuelve a registrar con `POST /v1/installations`.
- **Notificación tardía** → `expires_at` vencido → `expired`; Android, al abrir una antigua, consulta el estado vigente (`GET /v1/incidents/:id`).
- **Reintentos agotados** → `failed` + log de error; nunca bucle infinito.

---

## Orden de implementación

1. Migración `...000700`; `pnpm db:reset && pnpm db:sync`.
2. `scripts/pgboss-install.ts` y encadenarlo en `db:reset`.
3. `PushPort` + `FakePushAdapter` + `FcmPushAdapter` (unit test del mapeo de errores con errores simulados).
4. `QueueModule` (pg-boss del worker).
5. `ActionHandler`, `DispatcherService`, `RelayService` (unit tests del cálculo de backoff y del resultado).
6. `NotificationsService` + `notification-texts.ts`.
7. `NotifyIncidentHandler`, `SendNotificationHandler`.
8. `MaintenanceService`.
9. `NotificationsController` (acuses, listado) en la API.
10. `IncidentsService.getDetail` con evidencias.
11. `worker.main.ts`: orden de parada = detener relay → `boss.stop({ graceful: true })` → cerrar Prisma.
12. `test/helpers/worker-harness.ts` + tests.

---

## Criterios de aceptación

- [ ] Con API y worker levantados y `PUSH_PROVIDER=fake`: activar caída → el `FakePushAdapter` recibe un mensaje por instalación de cada cuidador con prioridad `high` y `collapseKey = incidentId`.
- [ ] T27: tras aceptación de FCM (fake) sin acuse → `GET /v1/incidents/:id` muestra `acceptedAt` y `receivedAt: null`, `openedAt: null`; ningún campo sugiere “leído” o “atendido”.
- [ ] Acuse `received` y luego `opened` desde la instalación destinataria → evidencias fijadas; acuse desde otra instalación → 404.
- [ ] T29: crear incidencia con el worker detenido → arrancar worker → la notificación se envía una sola vez.
- [ ] Forzar lease vencido (FakeClock) con la acción en `running` → se re-despacha y el push no se duplica.
- [ ] Retirar al cuidador antes de `drain()` → su notificación queda `discarded` y no hay push.
- [ ] `failNext('token_invalid')` → `installations.push_token` pasa a `NULL`.
- [ ] `failNext('retryable')` 5 veces → acción `failed` y log de error; nunca más de `max_attempts` intentos.
- [ ] `guardme_worker` no puede ejecutar `CREATE TABLE` en `pgboss` (test con el rol).
- [ ] `pnpm lint`, `pnpm test`, `pnpm test:int` en verde.
