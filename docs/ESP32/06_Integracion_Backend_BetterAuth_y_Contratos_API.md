# ESP-06 — Integración backend, Better Auth y contratos API

**Versión:** 1.1 · **Fecha:** 17 de noviembre de 2026.  
**Estado:** `backend/src` ya tiene controladores de reclamo, pasarela, eventos de pasarela e incidencias. Identidad viva: **Better Auth + PostgreSQL** (implementado; ver plan BetterAuth_20261117). La cancelación tardía sigue marcada como PD-12 pendiente en `gateway-events.service.ts`.

> Antes: este documento citaba Supabase Auth. Ese proveedor ya no es la identidad de producto.

## 1. Frontera remota

El servidor no recibe BLE ni controla directamente GPIO. Recibe hechos publicados por Android Persona, verificando Better Auth (sesión/bearer), instalación y asignación. El ESP32 no almacena credenciales de Auth ni PostgreSQL. FCM continúa como canal push y no como proveedor de identidad.

| Operación documentada | Responsable | Condición |
|---|---|---|
| `POST /v1/canes/claim` | NestJS con código de incorporación | Serie pública insuficiente |
| `POST /v1/canes/:id/gateway` | NestJS y Android Persona | Una pasarela activa; vínculo `user` |
| `GET /v1/profiles/:id/canes` | Apps autorizadas | Estado observado y antigüedad |
| `POST /v1/gateway-events` | Pasarela Android | Resultado independiente por elemento |
| `POST /v1/incidents` | Pasarela Android | Ventana vencida y episodio estable |
| Consulta de incidencia y decisiones | Cuidador autorizado | Estado/versiones verificados por servidor |

La incorporación en backend y la autorización BLE son controles complementarios. El parámetro provisional `PD12_CANE_PROXIMITY_PROOF_REQUIRED=false` del plan F1d no acredita posesión física ni seguridad del enlace. Una prueba piloto debe declarar qué validación está habilitada realmente.

## 2. Mapeo de identidad y tiempo

| Origen físico/local | Dominio/API |
|---|---|
| `deviceSerial` | Registro autorizado `canes.serial` y `caneId` |
| `sourceEventId` | Identidad compartida de caída y cancelación |
| Arranque y secuencia | `bootId`, `sequence` y contexto de origen |
| `recordId` | Acuse/reenvío BLE; no sustituye la identidad de la incidencia |
| Reloj monotónico del episodio | Ventana y edad estimadas por Android |
| Hora de la app | `reportedOccurredAt`, capturas y evidencia temporal |
| Instalación Android autenticada | Fuente y pasarela activa resueltas por servidor |

Si un registro emitido tras reiniciar se refiere a un episodio anterior, se conserva el arranque y secuencia de la detección para el DTO de incidencia. No sustituirlos por los del reenvío. La hora estimada mantiene su incertidumbre; `windowStartedAt`/`windowEndedAt` no prueban físicamente una caída.

## 3. Eventos y resultados

| Hecho local | Publicación y efecto |
|---|---|
| Candidato pendiente | Solo ESP32/Android durante los 30 segundos; sin incidencia ni push de caída al cuidador |
| Cancelación válida | `false_alarm_canceled`, `cancelledVia=button/app`; contador único sin incidencia visible |
| Vencimiento conciliado | Incidencia `fall_detected` con evidencia temporal y misma identidad |
| Telemetría | Solo datos soportados y captura; última observación por asignación |
| Evento antiguo | Conservar tiempo y política de retraso; no activar llamadas como si fuera actual |
| Orden BLE aplicada | Resultado local; no acredita aviso remoto ni asistencia |

La restricción de no avisar durante los 30 segundos se refiere al episodio de caída. No prohíbe tráfico operativo independiente de identidad o telemetría que no divulgue una prealerta al cuidador.

Las claves propuestas son `fall:<caneId>:<sourceEventId>` y `cancel:<caneId>:<sourceEventId>`. La base debe garantizar un único efecto por episodio mediante transacción y restricciones. Evitar duplicar solo cada clave por separado no resuelve el conflicto entre ambas.

## 4. Conflicto entre cancelación y vencimiento

El plan F2 ya contempla registrar una cancelación recibida después de crear la incidencia sin cancelar llamadas automáticamente. Falta cerrar la política PD-12 y formalizar también el caso inverso: cancelación válida registrada primero y vencimiento contradictorio que llega después.

Antes de habilitar consecuencias remotas se requiere:

1. Serializar ambos caminos para la misma clave de episodio, por ejemplo con un registro de resolución y bloqueo transaccional compartido.
2. Si una cancelación válida ya resolvió la ventana, rechazar o conciliar el vencimiento incompatible sin crear otra incidencia o encolar llamadas.
3. Si ya existe incidencia, conservar el hecho tardío sin confundirlo con cancelación previa ni cierre asistencial.
4. No incrementar falsas alarmas por un simple silenciamiento posterior al plazo.
5. Definir el código/respuesta para cada conflicto en OpenAPI y probar concurrencia en ambos órdenes.

La estructura SQL y la respuesta exacta siguen siendo diseño por cerrar; estas obligaciones no se presentan como código o migraciones añadidas. Hasta resolverlo, el plan F2 no es suficiente para declarar PD-12 implementado.

## 5. Carencias de contrato identificadas

| Carencia | Acción antes de integrar |
|---|---|
| `FalseAlarmPayload` solo trae `cancelledVia` | Diferenciar cancelación válida, tardía y silenciamiento sin inferirlo de la hora de recepción |
| No hay resolución compartida explícita del episodio | Diseñar arbitraje transaccional entre ambos endpoints |
| `ageAtSendMs` requiere edad confiable | Especificar representación de incertidumbre tras reinicio |
| Proximidad BLE no implementada | Mantener capacidad limitada visible y definir prueba verificable |
| Cursor BLE y reenvío sin contrato físico | Cerrar ESP-04 antes de pruebas de interoperabilidad |

Para la primera integración puede enviarse solo una resolución final conciliada por Android, pero eso no elimina la obligación de proteger el servidor ante duplicados, concurrencia y mensajes contradictorios.

## 6. Seguridad y persistencia

El servidor deriva el perfil desde el bastón y la pasarela activa; no confía en un perfil arbitrario enviado por el cliente. Las filas se atribuyen a la asignación correspondiente. El cambio de dueño o teléfono no mezcla historiales ni permite al teléfono retirado publicar para el nuevo propietario.

Se conserva el diseño **Better Auth + PostgreSQL privado + NestJS + Prisma + trabajador**. Android consume el dominio por la API, no mediante acceso directo a tablas. Las incidencias y acciones pendientes se guardan juntas antes de responder éxito. Una respuesta `scheduled` no equivale a push entregado o llamada contestada.

**Hardware pendiente (capacidad 0):** medición de batería y LED de desconexión no tienen pines asignados en ESP-02; el GATT no reporta batería real y Android trata desconexión por pérdida de link BLE.

## 7. Lectura relacionada

- [Plan F1d: dispositivos y pasarelas](../backend/Implementacion/04_F1d_Bastones_Pasarelas_Contactos.md).
- [Plan F2: eventos e incidencias](../backend/Implementacion/05_F2_Eventos_Pasarela_e_Incidencias.md).
- [BE-05: contratos](../backend/Desglose/05_Contratos_API_Eventos_y_Sincronizacion.md).
- [BE-08: integración](../backend/Desglose/08_Integracion_Movil_Baston_Telemetria_y_Ubicacion.md).
- [Plan Better Auth (registro)](../backend/Plan_Cambios_Backend_BetterAuth_20261117.md) — **implementado**.
