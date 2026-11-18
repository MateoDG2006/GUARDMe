# Spec 08 (F4a): Recordatorios compartidos, horarios, ocurrencias y respuestas

> **Para:** Cursor AI — Rol: Developer
> **Autor del plan:** Claude (Tech Lead)
> **Stack:** NestJS 11 · Prisma 6 · luxon · pg-boss (tarea programada)
> **Fecha:** 14 de noviembre de 2026
> **Docs de origen:** Propuesta §6.2, §15; BE-03 §3; BE-04 §7; BE-05 §6, §11; BE-07 §7–8, §10
> **Prerrequisito:** planes 01–07 en verde

---

## Instrucciones para Cursor

No tomes decisiones de arquitectura por tu cuenta. Implementa este plan exactamente como está descrito.
Si algo no está especificado, pregunta antes de asumir.
Contexto a cargar: `@docs/backend/Implementacion/00_Indice_Convenciones_y_Reglas_Cursor.md` `@backend/src/modules/profiles/access.service.ts` `@backend/src/modules/pending-actions/maintenance.service.ts` `@docs/backend/Desglose/07_Notificaciones_Tareas_Recordatorios_y_Seguimientos.md`

---

## Objetivo

La agenda (medicamentos y citas) es **compartida** entre el usuario y sus cuidadores: el servidor guarda la **definición** (autor, relación del autor al crearla, título), sus **horarios** (hora local, días, zona IANA, vigencia) y genera **ocurrencias** con ID estable. Android descarga una ventana de próximas ocurrencias y es el **único disparador físico** (aviso local + orden de luz/sonido al bastón), para no duplicar señales entre push y agenda local. La regla confirmada se aplica en el servidor: **el usuario no puede borrar recordatorios creados por un cuidador**, aunque llame directamente a la API. Tomado/Pospuesto/Omitido son declaraciones desde la app; la falta de respuesta nunca se convierte en “Omitido”.

---

## Archivos

| Acción | Ruta (`backend/`) | Descripción |
|--------|-------------------|-------------|
| CREAR | `supabase/migrations/20261114000900_reminders.sql` | `reminders`, `reminder_schedules`, `reminder_occurrences`, grants, RLS |
| MODIFICAR | `prisma/schema.prisma` | `pnpm db:sync` |
| CREAR | `src/modules/reminders/reminders.module.ts` | |
| CREAR | `src/modules/reminders/occurrence-generator.ts` | Función pura: horario + intervalo → instantes UTC |
| CREAR | `src/modules/reminders/occurrence-generator.spec.ts` | Unit tests (zonas, días, vigencia, DST) |
| CREAR | `src/modules/reminders/reminder-policy.ts` | Reglas de autoría puras (`canDelete`, `canEdit`, `canRespond`) |
| CREAR | `src/modules/reminders/reminder-policy.spec.ts` | Matriz de permisos |
| CREAR | `src/modules/reminders/reminders.service.ts`, `reminders.controller.ts` | CRUD de definiciones y horarios |
| CREAR | `src/modules/reminders/occurrences.service.ts`, `occurrences.controller.ts` | Ventana de ocurrencias y respuestas |
| CREAR | `src/modules/reminders/occurrence-horizon.job.ts` | Tarea programada que extiende el horizonte de ocurrencias |
| MODIFICAR | `src/modules/pending-actions/maintenance.service.ts` | Registrar `extend-occurrence-horizon` |
| MODIFICAR | `src/config/policy.config.ts` | `OCCURRENCE_HORIZON_DAYS` (7), `PD08_OCCURRENCE_SNOOZE_SEC` (600) |
| CREAR | `test/reminders.int-spec.ts` | T22, T23, T24 (parte backend) |

---

## Modelo de datos (migración `20261114000900_reminders.sql`)

### `guardme.reminders`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `profile_id` FK | | |
| `kind` | text not null CHECK in (`medication`,`appointment`) | |
| `title` | text not null (1..120) | |
| `notes` | text null (≤500) | No se copia a notificaciones de pantalla bloqueada |
| `author_account_id` | uuid not null FK | **Inmutable** (sin grant UPDATE) |
| `author_relation` | text not null CHECK in (`user`,`caregiver`) | **Inmutable**; se conserva aunque cambie la vinculación (BE-04 §7) |
| `status` | text not null default `'active'` CHECK in (`active`,`inactive`) | Borrado lógico |
| `deactivated_at` timestamptz null · `deactivated_by_account_id` uuid null | | |
| `created_at`, `updated_at`, `version` | | trigger |

