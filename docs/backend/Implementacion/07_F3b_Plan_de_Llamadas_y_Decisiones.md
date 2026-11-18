# Spec 07 (F3b): Plan de llamadas 1–1–2–2, telefonía (adaptador falso), decisiones del cuidador

> **Para:** Cursor AI — Rol: Developer
> **Autor del plan:** Claude (Tech Lead)
> **Stack:** NestJS 11 · Prisma 6 · pg-boss (vía relay del plan 06) · `TelephonyPort` con adaptador falso
> **Fecha:** 14 de noviembre de 2026
> **Docs de origen:** Propuesta §9–10, §13.2; BE-06 completo; BE-05 §5, §9, §12; BE-07 §3
> **Prerrequisito:** planes 01–06 en verde

---

## Instrucciones para Cursor

No tomes decisiones de arquitectura por tu cuenta. Implementa este plan exactamente como está descrito.
Si algo no está especificado, pregunta antes de asumir.
Contexto a cargar: `@docs/backend/Implementacion/00_Indice_Convenciones_y_Reglas_Cursor.md` `@backend/src/modules/incidents/incident-state.ts` `@backend/src/modules/incidents/incidents.service.ts` `@backend/src/modules/pending-actions/action-handler.ts` `@backend/src/modules/notifications/notifications.service.ts` `@docs/backend/Desglose/06_Incidencias_Llamadas_Escalamiento_y_Atencion.md`

**Advertencias no negociables:**
- No integres Twilio ni ningún proveedor real (PD-01 abierta). Solo `FakeTelephonyAdapter`.
- Ningún código llama, simula ni marca el 911. `emergencyAutoCall` sigue `not_enabled` (BE-R13, PD-02).
- “Respuesta de transporte” **no** es “cuidador informado”.

---

## Objetivo

Cuando una caída activa una incidencia, el backend ejecuta un **plan de llamadas persistente**: contacto 1 / intento 1, contacto 1 / intento 2, contacto 2 / intento 1, contacto 2 / intento 2, con **un único intento activo** por incidencia. Los contactos se copian al iniciar el episodio. Los resultados llegan por webhooks firmados que se deduplican y aplican en orden lógico; las solicitudes con resultado incierto se **reconcilian** antes de volver a marcar. Una respuesta humana confirmada (acción en la app o confirmación explícita en la llamada) detiene los intentos. El cuidador decide: **“Yo me encargo”** (cierra como *Recibió asistencia*, una sola vez, y crea un seguimiento), **“Contestar más tarde”** (aviso a 5 minutos y aviso colectivo a 2 horas, sin ambulancia automática) o **“Llamar a emergencias”** (registra la intención; la vía automática no existe todavía). Al agotar intentos: *escalamiento requerido*.

---

## Archivos

| Acción | Ruta (`backend/`) | Descripción |
|--------|-------------------|-------------|
| CREAR | `supabase/migrations/20261114000800_calls_decisions.sql` | `call_plans`, `call_attempts`, `provider_events`, `caregiver_decisions`, rol `guardme_ingest`, ampliar CHECK de `incident_events.type` |
| CREAR | `supabase/seed.sql` (MODIFICAR) | Contraseña local de `guardme_ingest` |
| MODIFICAR | `prisma/schema.prisma` | `pnpm db:sync` |
| MODIFICAR | `src/infra/db/db.service.ts` | Cliente `DATABASE_URL_INGEST` y `asIngest(fn)` (solo proceso API) |
| CREAR | `src/infra/telephony/telephony.port.ts`, `fake-telephony.adapter.ts`, `telephony.module.ts` | Puerto y adaptador falso |
| CREAR | `src/modules/calling/calling.module.ts` | |
| CREAR | `src/modules/calling/call-plan.service.ts` | Crear plan al activar incidencia; detener plan |
| CREAR | `src/modules/calling/attempt-status.ts` | Estados de intento, ranking monotónico, mapeo de proveedor |
| CREAR | `src/modules/calling/provider-event-applier.service.ts` | Aplicar un evento de proveedor a un intento (lo usan webhook y reconciliación) |
| CREAR | `src/modules/calling/provider-events.controller.ts` | `POST /v1/provider-events/:provider` (público, firmado) |
| CREAR | `src/modules/calling/dev-telephony.controller.ts` | Solo `NODE_ENV !== 'production'`: simular eventos del proveedor falso |
| CREAR | `src/modules/calling/handlers/start-next-attempt.handler.ts` | `START_NEXT_CALL_ATTEMPT` |
| CREAR | `src/modules/calling/handlers/apply-provider-event.handler.ts` | `APPLY_PROVIDER_EVENT` |
| CREAR | `src/modules/calling/handlers/reconcile-attempt.handler.ts` | `RECONCILE_CALL_ATTEMPT` |
| CREAR | `src/modules/calling/handlers/cancel-active-call.handler.ts` | `CANCEL_ACTIVE_CALL` |
| CREAR | `src/modules/calling/handlers/human-confirm-timeout.handler.ts` | `HUMAN_CONFIRM_TIMEOUT` |
| CREAR | `src/modules/incidents/decisions.service.ts`, `decisions.controller.ts` | Decisiones del cuidador y hechos de emergencia |
| CREAR | `src/modules/incidents/handlers/postpone.handlers.ts` | `POSTPONE_REMINDER`, `POSTPONE_COLLECTIVE` |
| MODIFICAR | `src/modules/incidents/incidents.service.ts` | Hook de `activate` → `CallPlanService.createForIncident`; `getDetail` añade `calls` y `decisions` |
| MODIFICAR | `src/main.ts` | `NestFactory.create(AppModule, { rawBody: true })` |
| MODIFICAR | `src/worker.module.ts` | Registrar handlers; colas de llamadas con concurrencia 1 |
| CREAR | `test/calling.int-spec.ts`, `test/decisions.int-spec.ts` | T10–T17, T30 |

