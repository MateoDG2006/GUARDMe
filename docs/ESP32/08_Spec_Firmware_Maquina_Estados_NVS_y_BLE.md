# Spec 08: Firmware del bastón — estados, NVS y BLE 0.2

> **Para:** Cursor AI — Rol: Developer
> **Autor del plan:** Tech Lead
> **Stack:** Arduino C++ · core Arduino-ESP32 3.x · FQBN `esp32:esp32:esp32` · Adafruit MPU6050 · BLE y NVS del core
> **Fecha:** 14 de noviembre de 2026
> **Docs de origen:** ESP-01 a ESP-04, ESP-07, entrevista de producto 14 nov 2026 §§3–4
> **Alcance:** solo el firmware en `Arduino/ESP32_main/`. Android y backend no se modifican.

---

## Instrucciones para Cursor

No tomes decisiones de arquitectura por tu cuenta.
Implementa este plan exactamente como está descrito.
Si un símbolo BLE citado no existe en el core instalado, detente y reporta la versión del core. No cambies a NimBLE ni a otra biblioteca.
Archivos de contexto a cargar: `@docs/ESP32/08_Spec_Firmware_Maquina_Estados_NVS_y_BLE.md` `@docs/ESP32/03_Arquitectura_Firmware_Estados_y_Persistencia.md` `@docs/ESP32/04_Contrato_BLE_Eventos_Comandos_y_Seguridad.md` `@Arduino/ESP32_main/ESP32_main.ino`

Esta spec es una propuesta de implementación 0.2. No es aprobación de producto, no cierra ESP-P07 (MITM, cambio de teléfono, revocación) y no acredita pruebas físicas. El sketch actual sigue siendo la referencia del detector hasta que esta spec se compile.

---

## Objetivo

Separar el prototipo de `ESP32_main.ino` en módulos y añadir la máquina del episodio de 30 segundos, un anillo durable en NVS y un periférico BLE con tramas binarias little-endian. El bastón detecta el mismo golpe que hoy, hace sonar el buzzer y permite cancelar con el botón o con una orden del teléfono ya emparejado. Si pasan 30 segundos sin una cancelación aplicada a tiempo, el resultado local queda vencido. Un corte de alimentación no inventa ese vencimiento.

La cadena Android → NestJS queda fuera de este trabajo. El firmware no abre Wi-Fi, no guarda tokens y no avisa al cuidador.

---

## Decisiones de esta spec

| Tema | Valor fijado aquí | Qué no cierra |
|---|---|---|
| Placa | ESP32 clásico, FQBN `esp32:esp32:esp32` | El circuito del buzzer y del botón sigue sin esquema eléctrico |
| Pines | SDA 21, SCL 22, botón 4 (PULLUP), buzzer 18, LED R23/G19/B15 | GPIO 6 y GPIO 7 prohibidos: en este chip van al flash |
| Detector | Fórmula, umbral `100.0`, ±8 g, filtro 94 Hz, muestra cada 10 ms | Calibración con caídas reales |
| Ventana | 30 000 ms desde el candidato aceptado en este arranque | Política remota PD-12 |
| Aire | Binario little-endian, protocolo mayor 0 menor 2 | Medición de MTU, consumo y alcance |
| BLE | API `BLEDevice` del core Arduino-ESP32 3.x | NimBLE |
| Emparejamiento | Bonding Just Works, sin PIN, órdenes solo cifradas | Prueba de posesión y protección ante intermediario |
| Almacén | NVS vía `Preferences`, anillo de 8 registros | Desgaste medido en placa |

---

## Archivos

| Acción | Ruta | Descripción |
|--------|------|-------------|
| CREAR | `Arduino/ESP32_main/config.h` | Pines, tiempos, UUID, capacidades y topes |
| CREAR | `Arduino/ESP32_main/protocol.h` | Layouts de bytes, tipos, fases y códigos |
| CREAR | `Arduino/ESP32_main/episode_step.h` | Entrada, decisión y firma de la transición pura |
| CREAR | `Arduino/ESP32_main/episode_step.cpp` | Transición pura, sin `Arduino.h` |
| CREAR | `Arduino/ESP32_main/detector.h` / `.cpp` | MPU6050, muestreo y candidato |
| CREAR | `Arduino/ESP32_main/button.h` / `.cpp` | Pulsación de 600 ms, suelta, rearme y atasco |
| CREAR | `Arduino/ESP32_main/signals.h` / `.cpp` | Buzzer no bloqueante |
| CREAR | `Arduino/ESP32_main/store.h` / `.cpp` | NVS, anillo, serie, resultados de órdenes |
| CREAR | `Arduino/ESP32_main/ble_link.h` / `.cpp` | GATT, fragmentación, bonding, colas |
| CREAR | `Arduino/ESP32_main/diag.h` / `.cpp` | Serie cada 100 ms y autochequeo |
| MODIFICAR | `Arduino/ESP32_main/ESP32_main.ino` | `setup`/`loop` en el orden de esta spec |

No crear módulos de Android, NestJS, LED, batería ni Wi-Fi.

---

## Constantes (`config.h`)