### `guardme.reminder_schedules`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `reminder_id` FK | | |
| `local_time` | time not null | Hora de calendario |
| `days_of_week` | smallint[] not null | ISO 1=lunes … 7=domingo; CHECK no vacío y valores 1..7 |
| `time_zone` | text not null | IANA; por defecto la del perfil |
| `valid_from` | date not null · `valid_to` date null | CHECK `valid_to IS NULL OR valid_to >= valid_from` |
| `status` | text not null default `'active'` CHECK in (`active`,`ended`) | |
| `created_at` | timestamptz | |

### `guardme.reminder_occurrences`
| Columna | Tipo | Regla |
|---------|------|-------|
| `id` uuid PK · `reminder_id` FK · `schedule_id` FK | | ID estable compartido con Android |
| `scheduled_for` | timestamptz not null | unique `(schedule_id, scheduled_for)` |
| `status` | text not null default `'scheduled'` CHECK in (`scheduled`,`taken`,`postponed`,`skipped`,`acknowledged`,`canceled`) | |
| `cancel_reason` | text null CHECK in (`reminder_deactivated`,`schedule_changed`) | |
| `postponed_until` | timestamptz null | |
| `responded_by_account_id` uuid null · `responded_at` timestamptz null · `response_installation_id` uuid null | | |
| `version` | int default 1 | trigger |

Índices: `(reminder_id, scheduled_for)`; `(scheduled_for) WHERE status IN ('scheduled','postponed')`.

### Grants y RLS
| Tabla | `guardme_api` | `guardme_worker` |
|-------|---------------|------------------|
| `reminders` | SELECT, INSERT, UPDATE(`title`,`notes`,`status`,`deactivated_at`,`deactivated_by_account_id`) | SELECT |
| `reminder_schedules` | SELECT, INSERT, UPDATE(`status`,`valid_to`) | SELECT |
| `reminder_occurrences` | SELECT, INSERT, UPDATE(`status`,`cancel_reason`,`postponed_until`,`responded_by_account_id`,`responded_at`,`response_installation_id`) | SELECT, INSERT |

Políticas `guardme_api`:
- `reminders`: `USING/WITH CHECK (guardme.has_profile_access(profile_id))`. INSERT además `WITH CHECK (author_account_id = guardme.ctx_account_id() AND author_relation = guardme.profile_relation(profile_id))` → el cliente no puede falsear la autoría.
- **Defensa en profundidad de la regla de borrado**: política UPDATE adicional `RESTRICTIVE` en `reminders`: `WITH CHECK (status = 'active' OR author_relation = 'user' OR guardme.profile_relation(profile_id) = 'caregiver')` → aunque el servicio fallara, el rol API no puede desactivar un recordatorio de cuidador en contexto de usuario.
- `reminder_schedules`, `reminder_occurrences`: vía `EXISTS (SELECT 1 FROM guardme.reminders r WHERE r.id = reminder_id AND guardme.has_profile_access(r.profile_id))`.
- `guardme_worker`: `USING (true)`.

---

## Contratos de funciones

### `occurrence-generator.ts`
```typescript
interface ScheduleSpec { id: string; localTime: string /* 'HH:mm' */; daysOfWeek: number[]; timeZone: string; validFrom: string /* 'YYYY-MM-DD' */; validTo: string | null }
function generateOccurrences(s: ScheduleSpec, fromUtc: Date, toUtc: Date): Date[]
```
- Recorre días locales en `timeZone` con luxon; incluye un día si su `weekday` ∈ `daysOfWeek` y está en `[validFrom, validTo]`; construye `DateTime.fromObject({ ... hour, minute }, { zone })`.
- Hora inexistente por cambio de horario (DST) → usar la siguiente hora válida que devuelve luxon; hora repetida → la primera. Documentar con test.
- Devuelve instantes en `[fromUtc, toUtc)`, ordenados, sin duplicados.

### `reminder-policy.ts`
```typescript
type Relation = 'user' | 'caregiver'
function canDelete(requester: Relation, authorRelation: Relation): boolean          // false solo si requester='user' y author='caregiver'
function canEdit(requester: Relation, authorRelation: Relation, pd08UserCanEdit: boolean): 'allowed' | 'not_defined'
function canRespond(requester: Relation): 'allowed' | 'not_defined'                 // user → allowed; caregiver → not_defined (PD-08: registro asistido)
function allowedResponses(kind: 'medication' | 'appointment'): string[]             // medication: taken|postponed|skipped ; appointment: acknowledged|postponed
```
`canEdit` → `not_defined` cuando `requester='user'`, `author='caregiver'` y `PD08_USER_CAN_EDIT_CAREGIVER_REMINDERS=false`. Los estados de cita son una propuesta (BE-07 §8: “las citas pueden necesitar estados propios”). `// PD-08 pendiente`.

