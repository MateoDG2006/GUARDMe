# ESP-07 — Plan de implementación, pruebas y aceptación

**Versión:** 1.0 · **Fecha:** 14 de noviembre de 2026.  
**Estado:** planificación; todos los resultados físicos y de integración están pendientes.

## 1. Etapas y condiciones de salida

| Etapa | Trabajo | Evidencia requerida |
|---|---|---|
| E0 — Entorno y banco | Confirmar placa, circuito, dependencias y detector | Compilación reproducible; botón/buzzer/sensor observados |
| E1 — Contrato físico | Cerrar UUID, codificación, límites, acuses y seguridad | Valores de ESP-08 verificados en placa y vectores de ESP-04 |
| E2 — Conexión local | BLE, identidad, eventos y cancelación en ambos sentidos | Teléfono real apaga alarma y recibe botón del mismo episodio |
| E3 — Robustez local | Ventana, persistencia, reconexión y servicio Android | Recuperación sin reiniciar ventana ni perder resolución |
| E4 — Registro remoto | Better Auth, instalaciones, pasarela, API y arbitraje | Una incidencia o una cancelación coherente ante reenvíos |
| E5 — Dos teléfonos | FCM, consulta y decisión de cuidador | Aviso real y atención persistida visible desde ambas apps |
| E6 — Primera versión completa | Recordatorios, señales y telefonía viable | Ocurrencias y llamadas reales según reglas de producto |

Las etapas pueden preparar trabajo independiente, pero cada capacidad se declara disponible solo con su evidencia. La conexión BLE no acredita llamadas reales ni el 911. La ubicación puede diferirse según producto; no se reemplaza por coordenadas simuladas.

## 2. Matriz de pruebas

| ID | Caso | Resultado esperado | Estado |
|---|---|---|---|
| ESP-T01 | Lectura, ruido y movimiento habitual | Frecuencia medida y falsos positivos registrados | Pendiente |
| ESP-T02 | Impacto controlado | Candidato identificado; no diagnóstico de caída | Pendiente |
| ESP-T03 | Cancelación física dentro de ventana | Mismo episodio cancelado, alarma apagada, contador +1 | Pendiente |
| ESP-T04 | Cancelación desde app | Orden aplicada confirmada; no éxito por write GATT | Pendiente |
| ESP-T05 | Sin cancelación 30 segundos | Ningún aviso previo; una incidencia tras vencimiento | Pendiente |
| ESP-T06 | Botón y app simultáneos | Una resolución y un incremento agregado | Pendiente |
| ESP-T07 | Cancelación en límite del plazo | Resultado conforme a arbitraje aprobado | Pendiente |
| ESP-T08 | BLE perdido durante ventana | Alarma local disponible y recuperación sin ventana nueva | Pendiente |
| ESP-T09 | Internet perdido y recuperado | Cola durable; identidad y antigüedad originales | Pendiente |
| ESP-T10 | Acuse BLE perdido | Reenvío/consulta sin perder cancelación ni repetir efecto | Pendiente |
| ESP-T11 | Respuesta HTTP perdida | Repetición devuelve resultado existente, sin otro aviso | Pendiente |
| ESP-T12 | Reinicio ESP32/Android | Episodio recuperado e incertidumbre temporal explícita | Pendiente |
| ESP-T13 | Pantalla bloqueada y ahorro de batería | Escucha y limitaciones reales documentadas | Pendiente |
| ESP-T14 | Sensor ausente o botón atascado | Fallo visible; sin capacidad saludable ficticia | Pendiente |
| ESP-T15 | MTU mínima, fragmento perdido y datos inválidos | Error limitado y reensamblado sin bloqueo | Pendiente |
| ESP-T16 | Teléfono ajeno o pasarela revocada | Sin órdenes locales/publicaciones no autorizadas según mecanismo validado | Pendiente |
| ESP-T17 | Cola llena o registro corrupto | Diagnóstico y política de recuperación, sin pérdida silenciosa | Pendiente |
| ESP-T18 | Dos teléfonos y atención | Incidente recibido y decisión persistida común | Pendiente |
| ESP-T19 | Recordatorio duplicado/vencido y caída simultánea | Sin repetición vencida; alarma prioritaria; dosis solo desde app | Pendiente |
| ESP-T20 | Telemetría ausente o atrasada | Desconocido y antigüedad; sin reemplazar observación reciente | Pendiente |
| ESP-T21 | Cancelación válida antes de vencimiento remoto contradictorio | Sin crear incidencia ni llamadas por ese episodio | Pendiente |
| ESP-T22 | Incidencia primero y cancelación tardía después | Registrar conflicto; sin falso incremento ni cierre inventado | Pendiente |
| ESP-T23 | Ambos endpoints concurrentes | Una resolución consistente con transacciones compartidas | Pendiente |

Las pruebas de llamadas utilizan destinos de ensayo controlados; esta matriz no autoriza llamadas de prueba al 911. La viabilidad de ese escalamiento sigue siendo una puerta técnica del proyecto.

## 3. Registro de decisiones abiertas

| ID | Tema | Responsable | Referencia |
|---|---|---|---|
| ESP-P01 | Variante de placa, FQBN, versiones y circuito | Hardware/firmware | ESP-02 |
| ESP-P02 | Calibración y distinción bastón/persona | Hardware/firmware | ESP-01; entrevista §12 |
| ESP-P03 | UUID, frames, MTU, límites y compatibilidad | Firmware/Android | P-03/P-12 frontend; PD-12 backend |
| ESP-P04 | Patrón de botón, plazo y arbitraje al vencer | Producto/firmware/Android | P-04; PD-12 |
| ESP-P05 | Tiempo tras reinicio y duración del buzzer | Producto/firmware/Android | ESP-03; PD-12 |
| ESP-P06 | Persistencia, acuses, retención y cola llena | Firmware/Android/backend | ESP-03/04; PD-10 |
| ESP-P07 | Proximidad, claves, cambio de teléfono y revocación BLE | Firmware/Android/backend | ESP-04; plan F1d |
| ESP-P08 | Resolución de episodio entre endpoints | Android/backend | ESP-06; plan F2; PD-12 |
| ESP-P09 | Mecanismo y permisos de segundo plano | Android | FE-D08/09; BE-08 |
| ESP-P10 | Medición de batería/carga y patrones LED | Hardware/firmware/producto | Entrevista §9/10 |
| ESP-P11 | Antigüedad e incertidumbre de eventos | Producto/Android/backend | PD-10; ESP-06 |

Las propuestas de esta carpeta no cierran automáticamente estos pendientes. [ESP-08](08_Spec_Firmware_Maquina_Estados_NVS_y_BLE.md) registra valores de implementación para ESP-P01 y ESP-P03. No los cierra: faltan la compilación y las pruebas cruzadas. Al resolver uno registrar decisión, versión, responsables y pruebas asociadas en el documento correspondiente.

## 4. Evidencias y actualización documental

Cada ejecución debe identificar firmware y protocolo, placa, teléfono/Android, versión de app y backend, caso, condiciones de conectividad, IDs correlacionados, resultado esperado y observado. Conservar logs mínimos sin tokens, secretos o ubicación precisa innecesaria. Registrar fallos y limitaciones, no solo capturas de pantallas satisfactorias.

Tras una implementación, actualizar ESP-01 y los estados de aceptación con enlaces a la evidencia real. Mantener las reglas del botón y medicamentos, los dos contactos con dos intentos y la separación entre cierre asistencial y seguimiento. Una entrega documental no cambia esos requisitos ni acredita su cumplimiento.