```cpp
static const int PIN_SDA = 21;
static const int PIN_SCL = 22;
static const int PIN_BOTON = 4;    // INPUT_PULLDOWN, activo en HIGH
static const int PIN_BUZZER = 18;  // OUTPUT, activo en HIGH (esquema GUARDMe)
static const int PIN_LED_R = 23;   // RGB ánodo común, activo en LOW
static const int PIN_LED_G = 19;
static const int PIN_LED_B = 15;

static const float UMBRAL_GOLPE = 100.0f;
static const uint32_t MUESTRA_MS = 10;
static const uint32_t SERIAL_MS = 100;
static const uint32_t VENTANA_MS = 30000;
static const uint32_t PULSO_MS = 600;
static const uint32_t SUELTA_MS = 80;
static const uint32_t REARME_MS = 400;
static const uint32_t ATASCO_MS = 2000;
static const uint32_t REINTENTO_SENSOR_MS = 1000;
static const uint32_t REINTENTO_NVS_MS = 1000;
static const uint32_t ENSAMBLE_MS = 2000;
static const uint32_t INDICATE_MS = 3000;
static const uint8_t INDICATE_REINTENTOS = 3;
static const uint32_t RECORDATORIO_MAX_MS = 300000;

static const uint8_t PROTO_MAJOR = 0;
static const uint8_t PROTO_MINOR = 2;
static const char FIRMWARE_VERSION[] = "0.2.0";
static const char BLE_NAME[] = "GUARDMe";
static const char NVS_NS[] = "gm";

static const int ANILLO = 8;
static const int ORDENES = 16;
static const int COLA_SALIDA = 4;
```

GPIO 6 y GPIO 7 no aparecen en ningún `pinMode`.

UUID locales de esta spec. No cambiarlos sin subir `PROTO_MINOR`.

| Característica | Propiedad | Permiso GATT | UUID |
|---|---|---|---|
| Servicio GuardMe | — | — | `4f6a8c10-2b7e-4d91-a3c5-91e0b74d6f20` |
| `identity` | Read | lectura abierta | `4f6a8c11-2b7e-4d91-a3c5-91e0b74d6f20` |
| `state` | Read | lectura cifrada | `4f6a8c12-2b7e-4d91-a3c5-91e0b74d6f20` |
| `events` | Indicate | lectura cifrada | `4f6a8c13-2b7e-4d91-a3c5-91e0b74d6f20` |
| `commands` | Write | escritura cifrada | `4f6a8c14-2b7e-4d91-a3c5-91e0b74d6f20` |
| `command_results` | Indicate | lectura cifrada | `4f6a8c15-2b7e-4d91-a3c5-91e0b74d6f20` |

`events` y `command_results` llevan descriptor `BLE2902`. Publicidad: nombre `GUARDMe`, UUID del servicio, intervalo 100 ms. Sin serie, sin token y sin fabricante.

Capacidades en el bloque de identidad, `uint16` little-endian:

| Bit | Significado | Valor 0.2 |
|---|---|---|
| 0 | Acelerómetro | 1 |
| 1 | Giroscopio informado y fuera de la decisión | 1 |
| 2 | Botón | 1 |
| 3 | Buzzer digital | 1 |
| 4 | NVS | 1 |
| 5 | Indicate fragmentado | 1 |
| 6 | Batería | 0 |
| 7 | LED | 0 |

---

## Modelo de datos

Todos los enteros de más de un byte van little-endian, en el aire y en NVS. Los magic se escriben byte a byte, en el orden de la tabla. Un `uint32` nativo no se vuelca con un cast.

### Fases, tipos y códigos

```cpp
enum class Fase : uint8_t { Idle = 0, Pending = 1, Canceled = 2, Expired = 3 };

enum class Tipo : uint8_t {
  FallCandidate = 0x01,
  FallCanceled = 0x02,
  FallExpired = 0x03,
  Telemetry = 0x05,
  DeviceFault = 0x06,
  AlarmSilenced = 0x07,
  CmdGetState = 0x10,
  CmdCancelFall = 0x11,
  CmdRequestReplay = 0x12,
  CmdAckRecords = 0x13,
  CmdSignalReminder = 0x14,
  CmdResult = 0x20
};

enum class FaseOrden : uint8_t { Received = 1, Applied = 2, Rejected = 3 };

enum class Codigo : uint8_t {
  Ok = 0,
  AlreadyApplied = 1,
  Expired = 2,
  UnknownEpisode = 3,
  NotBonded = 4,
  BadIdReuse = 5,
  Unsupported = 6,
  ExpiredTtl = 7,
  Gap = 8,
  NoSpace = 9,
  BadFrame = 10,
  Incompatible = 11,
  Preempted = 12
};
```

`Via`: `1` botón, `2` app. La cadena canónica de un episodio, solo para el monitor serie y para el mapeo futuro del teléfono, es 16 hexadecimales en minúscula del `boot_id` de origen, dos puntos y la secuencia decimal sin ceros a la izquierda. Ejemplo: `a1b2c3d4e5f67890:18`. En el aire viajan los 8 bytes y el `uint16`, no el texto.

### Registro NVS y cuerpo de evento (64 bytes)

| Offset | Bytes | Campo |
|---|---|---|
| 0 | 4 | Magic `47 4D 52 31` |
| 4 | 1 | `layout` = 1 |
| 5 | 1 | `tipo` |
| 6 | 1 | `flags`: bit0 reconocido, bit1 tiempo incierto |
| 7 | 1 | `payload_len` |
| 8 | 2 | `sequence` de este registro en su arranque |
| 10 | 2 | `source_sequence` |
| 12 | 8 | `boot_id` del arranque que escribió el registro |
| 20 | 8 | `source_boot_id` del arranque que creó el episodio |
| 28 | 4 | `uptime_ms` del arranque que escribe |
| 32 | 24 | `payload`, resto a cero |
| 56 | 4 | CRC-32/ISO-HDLC de los bytes 0..55 |
| 60 | 4 | Cero |

La secuencia de un arranque empieza en 1. El valor 0 significa «no hay episodio». El `boot_id` son 8 bytes de `esp_random()` generados una vez en `setup` y guardados. No se deriva de `millis()`.

