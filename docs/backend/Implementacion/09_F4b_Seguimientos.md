# Spec 09 (F4b): Seguimiento posterior al cierre (“Recibió asistencia”)

> **Para:** Cursor AI — Rol: Developer
> **Autor del plan:** Claude (Tech Lead)
> **Stack:** NestJS 11 · Prisma 6 · luxon · acciones pendientes (plan 06)
> **Fecha:** 14 de noviembre de 2026
> **Docs de origen:** Propuesta §10.2–10.3; BE-07 §3, §9–11; BE-04 §6; BE-06 §7
> **Prerrequisito:** planes 01–08 en verde

---

## Instrucciones para Cursor

No tomes decisiones de arquitectura por tu cuenta. Implementa este plan exactamente como está descrito.
Si algo no está especificado, pregunta antes de asumir.
Contexto a cargar: `@docs/backend/Implementacion/00_Indice_Convenciones_y_Reglas_Cursor.md` `@backend/src/modules/incidents/decisions.service.ts` `@backend/src/modules/notifications/notifications.service.ts` `@backend/src/modules/pending-actions/action-handler.ts` `@docs/backend/Desglose/07_Notificaciones_Tareas_Recordatorios_y_Seguimientos.md`

---

## Objetivo

Cuando un cuidador elige “Yo me encargo”, la incidencia se cierra como *Recibió asistencia* (plan 07) y, en la misma transacción, se crea **un único seguimiento independiente**. El seguimiento pregunta a la persona al **día siguiente a las 7:00 a. m. en la zona del perfil**; si no responde en **dos horas**, pregunta al cuidador; una respuesta negativa programa **una única última consulta a tres días**; sin respuesta se cierra como **inconcluso**. El seguimiento nunca reabre la incidencia ni dispara escalamiento médico. Todo vencimiento es una acción pendiente persistente y se prueba con reloj controlado.

---

## Archivos

| Acción | Ruta (`backend/`) | Descripción |
|--------|-------------------|-------------|
| CREAR | `supabase/migrations/20261114001000_followups.sql` | `followups`, `followup_questions`, `followup_responses`, grants, RLS |
| MODIFICAR | `prisma/schema.prisma` | `pnpm db:sync` |
| CREAR | `src/modules/followups/followups.module.ts` | |
| CREAR | `src/modules/followups/followup-schedule.ts` | Funciones puras de calendario |
| CREAR | `src/modules/followups/followup-schedule.spec.ts` | Unit tests (antes/después de 7:00, cambio de fecha, DST) |
| CREAR | `src/modules/followups/followup-machine.ts` | Transiciones puras del seguimiento |
| CREAR | `src/modules/followups/followup-machine.spec.ts` | |
| CREAR | `src/modules/followups/followups.service.ts` | `createForIncident`, respuestas, pendientes |
| CREAR | `src/modules/followups/followups.controller.ts` | `GET /v1/followups/pending`, `POST /v1/followup-questions/:id/responses` |
| CREAR | `src/modules/followups/handlers/publish-question.handler.ts` | `FOLLOWUP_PUBLISH_QUESTION` |
| CREAR | `src/modules/followups/handlers/question-deadline.handler.ts` | `FOLLOWUP_QUESTION_DEADLINE` |
| MODIFICAR | `src/modules/incidents/decisions.service.ts` | Reemplazar el comentario `// plan 09` por `FollowupsService.createForIncident(tx, incident)` |
| MODIFICAR | `src/modules/incidents/incidents.service.ts` | `getDetail` añade `followup` |
| MODIFICAR | `src/config/policy.config.ts` | `PD07_CAREGIVER_RECIPIENT` (`closing_caregiver`), `PD07_LAST_RECIPIENT` (`user`) |
| MODIFICAR | `src/worker.module.ts` | Registrar handlers |
| CREAR | `test/followups.int-spec.ts` | T18–T21 |

---

## Modelo de datos (migración `20261114001000_followups.sql`)