### `RemindersService`
```typescript
interface ScheduleInput { localTime: string; daysOfWeek: number[]; timeZone?: string; validFrom: string; validTo?: string | null }
interface ReminderView {
  id: string; profileId: string; kind: 'medication' | 'appointment'; title: string; notes: string | null
  author: { accountId: string; relation: 'user' | 'caregiver'; displayName: string }
  status: 'active' | 'inactive'; version: number
  schedules: Array<ScheduleInput & { id: string; status: string }>
  permissions: { canEdit: boolean; canDelete: boolean }     // calculado para el principal (Android oculta acciones)
}
class RemindersService {
  list(p: Principal, profileId: string, q: { includeInactive?: boolean }): Promise<ReminderView[]>
  create(p: Principal, profileId: string, input: CreateReminderDto): Promise<ReminderView>       // @Idempotent
  update(p: Principal, reminderId: string, input: UpdateReminderDto): Promise<ReminderView>
  deactivate(p: Principal, reminderId: string, expectedVersion: number): Promise<void>
}
```
- `create` (`asAccount`): `requireAccess` → `author_relation = relation` del principal; insertar definición y horarios; generar ocurrencias `[now, now + OCCURRENCE_HORIZON_DAYS)` con `ON CONFLICT DO NOTHING`; auditar `reminder.create`.
- `update`: `canEdit` → `not_defined` → `CAPABILITY_NOT_ENABLED` (`details.policy='PD-08'`). Versión → `VERSION_CONFLICT`. Si cambian `schedules`: horarios activos → `ended` con `valid_to = hoy local`; ocurrencias futuras `scheduled`/`postponed` → `canceled` (`schedule_changed`); crear horarios nuevos y sus ocurrencias. Las ocurrencias pasadas y sus respuestas no se tocan. Audita `reminder.update`.
- `deactivate` (lo que expone `DELETE`): `canDelete=false` → `FORBIDDEN_ACTION` (`details.reason='caregiver_authored'`) + auditar `reminder.delete` `denied`. Si se permite: `status='inactive'`, ocurrencias futuras `canceled` (`reminder_deactivated`), confirmaciones previas intactas. Audita `ok`.

### `OccurrencesService`
```typescript
interface OccurrenceView { id: string; reminderId: string; kind: string; title: string; scheduledFor: string; status: string; postponedUntil: string | null; respondedAt: string | null; respondedBy: string | null; version: number }
class OccurrencesService {
  window(p: Principal, profileId: string, q: { from: string; to: string }): Promise<OccurrenceView[]>   // máx. 14 días
  respond(p: Principal, occurrenceId: string, input: RespondOccurrenceDto): Promise<OccurrenceView>     // @RequireInstallation
}
```
- `respond` (`asAccount`, `SELECT ... FOR UPDATE`):
  1. `canRespond` → caregiver → `CAPABILITY_NOT_ENABLED` (`PD-08`).
  2. Respuesta fuera de `allowedResponses(kind)` → `VALIDATION_FAILED`.
  3. Transiciones: `scheduled → taken|skipped|postponed|acknowledged`; `postponed → taken|skipped|acknowledged|postponed`; terminales (`taken`,`skipped`,`acknowledged`,`canceled`) → misma respuesta = replay 200; distinta → `INCOMPATIBLE_STATE`.
  4. `postponed` → `postponed_until = now + PD08_OCCURRENCE_SNOOZE_SEC` (Android reprograma el aviso local). `// PD-08 pendiente: duración de posposición`.
  5. `expectedVersion` obligatorio → `VERSION_CONFLICT`.
  6. Guardar actor e instalación; auditar `occurrence.respond`.
- El botón del bastón **no** tiene ruta: la declaración solo llega desde la app (T24).

### `OccurrenceHorizonJob` (pg-boss `schedule`, `0 * * * *`)
- Para cada horario `active` de recordatorio `active`, generar ocurrencias hasta `now + OCCURRENCE_HORIZON_DAYS` (`ON CONFLICT DO NOTHING`). Lotes de 500 horarios.
- No marca nada como `skipped` ni avisa por falta de respuesta. `// PD-08 pendiente: aviso al cuidador por falta de confirmación`.

