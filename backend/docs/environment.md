# Variables de entorno — GuardMe backend

Fuente de validación: `src/config/env.config.ts`.  
Archivos de ejemplo:

| Archivo | Uso |
|---|---|
| `.env.example` → `.env` | API/worker locales + Postgres de Supabase CLI (`127.0.0.1:54322`) |
| `.env.docker.example` → `.env.docker` | Stack Docker Compose (host interno `db:5432`) |

La API y el worker **no arrancan** si falta una variable obligatoria o falla la validación.

---

## Cómo elegir el archivo

- **Compose:** `docker compose --env-file .env.docker up --build`
- **Local (pnpm):** `.env` + `pnpm db:start` + `pnpm dev:api` / `pnpm dev:worker`
- **App móvil:** `GuardMeMobile/local.properties` → `guardme.api.base.url` debe apuntar a la misma base que `BETTER_AUTH_URL`

---

## Núcleo (obligatorias)

| Variable | Para qué |
|---|---|
| `NODE_ENV` | Modo de ejecución: `development`, `test` o `production`. Cambia logging, Swagger y reglas (p. ej. telefonía `fake` prohibida en production). |
| `PORT` | Puerto HTTP de la API (p. ej. `3000`). |
| `BETTER_AUTH_SECRET` | Secreto de Better Auth (≥32 caracteres). Firma cookies/tokens. **No** usar el texto `replace-with`. |
| `BETTER_AUTH_URL` | URL pública base de la API que ve el cliente (login, redirects, trusted origins). En móvil/Tailscale debe ser la IP/hostname alcanzable, no solo `localhost`. |
| `SECRET_PEPPER` | Pepper para hashes de códigos secretos (claim de bastón, enrollment, etc.). ≥32 caracteres. |

---

## Base de datos

Cada rol de Postgres tiene su propia URL (RLS y privilegios distintos). Ver también README → “Roles de base de datos”.

| Variable | Rol / uso |
|---|---|
| `DATABASE_URL_AUTH` | Usuario `guardme_auth`. Better Auth / schema `identity`. |
| `DATABASE_URL_API` | Usuario `guardme_api`. Prisma de la API (queries con RLS). |
| `DATABASE_URL_ONBOARDING` | Usuario `guardme_onboarding`. Flujos de onboarding / invitaciones. |
| `DATABASE_URL_WORKER` | Usuario `guardme_worker`. Worker Nest + cola pg-boss. |
| `DATABASE_URL_INGEST` | Usuario `guardme_ingest`. Ingest / webhooks de proveedores. |
| `DATABASE_URL_MIGRATIONS` | Superusuario `postgres`. **Solo** `prisma migrate`, seed y scripts. Nunca en runtime de API/worker. |

Formato: `postgresql://USER:PASS@HOST:PORT/DB` (opcional `?connect_timeout=30`).

### Solo Docker Compose

| Variable | Para qué |
|---|---|
| `POSTGRES_USER` | Usuario **admin** del contenedor `db` (p. ej. `mateo_user_db_backend`). Solo migrate/seed. |
| `POSTGRES_PASSWORD` | Password de ese admin. |
| `POSTGRES_DB` | Nombre de la base (p. ej. `guardme_db_backend`). |
| `POSTGRES_HOST_PORT` | Puerto publicado en el host (default `54323`, para no chocar con Supabase CLI en `54322`). |

Postgres solo crea `POSTGRES_USER` / `POSTGRES_DB` en la **primera** inicialización del volumen.
Si los cambiás después: `docker compose --env-file .env.docker down -v` y volvé a subir.

Las URLs `DATABASE_URL_API` / `_AUTH` / etc. deben seguir usando los roles `guardme_*`
(RLS). El admin personalizado va solo en `POSTGRES_*` y `DATABASE_URL_MIGRATIONS`.

---

## Push (notificaciones)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `PUSH_PROVIDER` | Sí | `fake` (dev/tests) o `fcm` (Firebase Cloud Messaging). |
| `FCM_SERVICE_ACCOUNT_JSON` | Solo si `fcm` | JSON completo de la service account de Firebase (una línea o escapado). |

Con `fake`, la app reporta push simulado; no se envían notificaciones reales.