CRC-32/ISO-HDLC: polinomio reflejado `0xEDB88320`, inicial `0xFFFFFFFF`, xor final `0xFFFFFFFF`.

Payload por tipo, dentro de los 24 bytes:

| Tipo | Longitud | Contenido |
|---|---|---|
| `FallCandidate` | 8 | `u16 window_ms = 30000`, `float32` intensidad, `u8` fase `Pending`, `u8` tiempo cierto |
| `FallCanceled` | 8 | `u8` vía, `u8` `after_deadline = 0`, 2 bytes cero, `u32 elapsed_ms` |
| `FallExpired` | 8 | `u32 elapsed_ms`, `u8` tiempo cierto, 3 bytes cero |
| `AlarmSilenced` | 4 | `u8` vía `1`, `u8` `after_deadline = 1`, 2 bytes cero |
| `Telemetry` | 8 | `u8` sensor (0 desconocido, 1 ok, 2 fallo), `u8` enlace (0, 1 conectado, 2 autorizado), 2 bytes cero, `float32` última intensidad |
| `DeviceFault` | 4 | `u16` código, `u8` unidad, `u8` recuperable |

Códigos de fallo: `1` sensor ausente, `2` botón atascado, `3` NVS corrupta, `4` anillo lleno, `5` secuencia agotada. Unidades: `1` sensor, `2` botón, `3` almacenamiento, `4` secuencia, `5` reloj.

### Identidad leída por GATT (48 bytes)

| Offset | Bytes | Campo |
|---|---|---|
| 0 | 4 | Magic `47 4D 49 44` |
| 4 | 1 | `layout` = 1 |
| 5 | 1 | `PROTO_MAJOR` |
| 6 | 1 | `PROTO_MINOR` |
| 7 | 1 | Cero |
| 8 | 20 | Serie terminada en NUL, forma `GM-` + 12 hex mayúsculas |
| 28 | 16 | `FIRMWARE_VERSION` terminada en NUL |
| 44 | 2 | Capacidades |
| 46 | 2 | Cero |

La serie sale de `esp_read_mac(..., ESP_MAC_WIFI_STA)`. Si la clave NVS `serial` ya existe, se usa esa y no se reescribe.

### Estado leído por GATT (52 bytes)

| Offset | Bytes | Campo |
|---|---|---|
| 0 | 4 | Magic `47 4D 53 54` |
| 4 | 1 | `layout` = 1 |
| 5 | 1 | `Fase` viva |
| 6 | 1 | Tiempo cierto de la fase viva |
| 7 | 1 | Enlace |
| 8 | 1 | Sensor |
| 9 | 1 | Botón atascado |
| 10 | 1 | NVS usable |
| 11 | 1 | Anillo sin hueco libre para un registro no reconocido |
| 12 | 8 | `boot_id` de este arranque |
| 20 | 2 | Secuencia viva, 0 si `Idle` |
| 22 | 2 | `source_sequence` viva, 0 si `Idle` |
| 24 | 8 | `source_boot_id` vivo, cero si `Idle` |
| 32 | 4 | `elapsed_ms` si la fase es `Pending` o `Expired` y el tiempo es cierto; si no, 0 |
| 36 | 4 | `uptime_ms` |
| 40 | 2 | `VENTANA_MS` |
| 42 | 2 | Registros no reconocidos |
| 44 | 1 | Vía de la cancelación viva, o 0 |
| 45 | 1 | Último código de fallo, o 0 |
| 46 | 2 | Registros con `flags.bit1` aún no reconocidos |
| 48 | 4 | CRC-32 de los bytes 0..47 |

### Orden entrante y resultado (32 bytes cada uno)

Orden, tras reensamblar:

| Offset | Bytes | Campo |
|---|---|---|
| 0 | 1 | Tipo `0x10`..`0x14` |
| 1 | 3 | Cero |
| 4 | 16 | `command_id` |
| 20 | 12 | Argumentos |

Argumentos:

| Orden | Bytes 20..31 |
|---|---|
| `CmdGetState` | Ceros |
| `CmdCancelFall` | 8 `source_boot_id`, `u16 source_sequence`, 2 ceros |
| `CmdRequestReplay` | 8 `cursor_boot`, `u16 cursor_sequence`, 2 ceros. Ceros en ambos = desde el más antiguo retenido |
| `CmdAckRecords` | 8 `boot_id`, `u16 from_seq`, `u16 to_seq`, 0 ceros de relleno hasta 12 |
| `CmdSignalReminder` | 8 `occurrence_id`, `u32 duration_ms`, `u8 pattern_id` |

Resultado, en `command_results`:

| Offset | Bytes | Campo |
|---|---|---|
| 0 | 1 | `CmdResult` |
| 1 | 1 | `FaseOrden` |
| 2 | 1 | `Codigo` |
| 3 | 1 | Cero |
| 4 | 16 | `command_id` |
| 20 | 8 | `source_boot_id` u `occurrence_id`, si aplica |
| 28 | 2 | `source_sequence`, o 0 |
| 30 | 2 | Cero |

`Received` lleva `Codigo::Ok` y no significa que el buzzer haya cambiado. El resultado final llega después, con el mismo `command_id`.

### Cabecera de fragmento (8 bytes)

| Offset | Bytes | Campo |
|---|---|---|
| 0 | 1 | `0xA5` |
| 1 | 1 | `0x02` |
| 2 | 1 | Tipo del mensaje completo |
| 3 | 1 | bit0 = 1 si faltan fragmentos |
| 4 | 2 | `transfer_id` |
| 6 | 1 | Índice, desde 0 |
| 7 | 1 | Cantidad, mínimo 1 |

