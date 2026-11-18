# Spec 05 (F2): Eventos de pasarela, falsas alarmas, telemetría e incidencias

> **Para:** Cursor AI — Rol: Developer
> **Autor del plan:** Claude (Tech Lead)
> **Stack:** NestJS 11 · Prisma 6 · PostgreSQL de Supabase
> **Fecha:** 14 de noviembre de 2026
> **Docs de origen:** Propuesta §8, §13–14; BE-04 §4–5, §8; BE-05 §4–5, §7–10; BE-06 §2, §5, §11; BE-08 §5, §7–9
> **Prerrequisito:** planes 01–04 en verde

---

## Instrucciones para Cursor

No tomes decisiones de arquitectura por tu cuenta. Implementa este plan exactamente como está descrito.
Si algo no está especificado, pregunta antes de asumir.
Contexto a cargar: `@docs/backend/Implementacion/00_Indice_Convenciones_y_Reglas_Cursor.md` `@backend/src/infra/db/db.service.ts` `@backend/src/modules/pending-actions/pending-actions.service.ts` `@backend/src/modules/devices/gateways.service.ts` `@backend/src/modules/profiles/access.service.ts` `@docs/backend/Desglose/06_Incidencias_Llamadas_Escalamiento_y_Atencion.md`

---

## Objetivo

Recibir desde el teléfono de la persona (pasarela) la caída no cancelada **después** de vencer la ventana local de 30 segundos (→ incidencia), la emergencia manual (→ incidencia con escalamiento requerido), la falsa alarma cancelada (→ incremento agregado único, sin incidencia visible) y la telemetría del bastón (→ último estado con antigüedad). Toda incidencia se **persiste junto con su primer evento de historial y su acción pendiente de aviso en una sola transacción** antes de responder. Reenviar el mismo evento devuelve el mismo resultado sin duplicar nada. Los eventos atrasados se registran como tales y no inician llamadas. Durante los 30 segundos no se publica una incidencia ni se avisa al cuidador por esa caída; el tráfico operativo independiente no queda prohibido.

### Bloqueo de integración ESP32 — revisión del 14 de noviembre de 2026

El [contrato lógico BLE](../../ESP32/04_Contrato_BLE_Eventos_Comandos_y_Seguridad.md) y [ESP-06](../../ESP32/06_Integracion_Backend_BetterAuth_y_Contratos_API.md) añaden requisitos de conciliación todavía no resueltos por los DTO y pasos siguientes. Antes de habilitar consecuencias remotas completar estas decisiones en este plan, migraciones y OpenAPI:

- Diferenciar cancelación válida durante la ventana de una cancelación tardía o simple silenciamiento. `cancelledVia` solo indica la vía, no el resultado temporal.
- Serializar activación y cancelación por la misma identidad de episodio. Una cancelación válida registrada primero impide crear incidencia/avisos por un vencimiento contradictorio posterior.
- En el orden inverso, conservar el hecho tardío y aplicar PD-12 sin incrementar falsas alarmas ni cerrar la incidencia automáticamente.
- Conservar identidad de origen y expresar incertidumbre temporal tras reinicios; no fabricar edad exacta ni reiniciar la ventana.

Los contratos de esta versión del plan son una base incompleta para esos casos. El esquema de resolución y los errores exactos deben cerrarse antes de implementar el arbitraje; no interpretar las claves `fall:` y `cancel:` independientes como garantía suficiente. Pruebas requeridas: ESP-T07, ESP-T12 y ESP-T21–ESP-T23 de [ESP-07](../../ESP32/07_Plan_Implementacion_Pruebas_y_Aceptacion.md).

---

## Archivos