### `guardme.followups`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK | | |
| `incident_id` | uuid not null **unique** FK | Una secuencia por cierre (T15) |
| `profile_id` uuid not null FK | | |
| `closing_account_id` | uuid not null | Cuidador que se encargó |
| `time_zone` | text not null | Copiada del perfil al crear (explicable aunque cambie después) |
| `status` | text not null CHECK in (`scheduled`,`awaiting_user`,`awaiting_caregiver`,`awaiting_last`,`closed_ok`,`closed_no_followup`,`closed_encouraged`,`closed_inconclusive`) | |
| `created_at` · `closed_at` timestamptz null | | |
| `version` | int default 1 | trigger |

### `guardme.followup_questions`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `followup_id` FK | | |
| `round` | text not null CHECK in (`first`,`caregiver`,`last`) | unique `(followup_id, round)` → rondas acotadas, nunca infinitas |
| `recipient_kind` | text not null CHECK in (`user`,`caregiver`) | |
| `recipient_account_ids` | uuid[] not null | Resueltos al publicar |
| `publish_at` · `deadline_at` | timestamptz not null | Previstos (no se reescriben si el worker se retrasa) |
| `published_at` timestamptz null | | Efectivo |
| `status` | text not null CHECK in (`scheduled`,`published`,`answered`,`expired`,`canceled`) | |
| `version` | int default 1 | trigger |

### `guardme.followup_responses`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `question_id` FK · `account_id` FK | | |
| `option` | text not null CHECK in (`well`,`not_well`,`no_followup_needed`) | |
| `at` | timestamptz default now() | |
| `applied` | boolean not null | `false` = respuesta tardía conservada sin efecto |
| Índice | unique parcial `(question_id) WHERE applied` | Una decisión vigente por consulta |

### Grants y RLS
| Tabla | `guardme_api` | `guardme_worker` |
|-------|---------------|------------------|
| `followups` | SELECT, INSERT, UPDATE(`status`,`closed_at`) | SELECT, UPDATE |
| `followup_questions` | SELECT, INSERT, UPDATE(`status`) | SELECT, INSERT, UPDATE |
| `followup_responses` | SELECT, INSERT | SELECT |

Políticas `guardme_api`: `followups` → `has_profile_access(profile_id)`; las otras dos vía `followups`. `guardme_worker`: `USING (true)`.

---

## Reglas de calendario (`followup-schedule.ts`)

```typescript
function firstQuestionAt(closedAtUtc: Date, timeZone: string, localHour: number): Date
// Día calendario siguiente al cierre en `timeZone`, a `localHour`:00. Siempre el día siguiente,
// aunque se cierre a las 00:30 o a las 06:59 (T18). No equivale a sumar 24 h.

function lastQuestionAt(negativeAnswerAtUtc: Date, timeZone: string, localHour: number, delayDays: number): Date
// `delayDays` días calendario después de la fecha local de la respuesta negativa, a `localHour`:00.
// Convención propuesta (misma hora local que la primera consulta). // PD-07 pendiente

function plusSeconds(fromUtc: Date, seconds: number): Date
```
Valores: `localHour = FOLLOWUP_FIRST_LOCAL_HOUR (7)`, `delayDays = FOLLOWUP_LAST_DELAY_DAYS (3)`. Hora local inexistente por DST → la siguiente válida (misma regla que el plan 08).

---

## Máquina del seguimiento (`followup-machine.ts`)

| Estado / evento | Respuesta `well` | `no_followup_needed` | `not_well` | Vence plazo sin respuesta |
|-----------------|------------------|----------------------|------------|---------------------------|
| `awaiting_user` (ronda `first`) | `closed_ok` | `closed_no_followup` | crear ronda `last` → `awaiting_last` | crear ronda `caregiver` → `awaiting_caregiver` |
| `awaiting_caregiver` | `closed_ok` | `closed_no_followup` | crear ronda `last` → `awaiting_last` | `closed_inconclusive` |
| `awaiting_last` | `closed_ok` | `closed_no_followup` | `closed_encouraged` (mostrar aliento, sin más consultas) | `closed_inconclusive` |

`scheduled` → `awaiting_user` al publicar la primera ronda. Los estados `closed_*` son terminales. La incidencia **no cambia** en ninguna transición (sigue `closed_assisted`).

```typescript
type FollowupEvent = { kind: 'answer'; option: 'well' | 'not_well' | 'no_followup_needed' } | { kind: 'deadline' }
function nextFollowupStep(status: FollowupStatus, round: Round, ev: FollowupEvent):
  { status: FollowupStatus; createRound?: 'caregiver' | 'last'; closeAs?: FollowupStatus; showEncouragement?: boolean }
```