---

## Modelo de datos (migración `20261114000800_calls_decisions.sql`)

### Rol `guardme_ingest`
`NOLOGIN NOBYPASSRLS` (LOGIN en `seed.sql` local). Grants: `USAGE` en `guardme`; `INSERT` en `provider_events` y `pending_actions`. Políticas `WITH CHECK (true)` en ambas para ese rol. Lo usa **solo** el webhook público, que no tiene principal.

### `guardme.call_plans`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `incident_id` uuid **unique** FK | | Un plan por episodio |
| `policy_version` | text not null | p. ej. `'v1:run_available'` + valores PD-04 usados |
| `contacts_snapshot` | jsonb not null | `[{ contactId, displayName, phoneE164, priority, linkedAccountId }]` |
| `status` | text not null CHECK in (`active`,`stopped`,`exhausted`) | |
| `stopped_reason` | text null CHECK in (`caregiver_decision`,`human_confirmed`) | |
| `created_at`, `updated_at` | | |

### `guardme.call_attempts`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `call_plan_id` FK · `incident_id` FK | | |
| `ordinal` | smallint not null CHECK (1..4) | unique `(call_plan_id, ordinal)` |
| `contact_id` uuid not null · `contact_name` text · `contact_phone_e164` text · `linked_account_id` uuid null | | Copia del snapshot |
| `channel` | text not null default `'pstn'` | |
| `provider` | text not null | `fake` |
| `provider_ref` | text null | unique parcial `(provider, provider_ref) WHERE provider_ref IS NOT NULL` |
| `status` | text not null CHECK in (`planned`,`requesting`,`ringing`,`answered_transport`,`human_confirmed`,`answered_unconfirmed`,`no_answer`,`busy`,`failed`,`canceled`,`uncertain`,`skipped`) | |
| `status_reason` | text null | `ring_timeout`, `contact_removed`, `not_created`, `superseded_by_decision`, … |
| `requested_at` · `answered_at` · `ended_at` | timestamptz null | |
| `last_provider_rank` | smallint not null default 0 | Orden lógico |
| `version` | int default 1 | trigger |

Índice unique parcial `(incident_id) WHERE status IN ('requesting','ringing','answered_transport','uncertain')` → **como máximo un intento activo** (BE-04 §8).

### `guardme.provider_events`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `provider` text · `event_key` text | | unique `(provider, event_key)` |
| `provider_ref` | text not null | |
| `status` | text not null | Estado normalizado (`ProviderCallStatus`) |
| `sequence` | int null · `provider_timestamp` timestamptz null | |
| `received_at` | timestamptz default now() | |
| `applied_at` | timestamptz null · `apply_result` text null | `applied`, `ignored_older`, `ignored_closed`, `unmatched` |

### `guardme.caregiver_decisions`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `incident_id` FK · `account_id` FK | | |
| `option` | text not null CHECK in (`take_charge`,`postpone`,`request_emergency`) | |
| `at` | timestamptz default now() | |
| `applied_incident_version` | int not null | Versión sobre la que se aplicó |
| `resulting_status` | text not null | |