| Acción | Ruta (`backend/`) | Descripción |
|--------|-------------------|-------------|
| CREAR | `supabase/migrations/20261114000600_events_incidents.sql` | `event_receipts`, `false_alarm_counters`, `cane_telemetry_latest`, `incidents`, `incident_events`, grants, RLS |
| MODIFICAR | `prisma/schema.prisma` | `pnpm db:sync` |
| CREAR | `src/modules/incidents/incidents.module.ts` | |
| CREAR | `src/modules/incidents/incident-state.ts` | Estados, transiciones permitidas y función pura `assertTransition` |
| CREAR | `src/modules/incidents/incident-state.spec.ts` | Unit tests de transiciones |
| CREAR | `src/modules/incidents/incidents.controller.ts`, `incidents.service.ts` | Activación, historial, detalle |
| CREAR | `src/modules/incidents/incident-events.service.ts` | `append(tx, …)` del historial |
| CREAR | `src/modules/devices/gateway-events.controller.ts`, `gateway-events.service.ts` | Lote de eventos de pasarela |
| CREAR | `src/modules/devices/gateway-resolver.service.ts` | Resolver bastón → asignación → perfil desde la instalación |
| CREAR | `src/common/pagination/cursor.ts` | Cursor opaco `(timestamp, id)` en base64url |
| MODIFICAR | `src/modules/devices/canes.service.ts` | `CaneView` incluye `telemetry` y `linkState` con antigüedad |
| CREAR | `test/incidents.int-spec.ts`, `test/gateway-events.int-spec.ts` | T08, T09, T14 (registro), T26 (parte backend) |

---

## Modelo de datos (migración `20261114000600_events_incidents.sql`)

### `guardme.event_receipts` (deduplicación técnica mínima)
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK | | |
| `source_key` | text not null **unique** | Ver “Claves de origen” |
| `kind` | text not null CHECK in (`false_alarm_canceled`,`telemetry_observed`) | |
| `installation_id` uuid not null · `cane_id` uuid not null · `cane_assignment_id` uuid not null | | |
| `occurred_at` | timestamptz not null | Hora del teléfono (no confiable) |
| `received_at` | timestamptz not null default now() | |
| `detail` | text null | p. ej. `button` / `app` para la vía de cancelación |

### `guardme.false_alarm_counters`
| Columna | Tipo | Regla |
|---------|------|-------|
| `profile_id` uuid FK · `cane_id` uuid FK | | PK `(profile_id, cane_id)` |
| `total` | int not null default 0 CHECK (`total >= 0`) | |
| `updated_at` | timestamptz | |

### `guardme.cane_telemetry_latest`
| Columna | Tipo | Regla |
|---------|------|-------|
| `cane_assignment_id` | uuid PK FK | Atribuida a la asignación, no solo al bastón (BE-04 §4) |
| `cane_id` uuid FK | | |
| `battery_pct` | smallint null CHECK (0..100) | `NULL` = desconocido, nunca 0 por defecto |
| `charging` | boolean null | |
| `sensor_status` | text null CHECK in (`ok`,`fault`,`unknown`) | |
| `link_status` | text null CHECK in (`connected`,`disconnected`) | Observación BLE de la pasarela |
| `captured_at` | timestamptz not null | |
| `received_at` | timestamptz not null | |
| `source_installation_id` | uuid not null | |

### `guardme.incidents`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK | | |
| `profile_id` uuid not null FK | | |
| `cane_id` uuid null · `cane_assignment_id` uuid null | | Obligatorios si `origin='fall_detected'` (CHECK) |
| `origin` | text not null CHECK in (`fall_detected`,`manual_emergency`) | |
| `source_key` | text not null **unique** | |
| `status` | text not null CHECK in (`pending_contact`,`contacting`,`caregiver_informed`,`attention_postponed`,`escalation_required`,`closed_assisted`,`delayed_review`) | |
| `escalation_reason` | text null CHECK in (`attempts_exhausted`,`manual_request`,`caregiver_request`,`no_contacts`) | |
| `occurred_at` | timestamptz not null | Estimada por servidor (ver abajo) |
| `reported_occurred_at` | timestamptz not null | Lo que dijo el teléfono |
| `received_at` | timestamptz not null default now() | |
| `is_delayed` | boolean not null default false | |
| `closed_at` timestamptz null · `closed_by_account_id` uuid null | | |
| `created_by_installation_id` | uuid not null | |
| `context` | jsonb not null default `'{}'` | `protocolVersion`, `bootId`, `sequence`, `windowStartedAt`, `windowEndedAt`, `connectivity` |
| `created_at`, `updated_at`, `version` | | trigger |