---

## Contratos de funciones

### `FollowupsService`
```typescript
class FollowupsService {
  createForIncident(tx: Tx, incident: IncidentRow): Promise<void>                          // dentro de la tx de take_charge
  pendingForMe(p: Principal): Promise<PendingQuestionView[]>
  respond(p: Principal, questionId: string, input: RespondFollowupDto): Promise<RespondFollowupResult>
}
```
`createForIncident`:
1. Insertar `followups` (`status='scheduled'`, `time_zone` del perfil, `closing_account_id = incident.closed_by_account_id`). La unique por `incident_id` impide un segundo seguimiento.
2. Ronda `first`: `recipient_kind='user'`; `publish_at = firstQuestionAt(closed_at, tz, 7)`; `deadline_at = publish_at + PD07_FOLLOWUP_USER_WINDOW_SEC`.
   - Si el perfil no tiene ninguna cuenta con relación `user` activa → la ronda `first` se crea con `recipient_kind='caregiver'` y se trata como ronda `caregiver` (evento `followup_created` con `context.reason='no_user_account'`). `// PD-07 pendiente`.
3. `enqueue FOLLOWUP_PUBLISH_QUESTION` (`runAt: publish_at`, `dedupeKey: followup:<questionId>:publish`) y `FOLLOWUP_QUESTION_DEADLINE` (`runAt: deadline_at`, `dedupeKey: followup:<questionId>:deadline`).
4. Evento de incidencia `followup_created`.

`respond` (`asAccount`, `SELECT question ... FOR UPDATE`, luego `followup FOR UPDATE`):
1. El principal debe estar en `recipient_account_ids` **y** conservar acceso activo → si no, `NOT_FOUND`.
2. Pregunta `published` → aplicar `nextFollowupStep`; insertar respuesta `applied=true`; pregunta `answered`; crear siguiente ronda si toca (con sus dos acciones pendientes); cerrar si toca (`closed_at`).
3. Pregunta `answered` y la misma cuenta repite la misma opción → replay 200.
4. Pregunta `expired` o `answered` por otra persona → insertar respuesta `applied=false` (se conserva la secuencia) y devolver 200 con `applied: false`. No sobrescribe la decisión vigente (BE-07 §11).
5. Pregunta `scheduled` (aún no publicada) → `INCOMPATIBLE_STATE`.

```typescript
interface RespondFollowupResult { applied: boolean; followupStatus: FollowupStatus; showEncouragement: boolean }
interface PendingQuestionView { questionId: string; followupId: string; incidentId: string; profileId: string; profileName: string; round: 'first' | 'caregiver' | 'last'; publishedAt: string; deadlineAt: string; options: ['well', 'not_well', 'no_followup_needed'] }
```
El texto de aliento es una clave (`followup.encouragement`) que Android traduce; no expresa diagnóstico ni garantía (BE-07 §9).

### `PublishQuestionHandler` (`FOLLOWUP_PUBLISH_QUESTION`)
1. Pregunta `scheduled` y seguimiento no cerrado → si no, `discarded`.
2. Resolver destinatarios en este momento (accesos vigentes):
   - `user` → cuentas con relación `user` activa.
   - `caregiver` → `PD07_CAREGIVER_RECIPIENT='closing_caregiver'`: el cuidador que se encargó si conserva acceso; si no lo conserva → todos los cuidadores activos, con evento `context.reason='recipient_revoked_fallback'`. `// PD-07 pendiente`.
   - `last` → `PD07_LAST_RECIPIENT='user'` (con el mismo respaldo a cuidadores si no hay usuario).
3. Sin destinatarios → la pregunta se publica igual (para que el vencimiento cierre como inconcluso) y se registra `recipients=0`.
4. `published_at = now`, `status='published'`; seguimiento `awaiting_user|awaiting_caregiver|awaiting_last` según la ronda.
5. `NotificationsService.createForRecipients` tipo `followup_question`, prioridad `agenda`, `expiresAt = deadline_at`.

