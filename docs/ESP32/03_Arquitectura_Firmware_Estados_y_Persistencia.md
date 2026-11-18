# ESP-03 — Arquitectura del firmware, estados y persistencia

**Versión:** 1.0 · **Fecha:** 14 de noviembre de 2026.  
**Estado:** diseño propuesto. El detalle ejecutable de módulos, bytes y restauración está en [ESP-08](08_Spec_Firmware_Maquina_Estados_NVS_y_BLE.md). Las decisiones de temporización remota y reinicio siguen PD-12/P-04 hasta validación conjunta.

## 1. Separación de responsabilidades

| Unidad propuesta | Función | Restricción |
|---|---|---|
| Sensor y detector | Muestrear, diagnosticar y producir candidatos | No esperar conexión o respuesta remota |
| Gestor de episodio | Identidad, ventana, resultado y orden | Una transición coherente por episodio |
| Entrada física | Antirrebote y pulsación válida | No convertir botón atascado en silencio permanente del detector |
| Señales | Buzzer y LED por prioridad | Sin esperas bloqueantes largas |
| BLE | Recibir órdenes y publicar hechos | Los callbacks no ejecutan trabajo lento |
| Registro local | Conservar hechos críticos y resultados | No escribir cada muestra en flash |
| Diagnóstico | Versión, capacidades, sensor y almacenamiento | Sin secretos ni datos personales |

La organización puede comenzar como módulos Arduino sin introducir un framework adicional. La planificación debe separar muestreo, comunicación y persistencia para medir su latencia conjunta.

## 2. Episodio y estados propuestos

Los estados de comunicación (`disconnected`, `connected`, `authorized`) son independientes del episodio. Perder BLE no cancela la alarma ni crea otra detección.

| Estado lógico | Entrada | Resultado |
|---|---|---|
| `idle` | Candidato aceptado por detector | Crear episodio, registrar inicio, activar alarma y pasar a `pending` |
| `pending` | Cancelación válida dentro de la ventana | Persistir `canceled`, ordenar apagar buzzer y emitir resultado |
| `pending` | Plazo agotado sin cancelación | Persistir `expired`; Android podrá publicar incidencia |
| `canceled` | Acuse, consulta o reenvío | Conservar resultado hasta transferencia y retención acordadas |
| `expired` | Botón o comando posterior | Separar silenciamiento de alarma y cancelación tardía |
| Resultado local cerrado | Condiciones de rearme satisfechas | Permitir episodio nuevo sin perder el anterior pendiente |

No se debe mantener indefinidamente un único episodio bloqueando nuevas detecciones por falta de Internet. El rearme y la retención del historial son responsabilidades distintas. El patrón de rearme y el tratamiento de nuevos impactos durante `pending` deben probarse y documentarse.

## 3. Ventana local de 30 segundos

La regla funcional es una espera de 30 segundos desde la detección, con sonido solo en el bastón. Android conserva la coordinación local y la publicación remota. Se propone que el ESP32 mantenga además la referencia monotónica y el resultado físico del episodio para respaldar la recuperación; este respaldo aún no existe.

Un único `sourceEventId` representa la detección, la cancelación y el vencimiento. La reconexión devuelve tiempo transcurrido y resultado; no reinicia la espera. Android no espera 30 segundos adicionales desde la recepción de una detección atrasada.

Propuesta de arbitraje para probar: el firmware serializa la cancelación y el vencimiento del mismo episodio; una cancelación válida evaluada antes del plazo produce `canceled`, y al llegar o superar el plazo produce un resultado tardío. La orden debe llegar al firmware: la hora del toque en pantalla no acredita su ejecución. La política de margen temporal y cancelación tardía remota continúa pendiente; no se debe ocultar esa limitación.

Al reconectar, Android consulta el resultado antes de publicar un vencimiento pendiente. Si no puede confirmar el estado físico, conserva explícitamente la incertidumbre y aplica la política PD-12 que se valide, sin fabricar una confirmación.

## 4. Identidad y persistencia

| Campo | Propuesta |
|---|---|
| `deviceSerial` | Estable y provisionado; público, no es credencial |
| `firmwareVersion` | Versión del binario cargado |
| `protocolVersion` | Versión del contrato lógico |
| `bootId` | Nuevo identificador por arranque, no derivado solo de `millis()` |
| `sequence` | Orden de registros en un arranque, con política de desbordamiento |
| `sourceEventId` | Identidad de detección, por ejemplo `bootId:sequence`; no cambia al reenviar |
| `commandId` | Identidad de orden para ejecución idempotente |

Un episodio recuperado después de reiniciar conserva el `sourceEventId` y el arranque de origen. Los registros nuevos pueden indicar también el arranque de emisión; no se reescribe la identidad del hecho original.

Se propone un registro acotado y recuperable en almacenamiento no volátil para inicio, cancelación, vencimiento y resultado de comandos críticos. Debe especificar formato versionado, escritura atómica, detección de corrupción, capacidad y comportamiento al llenarse. Una cola llena genera diagnóstico; no se descarta silenciosamente el episodio para presentar éxito. El presupuesto de memoria y desgaste se mide en la placa real.

Un acuse BLE de transporte no permite borrar el hecho. El acuse de aplicación `ack_records` solo se envía después de persistirlo en Android. La copia Android no se elimina hasta el resultado correspondiente del backend. Retención y reenvío máximo se cierran en ESP-04.

## 5. Reinicio y fallos

`millis()` reinicia con el dispositivo y no mide el tiempo sin alimentación. Sin RTC o referencia temporal fiable no se puede reconstruir con exactitud una ventana atravesada por un apagado. En ese caso el estado recuperado debe marcar incertidumbre; no se inicia otra ventana silenciosamente ni se declara vencimiento preciso inventado. La decisión de aviso/revisión se mantiene como puerta pendiente en ESP-07.

Un fallo del sensor debe ser visible, con intento de recuperación controlado. La pérdida de enlace mantiene las funciones locales disponibles. Las llamadas se originan en el flujo validado de Android/backend, nunca desde un estado del firmware que afirme que ya se contactó a un cuidador.

La duración del buzzer después del vencimiento, el silenciamiento posterior y el tiempo de rearme son decisiones pendientes. Silenciar después de vencer no borra una incidencia ni demuestra falsa alarma previa al vencimiento.