Índices: `(profile_id, occurred_at DESC, id)`; parcial `(status) WHERE status NOT IN ('closed_assisted')`.

### `guardme.incident_events`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `incident_id` uuid FK | | |
| `type` | text not null | Catálogo `IncidentEventType` (abajo); CHECK con la lista |
| `actor_kind` | text not null CHECK in (`account`,`installation`,`system`,`provider`) | |
| `actor_account_id` uuid null · `actor_installation_id` uuid null | | |
| `at` | timestamptz not null default now() | Hora del servidor |
| `context` | jsonb not null default `'{}'` | Mínimo; sin coordenadas ni teléfonos completos |

Índice `(incident_id, at, id)`. Correcciones = nuevo evento, nunca `UPDATE`/`DELETE` (no conceder esos privilegios a ningún rol).

### Grants y RLS

| Tabla | `guardme_api` | `guardme_worker` |
|-------|---------------|------------------|
| `event_receipts` | SELECT, INSERT | SELECT, DELETE |
| `false_alarm_counters` | SELECT, INSERT, UPDATE | SELECT |
| `cane_telemetry_latest` | SELECT, INSERT, UPDATE | SELECT |
| `incidents` | SELECT, INSERT, UPDATE(`status`,`escalation_reason`,`closed_at`,`closed_by_account_id`) | SELECT, UPDATE(mismas columnas) |
| `incident_events` | SELECT, INSERT | SELECT, INSERT |
| `gateways` (ALTER grant) | + UPDATE(`last_event_at`) | |
| `canes` (ALTER grant) | + UPDATE(`firmware_version`) | |
| `installations` | (ya tiene `last_seen_at`) | |

Políticas `guardme_api`:
- `event_receipts`: `USING/WITH CHECK (installation_id = guardme.ctx_installation_id())`.
- `false_alarm_counters`, `incidents`: `USING/WITH CHECK (guardme.has_profile_access(profile_id))`.
- `cane_telemetry_latest`: `USING (EXISTS (… cane_assignments a WHERE a.id = cane_assignment_id AND guardme.has_profile_access(a.profile_id)))`.
- `incident_events`: `USING/WITH CHECK (EXISTS (SELECT 1 FROM guardme.incidents i WHERE i.id = incident_id AND guardme.has_profile_access(i.profile_id)))`.
- `canes` UPDATE: política con el mismo predicado de SELECT del plan 04.
- `guardme_worker`: `USING (true)`.

---

## Reglas de dominio

### Claves de origen
| Hecho | `source_key` |
|-------|--------------|
| Caída vencida | `fall:<caneId>:<sourceEventId>` |
| Emergencia manual | `manual:<profileId>:<sourceEventId>` |
| Falsa alarma cancelada | `cancel:<caneId>:<sourceEventId>` |
| Telemetría | sin dedupe (último gana por `captured_at`) |

`sourceEventId` (1..128, `[A-Za-z0-9:_-]`) lo genera el bastón/teléfono **antes del primer envío** (detección + arranque + secuencia, BE-05 §7) y se conserva en todos los reintentos. La caída vencida y su cancelación usan el **mismo** `sourceEventId` de detección.

### Hora estimada de ocurrencia
- Si el cuerpo trae `ageAtSendMs` (edad monotónica medida por el teléfono al enviar): `occurred_at = received_at - ageAtSendMs`.
- Si no: `occurred_at = reported_occurred_at` pero acotado a `≤ received_at`.
- `is_delayed = (received_at - occurred_at) > PD10_MAX_INCIDENT_AGE_FOR_CALLS_SEC`. `// PD-10 pendiente`.

### Estados iniciales
| Caso | `status` inicial | Acciones pendientes encoladas en la misma transacción |
|------|------------------|---------------------------------------------------------|
| Caída, no atrasada | `pending_contact` | `NOTIFY_INCIDENT` (now). El plan 07 añade la creación del plan de llamadas y `START_NEXT_CALL_ATTEMPT` |
| Caída atrasada | `delayed_review` | `NOTIFY_INCIDENT` (now, `payload.delayed=true`). Sin llamadas |
| Emergencia manual | `escalation_required` (`escalation_reason='manual_request'`) | `NOTIFY_INCIDENT` (now). Sin cascada de llamadas a contactos |