### `QuestionDeadlineHandler` (`FOLLOWUP_QUESTION_DEADLINE`)
1. Pregunta `published` sin respuesta aplicada → si no, `discarded`.
2. Si el worker despertó antes de `deadline_at` (reloj) → `retry` con `retryInSec` hasta el plazo.
3. Pregunta `expired`; aplicar `nextFollowupStep(…, { kind: 'deadline' })`:
   - Ronda `first` → crear ronda `caregiver` con `publish_at = now`, `deadline_at = now + PD07_FOLLOWUP_CAREGIVER_WINDOW_SEC` y sus acciones.
   - Ronda `caregiver` o `last` → `closed_inconclusive`.
4. Las rondas `last` usan `deadline_at = publish_at + PD07_FOLLOWUP_LAST_WINDOW_SEC`.

---

## Endpoints y DTOs

| Método y ruta | Body | Respuesta |
|---------------|------|-----------|
| `GET /v1/followups/pending` | — | `PendingQuestionView[]` |
| `POST /v1/followup-questions/:id/responses` | `RespondFollowupDto { option: 'well' \| 'not_well' \| 'no_followup_needed' }` | `RespondFollowupResult` |

`IncidentDetailView` añade `followup: { id; status; rounds: Array<{ round; recipientKind; publishAt; publishedAt; deadlineAt; status; answer: { option; byDisplayName; at } | null }> } | null`.

---

## Dependencias

Ninguna nueva (luxon ya instalado en el plan 08).

---

## Edge cases y manejo de errores

- **Cierre a las 06:59 o a las 23:59** → primera consulta el día siguiente a las 7:00 local (T18).
- **Usuario no responde en 2 h** → ronda `caregiver` al cuidador definido por PD-07 (T19).
- **Respuesta negativa** → una sola ronda `last` a 3 días; una segunda negativa → `closed_encouraged`, sin tercera consulta ni escalamiento (T20, T21).
- **Sin respuesta en `caregiver` o `last`** → `closed_inconclusive`; la incidencia sigue `closed_assisted` (T21).
- **Usuario responde tarde, tras derivar** → respuesta guardada con `applied=false`; la ronda del cuidador sigue vigente.
- **Dos respuestas simultáneas a la misma pregunta** → `FOR UPDATE` + unique parcial → una aplicada, la otra `applied=false`.
- **Cuenta revocada** → no recibe la consulta ni puede responder.
- **Worker caído durante el vencimiento** → la acción se ejecuta al volver; `publish_at`/`deadline_at` previstos se conservan y `published_at` muestra el retraso real (BE-07 §10).
- **Zona del perfil cambia tras el cierre** → se usa la `time_zone` copiada en el seguimiento (vencimiento único y explicable).

---

## Orden de implementación

1. Migración `...001000`; `pnpm db:reset && pnpm db:sync`.
2. `followup-schedule.ts` + tests.
3. `followup-machine.ts` + tests (todas las celdas de la tabla).
4. `FollowupsService.createForIncident` e integración en `DecisionsService` (take_charge).
5. Handlers de publicación y vencimiento.
6. `respond`, `pendingForMe` + controller.
7. `getDetail` con `followup`.
8. Tests de integración con `FakeClock` + `worker-harness`.

---

## Criterios de aceptación

- [ ] T18: cerrar a las 06:30 y a las 21:00 hora de Panamá → `publish_at` = día siguiente 07:00 America/Panama (12:00 UTC) en ambos casos.
- [ ] T19: avanzar a 07:00 + 2 h sin respuesta → ronda `caregiver` publicada al cuidador que se encargó; seguimiento `awaiting_caregiver`.
- [ ] T20: responder `not_well` en la primera ronda → ronda `last` con `publish_at` = 3 días después a las 07:00 local; no existe otra ronda.
- [ ] T21: (a) `not_well` en `last` → `closed_encouraged` y `showEncouragement=true`; (b) sin respuesta en `last` → `closed_inconclusive`; en ambos la incidencia sigue `closed_assisted`.
- [ ] Respuesta `well` en cualquier ronda → `closed_ok`; `no_followup_needed` → `closed_no_followup`.
- [ ] Repetir `take_charge` (replay) no crea un segundo seguimiento.
- [ ] Reiniciar el worker entre la creación y la publicación → la pregunta se publica una vez.
- [ ] `pnpm lint`, `pnpm test`, `pnpm test:int` en verde.