El payload del fragmento mide `MTU - 3 - 8` y nunca menos de 1. Con MTU 23 son 12 bytes. Un mensaje se reensambla en orden, con el mismo `transfer_id`, hasta `cantidad` fragmentos. Índice fuera de rango, cantidad 0, versión distinta de `0x02` o silencio de más de `ENSAMBLE_MS` descartan el traslado y producen `BadFrame` si ya había un `command_id` legible; si no, solo se descarta.

Indicate y Write usan esta cabecera. Read de identidad y de estado no: el cliente usa Read Blob con offset sobre el bloque fijo.

---

## Contratos de funciones

### `stepEpisode`

```cpp
// Archivo: Arduino/ESP32_main/episode_step.h
// Sin includes de Arduino, BLE, Wire ni Preferences.

struct EntradaEpisodio {
  Fase fase;
  uint8_t tiempo_cierto;
  uint32_t now_ms;
  uint32_t t0_ms;
  uint8_t candidato;
  uint8_t cancelar;
  uint32_t cancel_at_ms;
  uint8_t via;
  uint8_t silenciar;
  uint8_t ya_silenciado;
};

struct DecisionEpisodio {
  Fase fase;
  Tipo emitir;          // 0 si no hay registro
  uint8_t hay_emision;
  uint8_t buzzer_on;
  uint8_t silenciado;
  uint32_t elapsed_ms;
};

DecisionEpisodio stepEpisode(const EntradaEpisodio& in, uint32_t window_ms);
```

**Responsabilidad:** una transición. No escribe NVS, no toca GPIO y no lee el reloj.

Reglas, evaluadas en este orden:

1. `Idle` y `candidato`: pasar a `Pending`, emitir `FallCandidate`, `buzzer_on = 1`, `elapsed_ms = 0`. El llamador fija `t0_ms` con el `now_ms` de esa vuelta.
2. `Pending`, `tiempo_cierto == 1` y `cancelar` con `(cancel_at_ms - t0_ms) < window_ms`: pasar a `Canceled`, emitir `FallCanceled`, `buzzer_on = 0`.
3. `Pending`, `tiempo_cierto == 1` y `(now_ms - t0_ms) >= window_ms`: pasar a `Expired`, emitir `FallExpired`, `buzzer_on = 1`.
4. `Pending` y `tiempo_cierto == 0`: la fase no cambia y no hay emisión. `buzzer_on = 0`.
5. `Expired` y `silenciar`, con `ya_silenciado == 0`: la fase sigue `Expired`, emitir `AlarmSilenced`, `buzzer_on = 0`, `silenciado = 1`.
6. `Expired` y `ya_silenciado == 1`: la fase sigue `Expired`, sin emisión, `buzzer_on = 0`, `silenciado = 1`.
7. `Canceled`: la fase sigue `Canceled`, sin emisión, `buzzer_on = 0`, `silenciado = 0`.
8. `Idle` sin candidato: la fase sigue `Idle`, sin emisión, `buzzer_on = 0`, `silenciado = 0`.
9. `Pending` que no entró por las reglas 2 a 4: la fase sigue `Pending`, sin emisión, `buzzer_on = 1` si `tiempo_cierto == 1` y `0` si no. `silenciado = 0`.

Las restas son de `uint32`. Un cancelar con `(cancel_at_ms - t0_ms) >= window_ms` no entra por la regla 2; si el plazo ya se cumplió, entra por la regla 3.

### `onBootRestore`

```cpp
// Archivo: Arduino/ESP32_main/episode_step.h
struct RestaureArranque {
  Fase fase_viva;                 // siempre Idle
  uint8_t buzzer_on;              // siempre 0
  uint8_t marcar_incierta;        // 1 si la fase guardada era Pending
};

RestaureArranque onBootRestore(Fase fase_guardada);
```

**Responsabilidad:** después de un rearranque la ventana no continúa y no se declara vencida. Si la fase guardada era `Pending`, el registro de ese candidato se marca `flags.bit1` y la fase viva queda `Idle`.

### `episodioListoParaNuevo`

```cpp
// Archivo: Arduino/ESP32_main/episode_step.h
uint8_t episodioListoParaNuevo(Fase fase, uint8_t suelta_estable, uint8_t rearme_cumplido);
```

**Responsabilidad:** devuelve 1 solo si la fase es `Canceled` o `Expired`, la suelta ya cumplió `SUELTA_MS` y el rearme cumplió `REARME_MS`. El llamador pasa entonces la fase viva a `Idle` sin borrar registros.

### `runEpisodeSelfCheck`

```cpp
// Archivo: Arduino/ESP32_main/episode_step.h
// Devuelve 0 si todas las filas de «Autochequeo» pasan. Si no, devuelve el número de fila (1..8).
int runEpisodeSelfCheck();
```

**Responsabilidad:** ejecutar la tabla de autochequeo contra `stepEpisode` y `onBootRestore`. Se llama desde `setup` antes de anunciar BLE.

### `Detector`

```cpp
// Archivo: Arduino/ESP32_main/detector.h
struct Muestra {
  uint32_t uptime_ms;
  float ax, ay, az;
  float gx, gy, gz;
  float intensidad;
  uint8_t sensor_ok;
};

class Detector {
 public:
  uint8_t begin();
  void tick(uint32_t now_ms);
  uint8_t takeCandidate(float& intensidad);
  uint8_t sensorOk() const;
  void lastSample(Muestra& out) const;
};
```