`delayed_review` es una precisión propuesta para PD-10: el episodio se conserva, se informa a los cuidadores como atrasado y admite las decisiones del plan 07; no inicia la cascada.

### Transiciones (`incident-state.ts`)

| Desde | Hacia permitidos |
|-------|------------------|
| `pending_contact` | `contacting`, `caregiver_informed`, `attention_postponed`, `escalation_required`, `closed_assisted` |
| `contacting` | `pending_contact` (entre intentos), `caregiver_informed`, `attention_postponed`, `escalation_required`, `closed_assisted` |
| `caregiver_informed` | `attention_postponed`, `escalation_required`, `closed_assisted` |
| `attention_postponed` | `escalation_required`, `closed_assisted` |
| `escalation_required` | `attention_postponed`, `closed_assisted` |
| `delayed_review` | `attention_postponed`, `escalation_required`, `closed_assisted` |
| `closed_assisted` | — (terminal) |

`assertTransition(from, to)` lanza `DomainError('INCOMPATIBLE_STATE', …, { from, to })`.

### Catálogo `IncidentEventType`
`activated`, `delayed_registered`, `notification_scheduled`, `late_cancellation_received`, `call_plan_created`, `call_attempt_requested`, `call_attempt_result`, `transport_answered`, `caregiver_informed`, `decision_take_charge`, `decision_postpone`, `decision_request_emergency`, `escalation_required`, `closed_assisted`, `followup_created`, `postpone_reminder_sent`, `postpone_collective_sent`. (Los planes 07 y 09 los usan; definirlos todos ahora en el CHECK.)

---

## Contratos de funciones

### `GatewayResolverService`
```typescript
interface ResolvedGateway { caneId: string; caneAssignmentId: string; profileId: string; gatewayId: string }
class GatewayResolverService {
  resolveActive(tx: Tx, installationId: string, caneId: string): Promise<ResolvedGateway>
}
```
- La instalación debe ser la **pasarela activa** de ese bastón (`gateways.ended_at IS NULL`). Si no → `FORBIDDEN_ACTION` `details.reason='not_active_gateway'`. Así un teléfono retirado no publica datos sobre el nuevo propietario (BE-08 §7).
- Actualiza `gateways.last_event_at` e `installations.last_seen_at` con `now`.

### `IncidentsService`
```typescript
class IncidentsService {
  activate(p: Principal, input: ActivateIncidentDto): Promise<{ incident: IncidentView; replay: boolean }>
  listForProfile(p: Principal, profileId: string, q: { cursor?: string; limit?: number }): Promise<{ items: IncidentSummaryView[]; nextCursor: string | null }>
  getDetail(p: Principal, incidentId: string): Promise<IncidentDetailView>
}
```
`activate` (`asAccount`, transacción, `@RequireInstallation`):
1. Calcular `source_key`.
2. Si ya existe incidencia con ese `source_key` (SELECT bajo RLS) → devolver `replay=true` (HTTP 200, `X-Idempotent-Replay: true`). Si existe pero no es visible por RLS → `NOT_FOUND`.
3. `fall_detected`: `GatewayResolverService.resolveActive` → `profileId`. `manual_emergency`: `profileId` del cuerpo + `requireAccess` con relación `user` (si es `caregiver` → `FORBIDDEN_ACTION`).
4. Calcular `occurred_at`, `is_delayed` y estado inicial.
5. `INSERT ... ON CONFLICT (source_key) DO NOTHING RETURNING *`. Si no devolvió fila (carrera) → releer y responder como replay.
6. `IncidentEventsService.append(tx, 'activated' | 'delayed_registered', …)`.
7. `PendingActionsService.enqueue(tx, { type: 'NOTIFY_INCIDENT', resourceType: 'incident', resourceId, dedupeKey: 'notify:incident:<id>:activated', runAt: now })` + evento `notification_scheduled`.
8. Hook para el plan 07: `// plan 07: CallPlanService.createForIncident(tx, incident) si status='pending_contact'`.
9. Responder 201 con `registration: 'persisted'` y `notification: 'scheduled'` (nunca “enviado”).