Índice unique parcial `(incident_id) WHERE option = 'take_charge'` → **un único cierre** aunque dos cuidadores pulsen a la vez (T15).

### `incident_events.type` (ALTER CHECK)
Añadir: `emergency_dialer_opened`, `call_attempt_skipped`, `human_confirm_timeout`, `late_transport_answer`, `call_plan_stopped`, `call_plan_exhausted`.

### Grants y RLS
| Tabla | `guardme_api` | `guardme_worker` |
|-------|---------------|------------------|
| `call_plans` | SELECT, INSERT, UPDATE(`status`,`stopped_reason`) | SELECT, UPDATE |
| `call_attempts` | SELECT, INSERT, UPDATE(`status`,`status_reason`,`ended_at`) | SELECT, UPDATE |
| `provider_events` | — | SELECT, INSERT, UPDATE(`applied_at`,`apply_result`) |
| `caregiver_decisions` | SELECT, INSERT | SELECT |

Políticas `guardme_api`: todas vía `EXISTS (SELECT 1 FROM guardme.incidents i WHERE i.id = incident_id AND guardme.has_profile_access(i.profile_id))` (para `call_plans` y `call_attempts` usar `incident_id`). `guardme_worker`: `USING (true)`.

---

## Contratos de funciones

### `TelephonyPort`
```typescript
// src/infra/telephony/telephony.port.ts
type ProviderCallStatus = 'queued' | 'ringing' | 'answered' | 'human_confirmed' | 'completed' | 'busy' | 'no_answer' | 'failed' | 'canceled'

interface CreateCallInput { attemptId: string; to: string; ringTimeoutSec: number; incidentId: string }
type CreateCallResult =
  | { status: 'requested'; providerRef: string }
  | { status: 'rejected'; error: string }       // el proveedor rechazó con certeza (número inválido…)
  | { status: 'uncertain'; error: string }      // timeout/red: puede o no existir la llamada

interface ProviderCallSnapshot { providerRef: string; status: ProviderCallStatus; at: Date }
interface ParsedProviderEvent { eventKey: string; providerRef: string; status: ProviderCallStatus; sequence: number | null; providerTimestamp: Date | null }

abstract class TelephonyPort {
  abstract readonly provider: string
  abstract createCall(input: CreateCallInput): Promise<CreateCallResult>
  abstract findCallByAttempt(attemptId: string): Promise<ProviderCallSnapshot | null>   // reconciliación
  abstract cancelCall(providerRef: string): Promise<void>
  abstract verifyAndParseWebhook(headers: Record<string, string>, rawBody: Buffer): ParsedProviderEvent[]  // lanza UNAUTHENTICATED si la firma falla
}
```
`createCall` usa `attemptId` como clave idempotente/correlación del proveedor. Así una reconciliación encuentra la llamada aunque no se haya guardado `providerRef`.

### `FakeTelephonyAdapter`
- Guarda llamadas en memoria `Map<attemptId, { providerRef, status }>`.
- `failNextCreate('rejected' | 'uncertain' | 'uncertain_but_created')` para tests (el último crea la llamada pero responde incierto).
- Firma de webhook: header `x-fake-signature = hex(HMAC-SHA256(FAKE_TELEPHONY_WEBHOOK_SECRET, rawBody))`; cuerpo `{ events: [{ eventKey, providerRef, status, sequence, timestamp }] }`. Comparar con `timingSafeEqual`.
- `emit(providerRef, status)` (usado por tests y por el controlador dev): construye el cuerpo, lo firma y hace `POST` interno a `/v1/provider-events/fake`.
- Con `NODE_ENV=production` el módulo se niega a registrar el adaptador falso (error al arrancar).