**Responsabilidad:** configurar el MPU6050 a ±8 g y ancho de banda 94 Hz, leer cada `MUESTRA_MS` y calcular `sqrt(dx*dx + dy*dy + dz*dz)` con la muestra anterior. `takeCandidate` devuelve 1 una sola vez cuando la intensidad supera `UMBRAL_GOLPE`. El giroscopio se guarda en `Muestra` y no entra en la comparación. Si `begin` falla, `tick` reintenta cada `REINTENTO_SENSOR_MS` sin `delay` y sin bucle infinito. El nivel del botón no interviene.

### `ButtonInput`

```cpp
// Archivo: Arduino/ESP32_main/button.h
enum class Gesto : uint8_t { Ninguno = 0, Pulsacion = 1, Atasco = 2 };

class ButtonInput {
 public:
  void begin(int pin);
  Gesto tick(uint32_t now_ms);
  uint8_t sueltaEstable() const;
  uint8_t rearmeCumplido() const;
  uint8_t atascado() const;
};
```

**Responsabilidad:** HIGH continuo de `PULSO_MS` durante `Pending` o `Expired` produce `Pulsacion` una vez. Soltar antes de `PULSO_MS` reinicia el conteo. Tras la pulsación válida, la suelta estable dura `SUELTA_MS` y el rearme dura `REARME_MS`; un HIGH durante el rearme reinicia ese plazo. Un HIGH de `ATASCO_MS` con la fase viva en `Idle` activa el atasco y no inhibe al detector. El atasco se limpia con una suelta de `SUELTA_MS`.

### `Signals`

```cpp
// Archivo: Arduino/ESP32_main/signals.h
enum class Sonido : uint8_t { Off = 0, Alarma = 1, Recordatorio = 2, Fallo = 3 };

class Signals {
 public:
  void begin(int pin);
  void set(Sonido sonido);
  void tick(uint32_t now_ms);
};
```

**Responsabilidad:** sin `delay`. `Alarma` deja el GPIO en HIGH. `Off` lo deja en LOW. `Recordatorio` hace 100 ms en HIGH y 400 ms en LOW hasta que el llamador pase a `Off`. `Fallo` hace 50 ms en HIGH cada 2000 ms. `Alarma` sustituye a los otros modos en la misma llamada a `set`.

### `RecordStore`

```cpp
// Archivo: Arduino/ESP32_main/store.h
struct Registro;      // los 64 bytes de protocol.h, con acceso por campos
struct ResultadoOrden; // los 32 bytes del resultado, más el hash de los 32 bytes de la orden

class RecordStore {
 public:
  uint8_t begin();
  void loadOrCreateSerial(char out[20]);
  void loadOrCreateBoot(uint8_t boot_id[8], uint8_t generar_nuevo);
  uint8_t append(const Registro& rec);
  uint8_t markAcked(const uint8_t boot[8], uint16_t from_seq, uint16_t to_seq);
  int replay(const uint8_t* cursor_boot, uint16_t cursor_seq, Registro* out, int max_out);
  uint8_t saveEpisode(Fase fase, uint32_t t0_ms, const uint8_t source_boot[8], uint16_t source_seq);
  uint8_t loadEpisode(Fase& fase, uint32_t& t0_ms, uint8_t source_boot[8], uint16_t& source_seq, uint8_t& found);
  uint8_t saveCommand(const uint8_t command_id[16], const uint8_t orden[32], const ResultadoOrden& result);
  uint8_t findCommand(const uint8_t command_id[16], const uint8_t orden[32], ResultadoOrden& result, uint8_t& hash_distinto);
  uint16_t unacked() const;
  uint16_t uncertainUnacked() const;
  uint8_t full() const;
  uint8_t ok() const;
};
```

**Responsabilidad:** `begin` abre el namespace `gm`. Cada ranura `r0`..`r7` es una escritura `putBytes` de 64 bytes. El índice de cabeza se actualiza después de la ranura. Un CRC malo deja la ranura fuera de uso, enciende el fallo `storage_corrupt` y no la trata como éxito vacío.

`append` no pisa un registro con `flags.bit0 == 0`. Si las ocho ranuras están sin reconocer, devuelve 0 y `full()` queda en 1. Las ranuras reconocidas sí se reutilizan.

`markAcked` exige que cada secuencia de `from_seq` a `to_seq`, inclusive, exista para ese `boot_id`. Si falta una, no marca ninguna y devuelve 0. `replay` recorre el anillo en orden de inserción y copia los registros posteriores al cursor. Si el cursor no es cero y no está en el anillo, devuelve `-1`.

`saveCommand` guarda 16 resultados como máximo en la clave `cmds`. Al llenarse, el más antiguo se reemplaza. `findCommand` devuelve 1 si el id está guardado. `hash_distinto` queda en 1 cuando el id coincide y los 32 bytes de la orden no.

`saveEpisode` / `loadEpisode` usan la clave `live` para la fase de la sesión, aparte del anillo. Un CRC malo en `live` equivale a `found = 0`.

### `GuardMeBle`

```cpp
// Archivo: Arduino/ESP32_main/ble_link.h
enum class Enlace : uint8_t { Off = 0, Connected = 1, Authorized = 2 };

struct OrdenLista {
  uint8_t bytes[32];
  uint32_t llegada_ms;
};

class GuardMeBle {
 public:
  void begin(RecordStore& store);
  void tick(uint32_t now_ms);
  Enlace link() const;
  uint8_t takeCommand(OrdenLista& out);
  uint8_t indicate(const uint8_t* msg, uint16_t len, uint8_t tipo);
  void setState(const uint8_t* bloque52);
  void setIdentity(const uint8_t* bloque48);
};
```

