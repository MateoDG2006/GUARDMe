# ESP-05 — Integración Android, pasarela y sincronización

**Versión:** 1.0 · **Fecha:** 14 de noviembre de 2026.  
**Estado:** obligaciones de implementación futura; la app revisada utiliza estados de demostración.

## 1. Componentes propuestos

| Componente lógico | Responsabilidad |
|---|---|
| `CaneBleClient` | Descubrir, conectar, negociar GATT, suscribirse y transferir mensajes |
| `CaneRepository` | Identidad, capacidades, enlace y datos con antigüedad |
| `FallEpisodeCoordinator` | Conciliar episodio, plazo, botón y cancelación desde app |
| Persistencia Room | Episodios, registros entrantes, operaciones y cola remota |
| `GatewaySyncRepository` | Traducir al contrato NestJS y conservar resultados por elemento |
| Gestor de sesión | Supabase Auth, instalación y recuperación autorizada |
| Servicio Android apropiado | Escucha BLE prolongada y exposición del estado operativo |

Estos nombres son una propuesta organizativa, no clases existentes. Los ViewModels observan estos componentes; no son propietarios únicos del cronómetro, enlace o cola.

## 2. Preparación del teléfono

El manifiesto y las dependencias actuales no acreditan BLE, Internet, persistencia ni FCM. Implementar los permisos declarados y solicitudes en ejecución que correspondan a cada versión soportada. Para BLE en Android moderno se contemplan `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` según uso; no pedir publicidad BLE si el teléfono no anuncia. Compatibilidad con versiones anteriores se verifica por separado.

La escucha prolongada requiere evaluar `CompanionDeviceService` o servicio en primer plano `connectedDevice`, con sus permisos, restricciones y notificación técnica correspondiente. WorkManager se usa para sincronización diferible y no garantiza escucha continua ni vencimiento exacto. La notificación técnica del servicio no es un aviso de caída al cuidador y durante la ventana no debe introducir señal sonora añadida de incidente en el teléfono.

Registrar y mostrar Bluetooth apagado, permiso retirado, servicio detenido, ausencia de Internet y sesión no renovable como condiciones distintas. Pantalla bloqueada, ahorro de batería y proceso terminado requieren pruebas en teléfonos objetivo; no se promete superar una detención forzada del usuario.

## 3. Incorporación y conexión

1. Autenticar con Supabase Auth y registrar la instalación en NestJS.
2. Preparar el perfil autorizado y reclamar el bastón conforme al plan backend F1d.
3. Descubrir el dispositivo y comprobar identidad física/proximidad mediante el mecanismo acordado.
4. Completar autorización BLE, negociar protocolo y leer capacidades.
5. Designar esta instalación como pasarela del teléfono que llevará la persona.
6. Suscribirse, obtener snapshot y recuperar registros sin huecos.
7. Comprobar comunicación local y remota antes de mostrar preparación completa.

No existe una transacción única entre radio y servidor. Una interrupción debe conservar progreso y permitir reanudar sin dejar dos pasarelas activas ni presentar vinculación terminada con BLE no autorizado. La indisponibilidad del mecanismo de proximidad debe quedar visible.

## 4. Detección y cancelación

Al recibir `fall_candidate`, persistir el registro y episodio antes de reconocerlo al firmware. La pantalla se deriva del plazo restante según ESP-03. Un evento recibido tarde no obtiene una nueva ventana completa. No se crea aún incidencia ni se alerta al cuidador.

Desde «Estoy bien»: crear `commandId`, persistir la intención, enviar `cancel_fall` y presentar confirmación pendiente. Solo un resultado aplicado o snapshot compatible permite afirmar que el firmware canceló. Si ya venció, informar el resultado y aplicar la política tardía; no borrar la incidencia local por navegación.

La cancelación física llega como registro del mismo episodio y puede resolver una orden de app pendiente. Ambas vías producen como máximo un incremento remoto agregado. Un acuse perdido se recupera mediante consulta/reenvío del mismo ID, no mediante otra detección.

## 5. Cola y publicación remota

| Hecho conciliado | Operación backend propuesta |
|---|---|
| Caída vencida sin cancelación válida | `POST /v1/incidents`, `origin=fall_detected` |
| Cancelación válida durante ventana | `POST /v1/gateway-events`, `false_alarm_canceled` |
| Observación soportada | `POST /v1/gateway-events`, `telemetry_observed` |
| Silenciamiento/cancelación tardía | Conservar separadamente hasta cerrar su contrato; no enviarlo como falsa alarma válida |

El evento local original y la operación remota tienen identidades relacionadas pero distintas. La serie se resuelve a `caneId` mediante el registro autorizado del servidor; no se usa una dirección Bluetooth como ID de dominio.

Android conserva las operaciones hasta recibir resultado persistido. Los lotes se reconcilian por elemento; un 200 global no significa que todos se aceptaron. Los reintentos no regeneran `sourceEventId`. Un 401 intenta recuperar sesión según el estado de Auth; una pasarela revocada no se reintenta indefinidamente como si faltara red.

Mientras un arranque Android siga siendo el mismo, la edad se calcula con reloj monotónico. Después de reiniciar el teléfono se conserva la incertidumbre temporal si no puede reconstruirse: el campo `ageAtSendMs` no debe aparentar precisión no disponible.

## 6. Recordatorios, telemetría y Cuidador

Las ocurrencias de servidor se sincronizan a la agenda local. El teléfono envía `signal_reminder` solo si sigue vigente y la capacidad existe, respetando la prioridad de alarma. Un acuse del firmware no significa medicamento tomado. Tomado/Pospuesto/Omitido se registran desde la app con la ocurrencia correspondiente.

Batería y carga ausentes se muestran como desconocidas. Se separa última comunicación BLE de última actividad de la pasarela remota. El cuidador consulta datos del backend con antigüedad; `DemoHub` no participa en comunicación real entre teléfonos.

## 7. Referencias de plataforma

- [Permisos Bluetooth Android](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions).
- [BLE en segundo plano](https://developer.android.com/develop/connectivity/bluetooth/ble/background).
- [Arquitectura sin conexión](https://developer.android.com/topic/architecture/data-layer/offline-first).
- [Supabase Auth](https://supabase.com/docs/guides/auth).

Validar la compatibilidad de versiones antes de añadir SDK o servicios. Estas referencias no acreditan una compilación de GuardMeMobile.
