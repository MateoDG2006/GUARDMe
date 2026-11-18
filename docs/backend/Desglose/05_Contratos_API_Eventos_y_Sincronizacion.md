# GUARDMe — Contratos API, eventos y sincronización

**Documento:** BE-05 de 10 · **Versión:** 1.2 · **Fecha:** 14 de noviembre de 2026  
**Estado:** desglose documental de la propuesta aprobada; no acredita implementación.  
**Origen:** secciones 8, 11, 12, 13 y 14 de [Propuesta de backend](https://chatgpt.com/library?file_id=libfile_856c231c19bc819186a42b13a9a6c5c4&account_id=personal).  
**Lectura del conjunto:** [BE-01 — Índice y trazabilidad](01_Vision_Alcance_Requisitos_y_Trazabilidad.md).

Las reglas confirmadas del producto se conservan. Las precisiones nuevas se identifican como diseño propuesto; los puntos abiertos de la propuesta original siguen pendientes de definición. Este documento no contiene código de aplicación ni despliega servicios.

**Revisión 1.3 (17 nov 2026):** identidad viva = Better Auth + PostgreSQL (implementado).

**Revisión 1.1:** autenticación con Supabase Auth (histórico).

## 1. Objetivo y nivel de especificación

Este documento define superficies de servicio y reglas de intercambio para Android Persona, Android Cuidador, trabajador y proveedores. Es documentación conceptual: no es una API desplegada ni una especificación ejecutable.

La API se versionará. Las rutas de esta propuesta usan una primera versión lógica y deben convertirse posteriormente en un contrato OpenAPI revisado con el equipo móvil. Los ejemplos de operaciones no autorizan implementación durante esta entrega.

HTTPS transporta operaciones y consultas. Push avisa de cambios; no sustituye consulta de estado ni autorización. SSE es complementario para pantallas abiertas.

## 2. Reglas generales del contrato

| Aspecto | Regla propuesta |
| --- | --- |
| Identidad | Access token de Better Auth en cada solicitud protegida; sesión activa |
| Alcance | Resolver acceso actual al perfil del recurso |
| Instalación | Identificar qué copia de la app envía el evento |
| Actor | Derivado por el servidor; no confiar en actor libre del cuerpo |
| Fechas | Instantes UTC más zona en reglas de calendario |
| Identificadores | Estables y opacos; no depender de números correlativos visibles |
| Idioma | Identificadores técnicos estables y mensajes traducibles |
| Paginación | Cursor opaco con orden estable |
| Versiones | Cambios de estado con versión esperada |
| Reenvío | Clave idempotente o identificador de evento persistente |
| Errores | Código lógico, correlación y descripción sin secretos |
| Datos ausentes | Declarar desconocido/no disponible, no fabricar valores |

El perfil enviado por el cliente puede orientar la petición, pero el servidor verifica su relación con el recurso. En un evento de bastón, el perfil se resuelve desde la asignación acreditada.

## 3. Identidad e incorporación

| Método y ruta conceptual | Finalidad | Condiciones |
| --- | --- | --- |
| GET /v1/me | Consultar cuenta y relaciones | Identidad válida |
| POST /v1/accounts/bootstrap | Resolver cuenta de dominio después de autenticar en Supabase | auth.users.id verificado, vínculo único e idempotencia |
| POST /v1/installations | Registrar instalación/token push | Asociada al principal |
| DELETE /v1/installations/{id} | Revocar instalación propia/autorizada | No borrar historial |
| GET /v1/onboarding | Consultar progreso | Contexto de cuenta/perfil |
| POST /v1/profiles | Crear perfil asistido | Evitar duplicado por reenvío |
| GET /v1/profiles | Listar perfiles accesibles | Solo accesos actuales |
| POST /v1/profiles/{id}/invitations | Invitar cuidador | Acceso y administración permitidos |
| POST /v1/invitations/accept | Consumir invitación | Secreto, identidad y vigencia |
| DELETE /v1/profiles/{id}/memberships/{accessId} | Retirar vinculación | Autoridad sobre ese perfil |
| POST /v1/enrollments | Emitir incorporación supervisada | Emisor autenticado y autorizado |
| POST /v1/enrollments/consume | Incorporar teléfono de la persona | Sesión Supabase propia, código temporal de uso único y límites |
| POST /v1/session/logout | Cerrar sesión/instalación con alcance explícito | Identidad propia; retirar autorización local y aplicar cierre de Auth correspondiente |

El registro e inicio de sesión se realizan con Better Auth vía rutas `/v1/auth/*` expuestas por NestJS. El bootstrap de GuardMe solo resuelve la cuenta y sus accesos después de verificar la identidad.

El consumo de incorporación requiere una sesión propia, que puede ser anónima conforme a BE-03, más el código autorizado. Una identidad recién creada no puede consultar el perfil antes del consumo válido. No se entrega un token personalizado ni la sesión del cuidador. Las invitaciones asistenciales siguen siendo de GuardMe y no se confunden con correos de alta de Supabase.

## 4. Dispositivos, contactos y observaciones

| Método y ruta conceptual | Finalidad | Resultado esperado |
| --- | --- | --- |
| POST /v1/canes/claim | Acreditar incorporación del bastón | Asignación o conflicto |
| POST /v1/canes/{id}/gateway | Designar/cambiar pasarela | Vigencia anterior cerrada y nueva activa |
| GET /v1/profiles/{id}/canes | Consultar dispositivos | Estado observado y antigüedad |
| POST /v1/gateway-events | Enviar evento de pasarela | Resultado persistido por evento |
| GET /v1/profiles/{id}/contacts | Consultar prioridades | Lista ordenada |
| POST /v1/profiles/{id}/contacts | Crear contacto | Validación y prioridad coherente |
| PATCH /v1/profiles/{id}/contacts | Actualizar lista/orden | Cambio de conjunto atómico |

El cambio de contactos debe evitar una ventana con dos prioridades iguales. La cuenta vinculada de un contacto es opcional; un número puede recibir llamadas sin haber aceptado una invitación de cuidador. Ese hecho no le concede lectura del perfil.

Los lotes de eventos mantienen resultado por elemento. Aceptar parte de un lote no permite al cliente descartar los elementos fallidos. Los reenvíos conservan sus identificadores.

## 5. Incidencias y atención

| Método y ruta conceptual | Finalidad | Semántica |
| --- | --- | --- |
| POST /v1/incidents | Activar incidencia vencida o emergencia manual | Se persiste antes del resultado |
| GET /v1/profiles/{id}/incidents | Historial paginado | Incidencias del perfil autorizado |
| GET /v1/incidents/{id} | Detalle y cronología | Estado actual y evidencias |
| POST /v1/incidents/{id}/decisions | Encargarse, posponer o solicitar emergencias | Versión esperada e idempotencia |
| GET /v1/incidents/{id}/calls | Historial de intentos | Transporte, resultado y tiempos |
| POST /v1/provider-events/{provider} | Evento de telefonía | Firma y referencia válidas |
| POST /v1/notifications/{id}/acknowledgements | Confirmar recepción/apertura | Solo destinatario de esa entrega |

La incidencia vencida no se activa durante los 30 segundos locales. El evento incluye evidencia temporal de la ventana, pero el servidor no puede verificar físicamente una caída solo por los campos recibidos.

Solicitar emergencias registra una intención y usa la vía validada disponible. No devuelve “ambulancia enviada” por el hecho de registrar la solicitud.

## 6. Agenda, seguimientos, ubicación y cambios

| Método y ruta conceptual | Finalidad |
| --- | --- |
| GET /v1/profiles/{id}/reminders | Consultar agenda compartida |
| POST /v1/profiles/{id}/reminders | Crear definición y horarios |
| PATCH /v1/reminders/{id} | Modificar definición con versión |
| DELETE /v1/reminders/{id} | Eliminar/desactivar según política y autoría |
| POST /v1/occurrences/{id}/responses | Registrar Tomado, Pospuesto u Omitido |
| GET /v1/followups/pending | Consultas asignadas al principal |
| POST /v1/followup-questions/{id}/responses | Respuesta a ronda vigente |
| PUT /v1/profiles/{id}/location-consent | Registrar o revocar consentimiento |
| POST /v1/profiles/{id}/location | Publicar posición desde fuente autorizada |
| GET /v1/profiles/{id}/location | Consultar última posición permitida |
| GET /v1/changes | Recuperar cambios desde cursor autorizado |

Las operaciones de modificación de recordatorios de cuidador deben incorporar la política PD-08 antes de publicarse como capacidades. La ruta propuesta no la resuelve por sí misma.

### Contexto de autorización y datos

El backend deriva el principal del sub verificado y comprueba session_id, instalación y relaciones actuales. Ningún campo de actor, rol o auth_user_id enviado por el cliente reemplaza esa comprobación. El refresh token permanece en el cliente Auth y no se guarda dentro de un evento, trabajo o log de GuardMe.

Las rutas del dominio continúan en NestJS. En esta base se mantiene Data API deshabilitada y guardme fuera de los esquemas expuestos. Las consultas Prisma aplican el contexto verificado dentro de su transacción para que RLS corresponda al usuario real; los detalles y roles se especifican en BE-04.

## 7. Sobre común de eventos

| Campo conceptual | Uso |
| --- | --- |
| ID de evento | Identidad estable antes del primer envío |
| Tipo y versión | Interpretación del contenido |
| Instalación/pasarela | Fuente autenticada |
| Bastón y asignación | Atribución histórica y vigente |
| ID de arranque y secuencia | Distinguir reinicios y duplicados |
| Momento de ocurrencia | Cuándo se observó el hecho |
| Momento de captura | Cuándo se obtuvo una medida |
| Recepción | Generada por el servidor |
| Correlación | Vincular detección, incidencia y efectos |
| Datos propios del tipo | Solo campos necesarios y validados |

La hora de recepción no sustituye la de ocurrencia. Un evento sin reloj físico confiable puede indicar edad monotónica y captura de la pasarela; no se inventa una precisión que el bastón no posee.

## 8. Catálogo de eventos

| Evento | Emisor | Significado | No demuestra |
| --- | --- | --- | --- |
| Detección cancelada | Pasarela | Persona indicó estar bien | Incidencia que requiere llamadas |
| Ventana de caída vencida | Pasarela | No se canceló dentro de la ventana | Diagnóstico confirmado |
| Emergencia manual solicitada | Android | Usuario eligió contactar emergencias | Llamada conectada |
| Telemetría observada | Pasarela | Estado medido y su fecha | Conexión actual indefinida |
| Ubicación capturada | Android Persona | Posición obtenida con permisos | Ubicación instantánea futura |
| Notificación recibida | Instalación destino | Copia de la app recibió el aviso | Lectura o atención humana |
| Llamada contestada en transporte | Proveedor | Conexión telefónica establecida | Respuesta humana |
| Cuidador confirmado | Interacción verificada | Persona informada del incidente | Asistencia presencial |
| Atención asumida | Cuidador autorizado | “Yo me encargo” | Evaluación clínica independiente |
| Ocurrencia respondida | App | Declaración para esa ocurrencia | Ingesta comprobada |

Los consumidores no derivan efectos a partir del texto visible de una notificación. Utilizan tipo, identificador y estado vigente.

## 9. Idempotencia y conflictos

Una operación de creación o decisión conserva clave de reenvío y resultado. La misma clave con contenido distinto produce conflicto; no se interpreta como una segunda operación válida.

Los cambios de versión impiden que dos cuidadores sobrescriban decisiones sin advertencia. Si uno ya cerró, repetir su misma decisión devuelve el resultado existente; una acción incompatible informa el conflicto y el estado actual.

La ventana de conservación de claves se coordina con PD-10. Cuando se elimina una recepción técnica, no se puede admitir indefinidamente el mismo evento antiguo como nuevo.

## 10. Respuestas y errores

| Situación | Respuesta documental propuesta |
| --- | --- |
| Registro nuevo persistido | Creado, con ID y estado actual |
| Mismo evento ya aceptado | Resultado existente, sin duplicar |
| Acción externa programada | Aceptada/programada, no entregada |
| Sesión inválida | Reautenticación o recuperación necesaria |
| Recurso ajeno | Sin acceso; evitar revelar existencia |
| Datos mal formados | Campos y motivo validable |
| Versión obsoleta | Conflicto y posibilidad de refrescar |
| Límite temporal/proveedor | Error recuperable con espera indicada |
| Estado incompatible | Acción rechazada; no forzar transición |
| Integración no disponible | Capacidad no habilitada, sin resultado simulado |

Los códigos HTTP finales se documentarán en OpenAPI. El mensaje debe explicar lo necesario para recuperar la operación sin exponer secretos ni detalles internos de infraestructura.

## 11. Sincronización y datos locales

El cursor identifica una posición opaca del flujo de cambios, no un permiso permanente. Cada consulta vuelve a filtrar por accesos actuales. Una revocación puede retirar datos aunque no exista un cambio posterior de su contenido.

Los cambios incluyen versión, recurso y tipo de operación, incluido borrado lógico cuando corresponda. La paginación evita perder elementos con la misma marca de tiempo.

La agenda local y el servidor comparten IDs de ocurrencia. El mismo aviso recibido por push y por programación local no debe generar dos declaraciones o dos señales físicas independientes.

Los eventos antiguos se guardan como antiguos y siguen la política de BE-08. No activan llamadas nuevas solo porque llegan a una API técnicamente correcta.

## 12. Webhooks y compatibilidad

Los eventos de proveedor requieren firma, identificación del intento y deduplicación. Un webhook no queda autenticado porque incluya un ID conocido. El orden de llegada no determina el orden real de la llamada.

La revisión 1.1 sustituye la identidad previa por Supabase Auth; no cambia IDs de incidencias ni la semántica de eventos. Si existiera una implementación previa, requeriría migración de identidades y reincorporación verificadas; la documentación no afirma que ya existan cuentas o datos a migrar.

Los nuevos campos se incorporan sin cambiar el significado de los anteriores. Tipos desconocidos no se transforman en éxito. La negociación de capacidades permite que Android muestre ubicación o telefonía como pendientes cuando no están habilitadas.

Relacionado: [BE-03](03_Identidad_Usuarios_Permisos_y_Configuracion_Inicial.md), [BE-04](04_Modelo_de_Datos_Diccionario_y_Persistencia.md), [BE-06](06_Incidencias_Llamadas_Escalamiento_y_Atencion.md) y [BE-08](08_Integracion_Movil_Baston_Telemetria_y_Ubicacion.md). Fuente de notificaciones y eventos telefónicos: S11, S12 y S15 de la propuesta.

## 13. Conciliación con el contrato ESP32

[ESP-04](../../ESP32/04_Contrato_BLE_Eventos_Comandos_y_Seguridad.md) define un borrador lógico BLE y [ESP-06](../../ESP32/06_Integracion_Backend_BetterAuth_y_Contratos_API.md) mapea esos hechos a las operaciones remotas. `recordId` identifica un registro físico para transferencia; `sourceEventId` identifica la detección compartida por cancelación y vencimiento. La asignación y el perfil se resuelven en servidor desde la pasarela vigente.

Las superficies actuales requieren completar OpenAPI para evidencia de cancelación dentro de ventana, resultado tardío/silenciamiento, incertidumbre de tiempo tras reinicio y conflicto entre endpoints. No se considera suficiente `cancelledVia` para probar cuándo se resolvió un episodio. Una cancelación válida previa debe impedir que un vencimiento contradictorio posterior cree incidencia y llamadas. El caso inverso conserva su política PD-12 pendiente y no se resuelve cerrando una incidencia sin evidencia.

Hasta formalizar esos casos, los DTO de los planes son una base incompleta de integración. No se añade una ruta BLE al servidor ni acceso directo del ESP32 a Supabase.