### `attempt-status.ts`
```typescript
const ACTIVE_ATTEMPT_STATUSES = ['requesting', 'ringing', 'answered_transport', 'uncertain'] as const
function providerRank(s: ProviderCallStatus): number   // queued 1, ringing 2, answered 3, human_confirmed 4, terminal (completed|busy|no_answer|failed|canceled) 5
function toAttemptStatus(current: AttemptStatus, ev: ProviderCallStatus): AttemptStatus | 'unchanged'
```
Reglas de `toAttemptStatus` (tabla, unit-testeada):
| Actual | Evento | Resultado |
|--------|--------|-----------|
| `requesting`/`uncertain` | `queued` | `requesting` |
| `requesting`/`uncertain`/`ringing` | `ringing` | `ringing` |
| activo no contestado | `answered` | `answered_transport` |
| `answered_transport` | `human_confirmed` | `human_confirmed` |
| `answered_transport`/`human_confirmed` | `completed` | `unchanged` (solo fija `ended_at`) |
| activo no contestado | `busy`/`no_answer`/`failed`/`canceled` | ese estado |
| activo no contestado | `completed` | `no_answer` (terminó sin contestar) |
| cualquier terminal | cualquiera | `unchanged` (excepto `answered` tardío → evento `late_transport_answer`) |
| rank del evento ≤ `last_provider_rank` | — | `unchanged` (fuera de orden) |

### `CallPlanService`
```typescript
class CallPlanService {
  createForIncident(tx: Tx, incident: IncidentRow): Promise<void>     // llamado desde IncidentsService.activate (API)
  stopPlan(tx: Tx, incidentId: string, reason: 'caregiver_decision' | 'human_confirmed'): Promise<{ activeAttemptId: string | null }>
}
```
- `createForIncident` (solo `status='pending_contact'`):
  1. Contactos `active` con `priority` 1 y 2, ordenados.
  2. Ninguno → incidencia `escalation_required` / `no_contacts`, evento `escalation_required`, `NOTIFY_INCIDENT_UPDATE`. Sin plan. `// PD-04 pendiente`.
  3. `PD04_MIN_CONTACTS_POLICY='run_available'`: 2 intentos consecutivos por contacto disponible (1 contacto → ordinales 1–2; 2 contactos → 1–4). Nunca se inventa un segundo contacto.
  4. Insertar plan + intentos `planned`; evento `call_plan_created`; `enqueue START_NEXT_CALL_ATTEMPT` (`dedupeKey: call:<planId>:start:1`, `runAt: now`).
- `stopPlan`: plan `stopped`; intentos `planned` → `canceled` (`superseded_by_decision`); devuelve el intento activo (si hay) para que el llamador encole `CANCEL_ACTIVE_CALL`.

### `StartNextAttemptHandler`
1. **Tx corta** (`asWorker`): `SELECT incidents ... FOR UPDATE`. Si `status ∉ {pending_contact, contacting}` → `discarded`. Si existe intento activo → `discarded`. Tomar el `planned` de menor `ordinal`.
   - Ninguno → plan `exhausted`, incidencia `escalation_required` / `attempts_exhausted`, eventos `call_plan_exhausted` + `escalation_required`, `NOTIFY_INCIDENT_UPDATE` → `done`.
   - Contacto ya `removed` (o cuenta vinculada sin acceso) → intento `skipped` (`contact_removed`), evento `call_attempt_skipped`, encolar siguiente (`runAt: now`) → `done`.
   - Si no: intento `requesting`, `requested_at`; incidencia `contacting`; evento `call_attempt_requested`.
2. **Fuera de tx**: `telephony.createCall({ attemptId, to, ringTimeoutSec: PD04_CALL_RING_TIMEOUT_SEC, incidentId })`.
3. **Tx corta** con el resultado:
   - `requested` → guardar `provider_ref`; `enqueue RECONCILE_CALL_ATTEMPT` en `now + ringTimeout + 30 s` (red de seguridad si se pierde el webhook).
   - `uncertain` → intento `uncertain`; `enqueue RECONCILE_CALL_ATTEMPT` en `now + 10 s`. **No** volver a marcar (BE-06 §9).
   - `rejected` → intento `failed`; incidencia `pending_contact`; encolar siguiente en `now + PD04_CALL_PAUSE_BETWEEN_ATTEMPTS_SEC`.
   - Dedupe de “siguiente”: `call:<planId>:start:<ordinal+1>`.

### Webhook `POST /v1/provider-events/:provider` (`@Public()`)
1. `provider` debe coincidir con `TelephonyPort.provider`; si no → 404.
2. `verifyAndParseWebhook(headers, req.rawBody)`; firma inválida → 401 y log `warn` (sin cuerpo).
3. `asIngest`: por evento, `INSERT provider_events ... ON CONFLICT (provider, event_key) DO NOTHING`; si insertó → `enqueue APPLY_PROVIDER_EVENT` (`dedupeKey: provider:<provider>:<eventKey>`, `runAt: now`).
4. Responder `204` rápido. Repetir el webhook no reaplica nada (T30).

