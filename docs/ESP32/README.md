# GUARDMe — Documentación Arduino y ESP32

**Fecha:** 17 de noviembre de 2026.  
**Versión documental:** 1.2.  
**Estado:** evaluación del código existente, diseño propuesto y spec de firmware 0.2; el sketch bajo `Arduino/ESP32_main/` implementa episodio 30 s, NVS y BLE GATT según ESP-08. Pruebas físicas en placa siguen pendientes. Batería/LED físico: capacidad 0 hasta hardware (ESP-02).

Esta carpeta reúne la documentación vigente del firmware Arduino del bastón y sus interfaces con Android y backend. El código fuente permanece en [Arduino/ESP32_main/](../../Arduino/ESP32_main/). No se considera implementada una función solo por aparecer aquí. [ESP-08](08_Spec_Firmware_Maquina_Estados_NVS_y_BLE.md) es la spec de máquina de estados, NVS y contrato BLE binario.

## Orden de lectura

| ID | Documento | Contenido |
|---|---|---|
| ESP-01 | [Evaluación y brechas](01_Evaluacion_Firmware_y_Brechas.md) | Qué existe, limitaciones observadas y trabajo de cada componente |
| ESP-02 | [Hardware y entorno Arduino](02_Hardware_Pines_y_Entorno_Arduino.md) | Pines observados, dependencias, compilación y hardware por confirmar |
| ESP-03 | [Arquitectura del firmware](03_Arquitectura_Firmware_Estados_y_Persistencia.md) | Detección, episodio, alarma, temporización y recuperación |
| ESP-04 | [Contrato BLE propuesto](04_Contrato_BLE_Eventos_Comandos_y_Seguridad.md) | Identidad, mensajes, acuses, transporte y seguridad por completar |
| ESP-05 | [Integración Android](05_Integracion_Android_Pasarela_y_Sincronizacion.md) | Enlace, permisos, segundo plano, cola y cancelación |
| ESP-06 | [Integración backend](06_Integracion_Backend_BetterAuth_y_Contratos_API.md) | Mapeo a API, Better Auth, deduplicación y conflictos |
| ESP-07 | [Implementación y pruebas](07_Plan_Implementacion_Pruebas_y_Aceptacion.md) | Etapas, matriz de pruebas, evidencias y decisiones abiertas |
| ESP-08 | [Spec de firmware 0.2](08_Spec_Firmware_Maquina_Estados_NVS_y_BLE.md) | Módulos, estados, NVS y contrato BLE binario para el ESP32 clásico |

## Arquitectura y autoridad

El ESP32 se comunica por BLE con el teléfono que lleva la persona. Esa instalación Android actúa como pasarela y utiliza HTTPS para comunicarse con NestJS. **Better Auth** identifica a la app y **PostgreSQL** conserva el dominio. El backend avisa al cuidador mediante FCM y este consulta la incidencia desde otro teléfono.

| Componente | Responsabilidad |
|---|---|
| ESP32 | Sensor, hechos físicos, alarma, botón, señales y estado recuperable del episodio |
| Android Persona | Enlace BLE, coordinación local, persistencia, sesión y publicación remota |
| NestJS y trabajador | Autorización, incidencias, contador, historial, tareas, avisos y llamadas integradas |
| Android Cuidador | Consultar hechos vigentes y registrar decisiones autorizadas |

El ESP32 no necesita Wi-Fi, GPS, sesión Auth ni credenciales PostgreSQL para este diseño. La ubicación procede del teléfono. La confirmación de medicamentos se realiza en la app; el botón tiene como función acordada cancelar la alarma de posible caída.

La [entrevista de producto](../GUARDMe_Entrevista_Producto_20261114.md) conserva la autoridad sobre las reglas funcionales. ESP-03, ESP-04 y ESP-08 proponen precisiones técnicas y no sustituyen decisiones pendientes por supuestas aprobaciones. Frontend P-03/P-04 y backend PD-12 se rastrean en ESP-07.

## Estado de entrega y documentos relacionados

- Firmware modular (episodio, NVS, BLE, detector, buzzer) bajo `Arduino/ESP32_main/`.
- Sin pin LED ni ADC de batería → bits de capacidad batería/LED en `0`; recordatorio por buzzer (`CmdSignalReminder`).
- [Propuesta frontend](../frontend/Propuesta_Frontend_GUARDMe_20261114.md) y [FE-D09](../frontend/Desglose/09_Integracion_Backend_Baston_Persistencia_y_Sincronizacion.md).
- [Propuesta backend](../backend/Propuesta_Backend_GUARDMe.md) y [BE-08](../backend/Desglose/08_Integracion_Movil_Baston_Telemetria_y_Ubicacion.md).
- [Plan Better Auth](../backend/Plan_Cambios_Backend_BetterAuth_20261117.md) — **implementado**.

Los archivos Markdown de las carpetas actuales son la referencia de trabajo. Los ZIP existentes son exportaciones de cortes anteriores y no incluyen esta revisión ESP32; se conservan como antecedentes.