**Responsabilidad:** crear el servidor GATT con los UUID y permisos de esta spec, anunciar `GUARDMe` y mover bytes. Los callbacks solo copian a un búfer. `tick` reensambla, espera la confirmación del Indicate y reintenta. Como máximo hay un central; una segunda conexión se cierra. Como máximo hay un ensamblado de orden y `COLA_SALIDA` mensajes de salida.

Seguridad, con los símbolos del core 3.x:

- `BLESecurity::setAuthenticationMode(ESP_LE_AUTH_BOND)`
- `BLESecurity::setCapability(ESP_IO_CAP_NONE)`
- sin PIN estático
- `identity`: `ESP_GATT_PERM_READ`
- `state` y los Indicate: `ESP_GATT_PERM_READ_ENCRYPTED`
- `commands`: `ESP_GATT_PERM_WRITE_ENCRYPTED`

Just Works no demuestra posesión del bastón. Esta spec no implementa comparación numérica, lista blanca de teléfonos ni borrado de una clave al cambiar la pasarela en el servidor.

Una orden con `PROTO` distinto no se aplica: el resultado es `Rejected` / `Incompatible`. El mayor y el menor tienen que ser 0 y 2.

### `Diag`

```cpp
// Archivo: Arduino/ESP32_main/diag.h
class Diag {
 public:
  void begin();
  void tick(uint32_t now_ms, Fase fase, const Muestra& muestra, Enlace enlace);
};
```

**Responsabilidad:** cada `SERIAL_MS`, imprimir `Intensidad: %.2f m/s2 | Umbral: 100.00 | Estado: ` y una de estas etiquetas: `ESPERANDO_GOLPE` en `Idle`, `ALARMA_ACTIVA` en `Pending`, `ESPERANDO_LIBERACION` mientras la suelta no es estable tras una pulsación, `REARMANDO` durante `REARME_MS`, `CANCELADO`, `VENCIDO`, `FALLO_SENSOR`. La etiqueta no sustituye a la fase guardada.

### `setup` y `loop`

```cpp
// Archivo: Arduino/ESP32_main/ESP32_main.ino
void setup();
void loop();
```

**Responsabilidad de `setup`:** serie a 115200, `runEpisodeSelfCheck`, almacén, serie y `boot_id` nuevos, `onBootRestore`, botón, buzzer, detector y BLE. Si el autochequeo devuelve distinto de 0, imprimir `EPISODE_SELFTEST_FAIL <fila>` y no anunciar BLE. Si devuelve 0, imprimir `EPISODE_SELFTEST_OK` y anunciar.

**Responsabilidad de `loop`:** sin `delay`. Orden de cada vuelta: botón, detector, transición de episodio, intento de NVS pendiente, buzzer, BLE, diagnóstico. El enlace perdido no cambia la fase del episodio.

---

## Orden de una vuelta y de un arranque

1. El gesto de pulsación o la orden `CmdCancelFall` ya sacada de la cola se convierten en `cancelar`, `cancel_at_ms` y `via` antes de `stepEpisode`.
2. `stepEpisode` decide la fase y el tipo a emitir.
3. Si hay emisión, se rellena el registro de 64 bytes con la secuencia de este arranque y se llama a `append`.
4. La fase RAM y el buzzer se actualizan aunque `append` devuelva 0. El mismo registro se reintenta cada `REINTENTO_NVS_MS` sin pedir otro `source_sequence`.
5. Con la fase ya en `Canceled` o `Expired`, `episodioListoParaNuevo` puede devolverla a `Idle`. El anillo no se borra por eso.
6. `GuardMeBle::tick` envía los registros aún no entregados por Indicate. El acuse GATT no pone `flags.bit0`. Solo `CmdAckRecords` lo hace, cuando el rango completo existe.

En el arranque, `loadEpisode` alimenta `onBootRestore`. Un `Pending` guardado queda en el anillo con el bit de tiempo incierto, la fase viva nace en `Idle` y el buzzer nace en LOW. La secuencia de los registros nuevos pertenece al `boot_id` nuevo; `source_boot_id` y `source_sequence` de un episodio viejo no se reescriben.

---

## Órdenes

El Write Response de GATT confirma transporte. El efecto es el Indicate `CmdResult`.

| Orden | Condición | Resultado |
|---|---|---|
| Cualquiera, no emparejada o no cifrada | La pila debe rechazar el Write. Si aun así llega al búfer | `Rejected` / `NotBonded`, sin efecto |
| Mismo `command_id` y mismos 32 bytes, resultado aún guardado | Idempotencia | Se reenvía el resultado guardado, sin segundo efecto |
| Mismo `command_id` y otros 32 bytes | Conflicto | `Rejected` / `BadIdReuse` |
| `CmdGetState` | Siempre, ya emparejado | `Applied` / `Ok` y el Read de estado queda actualizado |
| `CmdCancelFall` dentro de la ventana, episodio vivo coincidente | Regla 2 de `stepEpisode` | `Applied` / `Ok`, un `FallCanceled` con vía `2` |
| `CmdCancelFall` con el episodio ya cancelado o el registro ya emitido | Una sola cancelación | `Applied` / `AlreadyApplied` |
| `CmdCancelFall` en o después del plazo, o fase `Expired` | Regla 3 | `Rejected` / `Expired`. No escribe `FallCanceled` y no apaga el buzzer |
| `CmdCancelFall` con boot o secuencia que no son el episodio vivo | Ajena | `Rejected` / `UnknownEpisode` |
| `CmdRequestReplay` con cursor cero o presente | Retención | `Applied` / `Ok` y a continuación los registros posteriores, en orden |
| `CmdRequestReplay` con cursor ausente | Hueco | `Rejected` / `Gap` y ningún registro inventado |
| `CmdAckRecords` con el rango entero presente | Mismo `boot_id` | `Applied` / `Ok` y `flags.bit0` en ese rango |
| `CmdAckRecords` con un hueco en el rango | Nada marcado | `Rejected` / `Gap` |
| `CmdSignalReminder` con alarma sonando | Prioridad | `Rejected` / `Preempted`. Un reintento del mismo id repite ese rechazo y no pita después |
| `CmdSignalReminder` con `pattern_id != 1` o `duration_ms > 300000` | Fuera de contrato | `Rejected` / `Unsupported` |
| `CmdSignalReminder` con `duration_ms == 0` | Caducada | `Rejected` / `ExpiredTtl` |
| `CmdSignalReminder` aceptada | Sin alarma | `Applied` / `Ok`. El plazo corre desde el `millis` de ese `Applied` y un duplicado no lo alarga |

