# GUARDMe — 06. Emergencias, llamadas, atención y seguimiento

**Documento:** FE-D06 · **Versión:** 1.1 · **Fecha:** 14 de noviembre de 2026.  
**Base:** propuesta frontend v1.1 y reglas de la entrevista de producto.  
**Objetivo:** definir qué representa cada pantalla y qué evidencia permite avanzar, sin declarar integración de llamadas ya validada.

## 1. Separación de hechos

El episodio local, la incidencia remota, los intentos de llamada, la decisión del cuidador y el seguimiento son entidades relacionadas. No deben convertirse en un único estado de overlay: su ciclo de vida continúa aunque se cierre una pantalla.

| Entidad | Inicio | Resultado independiente |
|---|---|---|
| Episodio local | Detección del bastón | Cancelado o ventana vencida |
| Incidente | Registro remoto activado | Atención o escalamiento requerido |
| Intento de llamada | Orden de contactar | Resultado de transporte y respuesta humana si se conoce |
| Decisión | Acción del cuidador autorizado | Aceptada, rechazada por conflicto o pendiente |
| Seguimiento | Cierre por «Yo me encargo» | Respuestas y finalización posterior |

Los nombres son conceptuales; la API final los formalizará. El frontend representa hechos, no emite por sí solo un «asistencia recibida» para que otro cliente lo acepte sin control.

## 2. Ventana local de posible caída

Al recibir una detección se muestra «Detectamos una posible caída», tiempo restante y «Estoy bien». Sólo el bastón suena durante los 30 segundos. La pantalla del teléfono no añade sonido ni vibración; conserva acceso voluntario mediante tecnologías de asistencia.

La base de tiempo local debe resistir rotación, navegación y muerte del proceso. Se propone usar tiempo monotónico para la duración durante la ejecución y persistir la referencia necesaria para recuperación. Un reinicio del teléfono requiere una regla explícita de conciliación, porque el reloj monotónico anterior no continúa como si nada hubiera ocurrido.

La UI no define una pulsación física: el patrón permanece P-04. El firmware actual de golpe y buzzer no acredita por sí solo esta ventana ni el protocolo acordado.

| Evento | Presentación | Acción de coordinación |
|---|---|---|
| Detección nueva | Cuenta restante | Identificar episodio único |
| Detección duplicada | Misma cuenta | No crear otro episodio |
| Cancelación desde app | «Cancelando…» | Enviar comando identificado |
| Cancelación desde mango | Resultado del dispositivo | Conciliar el mismo episodio |
| Acuse de apagado | «Alarma cancelada» | Contar falsa alarma una sola vez |
| Fin de ventana | Estado de comunicación remota | Registrar activación sin fingir entrega |
| Evento recibido tarde | Hora y condición actual | Aplicar política de antigüedad |

## 3. Cancelación y carreras de tiempo

Una orden y su acuse pueden perderse. Reintentar debe conservar el identificador de operación y permitir saber si el dispositivo ya la aplicó. Recibir dos acuses no genera dos falsas alarmas.

Cerca del segundo 30, el teléfono y el backend pueden conocer estados distintos. Debe definirse quién arbitra la cancelación y cómo se informa a un cuidador si el aviso ya salió. Se mantiene P-04 abierto; ocultar la pantalla no es prueba de que la comunicación remota se detuvo.

Si no se confirma el apagado local, se explica y se recuerda el botón físico. Si la intención se guardó pero el bastón sigue desconectado, la interfaz no utiliza «Todo cancelado». D09 detalla acuses y persistencia.

La cancelación porque la persona está bien actualiza el contador agregado. No exige mostrar una incidencia individual visible en historial. La llamada no contestada nunca se clasifica como falsa alarma.

## 4. Inicio del aviso remoto

El vencimiento sin cancelación inicia el recorrido de aviso y contactos. La app debe distinguir al menos intención local, envío pendiente, registro remoto y recepción confirmada cuando se conozca.

| Texto posible | Qué acredita | Qué no acredita |
|---|---|---|
| «Aviso pendiente de envío» | Evento conservado localmente | Conocimiento del servidor |
| «Incidente registrado» | Persistencia remota aceptada | Aviso mostrado al cuidador |
| «Recepción confirmada» | Acuse de una instalación | Lectura o atención humana |
| «Llamada contestada» | Respuesta según contrato validado | Cierre como asistencia |
| «Recibió asistencia» | «Yo me encargo» aceptado | Despacho de servicio externo |