---

## Telefonía (PSTN / llamadas de escalamiento)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `TELEPHONY_PROVIDER` | Sí | `fake` (simula llamadas), `none` (deshabilitado), `twilio` (PSTN real). |
| `FAKE_TELEPHONY_WEBHOOK_SECRET` | Solo si `fake` | Firma HMAC de webhooks de prueba (`/v1/provider-events/fake`). ≥16 caracteres. |
| `TWILIO_ACCOUNT_SID` | Solo si `twilio` | Account SID (`AC` + 32 hex). |
| `TWILIO_AUTH_TOKEN` | Solo si `twilio` | Auth Token de la cuenta Twilio. |
| `TWILIO_FROM_NUMBER` | Solo si `twilio` | Número origen E.164 (p. ej. `+1737…`). |
| `TWILIO_ANSWER_TWIML` | No | TwiML al contestar. Si se omite, se usa un `Say` en español por defecto. |

**Nota:** el adaptador Twilio **no** usa Status Callback; el estado de la llamada se obtiene por polling (`RECONCILE_CALL_ATTEMPT`, primer poll ~15 s y reintentos cada ~15 s).

Capacidades expuestas al cliente (`/v1/me`):

- `fake` → `telephony: fake`
- `twilio` → `telephony: enabled`
- `none` → `telephony: not_enabled`

**911:** la app abre el marcador del sistema (`Dialer` / `open_dialer`). No se usa VoIP Twilio para emergencias; `emergencyAutoCall` sigue `not_enabled`.

### Checklist de validación manual (Twilio)

1. Poner `TELEPHONY_PROVIDER=twilio` con SID, Auth Token y número `FROM` verificados.
2. Activar una incidencia de prueba que dispare el plan de llamadas a un número móvil propio (no 911).
3. Contestar: el reconcile debe pasar a `answered_*` vía `findCallByAttempt`.
4. No contestar: tras polls, estado `no_answer` / avance al siguiente intento.
5. Confirmar en logs del worker que `RECONCILE_CALL_ATTEMPT` corre ~15 s tras `requested`.
6. Verificar que un 911 desde Persona/Cuidador abre el Dialer nativo y no crea llamada Twilio.

---

## Worker y colas (pg-boss)

| Variable | Para qué |
|---|---|
| `RELAY_INTERVAL_MS` | Cada cuántos ms el relay revisa/encola trabajo pendiente. |
| `ACTION_LEASE_SEC` | Tiempo que un worker “reserva” una pending action antes de que otro pueda tomarla. |
| `ACTION_TIMEOUT_SEC` | Tiempo máximo de ejecución de una action antes de considerarla colgada. |
| `WORKER_CONCURRENCY` | Cuántas actions procesa en paralelo un proceso worker. |
| `WORKER_ID` | (Opcional) Identificador del worker en heartbeats. Default `guardme-worker`. Compose usa `guardme-worker-1`. |
| `INCIDENT_NOTIFICATION_TTL_SEC` | TTL de notificaciones ligadas a un incidente (cuándo dejan de ser relevantes). |
| `IDEMPOTENCY_KEY_RETENTION_DAYS` | Días que se conservan claves de idempotencia antes de limpiarlas. |

---

## Salud (health)

| Variable | Para qué |
|---|---|
| `HEALTH_DETAILS_TOKEN` | Token para ver detalles sensibles de `/health` (≥16 caracteres). |
| `HEALTH_WORKER_STALE_SEC` | Si el último heartbeat del worker es más viejo que esto → unhealthy. |
| `HEALTH_QUEUE_STALE_SEC` | Si la cola no avanza en este intervalo → unhealthy. |
| `HEALTH_PUSH_FAIL_RATIO` | Ratio (0–1) de fallos de push a partir del cual el health marca degradación. |

---

## Ubicación

| Variable | Para qué |
|---|---|
| `LOCATION_ENABLED` | `true` / `false`. Si es `false`, la API rechaza o desactiva features de ubicación y capabilities reporta `location: not_enabled`. |

---

## Políticas de producto (PD-*)

Ajustan timeouts y reglas de negocio del piloto. Validación en arranque; lectura vía `PolicyConfig`.

