# ESP-02 — Hardware, pines y entorno Arduino

**Versión:** 1.0 · **Fecha:** 14 de noviembre de 2026.  
**Estado:** inventario deducido del código; circuito, placa exacta y versiones pendientes de verificación.

## 1. Asignaciones observadas

| Elemento | Configuración del sketch | Comprobación pendiente |
|---|---|---|
| MPU6050 | I2C, SDA GPIO 21, SCL GPIO 22 | Placa compatible, alimentación, tierra, cableado y dirección detectada |
| Acelerómetro | `MPU6050_RANGE_8_G` | Rango apropiado y saturación en ensayos |
| Filtro | `MPU6050_BAND_94_HZ` | Relación con muestreo efectivo y ruido |
| Botón | GPIO 4, `INPUT_PULLDOWN`, activo en HIGH | Circuito real, nivel lógico y contactos bajo vibración |
| Buzzer | GPIO 5, salida digital | Tipo activo/pasivo, tensión, corriente y etapa de manejo requerida |
| Puerto serie | 115200 baudios | Puerto y monitor correctos |
| LED de estado | No definido | Existencia, pin, corriente y patrón de desconexión |
| Batería y carga | Sin medición declarada | Divisor/medidor, ADC, señal de carga y calibración si se incorporan |

Estas asignaciones describen el código; no son un esquema eléctrico verificado. No se prescribe una tensión o conexión del buzzer sin conocer el módulo. La señal HIGH del GPIO no acredita sonido audible. El seguro mecánico del botón, exigido por producto, requiere revisión física separada.

[ESP-08](08_Spec_Firmware_Maquina_Estados_NVS_y_BLE.md) fija el objetivo de compilación `esp32:esp32:esp32` y prohíbe GPIO 6 y GPIO 7, porque en el ESP32 clásico pertenecen al flash. El circuito de esta ficha sigue sin verificación física.

## 2. Dependencias y compilación reproducible

El sketch utiliza `Wire`, `Adafruit_MPU6050`, `Adafruit_Sensor` y `math.h`. Las versiones de las bibliotecas y del core no están fijadas en un manifiesto del firmware revisado. ESP-08 elige el core Arduino-ESP32 3.x y su BLE (`BLEDevice`, `Preferences`) para el FQBN `esp32:esp32:esp32`. No se presupone que cualquier variante incorpora BLE.

La orden reproducible y el FQBN están en ESP-08. Antes de la primera carga registrar:

1. Modelo y revisión de placa, variante del chip, memoria y esquema de alimentación.
2. Arduino IDE o CLI utilizado, versión del core y FQBN exacto.
3. Versiones resueltas de las bibliotecas y opciones de partición/compilación.
4. Resultado de compilación, consumo de memoria y puerto de carga.
5. Identidad del dispositivo y versión de firmware cargada.

La disponibilidad de `arduino-cli` en el equipo no acredita una compilación. La orden de compilación está en ESP-08. Al cargar el firmware, añadir junto al código el archivo de dependencias con las versiones realmente resueltas.

## 3. Medición y señales

La batería se declara como capacidad ausente hasta tener hardware y conversión calibrados. Android y backend utilizarán desconocido/`null`; nunca un porcentaje constante de demostración. El estado de carga exige una fuente observada y no se deduce solo de la variación porcentual.

Los patrones de caída, recordatorio y desconexión deben distinguirse. La prioridad propuesta es alarma de posible caída sobre recordatorio; una luz de desconexión no debe ocultar el estado de emergencia. Colores, frecuencia, intensidad y duración se fijarán tras verificar el hardware y la accesibilidad.

## 4. Evidencia mínima de banco

| Ensayo | Registro requerido |
|---|---|
| Arranque normal y sensor ausente | Logs y estado real comunicado |
| Botón suelto, pulsado y mantenido | Lectura, tiempos y ausencia de cancelación involuntaria |
| Vibración y movimiento habitual | Señales y falsos positivos del detector |
| Buzzer y LED | Funcionamiento físico y consumo |
| Alimentación y reinicio | Tensión, causa de reinicio si está disponible y recuperación |
| BLE junto con muestreo | Intervalo efectivo y ausencia de bloqueo del botón |

La calibración no requiere realizar caídas de personas. Los ensayos iniciales deben usar montajes controlados y documentar sus límites respecto al uso real.

## 5. Referencias

- [Biblioteca Adafruit MPU6050](https://github.com/adafruit/Adafruit_MPU6050).
- [Referencia oficial de Adafruit MPU6050](https://adafruit.github.io/Adafruit_MPU6050/html/index.html).
- [Arduino ESP32 de Espressif](https://docs.espressif.com/projects/arduino-esp32/en/latest/).

Las referencias sirven para concretar el entorno seleccionado; no sustituyen el inventario de versiones de la compilación real.