`getDetail`: incidencia + `events` ordenados + `falseAlarmCount` no aplica aquí. Los planes 07/09 añaden `calls`, `decisions`, `followup`.

### `GatewayEventsService`
```typescript
type GatewayEventItemResult = { eventId: string; status: 'accepted' | 'duplicate' | 'rejected'; code?: 'NOT_ACTIVE_GATEWAY' | 'EVENT_TOO_OLD' | 'VALIDATION_FAILED' }
class GatewayEventsService {
  ingestBatch(p: Principal, input: GatewayEventsBatchDto): Promise<{ results: GatewayEventItemResult[] }>
}
```
- Procesa cada elemento en **su propia** transacción `asAccount`; un fallo de un elemento no afecta a los demás (BE-05 §4). Respuesta 200 con resultado por elemento, en el mismo orden.
- `occurredAt` más antiguo que `PD10_EVENT_RECEIPT_RETENTION_DAYS` → `rejected/EVENT_TOO_OLD` (impide recontar tras limpiar receipts, BE-04 §4).
- `false_alarm_canceled`:
  1. `resolveActive`.
  2. Antes de clasificar/incrementar, verificar el resultado temporal y conciliar bajo el arbitraje por episodio definido en el bloqueo ESP32. El DTO actual debe ampliarse para esa evidencia; `cancelledVia` no basta.
  3. Para cancelación válida: `INSERT event_receipts ... ON CONFLICT (source_key) DO NOTHING RETURNING id`. Sin fila → `duplicate`. Incrementar `false_alarm_counters` una sola vez y conservar resolución que impida activación contradictoria posterior.
  4. Si existe incidencia o la acción ocurrió después del vencimiento, conservar el hecho tardío/conflicto según PD-12; **no** incrementar automáticamente el contador, cambiar estado ni cancelar llamadas. La respuesta y representación exactas deben formalizarse antes de habilitar esta rama.
- `telemetry_observed`:
  1. `resolveActive`.
  2. Upsert `cane_telemetry_latest` por `cane_assignment_id` **solo si** `captured_at` > existente (una medida atrasada no reemplaza una reciente).
  3. Si trae `firmwareVersion` distinta → actualizar `canes.firmware_version`.
  4. Siempre `accepted` (idempotente por naturaleza).

### `CaneView` (ampliación)
```typescript
telemetry: { batteryPct: number | null; charging: boolean | null; sensorStatus: string | null; linkStatus: string | null; capturedAt: string; ageSeconds: number } | null
gatewayLastEventAgeSeconds: number | null
linkState: 'linked_no_gateway' | 'gateway_set' | 'connected' | 'stale'
```
`connected` solo si `linkStatus='connected'` y `ageSeconds <= CANE_LINK_FRESH_SEC` (config, default 300); si no hay dato reciente → `stale`. Nunca inventar batería.

---

## Endpoints y DTOs

```typescript
// POST /v1/incidents   @RequireInstallation()
class ActivateIncidentDto {
  origin: 'fall_detected' | 'manual_emergency'
  sourceEventId: string
  caneId?: string                 // obligatorio si fall_detected
  profileId?: string              // obligatorio si manual_emergency
  reportedOccurredAt: string      // ISO 8601
  ageAtSendMs?: number            // 0..7 días
  protocolVersion: string
  bootId?: string
  sequence?: number
  windowStartedAt?: string
  windowEndedAt?: string          // evidencia de que venció la ventana local
  connectivity?: { network: 'wifi' | 'cellular' | 'none' | 'unknown'; bleLinked: boolean }
}
interface IncidentView {
  id: string; profileId: string; origin: string; status: string; escalationReason: string | null
  occurredAt: string; receivedAt: string; isDelayed: boolean; version: number
  registration: 'persisted'; notification: 'scheduled' | 'not_scheduled'
}

// GET /v1/profiles/:id/incidents?cursor=&limit=   (limit 1..50, default 20; orden occurred_at DESC, id DESC)
// GET /v1/incidents/:id  → IncidentDetailView { ...IncidentView, events: IncidentEventView[] }

// POST /v1/gateway-events   @RequireInstallation()
class GatewayEventsBatchDto {
  events: Array<{                 // 1..50
    eventId: string               // = sourceEventId
    type: 'false_alarm_canceled' | 'telemetry_observed'
    caneId: string
    occurredAt: string
    payload: FalseAlarmPayload | TelemetryPayload   // validación por discriminador `type`
  }>
}
interface FalseAlarmPayload { cancelledVia: 'button' | 'app' }
interface TelemetryPayload { batteryPct?: number; charging?: boolean; sensorStatus?: 'ok' | 'fault' | 'unknown'; linkStatus?: 'connected' | 'disconnected'; firmwareVersion?: string; capturedAt: string }

// GET /v1/profiles/:id/false-alarms → { total: number; perCane: Array<{ caneId; total; updatedAt }> }
```