Si el id ya no está entre las 16 órdenes guardadas, `CmdCancelFall` no crea un segundo `FallCanceled` para el mismo `source_boot_id` y `source_sequence`: responde `AlreadyApplied` cuando ese registro existe y `Expired` cuando existe `FallExpired`. `CmdGetState`, `CmdRequestReplay` y un ack de un rango ya marcado son seguros de repetir.

`CmdSignalReminder` vive en RAM. Un rearranque no lo reanuda.

El primer Indicate de una orden aceptada en cola es `Received` / `Ok`. El segundo es el de la tabla. Si la transición ocurre en la misma vuelta, se encolan los dos, en ese orden.

---

## Buzzer y recordatorio

| Situación | Sonido |
|---|---|
| `Pending` con tiempo cierto | `Alarma` |
| `Expired` antes del silencio | `Alarma` |
| `Canceled`, `Idle`, o `Expired` tras `AlarmSilenced` | `Off`, salvo un `Fallo` de sensor si no hay alarma |
| Recordatorio aceptado y sin alarma | `Recordatorio` hasta `duration_ms` |
| Sensor ausente y fase `Idle` | `Fallo` |
| Anillo lleno o NVS corrupta | No cambia el sonido de una alarma en curso. Queda en el estado GATT y en un `DeviceFault` si hay ranura |

No hay patrón de LED ni porcentaje de batería. La telemetría no rellena esos campos porque no existen en el bloque.

---

## Dependencias

| Paquete | Versión | Ya en el sketch | Comando |
|---------|---------|-----------------|---------|
| Core Arduino-ESP32 | 3.x, el que exponga `BLEDevice` y `Preferences` | El prototipo aún no lo incluye | FQBN `esp32:esp32:esp32`. No instalar NimBLE |
| `Adafruit MPU6050` | La ya usada por el sketch | Sí | No sustituirla |
| `Adafruit Unified Sensor` | La que exige la anterior | Sí | No sustituirla |
| Wire, math, Preferences, BLE del core | Las del core elegido | Wire y math sí | Ninguna biblioteca BLE aparte |

En el primer compilado, anotar en el informe de la etapa E0 la versión del core, el FQBN, las versiones de Adafruit y el uso de flash y RAM. Esta spec no inventa esos números.

Compilación prevista:

```text
arduino-cli compile --fqbn esp32:esp32:esp32 Arduino/ESP32_main
```

No usar `esp32:esp32:esp32s3`.

---

## Edge cases y manejo de errores

- **Sensor ausente al arrancar:** `sensor_ok = 0`, fallo `1`, sonido `Fallo` si la fase está en `Idle`, BLE anunciado si el autochequeo pasó. No hay `while (true)`.
- **Botón atascado en `Idle`:** fallo `2` una vez por episodio de atasco. El detector sigue aceptando candidatos. El HIGH de un atasco no cuenta como cancelación.
- **Botón y orden en la misma vuelta:** entra en `stepEpisode` una sola cancelación, la que tenga `cancel_at_ms` más antiguo. La otra orden, si era `CmdCancelFall` del mismo episodio, recibe `AlreadyApplied`.
- **Plazo exacto:** `elapsed >= 30000` vence. Una cancelación con `cancel_at - t0 >= 30000` no cancela.
- **BLE caído durante `Pending`:** la fase, el `t0_ms` y el buzzer siguen. Al reconectar no se crea otro episodio ni se pone `t0_ms` a cero.
- **Corte de alimentación en `Pending`:** al volver, `onBootRestore` marca el candidato como incierto, deja la fase en `Idle` y el buzzer en LOW. No emite `FallExpired` ni `FallCanceled`.
- **Corte después de un `FallExpired` ya escrito:** el registro sigue vencido. El buzzer no se restaura solo.
- **NVS llena:** la alarma RAM continúa, `full = 1`, fallo `4`. No se descarta en silencio un registro no reconocido para devolver éxito.
- **NVS corrupta:** la ranura o la clave `live` se ignoran, fallo `3`, el detector sigue.
- **Secuencia `65535` emitida:** el siguiente registro no se numera con 0. Fallo `5`. La alarma RAM de un episodio ya creado sigue su plazo.
- **MTU 23:** fragmentos de 12 bytes de payload. Un registro de 64 bytes sale en 6 fragmentos. No se exige MTU negociada mayor para funcionar.
- **Fragmento perdido o marco inválido:** se descarta el `transfer_id` y se responde `BadFrame` cuando el `command_id` ya era legible. El detector no espera ese timeout.
- **Indicate sin confirmación:** hasta 3 reintentos del fragmento, separados por `INDICATE_MS`. Después se abandona la salida y los registros siguen sin el bit de reconocido.
- **Anillo de órdenes lleno:** se olvida el resultado más antiguo. La cancelación de un episodio que ya tiene registro no se vuelve a emitir.
- **Recordatorio y alarma:** la alarma gana. El rechazo `Preempted` queda atado a ese `command_id`.
- **Rearme:** hace falta fase terminal, suelta de 80 ms y 400 ms sin un HIGH nuevo. Un episodio sin reconocer no bloquea el paso a `Idle`.
- **Telemetría:** se puede emitir en `Idle` como máximo cada 1000 ms si hay un central autorizado. No se escribe telemetría en cada muestra de 10 ms.
- **Segundo teléfono:** se desconecta. No hay órdenes desde un central sin cifrar.

