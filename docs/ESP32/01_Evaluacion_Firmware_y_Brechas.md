# ESP-01 — Evaluación del firmware y brechas de integración

**Versión:** 1.0 · **Fecha:** 14 de noviembre de 2026.  
**Método:** inspección estática del [sketch](../../Arduino/ESP32_main/ESP32_main.ino), fuentes Android, manifiesto, dependencias y fuentes NestJS. No acredita funcionamiento físico.

## 1. Resultado

El firmware es un prototipo de alarma local por cambios bruscos de aceleración. Tiene una base reutilizable de lectura, estados y temporizadores, pero no comunica episodios con Android. La app sigue en datos de demostración (`DemoHub`) y [su manifiesto](../../GuardMeMobile/app/src/main/AndroidManifest.xml) no declara Bluetooth. El backend NestJS ya no es la plantilla `Hello World`: `backend/src` incluye salud, identidad, perfiles, onboarding, bastones, eventos de pasarela e incidencias. Esta revisión no ejecutó ese servidor. La presencia de esas rutas no acredita el contrato BLE ni cierra PD-12: `gateway-events.service.ts` y `canes.service.ts` conservan la marca de pendiente.

| Capacidad | Evidencia en código | Brecha |
|---|---|---|
| Lectura inercial | MPU6050 por I2C; lectura solicitada cada 10 ms | Validar frecuencia efectiva, ruido, montaje y errores |
| Detección | Norma de la diferencia entre aceleraciones consecutivas; umbral 100.0 | Validar posibles caídas y falsos positivos |
| Giroscopio | Se obtiene `g` mediante `getEvent` | No interviene en la decisión |
| Buzzer | Salida GPIO 5, HIGH/LOW | Verificar circuito y sonido real; no hay control remoto |
| Cancelación física | GPIO 4 y pulsación mantenida 600 ms | No hay evento comunicable ni patrón funcional aprobado |
| Estados | Esperando golpe, alarma, esperando liberación, rearmando | Faltan episodio, vencimiento, resultado y recuperación |
| BLE e identidad | Sin implementación | Servicio, características, vinculación, mensajes y seguridad |
| Persistencia | Variables RAM | Conservar episodios y cancelaciones ante cortes/reinicios |
| Batería, carga y LED | Sin lectura ni control declarados | Confirmar hardware antes de anunciar capacidades |
| Recordatorios | Sin implementación | Orden identificada, vigencia, señales y prioridad |

## 2. Observaciones del detector y del control

La fórmula implementada es `sqrt((ax-axAnterior)^2 + (ay-ayAnterior)^2 + (az-azAnterior)^2)`. Es una variación de aceleración en m/s², no una estimación validada de caída ni una derivada temporal expresada en m/s³. El umbral `100.0` no debe interpretarse como aceleración absoluta ni como 100 g. Su calibración requiere datos reales.

El rango configurado es ±8 g. No corresponde declarar inalcanzable el umbral por compararlo con el rango de un solo eje: el cálculo utiliza diferencias y norma vectorial. Se deben medir saturación, duración de impactos y efectos del filtro antes de seleccionar otro umbral.

La condición `!botonPresionado` bloquea nuevas detecciones cuando el botón está en HIGH. Un botón atascado o un problema eléctrico puede inhibirlas; hace falta diagnóstico y una política explícita. Los 600 ms de pulsación reducen ciertos accionamientos breves, pero no constituyen una validación del circuito ni del antirrebote.

Si `mpu.begin()` falla, `setup()` entra en un bucle infinito. En el firmware conectado se propone un estado de fallo observable y recuperación controlada, manteniendo disponible la comunicación de diagnóstico cuando sea posible. No se debe reportar sensor correcto durante esa condición.

La alarma actual permanece activa hasta la pulsación válida. No hay transición a los 30 segundos, publicación de vencimiento ni cancelación desde el teléfono. Los logs se imprimen cada 100 ms y pueden omitir el pico entre impresiones; no son por sí solos un registro completo para calibrar el detector.

## 3. Brechas por componente

| ESP32 | Android Persona | Backend y Cuidador |
|---|---|---|
| BLE y estado consultable | Cliente BLE y escucha de eventos | Registro de dispositivo y pasarela |
| ID de episodio, arranque y orden | Conservar IDs sin regenerarlos | Resolver asignación y deduplicar |
| Botón y cancelación remota confirmados | Esperar resultado y conciliar | Contador agregado único |
| Tiempo local y resultado recuperable | Coordinación de los 30 segundos | Recibir caída vencida, sin aviso previo al cuidador |
| Registro pendiente | Cola durable y reintentos | Persistencia transaccional e historial |
| Señales de recordatorio | Agenda y órdenes vigentes | Definiciones y ocurrencias compartidas |
| Telemetría según hardware | Valores reales con antigüedad | Conservar última observación y su fuente |

## 4. Qué se conserva y qué debe demostrarse

Se conservan las lecturas MPU6050, el control de alarma local, la separación por estados y las restas de tiempos con `millis()`. Se recomienda separar responsabilidades antes de añadir BLE, para que el enlace no bloquee el detector o el botón.

Primero se debe demostrar detección → evento Android y cancelación por ambas vías. Después, vencimiento → única incidencia persistida → aviso a otro teléfono → atención registrada. Las llamadas reales, los recordatorios y la recuperación forman puertas de aceptación independientes en [ESP-07](07_Plan_Implementacion_Pruebas_y_Aceptacion.md).
