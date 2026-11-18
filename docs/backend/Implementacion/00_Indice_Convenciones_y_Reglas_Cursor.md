# GUARDMe Backend — Índice de planes de implementación y convenciones

**Aclaración ESP32 — 14 de noviembre de 2026:** el código Arduino y la comunicación con Android se documentan en [docs/ESP32](../../ESP32/README.md). Antes de integrar los planes 04/05, cargar [ESP-06](../../ESP32/06_Integracion_Backend_BetterAuth_y_Contratos_API.md): faltan contrato físico BLE, prueba de proximidad y arbitraje entre cancelación y vencimiento. La fase F0 sigue pendiente; los borradores no son evidencia de funciones habilitadas.

> **Para:** Cursor AI — Rol: Developer
> **Autor del plan:** Claude (Tech Lead)
> **Stack:** Node 22 LTS · TypeScript · NestJS 11 · Prisma 6 (solo ORM) · Supabase Auth + PostgreSQL (local con Supabase CLI + Docker) · pg-boss · FCM (firebase-admin) · pnpm · Jest
> **Fecha:** 14 de noviembre de 2026
> **Fuente funcional:** `docs/backend/Propuesta_Backend_GUARDMe.md` y `docs/backend/Desglose/01..10` (BE-01 a BE-10)

---

## Instrucciones para Cursor

No tomes decisiones de arquitectura por tu cuenta.
Implementa cada plan exactamente como está descrito y **en el orden de este índice**.
Si algo no está especificado, pregunta antes de asumir.
Antes de cada plan carga: `@docs/backend/Implementacion/00_Indice_Convenciones_y_Reglas_Cursor.md` + el plan de la fase + los documentos BE-xx que el plan cite.

---

## 1. Orden de ejecución

| # | Plan | Fase BE-10 | Resultado verificable |
|---|------|-----------|------------------------|
| 01 | [01_F1a_Base_Proyecto_Supabase_Prisma.md](01_F1a_Base_Proyecto_Supabase_Prisma.md) | F1 | Proyecto NestJS arranca; Supabase local; esquema `guardme` privado; roles, RLS base, Prisma generado; API y worker como dos procesos |
| 02 | [02_F1b_Autenticacion_Cuentas_Instalaciones.md](02_F1b_Autenticacion_Cuentas_Instalaciones.md) | F1 | JWT de Supabase verificado + sesión activa; bootstrap de cuenta; instalaciones; logout |
| 03 | [03_F1c_Perfiles_Accesos_Invitaciones_Incorporacion.md](03_F1c_Perfiles_Accesos_Invitaciones_Incorporacion.md) | F1 | Perfiles, vinculaciones, invitaciones de cuidador, incorporación supervisada (sesión anónima), progreso de configuración |
| 04 | [04_F1d_Bastones_Pasarelas_Contactos.md](04_F1d_Bastones_Pasarelas_Contactos.md) | F1 | Reclamo de bastón con secreto, asignación, pasarela única, contactos prioritarios |
| 05 | [05_F2_Eventos_Pasarela_e_Incidencias.md](05_F2_Eventos_Pasarela_e_Incidencias.md) | F2 | Incidencia vencida / manual idempotente; falsas alarmas agregadas; telemetría; acción pendiente transaccional |
| 06 | [06_F3a_Worker_Acciones_Pendientes_y_Notificaciones.md](06_F3a_Worker_Acciones_Pendientes_y_Notificaciones.md) | F3 | Relay de acciones pendientes → pg-boss; push FCM/falso; entregas y acuses |
| 07 | [07_F3b_Plan_de_Llamadas_y_Decisiones.md](07_F3b_Plan_de_Llamadas_y_Decisiones.md) | F3 | Secuencia 1–1–2–2, un intento activo, webhooks firmados, “Yo me encargo”, posponer, emergencias |
| 08 | [08_F4a_Recordatorios_y_Ocurrencias.md](08_F4a_Recordatorios_y_Ocurrencias.md) | F4 | Recordatorios compartidos, regla de borrado por autoría, ocurrencias, respuestas |
| 09 | [09_F4b_Seguimientos.md](09_F4b_Seguimientos.md) | F4 | Seguimiento 7:00 a. m. local, derivación, última consulta a 3 días, cierre inconcluso |
| 10 | [10_F5_Ubicacion_Sincronizacion_y_Operacion.md](10_F5_Ubicacion_Sincronizacion_y_Operacion.md) | F5 | Consentimiento y última ubicación, `/v1/changes`, salud, métricas, límites, OpenAPI |

**F0 (viabilidad BLE / voz / 911)** no tiene plan de código: es investigación con hardware y proveedores. Mientras no se cierre, el backend expone esas capacidades como `not_enabled` (ver §6).

