# ESP-04 — Contrato BLE: eventos, comandos y seguridad

**Versión lógica propuesta:** 0.1 · **Fecha:** 14 de noviembre de 2026.  
**Estado:** borrador de diseño compartido, no protocolo implementado ni aprobado para producción.

## 1. Topología y negociación

ESP32 actúa como periférico/servidor GATT y Android Persona como central/cliente. Solo la pasarela autorizada debe poder ejecutar órdenes. Android Cuidador utiliza la API remota y no necesita un enlace BLE con el bastón.

Se propone un servicio privado GuardMe con estas características lógicas:

| Nombre lógico | Operación | Contenido |
|---|---|---|
| `identity` | Read | Serie, modelo, firmware, protocolo y capacidades |
| `state` | Read mediante transferencia definida | Episodio y resultado actual, tiempo transcurrido y diagnóstico |
| `events` | Notify/Indicate según diseño físico | Registros de detección, cancelación, vencimiento y telemetría |
| `commands` | Write with response | Órdenes identificadas y limitadas |
| `command_results` | Notify/Indicate | Resultado aplicado o rechazado y motivo |

Los nombres son identificadores documentales. Los UUID, la trama little-endian y el bonding Just Works propuestos para el firmware están en [ESP-08](08_Spec_Firmware_Maquina_Estados_NVS_y_BLE.md). Esa asignación es spec 0.2, no aprobación de producto ni medición en placa. Leer identidad incluye compatibilidad de protocolo y capacidades; no basta con encontrar el nombre Bluetooth.

## 2. Sobre lógico

| Campo | Significado |
|---|---|
| `protocolVersion` | Versión mayor/menor interpretada por ambos extremos |
| `deviceSerial` | Identidad física que Android vincula con `caneId` del servidor |
| `recordId` | Identidad única del registro para acuse y reenvío |
| `bootId`, `sequence` | Arranque y orden del registro de origen |
| `type` | Tipo explícito del mensaje |
| `sourceEventId` | Detección relacionada; compartida por cancelación y vencimiento |
| `uptimeMs` | Tiempo monotónico en el arranque indicado, cuando esté disponible |
| `payload` | Datos validados del tipo |

`recordId` distingue los diferentes hechos de un episodio; `sourceEventId` agrupa ese episodio. No usar `sourceEventId` como acuse de todos sus registros: reconocer la detección no reconoce una cancelación posterior. Los enteros deben tener tamaño y desbordamiento definidos en el formato físico.

Ejemplo exclusivamente lógico, no paquete GATT listo para transmitir:

```json
{
  "protocolVersion": "0.1",
  "deviceSerial": "GM-0001",
  "recordId": "boot-a:18",
  "bootId": "boot-a",
  "sequence": 18,
  "type": "fall_candidate",
  "sourceEventId": "boot-a:18",
  "uptimeMs": 42000,
  "payload": { "windowDurationMs": 30000 }
}
```

## 3. Hechos emitidos por el bastón

| Tipo propuesto | Datos propios | Tratamiento Android |
|---|---|---|
| `fall_candidate` | Inicio monotónico, duración y estado `pending` | Persistir y presentar ventana restante |
| `fall_canceled` | Episodio, vía `button`/`app`, resultado temporal | Conciliar y preparar contador si fue cancelación válida |
| `fall_expired` | Episodio, referencia de vencimiento | Conciliar antes de publicar una incidencia |
| `state_snapshot` | Episodio, resultado, secuencia y certeza temporal | Recuperar estado al conectar |
| `telemetry` | Estado sensor y mediciones soportadas | Añadir hora de captura, fuente y antigüedad |
| `device_fault` | Código, unidad afectada y recuperabilidad | Mostrar capacidad limitada y conservar diagnóstico |

Una cancelación o silenciamiento posterior al vencimiento debe indicar esa condición; no se transforma automáticamente en `false_alarm_canceled`. La política remota correspondiente sigue pendiente. Tipos desconocidos o versiones mayores incompatibles producen incompatibilidad explícita; no se interpretan como éxito.

## 4. Órdenes y resultados

