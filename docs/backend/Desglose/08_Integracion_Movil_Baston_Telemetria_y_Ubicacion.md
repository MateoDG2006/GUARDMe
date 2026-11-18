# GUARDMe — Integración móvil, bastón, telemetría y ubicación

**Documento:** BE-08 de 10 · **Versión:** 1.2 · **Fecha:** 14 de noviembre de 2026  
**Estado:** desglose documental de la propuesta aprobada; no acredita implementación.  
**Origen:** secciones 3, 7, 8, 14, 15 y 16 de [Propuesta de backend](https://chatgpt.com/library?file_id=libfile_856c231c19bc819186a42b13a9a6c5c4&account_id=personal).  
**Lectura del conjunto:** [BE-01 — Índice y trazabilidad](01_Vision_Alcance_Requisitos_y_Trazabilidad.md).

Las reglas confirmadas del producto se conservan. Las precisiones nuevas se identifican como diseño propuesto; los puntos abiertos de la propuesta original siguen pendientes de definición. Este documento no contiene código de aplicación ni despliega servicios.

**Revisión 1.3 (17 nov 2026):** identidad viva = Better Auth + PostgreSQL (implementado).

**Revisión 1.1:** autenticación con Supabase Auth (histórico).

## 1. Objetivo y frontera

Este documento describe lo que el backend necesita del bastón y de Android. No implementa BLE ni redefine el algoritmo de detección. Las experiencias Persona y Cuidador son móviles; solo la instalación designada como pasarela necesita conectarse al bastón.

El bastón depende del teléfono para aviso remoto. Sin teléfono o internet no se promete comunicación con cuidadores. Detección y alarma local deben mantenerse según la capacidad del firmware, que tendrá que verificarse.

## 2. Responsabilidades de integración

| Capacidad | Bastón | Android Persona | Backend | Android Cuidador |
| --- | --- | --- | --- | --- |
| Detectar posible caída | Sensor y algoritmo | Recibe y conserva | Registra evento vencido | Consulta incidencia |
| Cancelar | Botón protegido | Acción en app y confirmación física | Cuenta/sincroniza resultado | Ve estado aplicable |
| Ventana 30 segundos | Alarma y eventos físicos | Coordinación temporal propuesta | No llama antes de evento vencido | Sin aviso previo |
| Recordatorio | Luz y sonido | Agenda local y orden | Definición y ocurrencias | Crea/consulta cambios |
| Batería/carga | Medición si hay hardware | Lee y transmite | Conserva dato y antigüedad | Consulta |
| Desconexión | Luz intermitente | Icono y cola persistente | Observa antigüedad de pasarela | Muestra último estado |
| Ubicación | No se exige GPS | Fuente de coordenadas | Consentimiento y última posición | Consulta autorizada |

## 3. Protocolo BLE documental

Se propone un servicio de control y observaciones con capacidades negociadas. Los identificadores de servicio/característica, tamaños, confirmaciones y seguridad se fijarán en un contrato específico antes de programar; no se inventan UUID ni formatos binarios como si ya existieran.

Ese contrato se centraliza ahora en [ESP-04](../../ESP32/04_Contrato_BLE_Eventos_Comandos_y_Seguridad.md), como borrador lógico 0.1. UUID, formato físico, fragmentación, límites y seguridad siguen pendientes de validación; el borrador no acredita conectividad. El estado del sketch, hardware y carencias se encuentran en [docs/ESP32](../../ESP32/README.md).

| Familia | Información necesaria | Sentido |
| --- | --- | --- |
| Identificación | Serie, modelo, firmware, versión de protocolo | Bastón a teléfono |
| Detección | ID, arranque/secuencia, posible caída, estado local | Bastón a teléfono |
| Cancelación física | Detección resuelta y secuencia | Bastón a teléfono |
| Cancelación por app | Orden referida a detección activa | Teléfono a bastón |
| Confirmación de orden | Orden aceptada/ejecutada/fallida | Bastón a teléfono |
| Telemetría | Batería, carga, sensor y disponibilidad | Bastón a teléfono |
| Señal de recordatorio | Ocurrencia, patrón y caducidad | Teléfono a bastón |
| Estado del enlace | Presencia y pérdida observada | Ambos, según mecanismo |

Una escritura BLE aceptada no prueba que el buzzer sonó. El contrato diferencia recepción y ejecución. Un modelo sin medición de batería declara capacidad ausente, no utiliza un porcentaje fijo.

## 4. Identificación, incorporación y seguridad física

El número de serie no es un secreto. La incorporación debe vincular posesión/proximidad con un código o mecanismo confiable. Se comprobará que un teléfono cercano no puede reclamar un bastón ya asignado solo por descubrirlo.

La transferencia a otro perfil es explícita. El backend conserva asignaciones históricas y una pasarela activa por bastón, según la política propuesta. El cambio de teléfono revoca la función anterior sin mezclar historiales.

El seguro del botón previene accionamientos accidentales según el diseño de producto. Las pruebas deben comprobar accesibilidad, pulsaciones involuntarias y botón mantenido, pero esta especificación no define todavía duración o patrón de pulsación.

## 5. Ventana local y orden de eventos

La propuesta asigna a Android la coordinación de los 30 segundos y al bastón la alarma física. El protocolo deberá resolver quién conserva la ventana si Android cambia de proceso o pierde el enlace.

Si el firmware incorpora un temporizador de respaldo, no puede originar un segundo episodio con otro ID. Debe existir una misma detección y un resultado reconciliable.

[ESP-03](../../ESP32/03_Arquitectura_Firmware_Estados_y_Persistencia.md) propone conservar la referencia monotónica y el resultado en firmware como respaldo a la coordinación Android. No cambia la regla de 30 segundos ni da por resuelto PD-12. Un reinicio sin reloj fiable puede impedir conocer el tiempo sin alimentación; la recuperación debe declarar esa incertidumbre en lugar de iniciar silenciosamente otra ventana.

Los hechos se ordenan por secuencia/arranque y tiempo monotónico cuando corresponda. Un cambio manual de hora del teléfono no debe alargar o acortar la espera local. La hora de calendario sirve para registro remoto, no como único cronómetro.

Cancelación física cercana al vencimiento, pérdida del acuse y cancelación recibida después de iniciar llamadas son casos PD-12. Debe definirse una regla antes de declarar el flujo completo; no basta con que cada componente funcione aisladamente.

## 6. Android en segundo plano

La escucha prolongada de BLE debe adaptarse a las APIs y permisos de Android. Se evaluarán CompanionDeviceService o servicio en primer plano de dispositivo conectado según versión y condiciones.

Una pantalla cerrada no debe destruir automáticamente la cola local ni el estado de detección. Una tarea diferida de sincronización ayuda a reintentar, pero no sustituye un mecanismo adecuado para escuchar BLE o cumplir la ventana local.

El estado de preparación distingue: Bluetooth apagado, permiso BLE ausente, notificaciones bloqueadas, servicio detenido, batería del teléfono limitada y falta de conexión remota. Se muestran capacidades disponibles, sin afirmar que todo está activo porque la app se abrió una vez.

### Sesión de la pasarela en Supabase

Android administra la sesión mediante Better Auth y utiliza su access token para GuardMe; no accede por PostgREST a las tablas del dominio. La instalación se asocia al principal y a la sesión de Auth, mientras la vinculación del bastón se conserva en la base de dominio.

Si una sesión expira sin poder renovarse por falta de red, la detección, alarma y cola local siguen sus reglas. El evento remoto permanece pendiente y no se envía como petición anónima pública. Recuperar sesión no reinicia la ventana de caída ni convierte un evento antiguo en una detección nueva.

La pérdida de una identidad supervisada requiere la reincorporación descrita en BE-03; conocer el PIN o la serie no autoriza restaurar acceso. El acceso local a emergencia se conserva según el producto, separando su resultado del aviso remoto aún pendiente.

## 7. Cola local y recuperación

Android persiste el evento antes de enviarlo y conserva el mismo ID hasta obtener resultado del servidor. Los reintentos no generan nuevos episodios.

| Corte | Información conservada | Recuperación |
| --- | --- | --- |
| Antes de enviar | Evento local y momento real | Envío posterior con antigüedad |
| Durante petición | ID de operación | Consultar/repetir idempotentemente |
| Después de persistir servidor | Acuse si llegó | Reenvío devuelve resultado existente |
| Después de una cancelación física no recibida | Estado/registro local del bastón si soporta | Reconciliar al reconectar |
| Reinicio de bastón | ID de arranque nuevo | No reutilizar secuencia anterior |
| Cambio de pasarela | Asignación y vigencia | Revisar fuente autorizada |

Se propone sincronizar cancelaciones y estados resueltos antes de activar consecuencias de detecciones pendientes del mismo origen. Eso reduce falsas escaladas por reproducción fuera de orden, pero requiere que el contrato físico conserve esa información.

La política de aceptar eventos del teléfono retirado y de atribuirlos a una asignación histórica debe impedir que se publiquen datos sobre el propietario nuevo.

## 8. Telemetría y frescura

Cada observación incluye dato, fuente y fecha. La última comunicación con el servidor no es necesariamente la última comunicación con el bastón: el teléfono puede tener internet y perder BLE.

| Dato | Interpretación correcta |
| --- | --- |
| Batería | Porcentaje medido, si disponible |
| Carga | Estado observado, no deducido solo de subida porcentual |
| Sensor | Resultado de diagnóstico reportado |
| Enlace BLE | Observación de la pasarela con antigüedad |
| Pasarela remota | Última recepción/actividad del teléfono |
| Firmware | Versión reportada, no constante de demostración |

El backend no almacena aceleración bruta continuamente. Las pruebas del detector pueden generar material técnico separado con finalidad y retención propias.

La frecuencia de telemetría se ajustará al consumo y al piloto. No se fija una tasa arbitraria ni se utiliza la ausencia de un paquete aislado como prueba definitiva de caída.

## 9. Desconexión y eventos antiguos

Se conserva el icono discreto de la app y la luz intermitente del bastón. Falta BLE y falta internet se representan de forma diferenciada.

Cuando vuelva la conexión se transmite el historial con sus tiempos originales. Una incidencia antigua no se convierte en emergencia nueva sin considerar PD-10. Se requiere un umbral/política de antigüedad y una presentación de aviso retrasado.

No se borran los hechos antiguos solo para evitar llamadas; se conserva qué ocurrió, cuándo se conoció y por qué no se activó una cascada inmediata. La decisión entre aviso informativo, revisión humana o contacto urgente debe validarse con el producto.

## 10. Órdenes y señales de recordatorio

La agenda del servidor se sincroniza con Android. El teléfono conserva próximas ocurrencias para señal local sin internet y utiliza IDs compartidos con el backend.

La orden al bastón lleva ocurrencia y caducidad. Al reconectar no se reproducen todos los sonidos vencidos. Un acuse de señal no confirma medicamento tomado; esa declaración se realiza desde la app.

Si coincide una posible caída, se propone prioridad a la señal de emergencia. Patrones de luz/sonido deberán ser distinguibles y no confundirse con la luz de desconexión. No se fija aquí color, duración ni intensidad sin conocer el hardware.

## 11. Ubicación

La fuente es el teléfono, no el bastón. El backend conserva inicialmente última posición, precisión, captura, recepción e instalación. No se propone historial de trayectos.

La lectura exige consentimiento y acceso actuales. La posición puede faltar por permisos, GPS, ahorro energético o conectividad; la app debe mostrar la causa conocida y la antigüedad.

Una petición de actualización remota puede solicitar al teléfono una nueva captura, pero no garantiza que Android pueda ejecutarla inmediatamente. No se reemplaza una ubicación válida reciente con una captura más antigua llegada tarde.

Si se difiere ubicación, el resto de la emergencia funciona sin coordenadas y la interfaz no dibuja una posición de demostración como real.

## 12. Entrega de integración y revisión

Antes de construir se debe cerrar una ficha por capacidad: protocolo, emisor, evento, acuse, persistencia, permisos y comportamiento sin conexión. La revisión del backend verifica contratos; la validación real añade bastón y dos teléfonos.

Casos mínimos: botón frente a cancelación en app, desconexión durante espera, reinicio, envío repetido, teléfono bloqueado, permiso retirado, recordatorio offline y ubicación desactualizada.

Relacionado: [BE-03](03_Identidad_Usuarios_Permisos_y_Configuracion_Inicial.md), [BE-05](05_Contratos_API_Eventos_y_Sincronizacion.md), [BE-06](06_Incidencias_Llamadas_Escalamiento_y_Atencion.md) y [BE-10](10_Plan_de_Implementacion_Pruebas_y_Aceptacion.md). Fuente: [Android BLE en segundo plano](https://developer.android.com/develop/connectivity/bluetooth/ble/background) y S13 de la propuesta para notificaciones.

## 13. Puerta de integración con ESP32

El backend recibe hechos de la pasarela Android autenticada, no paquetes BLE ni credenciales del bastón. El mapeo de serie, `caneId`, episodio, registros y tiempos se define en [ESP-06](../../ESP32/06_Integracion_Backend_BetterAuth_y_Contratos_API.md).

Antes de activar consecuencias remotas hay que resolver el caso cancelación válida registrada primero y vencimiento contradictorio posterior, además del orden inverso ya contemplado por el plan F2. Ambas rutas necesitan arbitraje transaccional por episodio. Deduplicar `fall:` y `cancel:` por separado no evita dos resultados incompatibles. Una cancelación tardía/silenciamiento no debe incrementar automáticamente falsas alarmas.

La asignación de pasarela en servidor no revoca por sí sola una vinculación BLE antigua. El aprovisionamiento y cambio de teléfono requieren un mecanismo local validado. La prueba completa incluye ESP-T03–ESP-T13 y ESP-T21–ESP-T23 de [ESP-07](../../ESP32/07_Plan_Implementacion_Pruebas_y_Aceptacion.md).