### `ProviderEventApplierService`
```typescript
class ProviderEventApplierService {
  apply(tx: Tx, ev: { id: string; providerRef: string; status: ProviderCallStatus }): Promise<'applied' | 'ignored_older' | 'ignored_closed' | 'unmatched'>
}
```
1. Buscar intento por `provider_ref`. Sin coincidencia → `unmatched` (el handler reintenta: puede que el paso 3 de `StartNextAttempt` aún no confirmó; tras `max_attempts` queda `failed` visible).
2. `SELECT incidents ... FOR UPDATE` y luego el intento `FOR UPDATE` (siempre en ese orden para evitar interbloqueos).
3. `toAttemptStatus`. Registrar `last_provider_rank`, tiempos y `incident_events` `call_attempt_result` con `{ ordinal, status }`.
4. Efectos según el nuevo estado, **solo si la incidencia sigue en `pending_contact`/`contacting`**:
   - `answered_transport` → evento `transport_answered`; `enqueue HUMAN_CONFIRM_TIMEOUT` en `now + PD03_HUMAN_CONFIRM_TIMEOUT_SEC`. **No** cambia la incidencia a `caregiver_informed`.
   - `human_confirmed` (confirmación explícita durante la llamada) → incidencia `caregiver_informed`; `stopPlan(…, 'human_confirmed')`; evento `caregiver_informed`; `NOTIFY_INCIDENT_UPDATE`.
   - Terminal sin contestar → incidencia `pending_contact`; encolar siguiente en `now + pause`.
5. Si la incidencia ya no está en contacto → registrar el hecho y devolver `ignored_closed` (no reabrir, no nuevos intentos) (T30).

### `ReconcileAttemptHandler`
- Intento terminal o `human_confirmed`/`answered_transport` → `discarded`.
- `telephony.findCallByAttempt(attemptId)`:
  - `null` y el intento está `uncertain` → la llamada no se creó: intento `failed` (`not_created`), siguiente intento encolado.
  - Snapshot → insertar `provider_events` sintético (`event_key: reconcile:<attemptId>:<status>`) y `applier.apply` en la misma tx; guardar `provider_ref` si faltaba.
  - Sigue en curso (`queued`/`ringing`) → `retry` con `retryInSec: 30`.
- Errores del proveedor → `retry`.

### `HumanConfirmTimeoutHandler`
- Si el intento sigue `answered_transport` y la incidencia sigue `contacting` → `PD03_ON_UNCONFIRMED_ANSWER='continue'`: intento `answered_unconfirmed`, evento `human_confirm_timeout`, incidencia `pending_contact`, encolar siguiente. `// PD-03 pendiente: buzón / respuesta no humana`. Otros valores de config → no implementados: el arranque falla si se configuran.
- Si no → `discarded`.

### `CancelActiveCallHandler`
- Si el intento sigue activo → `telephony.cancelCall(providerRef)` (si hay `providerRef`) y marcarlo `canceled` (`superseded_by_decision`). Los webhooks tardíos de ese intento quedan `ignored_closed`.

### `DecisionsService`
```typescript
type DecisionOption = 'take_charge' | 'postpone' | 'request_emergency'
interface DecisionResult {
  incident: IncidentView
  decision: { id: string; option: DecisionOption; at: string; byAccountId: string }
  replay: boolean
  emergency?: { autoCall: 'not_enabled'; recommendedAction: 'open_dialer' }   // solo request_emergency
}
class DecisionsService {
  decide(p: Principal, incidentId: string, input: DecideDto): Promise<DecisionResult>          // @Idempotent
  recordEmergencyAction(p: Principal, incidentId: string, input: EmergencyActionDto): Promise<void>
}
```
`decide` (`asAccount`, transacción):
1. `requireAccess` con relación `caregiver` (el usuario no se atribuye atención de cuidador, BE-03 §3) → si `user` → `FORBIDDEN_ACTION`.
2. `SELECT incidents ... FOR UPDATE`.
3. **Replay**: si esta cuenta ya registró la misma `option` y el estado actual es el `resulting_status` de esa decisión → devolver con `replay=true`.
4. `expectedVersion != version` → si `closed_assisted` → `INCOMPATIBLE_STATE` con `details.current` (otro cuidador ya se encargó); si no → `VERSION_CONFLICT` con `details.current`.
5. Si el estado era `pending_contact`/`contacting` → evento `caregiver_informed` (actor = cuenta). Si hay intento activo cuyo `linked_account_id` es esta cuenta → intento `human_confirmed`.
6. Según opción (`assertTransition` antes de escribir):