---

## Endpoints y DTOs

| Método y ruta | Guard | Body / Query | Respuesta |
|---------------|-------|--------------|-----------|
| `GET /v1/profiles/:id/reminders` | — | `includeInactive?` | `ReminderView[]` |
| `POST /v1/profiles/:id/reminders` | `@Idempotent()` | `CreateReminderDto { kind; title; notes?; schedules: ScheduleInput[] (1..10) }` | 201 `ReminderView` |
| `PATCH /v1/reminders/:id` | — | `UpdateReminderDto { expectedVersion; title?; notes?; schedules? }` | `ReminderView` |
| `DELETE /v1/reminders/:id` | — | query `expectedVersion` | 204 |
| `GET /v1/profiles/:id/occurrences` | — | `from`, `to` (ISO, ≤14 días) | `OccurrenceView[]` |
| `POST /v1/occurrences/:id/responses` | `@RequireInstallation()` | `RespondOccurrenceDto { response: 'taken'\|'postponed'\|'skipped'\|'acknowledged'; expectedVersion }` | `OccurrenceView` |

Validaciones de DTO: `localTime` `^([01]\d|2[0-3]):[0-5]\d$`; `daysOfWeek` únicos 1..7; `timeZone` válida IANA; `validFrom` fecha.

---

## Dependencias

| Paquete | Versión | Comando |
|---------|---------|---------|
| `luxon` | ^3 | `pnpm add luxon && pnpm add -D @types/luxon` |

---

## Edge cases y manejo de errores

- **Usuario borra recordatorio de cuidador por API directa** → 403 `FORBIDDEN_ACTION`; definición y ocurrencias intactas; auditoría `denied` (T22). La política RLS restrictiva lo impide aunque el servicio tuviera un error.
- **Usuario edita recordatorio de cuidador** → 501 `CAPABILITY_NOT_ENABLED` (PD-08), no un 403 que finja una regla confirmada.
- **Cuidador pierde la vinculación** → su recordatorio sigue con `author_relation='caregiver'`; el usuario sigue sin poder borrarlo.
- **Dos participantes editan a la vez** → el segundo recibe `VERSION_CONFLICT` con la versión vigente (T23).
- **Cambio de horario** → no se reescriben declaraciones previas; las futuras se regeneran.
- **Cambio de zona del perfil** → los horarios conservan su `time_zone`; solo los nuevos usan la nueva. Sin desplazamientos silenciosos.
- **Respuesta duplicada (reintento)** → replay 200.
- **Sin respuesta** → la ocurrencia queda `scheduled`; nunca `skipped` automático.
- **Coincide con una caída** → la prioridad de señales la resuelve Android/bastón; el backend no interviene.

---

## Orden de implementación

1. Migración `...000900`; `pnpm db:reset && pnpm db:sync`.
2. `occurrence-generator.ts` + tests (America/Panama, America/New_York con DST, `validTo`, días sueltos).
3. `reminder-policy.ts` + tests (matriz completa).
4. `RemindersService` + controller.
5. `OccurrencesService` + controller.
6. `OccurrenceHorizonJob` registrado en `MaintenanceService`.
7. Tests de integración.

---

## Criterios de aceptación

- [ ] T22: cuidador crea recordatorio; usuario `DELETE /v1/reminders/:id` → 403; el recordatorio sigue `active` con sus ocurrencias; existe auditoría `denied`. Además, un test con el rol `guardme_api` y contexto del usuario intenta `UPDATE reminders SET status='inactive'` directo → 0 filas / error de política.
- [ ] Usuario borra su propio recordatorio → 204; cuidador borra cualquiera del perfil → 204.
- [ ] T23: dos `PATCH` con la misma `expectedVersion` → uno 200 y otro 409; ambos participantes ven el cambio con `GET`.
- [ ] T24 (backend): respuesta `taken` desde la instalación del usuario → `taken` con actor; cuidador intenta responder → 501 `PD-08`.
- [ ] Crear horario lunes/miércoles 08:00 America/Panama → ocurrencias a las 13:00 UTC esos días dentro del horizonte; regenerar con el job no duplica.
- [ ] Cambiar horario → futuras antiguas `canceled/schedule_changed`, pasadas intactas.
- [ ] `pnpm lint`, `pnpm test`, `pnpm test:int` en verde.