La selección de destinatarios de push no debe confundirse con las dos prioridades de llamada. Backend propone avisar a cuidadores autorizados y llamar a dos contactos; su concreción sigue pendiente donde la entrevista no determinó destinatarios.

## 5. Secuencia de llamadas

| Posición | Contacto | Intento | Condición para continuar |
|---|---|---|---|
| 1 | Primero | Primero | Resultado sin respuesta según modalidad validada |
| 2 | Primero | Segundo | Ninguna respuesta confirmada |
| 3 | Segundo | Primero | Dos intentos previos sin respuesta |
| 4 | Segundo | Segundo | Sigue sin existir respuesta |
| 5 | Emergencias | Escalamiento | Cuatro intentos agotados y vía técnicamente viable |

Se detiene al contestar cualquiera. No se heredan los 28 segundos, pausas o cuentas adicionales del demo como requisitos aprobados. Duración por intento, pausas y cero/un contacto son P-07.

Sólo se presenta un intento activo por incidente según la propuesta de orquestación. El cuidador puede consultar el plan y los resultados. La interfaz no inventa duración si el proveedor no la aporta.

La propuesta backend toma una copia de los contactos al iniciar el episodio y verifica revocaciones antes de marcar. Frontend muestra el plan efectivo de ese incidente, incluso si luego cambia el orden cotidiano.

## 6. Respuesta humana y modalidad

Push, voz dentro de la app y telefonía convencional tienen evidencias diferentes. Una notificación sonora no es una llamada. Regresar desde el marcador tampoco confirma respuesta.

La recomendación backend plantea evaluar telefonía gestionada para contactos, pero sigue pendiente la modalidad definitiva. El proveedor puede conectar a un buzón; por ello su estado «respondido» no siempre equivale a una persona informada. Se debe acordar confirmación humana y actuación ante buzón antes de declarar cumplida la regla.

La app puede mostrar «Conexión telefónica confirmada; respuesta humana por confirmar» si esa distinción existe en el contrato. No transforma un evento de transporte en «Yo me encargo». El bastón tampoco se presenta como equipo de conversación: no se presupone micrófono o altavoz de voz.

## 7. Restricción del escalamiento al 911

Android documenta que ACTION_CALL no puede usarse para llamadas a números de emergencia; ACTION_DIAL abre el marcador para que la persona inicie la llamada. Esto permite una alternativa manual, pero no cumple el escalamiento automático por sí sola [R1].

El frontend debe basarse en capacidades comprobadas:

| Capacidad real | Etiqueta permitida |
|---|---|
| Abrir marcador con 911 | «Abrir marcador de emergencias» |
| Solicitar escalamiento al servicio | «Escalamiento solicitado» |
| Inicio real confirmado | «Llamada iniciada», si existe evidencia |
| Audio conectado | Estado de conexión según la modalidad |
| Sin vía validada | Limitación visible y acción manual disponible |

Ninguno de esos estados implica «Ayuda en camino». El objetivo automático se mantiene como P-06 y bloquea declarar completo ese aspecto de la primera entrega. Este paquete no selecciona un proveedor para llamar al 911 ni supone que el adaptador de contactos lo permita.

No realizar llamadas reales accidentales durante pruebas. La verificación utiliza un entorno de ensayo; cualquier prueba sobre servicios de emergencia necesita coordinación específica.

## 8. Atención y concurrencia

El cuidador dispone de «Yo me encargo», llamada a emergencias y «Contestar más tarde». Para quien ya está autenticado y vinculado, no se pide un nuevo PIN local al atender. El backend sigue validando perfil, instalación y estado.

«Yo me encargo» aceptado cierra con «Recibió asistencia», registra actor/hora y crea seguimiento. No se solicita otra comprobación presencial. La UI puede pedir una confirmación breve para evitar toques accidentales, sin añadir un estado obligatorio de atención separado.

Dos decisiones simultáneas requieren versión y resultado único. Si otra persona cerró primero, la segunda interfaz presenta el resultado existente. Si el envío no obtiene respuesta, consulta por identificador antes de crear un nuevo comando.

## 9. Posposición y dos horas