Cada plan termina en un estado que compila, pasa `pnpm lint`, `pnpm test` y `pnpm test:int`. No empieces el plan N+1 con el N en rojo.

---

## 2. Estructura de carpetas (fija para todos los planes)

```
backend/                              ← D:\PROYECTOS\GUARDMe\backend
├── .cursorrules
├── .nvmrc                            ← "22"
├── .env.example
├── package.json  pnpm-lock.yaml  tsconfig.json  tsconfig.build.json  nest-cli.json
├── jest.config.ts                    ← unit (*.spec.ts)
├── jest.int.config.ts                ← integración (*.int-spec.ts) contra Supabase local
├── supabase/
│   ├── config.toml
│   ├── migrations/                   ← ÚNICA autoridad de esquema (timestamp_nombre.sql)
│   └── seed.sql                      ← SOLO local: contraseñas de roles de desarrollo
├── prisma/
│   └── schema.prisma                 ← generado con `prisma db pull`; nunca `prisma migrate`
├── scripts/                          ← utilidades CLI (registrar bastón, etc.)
├── src/
│   ├── main.ts                       ← proceso API (HTTP)
│   ├── worker.main.ts                ← proceso trabajador (sin HTTP)
│   ├── app.module.ts
│   ├── worker.module.ts
│   ├── config/                       ← carga y validación de env
│   ├── common/                       ← errores, guards, decoradores, interceptores, pipes
│   ├── infra/
│   │   ├── db/                       ← clientes Prisma por rol + contexto RLS
│   │   ├── clock/                    ← ClockPort (real / falso para tests)
│   │   ├── queue/                    ← pg-boss
│   │   ├── push/                     ← PushPort (FCM / falso)
│   │   └── telephony/                ← TelephonyPort (falso; real tras PD-01)
│   └── modules/
│       ├── identity/  onboarding/  profiles/  devices/  contacts/
│       ├── incidents/  calling/  notifications/  reminders/  followups/
│       ├── location/  sync/  audit/  health/  pending-actions/
└── test/
    ├── helpers/                      ← crear usuarios Supabase, tokens, limpiar BD, FakeClock
    └── *.int-spec.ts
```

Un módulo por carpeta de `modules/`, con: `*.module.ts`, `*.controller.ts` (solo si expone HTTP), `*.service.ts` (reglas de dominio), `dto/` (class-validator), `*.repository.ts` solo si el servicio tiene más de ~5 consultas distintas. Nada de lógica de negocio en controllers.

---

## 3. Convenciones de código

| Tema | Regla |
|------|-------|
| Archivos | `kebab-case.ts`; clases `PascalCase`; funciones/variables `camelCase` |
| Tablas/columnas | `snake_case` en el esquema `guardme`; Prisma mapea a `camelCase` con `@map`/`@@map` (lo hace `db pull` + ajuste manual de nombres de modelo) |
| IDs | UUID v4 generado por PostgreSQL (`gen_random_uuid()`); nunca correlativos visibles |
| Tiempo | `timestamptz` en UTC; zona IANA aparte (`time_zone text`). Toda lectura de “ahora” pasa por `ClockPort.now()` |
| Estados | `text` + `CHECK (... in (...))`, no enums de PostgreSQL (permite ampliar antes de retirar) |
| Concurrencia | Columna `version int` + trigger `guardme.bump_version()`; los cambios aceptan `expectedVersion` y fallan con `VERSION_CONFLICT` |
| Validación HTTP | `class-validator` + `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` global |
| Actor | Siempre derivado del principal autenticado (`@CurrentPrincipal()`); ningún DTO acepta `accountId`, `role`, `authUserId` o `actor` |
| Logs | `nestjs-pino` con `redact` de `authorization`, `push_token`, `secret`, `code`, `lat`, `lng`, `phone` |
| Comentarios | Solo el “por qué”. Atajos conocidos: `// shortcut: <límite>, <cuándo mejorar>` |
| Decisiones abiertas | Se leen de config con el nombre `PD_xx_*` y comentario `// PD-xx pendiente` (ver §6) |

---

## 4. Contrato de errores (común a todos los módulos)