| Opción | Nuevo estado | Efectos en la misma tx |
|--------|--------------|------------------------|
| `take_charge` | `closed_assisted` | `closed_at`, `closed_by_account_id`; `stopPlan('caregiver_decision')` (+ `CANCEL_ACTIVE_CALL` si había activo); eventos `decision_take_charge`, `closed_assisted`; `// plan 09: FollowupsService.createForIncident(tx, incident)`; `NOTIFY_INCIDENT_UPDATE` |
| `postpone` | `attention_postponed` | `stopPlan`; `enqueue POSTPONE_REMINDER` en `now + PD06_POSTPONE_REMINDER_SEC` y `POSTPONE_COLLECTIVE` en `now + PD06_POSTPONE_COLLECTIVE_SEC` (ambos con `payload.decisionId`); evento `decision_postpone`; `NOTIFY_INCIDENT_UPDATE` |
| `request_emergency` | `escalation_required` (`caregiver_request`) | `stopPlan`; eventos `decision_request_emergency`, `escalation_required`; `NOTIFY_INCIDENT_UPDATE`; respuesta con `emergency.autoCall='not_enabled'` |

7. Insertar `caregiver_decisions`. Si la unique de `take_charge` salta (carrera) → capturar `P2002` → releer y devolver `INCOMPATIBLE_STATE` con el cierre existente (o replay si fue la misma cuenta).

`recordEmergencyAction`: `EmergencyActionDto { kind: 'dialer_opened' }`; usuario o cuidador con acceso; evento `emergency_dialer_opened`. **No** cambia estado ni afirma comunicación (BE-06 §7).

### Handlers de posposición
- `POSTPONE_REMINDER`: si la incidencia sigue `attention_postponed` y la última decisión es `payload.decisionId` → `NotificationsService.createForRecipients` tipo `postpone_reminder` solo al cuidador que pospuso, prioridad `attention`; evento `postpone_reminder_sent`. Si no → `discarded`.
- `POSTPONE_COLLECTIVE`: misma comprobación → tipo `postpone_collective` a destinatarios `PD05_POSTPONE_COLLECTIVE_RECIPIENTS` (todos los cuidadores); evento `postpone_collective_sent`. **No** reinicia llamadas ni escala (BE-06 §7). `// PD-05/PD-06 pendientes`.

### Controlador dev (solo no producción)
`POST /v1/dev/fake-telephony/attempts/:attemptId/events` `{ status: ProviderCallStatus }` → `FakeTelephonyAdapter.emit`. Requiere principal autenticado con acceso a la incidencia del intento. No se registra el controlador si `NODE_ENV=production`.

---

## Endpoints y DTOs

| Método y ruta | Guard | Body | Respuesta |
|---------------|-------|------|-----------|
| `POST /v1/incidents/:id/decisions` | `@Idempotent()` | `DecideDto { option: DecisionOption; expectedVersion: number }` | `DecisionResult` (201 / 200 replay) |
| `POST /v1/incidents/:id/emergency-actions` | — | `EmergencyActionDto { kind: 'dialer_opened' }` | 204 |
| `GET /v1/incidents/:id/calls` | — | — | `CallAttemptView[]` |
| `POST /v1/provider-events/:provider` | `@Public()` | firmado por proveedor | 204 |

```typescript
interface CallAttemptView {
  ordinal: number; contactName: string; contactPhoneMasked: string
  status: AttemptStatus; statusReason: string | null
  requestedAt: string | null; answeredAt: string | null; endedAt: string | null
  transportAnswered: boolean      // conexión telefónica
  humanConfirmed: boolean         // evidencia humana: son campos distintos (BE-R24)
}
```
`IncidentDetailView` añade `calls: CallAttemptView[]` y `decisions: Array<{ option; at; byAccountId; byDisplayName }>`.

---

## Dependencias

Ninguna nueva. Variables nuevas: `TELEPHONY_PROVIDER=fake`, `FAKE_TELEPHONY_WEBHOOK_SECRET`, `DATABASE_URL_INGEST`.

---

## Edge cases y manejo de errores