### Llamadas e incidentes

| Variable | Para qué |
|---|---|
| `PD04_CALL_RING_TIMEOUT_SEC` | Segundos de ring antes de dar por no contestada una tentativa de llamada. |
| `PD04_CALL_PAUSE_BETWEEN_ATTEMPTS_SEC` | Pausa entre una tentativa y la siguiente en el plan de llamadas. |
| `PD03_HUMAN_CONFIRM_TIMEOUT_SEC` | Tiempo para confirmar “humano / estoy bien” tras una respuesta de transporte. |
| `PD10_MAX_INCIDENT_AGE_FOR_CALLS_SEC` | Edad máxima del incidente para seguir iniciando llamadas. |
| `PD10_EVENT_RECEIPT_RETENTION_DAYS` | Retención de receipts de eventos del bastón/gateway. |

### Posponer / follow-up / recordatorios

| Variable | Para qué |
|---|---|
| `PD06_POSTPONE_REMINDER_SEC` | Delay del recordatorio tras un “posponer” individual. |
| `PD06_POSTPONE_COLLECTIVE_SEC` | Ventana del posponer colectivo (varios cuidadores). |
| `PD07_FOLLOWUP_USER_WINDOW_SEC` | Ventana de follow-up dirigida al usuario. |
| `PD07_FOLLOWUP_CAREGIVER_WINDOW_SEC` | Ventana de follow-up al cuidador que cerró. |
| `PD07_FOLLOWUP_LAST_WINDOW_SEC` | Ventana del último follow-up. |
| `FOLLOWUP_FIRST_LOCAL_HOUR` | Hora local (0–23) a partir de la cual se permiten follow-ups. |
| `FOLLOWUP_LAST_DELAY_DAYS` | Días de espera del follow-up final. |
| `OCCURRENCE_HORIZON_DAYS` | Horizonte (días) para materializar ocurrencias de recordatorios. |
| `PD08_OCCURRENCE_SNOOZE_SEC` | Duración del snooze de una ocurrencia. |
| `PD08_USER_CAN_EDIT_CAREGIVER_REMINDERS` | Si el usuario puede editar recordatorios creados por cuidadores. |

### Bastón (cane)

| Variable | Para qué |
|---|---|
| `CANE_LINK_FRESH_SEC` | Tiempo máximo de “frescura” del vínculo bastón↔perfil / claim. |
| `PD12_CANE_PROXIMITY_PROOF_REQUIRED` | Si hace falta prueba de proximidad para ciertas operaciones del bastón. |

---

## Localización y onboarding

| Variable | Para qué |
|---|---|
| `DEFAULT_PROFILE_TIME_ZONE` | Zona IANA por defecto de perfiles nuevos (p. ej. `America/Panama`). |
| `DEFAULT_PHONE_REGION` | Región ISO-2 para normalizar teléfonos sin prefijo (p. ej. `PA`). |
| `INVITATION_TTL_HOURS` | Caducidad de invitaciones de cuidador. |
| `ENROLLMENT_CODE_TTL_MIN` | Caducidad (minutos) de códigos de enrollment. |

---

## Condicionales rápidas

| Escenario | Variables extra |
|---|---|
| Push real | `PUSH_PROVIDER=fcm` + `FCM_SERVICE_ACCOUNT_JSON` |
| Llamadas PSTN reales | `TELEPHONY_PROVIDER=twilio` + `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` |
| Telefonía apagada | `TELEPHONY_PROVIDER=none` (sin secretos fake/twilio) |
| Dev local sin Compose | Completar secretos vacíos de `.env.example` y hosts `127.0.0.1:54322` |

---

## Checklist mínimo para “que arranque”

1. Secretos: `BETTER_AUTH_SECRET`, `SECRET_PEPPER`, `HEALTH_DETAILS_TOKEN`
2. URLs DB de los 5 roles (+ `DATABASE_URL_MIGRATIONS` para migrate/seed)
3. `BETTER_AUTH_URL` alcanzable desde el celular
4. Provider push + telefonía coherentes con sus secretos condicionales
5. Resto de `PD*` / worker / health con los valores del example (válidos para piloto)