---

## Orden de implementación

1. Crear `protocol.h` y `config.h` con los layouts, UUID y constantes de esta spec.
2. Crear `episode_step.h` / `episode_step.cpp` y `runEpisodeSelfCheck` con las ocho filas.
3. Dejar `ESP32_main.ino` llamando al autochequeo al inicio de `setup`. Si falla, no continuar el anuncio BLE.
4. Extraer `Detector` del sketch sin cambiar la fórmula, el umbral, el rango ni el filtro. Quitar el `while (true)` del fallo de `begin`.
5. Extraer `ButtonInput` y dejar de usar el nivel del botón como condición del candidato.
6. Extraer `Signals` y sustituir los `digitalWrite` sueltos del buzzer.
7. Implementar `RecordStore` y la restauración de arranque.
8. Implementar `GuardMeBle`: anuncio, identidad abierta, resto cifrado, fragmentación y colas.
9. Unir el `loop` en el orden indicado y conservar el texto de serie cada 100 ms.
10. Compilar con el FQBN `esp32:esp32:esp32`.

---

## Autochequeo

`window_ms` de la tabla es 30000. `runEpisodeSelfCheck` llama a `stepEpisode` con esos valores y falla en la primera fila distinta.

| Fila | Entrada | Fase resultante | Emisión | Buzzer |
|---|---|---|---|---|
| 1 | `Idle`, candidato | `Pending` | `FallCandidate` | on |
| 2 | `Pending`, cierto, cancelar con `cancel_at - t0 = 29999`, vía 1 | `Canceled` | `FallCanceled` | off |
| 3 | `Pending`, cierto, cancelar con `cancel_at - t0 = 30000`, y `now - t0 = 30000` | `Expired` | `FallExpired` | on |
| 4 | `Pending`, cierto, sin cancelar, `now - t0 = 30000` | `Expired` | `FallExpired` | on |
| 5 | `Pending`, cierto, sin cancelar, `now - t0 = 29999` | `Pending` | ninguna | on |
| 6 | `Pending`, incierto, `now - t0 = 999999` | `Pending` | ninguna | off |
| 7 | `Expired`, `ya_silenciado = 0`, silenciar. La llamada siguiente entra con `ya_silenciado = 1` y sin silencio nuevo | `Expired` en ambas. La primera emite `AlarmSilenced`. La segunda no emite | off en ambas |
| 8 | `onBootRestore(Pending)` | viva `Idle`, `marcar_incierta = 1`, buzzer off | — | off |

La fila 8 no usa `stepEpisode`.

---

## Criterios de aceptación

- [ ] `runEpisodeSelfCheck()` imprime `EPISODE_SELFTEST_OK` y devuelve 0.
- [ ] El compilado usa `esp32:esp32:esp32` y no referencia GPIO 6 ni GPIO 7.
- [ ] Con el sensor desconectado, el firmware anuncia BLE y publica fallo de sensor, sin quedarse en un bucle con `delay`.
- [ ] Un candidato con el botón en HIGH y la fase en `Idle` sigue pudiendo entrar en `Pending`.
- [ ] El texto de serie conserva `Intensidad:`, `m/s2`, `Umbral:` y las etiquetas históricas cuando la fase corresponde.
- [ ] Una pulsación de 600 ms antes de 30 000 ms escribe un solo `FallCanceled` de vía 1 y apaga el buzzer.
- [ ] Sin cancelación, a los 30 000 ms hay un solo `FallExpired` y el buzzer sigue en HIGH.
- [ ] Una pulsación de 600 ms con la fase `Expired` escribe `AlarmSilenced` y no escribe `FallCanceled`.
- [ ] `CmdCancelFall` del episodio vivo, llegada antes del plazo, apaga el buzzer y no cuenta el Write Response como resultado.
- [ ] La misma orden repetida no escribe un segundo `FallCanceled`.
- [ ] Un `command_id` reutilizado con otros bytes obtiene `BadIdReuse`.
- [ ] Tras un reinicio con un `Pending` guardado, el buzzer queda en LOW, el registro lleva el bit de tiempo incierto y no aparece un `FallExpired` nuevo.
- [ ] Perder el central durante `Pending` no reinicia `t0_ms`.
- [ ] Con MTU 23, un registro de 64 bytes se reensambla en 6 fragmentos y un fragmento inválido no detiene el `loop`.
- [ ] El anillo lleno mantiene la alarma RAM y deja `full = 1` en el estado leído.
- [ ] `CmdSignalReminder` durante la alarma responde `Preempted` y no alarga el sonido al terminar la alarma.
- [ ] La identidad leída muestra la serie `GM-…`, el protocolo 0.2 y las capacidades de esta spec, con batería y LED en cero.
- [ ] El firmware no inicia Wi-Fi y no contiene claves de Auth/servidor.

Las pruebas de teléfono, de incidencia y de llamadas siguen en ESP-07. Esta spec no las da por hechas.