---

## Dependencias

Ninguna nueva.

---

## Edge cases y manejo de errores

- **Corte después de persistir y antes del acuse** → Android reenvía con el mismo `sourceEventId` → 200 replay con la misma incidencia; no se encola otro aviso (dedupe por `source_key` y `dedupe_key`) (T09).
- **Misma cancelación reenviada dos veces / por dos caminos** → `event_receipts.source_key` único → contador +1 una sola vez (T08).
- **Cancelación que llega después de la incidencia** → evento `late_cancellation_received`; estado intacto (PD-12).
- **Evento de un teléfono que ya no es pasarela** → `FORBIDDEN_ACTION` / `NOT_ACTIVE_GATEWAY`.
- **Teléfono con hora manipulada** → `occurred_at` se estima con `ageAtSendMs` y se acota a `received_at`.
- **Incidencia sincronizada tras horas sin red** → `delayed_review`, sin llamadas, visible como atrasada.
- **Emergencia manual desde cuenta cuidador** → `FORBIDDEN_ACTION`.
- **Base de datos caída** → excepción → 5xx; nunca 201. Android conserva el evento (BE-09 §10).
- **Lote con elemento inválido** → ese elemento `rejected/VALIDATION_FAILED`; el resto se procesa.

---

## Orden de implementación

1. Migración `...000600`; `pnpm db:reset && pnpm db:sync`.
2. `incident-state.ts` + `incident-state.spec.ts` (todas las parejas permitidas y prohibidas).
3. `cursor.ts` + unit test.
4. `GatewayResolverService`.
5. `IncidentEventsService.append`.
6. `IncidentsService.activate` + `POST /v1/incidents`.
7. `listForProfile`, `getDetail` + endpoints.
8. `GatewayEventsService` + `POST /v1/gateway-events` + `GET /v1/profiles/:id/false-alarms`.
9. Ampliar `CaneView`.
10. Tests de integración (usar `FakeClock` para la antigüedad).

---

## Criterios de aceptación

- [ ] T09: activar caída → 201; reenviar idéntico → 200 replay con el mismo `id`; en BD hay 1 incidencia, 1 evento `activated` y 1 `pending_actions` `NOTIFY_INCIDENT`.
- [ ] T08: enviar la misma cancelación dos veces (mismo y distinto lote) → `total = 1`; no existe incidencia.
- [ ] T14 (parte backend): emergencia manual → `escalation_required` / `manual_request`, aviso encolado, ningún intento de llamada ni campo que diga “llamada conectada”.
- [ ] Concurrencia: 10 `POST /v1/incidents` simultáneos con el mismo `sourceEventId` → exactamente 1 fila.
- [ ] Caída con `ageAtSendMs` mayor que el umbral → `delayed_review`, `is_delayed=true`.
- [ ] Instalación que no es pasarela → 403 `not_active_gateway`; nada persistido.
- [ ] Telemetría con `capturedAt` antiguo después de una reciente → el último estado no cambia; batería ausente se devuelve `null`.
- [ ] Cuidador de otro perfil → `GET /v1/incidents/:id` → 404.
- [ ] `pnpm lint`, `pnpm test`, `pnpm test:int` en verde.