- **Ningún contacto contesta** → 1–1–2–2 sin solapes → `escalation_required/attempts_exhausted` (T10, T13).
- **Contesta el primero o el segundo** (confirmación humana) → intentos restantes `canceled`; no se crean nuevos (T11).
- **Contesta un buzón** (`answered` sin `human_confirmed` ni decisión) → `answered_transport`; tras `PD03_HUMAN_CONFIRM_TIMEOUT_SEC` → `answered_unconfirmed` y sigue el plan; nunca `caregiver_informed` (T12).
- **Dos cuidadores pulsan “Yo me encargo” a la vez** → `FOR UPDATE` + unique parcial → 1 cierre, 1 seguimiento; el segundo recibe `INCOMPATIBLE_STATE` con el cierre existente (T15).
- **Webhook repetido o desordenado tras el cierre** → `provider_events` único; `ignored_closed`; no reabre ni marca (T30).
- **Petición de llamada con resultado incierto** → `uncertain` + reconciliación; nunca un segundo `createCall` a ciegas para el mismo intento.
- **Contacto eliminado durante el episodio** → su intento `skipped`; la copia histórica no autoriza a llamarlo.
- **Cuidador pierde acceso** → `decide` → `NOT_FOUND`.
- **Posponer y luego “Yo me encargo” antes de 5 min** → los handlers de posposición encuentran otro estado/decisión → `discarded` (T16, T17).
- **Contacto sin app que confirma por la llamada** → `caregiver_informed`; las tres decisiones requieren la app. `// PD-01/PD-03: interacción en llamada`.
- **Notificación antigua abierta** → Android consulta `GET /v1/incidents/:id` antes de ofrecer acciones; una acción con versión vieja → 409.

---

## Orden de implementación

1. Migración `...000800` + seed de `guardme_ingest`; `pnpm db:reset && pnpm db:sync`.
2. `DbService.asIngest`.
3. `attempt-status.ts` + unit tests de la tabla completa.
4. `TelephonyPort` + `FakeTelephonyAdapter` (+ unit test de firma).
5. `CallPlanService` y hook en `IncidentsService.activate`.
6. `ProviderEventApplierService` + webhook controller (`rawBody`).
7. Handlers: `StartNextAttempt`, `ApplyProviderEvent`, `ReconcileAttempt`, `HumanConfirmTimeout`, `CancelActiveCall`.
8. `DecisionsService` + controller; handlers de posposición.
9. `getDetail` con `calls` y `decisions`; `GET /v1/incidents/:id/calls`.
10. Controlador dev.
11. Tests de integración con `worker-harness` + `FakeClock` (avanzar tiempo, `drain()`).

---

## Criterios de aceptación

- [ ] T10: cuatro `no_answer` → los intentos se piden en orden ordinal 1,2,3,4 (contactos 1,1,2,2); en ningún instante hay dos activos (consulta en cada paso); la incidencia termina `escalation_required/attempts_exhausted`.
- [ ] T11: `human_confirmed` en el intento 2 → intentos 3 y 4 `canceled`, nunca `requesting`.
- [ ] T12: `answered` sin confirmación → tras avanzar `PD03_HUMAN_CONFIRM_TIMEOUT_SEC` → `answered_unconfirmed` y se pide el intento siguiente; la incidencia nunca pasa por `caregiver_informed`.
- [ ] T13: el detalle muestra `escalation_required` y `capabilities.emergencyAutoCall='not_enabled'`; no hay ningún registro de llamada al 911.
- [ ] T15: dos `take_charge` concurrentes de cuentas distintas → una decisión `take_charge`, un `closed_assisted`, segunda respuesta 409 con el cierre existente.
- [ ] T16: `postpone` → avanzar 5 min → un `postpone_reminder` solo al cuidador que pospuso.
- [ ] T17: `postpone` → avanzar 2 h → `postpone_collective` a todos los cuidadores; ningún intento de llamada nuevo ni escalamiento.
- [ ] T30: reenviar el mismo webhook 3 veces y enviar `ringing` después de `no_answer` → un único `provider_events` por clave, estados monotónicos; webhook tras el cierre → `ignored_closed`, incidencia sigue cerrada.
- [ ] `failNextCreate('uncertain_but_created')` → no hay segundo `createCall` para ese intento; la reconciliación recupera `providerRef`.
- [ ] Webhook con firma inválida → 401 y nada insertado.
- [ ] Usuario (relación `user`) intenta `take_charge` → 403.
- [ ] `pnpm lint`, `pnpm test`, `pnpm test:int` en verde.