Cuerpo de error único, producido por `GlobalExceptionFilter` (`src/common/errors/`):

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "texto traducible", "correlationId": "uuid", "details": { } } }
```

| `code` | HTTP | Cuándo |
|--------|------|--------|
| `UNAUTHENTICATED` | 401 | Sin token, firma/emisor/audiencia/expiración inválidos |
| `SESSION_REVOKED` | 401 | JWT válido pero sesión de Auth cerrada o instalación revocada |
| `INSTALLATION_MISMATCH` | 401 | `X-Installation-Id` no pertenece a la cuenta/sesión actual |
| `ACCOUNT_NOT_BOOTSTRAPPED` | 403 | JWT válido sin cuenta de dominio (debe llamar `POST /v1/accounts/bootstrap`) |
| `NOT_FOUND` | 404 | Recurso inexistente **o ajeno** (no revelar existencia) |
| `FORBIDDEN_ACTION` | 403 | Recurso accesible pero operación prohibida (p. ej. usuario borra recordatorio de cuidador) |
| `VALIDATION_FAILED` | 400 | DTO inválido; `details.fields[]` |
| `VERSION_CONFLICT` | 409 | `expectedVersion` obsoleta; `details.current` con estado actual |
| `INCOMPATIBLE_STATE` | 409 | Transición no permitida desde el estado actual |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Misma `Idempotency-Key` con cuerpo distinto |
| `RATE_LIMITED` | 429 | Límite superado; header `Retry-After` |
| `PROVIDER_UNAVAILABLE` | 503 | Proveedor externo caído (solo en operaciones síncronas que lo requieran) |
| `CAPABILITY_NOT_ENABLED` | 501 | Capacidad no integrada o política PD no definida (911 automático, voz, edición PD-08…) |

Respuestas de éxito que **no** son errores pero deben distinguirse:
- Evento ya aceptado → `200` con el recurso existente y header `X-Idempotent-Replay: true`.
- Efecto externo programado → `202` o campo `delivery: "scheduled"`; **nunca** “enviado/entregado”.

`correlationId`: header `X-Correlation-Id` del cliente si es UUID válido; si no, se genera. Se propaga a logs, `audit_log` y `pending_actions.payload.correlationId`.

---

## 5. Patrones transversales (definidos en 01 y usados por todos)

| Patrón | Dónde se define | Uso obligatorio |
|--------|-----------------|-----------------|
| `DbService.asAccount(principal, fn)` | 01 | Toda lectura/escritura de datos de perfil desde la API (RLS con contexto local a la transacción) |
| `DbService.asOnboarding(fn)` | 01 | Solo operaciones de incorporación listadas en 02/03/04 |
| `DbService.asWorker(fn)` | 01 | Solo el proceso worker |
| `DbService.asIngest(fn)` | 07 | Solo el webhook público de telefonía (rol `guardme_ingest`, INSERT en `provider_events` y `pending_actions`) |
| `PendingActionsService.enqueue(tx, action)` | 01 (tabla) / 06 (proceso) | Todo efecto externo (push, llamada, consulta programada). Siempre en la misma transacción que el cambio de dominio |
| `AuditService.record(tx, entry)` | 01 | Incorporación, revocación, prioridad de contactos, consentimiento, decisiones, cambios de agenda |
| `IdempotencyInterceptor` + `@Idempotent()` | 02 | Creaciones y decisiones que no tienen clave natural |
| `ClockPort` | 01 | Toda regla temporal; tests usan `FakeClock` |
| `CapabilitiesService` | 02 | `GET /v1/me` devuelve `capabilities` (`location`, `telephony`, `emergencyAutoCall`, `voiceInApp`) |

---

## 6. Decisiones abiertas → configuración

Las PD abiertas **no** se resuelven en código. Se implementan como configuración con el valor propuesto por la documentación y se marcan como pendientes. Todas viven en `src/config/policy.config.ts` y se documentan en `.env.example`.

| Variable | Valor por defecto propuesto | PD | Fuente |
|----------|-----------------------------|----|--------|
| `PD04_CALL_RING_TIMEOUT_SEC` | `30` | PD-04 | BE-06 §4 (no heredar 28 s del prototipo; valor provisional) |
| `PD04_CALL_PAUSE_BETWEEN_ATTEMPTS_SEC` | `5` | PD-04 | BE-06 §4 |
| `PD04_MIN_CONTACTS_POLICY` | `run_available` (llama a los que haya, sin inventar) | PD-04 | BE-06 §12 |
| `PD03_HUMAN_CONFIRM_TIMEOUT_SEC` | `120` | PD-03 | BE-06 §6: tras respuesta de transporte se espera acción en app |
| `PD03_ON_UNCONFIRMED_ANSWER` | `continue` (seguir con siguiente posición) | PD-03 | BE-06 §6 |
| `PD05_FALL_PUSH_RECIPIENTS` | `all_caregivers` | PD-05 | Propuesta §8.3 |
| `PD05_POSTPONE_COLLECTIVE_RECIPIENTS` | `all_caregivers` | PD-05 | BE-06 §7 |
| `PD06_POSTPONE_REMINDER_SEC` | `300` (confirmado: 5 min) | — | Entrevista |
| `PD06_POSTPONE_COLLECTIVE_SEC` | `7200` contados desde la decisión | PD-06 | BE-06 §7 |
| `PD07_FOLLOWUP_USER_WINDOW_SEC` | `7200` (confirmado: 2 h) | — | Entrevista |
| `PD07_FOLLOWUP_CAREGIVER_WINDOW_SEC` | `7200` | PD-07 | BE-07 §9 |
| `PD07_FOLLOWUP_LAST_WINDOW_SEC` | `7200` | PD-07 | BE-07 §9 |
| `PD08_USER_CAN_EDIT_CAREGIVER_REMINDERS` | `false` → `CAPABILITY_NOT_ENABLED` | PD-08 | BE-03 §3 |
| `PD10_MAX_INCIDENT_AGE_FOR_CALLS_SEC` | `600` | PD-10 | Propuesta §14 (umbral configurable; valor provisional) |
| `PD10_EVENT_RECEIPT_RETENTION_DAYS` | `30` | PD-10 | BE-04 §4 |
| `PD12_CANE_PROXIMITY_PROOF_REQUIRED` | `false` | PD-12 | BE-08 §4 |
| `FOLLOWUP_FIRST_LOCAL_HOUR` | `7` (confirmado) | — | Entrevista |
| `FOLLOWUP_LAST_DELAY_DAYS` | `3` (confirmado) | — | Entrevista |
| `DEFAULT_PROFILE_TIME_ZONE` | `America/Panama` | — | Propuesta §10.2 |

`GET /v1/me` → `capabilities.pendingPolicies: string[]` lista las PD abiertas para que Android las muestre como “pendiente”.

---

## 7. `.cursorrules` (crear en `backend/.cursorrules` en el plan 01)

```
# Rol
Eres un desarrollador senior que implementa especificaciones técnicas exactas producidas
por un Tech Lead (Claude AI). Las specs están en docs/backend/Implementacion/.