| Orden propuesta | Datos mínimos | Resultado requerido |
|---|---|---|
| `get_state` | `commandId` | Snapshot identificado |
| `cancel_fall` | `commandId`, `sourceEventId` | Aplicada, ya cancelada, vencida, ajena o rechazada |
| `request_replay` | Cursor de registro conocido | Registros posteriores o indicación de hueco/retención agotada |
| `ack_records` | IDs/rango contiguo realmente persistidos | Acuse lógico de recepción durable en Android |
| `signal_reminder` | `commandId`, ocurrencia, patrón y vigencia | Señal aplicada, rechazada o caducada |

Las respuestas incluyen `commandId`, episodio/ocurrencia, fase `received`/`applied`/`rejected` y código estable. La respuesta GATT al write confirma transporte, no ejecución. `applied` acredita la transición y la salida programada por firmware; sin sensor adicional no demuestra sonido audible o funcionamiento eléctrico del buzzer.

La misma orden reenviada con el mismo ID y contenido devuelve el resultado conocido sin repetir el efecto. Reutilizar un ID con otro contenido se rechaza. Deben fijarse capacidad y retención del registro de comandos; al excederlas no se promete idempotencia ilimitada.

El botón no confirma medicamentos ni origina una emergencia manual adicional. La búsqueda sonora queda fuera del compromiso actual hasta que se acuerde y exista implementación.

## 5. Reconexión y caducidad

Al reconectar: verificar identidad y autorización, negociar versión/capacidades, suscribirse, obtener snapshot y recuperar registros. Suscripción y snapshot deben tener un cursor común o una segunda conciliación que cierre la carrera entre ambos; no se permite perder un evento ocurrido durante la lectura de estado.

Android persiste antes de `ack_records`. El firmware conserva registros no reconocidos y responde explícitamente si ya no puede reproducir un rango. Android concilia resultados del episodio antes de enviar vencimientos pendientes. Los reintentos mantienen IDs y no reinician los 30 segundos.

Los recordatorios necesitan vigencia comprobable. Se propone transmitir una duración restante referida a la recepción autorizada y un ID de ocurrencia, sin prolongarla por reenvíos. Android no reenvía una orden vencida y el firmware conserva su resultado. Si un reinicio impide conocer la vigencia restante, no se reproduce a ciegas; consultar o rechazar con motivo temporal. El formato final debe concretar cómo evita reiniciar el TTL en duplicados.

## 6. Transporte físico pendiente de cerrar

| Decisión obligatoria | Contenido que debe registrarse |
|---|---|
| UUID | Servicio y características, propiedades y permisos |
| Codificación | JSON/CBOR/binario, campos, tipos, tamaños y unidades |
| MTU y fragmentación | Funcionamiento con MTU mínima, cabecera, orden y reensamblado |
| Límites | Tamaño máximo, buffers, número de fragmentos y timeout |
| Flujo y fiabilidad | Notify/Indicate, crédito/cola, reenvío y acuse de aplicación |
| Errores | Códigos por versión, frame incompleto, orden desconocida y falta de espacio |
| Retención | Registros, comandos, desbordamiento, reinicio y cursores |
| Parámetros de enlace | Reconexión, supervisión y consumo medidos |

No se presupone que un JSON cabe en una notificación. El ejemplo anterior es un modelo de contenido. ESP-08 fija la codificación binaria, los UUID y la fragmentación como propuesta 0.2. El contrato se convierte en versión 1.0 solo cuando esta tabla tenga valores verificados en placa y pruebas cruzadas.

## 7. Seguridad e incorporación

Son dos controles diferentes: asignar el bastón a un perfil en backend y autorizar el enlace BLE que permite actuar sobre él. La serie, dirección BLE y nombre público no son secretos. El código de incorporación del servidor no se trata automáticamente como clave BLE.

La elección de pairing/bonding, cifrado, protección frente a intermediario, prueba física y aprovisionamiento debe ajustarse a las entradas/salidas disponibles del bastón. No se afirma que pairing sin autenticación fuerte demuestre posesión. Las órdenes críticas permanecen restringidas mientras no se complete la vinculación definida.

Se deben diseñar cambio de teléfono, revocación y recuperación física. Cambiar la pasarela en backend no elimina por sí solo una clave BLE antigua del ESP32, especialmente sin red; esa transición requiere un mecanismo local verificable. No se guardan tokens de Auth ni secretos de servidor en el bastón ni en publicidad BLE.