«Contestar más tarde» genera una nueva notificación a los cinco minutos. Se muestra su programación confirmada, no una cuenta independiente creada sólo en el ViewModel.

Si permanece sin responder durante dos horas, se notifica a contactos según la política por cerrar. Se propone contar desde la posposición aceptada por servidor; origen y destinatarios siguen P-08. Una repetición de la misma solicitud no reinicia silenciosamente el plazo.

Esta rama ya tiene a un cuidador informado. No llama automáticamente a ambulancia por la falta de decisión posterior. Se mantiene distinta del escalamiento inicial cuando nadie contesta los cuatro intentos.

## 10. Emergencia directa desde la app

La persona accede sin PIN al mecanismo real de emergencia. La acción genera también aviso a familiares. La pantalla distingue apertura de marcador, llamada conocida y estado de aviso remoto.

Si el teléfono tiene telefonía pero no Internet, puede existir vía al marcador sin notificación familiar entregada. Se muestran ambos estados. La cuenta de cinco segundos del demo no se incorpora como requisito: cualquier prevención adicional de toques debe evaluarse sin bloquear ayuda.

## 11. Seguimiento posterior

| Momento o respuesta | Efecto |
|---|---|
| Día siguiente, 7:00 a. m. | Preguntar primero al usuario del bastón |
| Dos horas sin respuesta | Dirigir consulta al cuidador |
| «Me encuentro bien» | Cerrar seguimiento |
| «Gracias por estar pendientes, no necesito seguimiento» | Cerrar sin nuevas consultas |
| Primera respuesta «No me encuentro bien» | Una última consulta tres días después |
| Segunda respuesta negativa | Palabras de aliento y funcionamiento regular |
| Sin respuesta dentro de política definida | Cierre inconcluso |

El incidente permanece cerrado. Se representan ronda, destinatario, programación, respuesta y cierre propios del seguimiento. Una segunda respuesta negativa no dispara otra serie ni escalamiento médico automático.

P-09 conserva hora de la segunda consulta, cambios de zona, destinatarios no fijados y plazo del cuidador antes de cerrar inconcluso. Backend propone zona del perfil y una convención de misma hora para la segunda ronda; sigue siendo propuesta. El frontend presenta la programación del servicio.

Un cambio del reloj del teléfono no reprograma la consulta remota. Se muestran hora local y fecha; si el usuario viaja, se aplica la política acordada en vez de reinterpretar cada cliente por su zona actual.

## 12. Recuperación y verificación

Probar cancelación antes y después del vencimiento, duplicados, ausencia de Internet, reinicio, llamada con resultado desconocido, buzón, dos cierres simultáneos y aviso atrasado. Los temporizadores deben sobrevivir a la desaparición de la UI mediante los responsables adecuados.

**Criterios relacionados:** FE-04–FE-13, FE-18 y FE-20.  
**Pendientes:** P-04–P-09 y P-14.  
**Integración:** [D09](09_Integracion_Backend_Baston_Persistencia_y_Sincronizacion.md).  
**Referencia R1:** [Android Intent: llamadas y marcador](https://developer.android.com/reference/android/content/Intent).  
**Pruebas:** [D10](10_Verificacion_Criterios_Aceptacion_y_Entrega.md).

## 13. Confirmación del episodio ESP32

La ventana, la cancelación física y el vencimiento deben usar la misma identidad de detección. Al tocar «Estoy bien» se presenta confirmación pendiente hasta recibir resultado aplicado o snapshot compatible del firmware. La aceptación GATT no acredita apagado y un cambio de pantalla no cancela el bastón.

Una reconexión o recepción tardía no inicia otros 30 segundos. [ESP-03](../../ESP32/03_Arquitectura_Firmware_Estados_y_Persistencia.md) propone respaldo temporal recuperable en firmware, manteniendo coordinación Android. El arbitraje en el límite, los reinicios con tiempo incierto y la cancelación posterior al vencimiento continúan pendientes PD-12/P-04.

Silenciar después del plazo no equivale a falsa alarma previa ni a cierre asistencial. La interfaz debe distinguir estado físico, publicación remota pendiente e incidencia ya persistida. Ver [ESP-05](../../ESP32/05_Integracion_Android_Pasarela_y_Sincronizacion.md) y [ESP-06](../../ESP32/06_Integracion_Backend_BetterAuth_y_Contratos_API.md).