# Reglas
- NO tomes decisiones de arquitectura por tu cuenta.
- Sigue el plan de implementación al pie de la letra.
- Si algo no está especificado en el plan, pregunta antes de asumir una solución.
- No agregues dependencias que no estén listadas en la spec.
- No cambies nombres de funciones, tipos, tablas o archivos sin indicación explícita.
- El esquema solo cambia con migraciones en supabase/migrations. NUNCA uses `prisma migrate`.
- Toda consulta de la API pasa por DbService.asAccount / asOnboarding. Nunca uses un PrismaClient suelto.
- Todo efecto externo (push, llamada, aviso programado) se registra con PendingActionsService.enqueue
  dentro de la misma transacción del cambio de dominio. Nunca llames a FCM/telefonía desde un controller.
- Nunca leas `new Date()` en dominio: usa ClockPort.
- Nunca registres en logs PIN, tokens, secretos, coordenadas ni teléfonos completos.
- Nunca devuelvas "enviado", "entregado" o "atendido" si solo se creó una fila pendiente.

# Cuando recibas una spec
1. Lee el plan completo antes de escribir cualquier código.
2. Carga los archivos de contexto mencionados con @archivo.
3. Implementa en el orden indicado en "Orden de implementación".
4. Verifica los "Criterios de aceptación" antes de terminar (pnpm lint, pnpm test, pnpm test:int).

# Si algo es ambiguo
Detente y pregunta. No improvises.
```

---

## 8. Trazabilidad requisitos → planes

| Requisito | Plan(es) | Pruebas BE-10 |
|-----------|----------|---------------|
| BE-R01, R02, R03 | 03 | T01, T02, T03 |
| BE-R04 (PIN local) | Fuera del backend (Android). El backend solo no exige PIN | T04 |
| BE-R05 | 04 | T05 |
| BE-R06, R07 | Android/firmware; backend en 05 no activa nada antes del evento vencido | T06, T07 |
| BE-R08, R09, R10 | 05 | T08, T09 |
| BE-R11, R12, R13, R14, R15, R16 | 07 | T10–T17 |
| BE-R17, R18, R19 | 09 | T18–T21 |
| BE-R20, R21 | 08 | T22–T24 |
| BE-R22 | 10 | T25 |
| BE-R23, R24 | 05, 06 | T26, T27 |
| BE-R25 | 03, 10 | T28 |
| BE-R26 | 06 | T29, T30 |
| BE-R27 | 02 | T31, T34, T36 |
| BE-R28 | 01 | T32, T33, T38 |
| BE-R29 | 03 | T35 |
| BE-R30 | 01 | T37 |

---

## 9. Flujo de trabajo Claude ↔ Cursor

1. Abre un chat nuevo en Cursor por cada plan: `@00_Indice... @0N_... Implementa este plan siguiendo el orden indicado`.
2. Al terminar, vuelve a Claude con el diff o resumen y pide: *“Solo dame feedback en texto, no reescribas el código.”*
3. Si Cursor se desvía (dependencia no listada, nombre cambiado, archivo extra), pide a Claude instrucciones correctivas en texto.
4. Conversación nueva de Claude por fase para no inflar el contexto.
