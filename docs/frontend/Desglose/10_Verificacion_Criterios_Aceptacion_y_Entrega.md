# GUARDMe — 10. Verificación, criterios de aceptación y entrega

**Documento:** FE-D10 · **Versión:** 1.1 · **Fecha:** 14 de noviembre de 2026.  
**Base:** criterios FE-01–FE-21 de la propuesta frontend v1.1 aprobada.  
**Estado:** plan de verificación futura. No se ejecutaron pruebas de aplicación, hardware, telefonía o accesibilidad para elaborar este paquete.

## 1. Objetivo y tipos de evidencia

**Ampliación ESP32:** la matriz [ESP-07](../../ESP32/07_Plan_Implementacion_Pruebas_y_Aceptacion.md) complementa los criterios FE sin renumerarlos. La aceptación requiere identidad BLE real, cancelación confirmada desde ambas vías, plazo recuperable, persistencia/reenvíos, pruebas con pantalla bloqueada y cuidador en otro teléfono. Incluir ESP-T07/12/21–23 para cancelación/vencimiento y tiempo incierto. Todas esas pruebas siguen pendientes; esta revisión solo verifica documentación.

Verificar que las pantallas representan correctamente hechos reales, conservan los permisos y permiten completar el recorrido de cuidado. El diseño visual, una prueba de reducer y una prueba entre teléfonos aportan evidencias distintas; ninguna se presenta como equivalente a las demás.

| Nivel | Qué comprueba | Qué no acredita por sí solo |
|---|---|---|
| Revisión documental | Cobertura y coherencia de reglas | Software funcionando |
| Revisión visual | Jerarquía, legibilidad y estados | Comunicación real |
| Prueba de regla aislada | Transiciones y validación | Integración de hardware o proveedor |
| Prueba de pantalla | Interacción y navegación | Entrega remota |
| Integración | API, persistencia y acuses | Usabilidad o respuesta humana |
| Recorrido real | Bastón y dos teléfonos con evidencia | Todas las condiciones posibles de Android |
| Accesibilidad manual | Uso con tecnologías de asistencia | Conformidad total sin otros controles |

Las pruebas deben elegirse por riesgo y comportamiento, evitando comprobar únicamente que una función interna devuelve el valor que su propia implementación define.

## 2. Matriz original de aceptación

Los identificadores y textos siguientes se conservan para trazabilidad. El detalle adicional de este documento define cómo recoger evidencia sin modificar la regla aprobada.

| ID | Criterio aprobado |
|---|---|
| FE-01 | La entrada de producción pregunta quién configura y no abre escenarios demo |
| FE-02 | Una persona puede tener varios cuidadores y un cuidador cambiar entre varias personas sin mezclar datos |
| FE-03 | Familiar y médico disponen de las mismas capacidades para una vinculación equivalente |
| FE-04 | Vinculaciones y permisos requieren PIN; las acciones de emergencia funcionan sin introducirlo |
| FE-05 | Una detección real abre la ventana restante de 30 segundos; durante ella sólo suena el bastón |
| FE-06 | Cancelar desde app o mango converge en el mismo episodio y aumenta una sola vez el contador |
| FE-07 | Rotar, reabrir o recuperar el proceso no reinicia cuentas ni crea otro incidente |
| FE-08 | La secuencia visible respeta dos intentos por cada uno de los dos contactos y se detiene por respuesta confirmada |
| FE-09 | No se muestra llamada contestada, aviso recibido o asistencia externa sin evidencia correspondiente |
| FE-10 | «Yo me encargo» confirma cierre como «Recibió asistencia» en todos los clientes; el seguimiento permanece separado |
| FE-11 | Dos cuidadores actuando sobre un incidente no producen cierres duplicados ni sobrescrituras silenciosas |
| FE-12 | La posposición muestra aviso a cinco minutos y aplica la política acordada de dos horas sin ambulancia automática por ese recorrido |
| FE-13 | El seguimiento va primero al usuario a las 7:00 a. m., deriva al cuidador tras dos horas y admite la última consulta prevista |
| FE-14 | Los recordatorios muestran cambios compartidos, autor y estados; el usuario no borra los creados por cuidador |
| FE-15 | Las confirmaciones se registran desde la app; el botón físico no se presenta como confirmación de medicamento |
| FE-16 | La desconexión bastón–teléfono se distingue de falta de Internet y aparece mediante icono pequeño con explicación accesible |
| FE-17 | Una ubicación antigua se identifica como última conocida y nunca se sustituye por coordenadas ficticias |
| FE-18 | Historial de incidentes, llamadas y contador de falsas alarmas conservan su significado independiente |
| FE-19 | TalkBack y fuente ampliada permiten completar cancelación, atención y confirmación sin recortes críticos |
| FE-20 | Notificaciones y enlaces abren el contexto correcto con la app abierta, en segundo plano y tras recuperación admitida por el sistema |
| FE-21 | Persona y Cuidador funcionan como experiencias móviles de GuardMe; la atención desde el teléfono del cuidador no depende de un portal web |

## 3. Asignación de criterios y evidencia mínima

| Criterio | Documento dueño | Evidencia propuesta |
|---|---|---|
| FE-01 | D03 | Primer inicio sin puerta demo y reanudación del progreso |
| FE-02 | D03/D05 | Cuenta con dos perfiles, cambio durante carga y aislamiento de datos |
| FE-03 | D03/D05 | Mismo recorrido como familiar y médico con vínculo equivalente |
| FE-04 | D03 | Tabla de acciones protegidas y emergencia sin desafío local |
| FE-05 | D06 | Tiempo observado desde evento real y registro de señales |
| FE-06 | D06/D09 | Cancelación por ambas vías y repetición sin doble contador |
| FE-07 | D08/D09 | Rotación, recreación y recuperación del proceso durante episodio |
| FE-08 | D06 | Cronología de cuatro posiciones y detención por respuesta validada |
| FE-09 | D02/D06 | Correspondencia entre etiquetas y evidencias de cada canal |
| FE-10 | D06 | Cierre visible en ambos teléfonos y seguimiento separado |
| FE-11 | D05/D09 | Dos cuidadores confirman concurrentemente con un único resultado |
| FE-12 | D06 | Programación remota y aviso sin ambulancia automática en posposición |
| FE-13 | D06 | Horarios y respuestas del seguimiento con zona del perfil |
| FE-14 | D07 | Autoría, cambios compartidos y rechazo de borrado no permitido |
| FE-15 | D04/D07 | Confirmación en app y guía correcta del mango |
| FE-16 | D02/D09 | Desconexiones local/remota diferenciadas con explicación accesible |
| FE-17 | D07 | Captura real, hora, precisión y antigüedad |
| FE-18 | D07 | Listas y agregado separados con resultados desconocidos explícitos |
| FE-19 | D02 | Tareas críticas completadas con TalkBack y fuente ampliada |
| FE-20 | D08/D09 | Entradas desde aviso en estados de app admitidos y contexto correcto |
| FE-21 | D01/D05/D08 | Persona y Cuidador operando desde sus teléfonos con la misma app |

La evidencia queda pendiente hasta ejecutar la comprobación. Una celda en esta tabla no representa una prueba aprobada.

## 4. Preparación del entorno de ensayo

Disponer de un bastón con versión identificable, teléfono Persona, teléfono Cuidador y, para concurrencia, otra instalación de cuidador. Registrar modelos, versiones Android, compilación de app, firmware, entorno backend y modalidad de llamada.

Utilizar perfiles y datos de ensayo claramente diferenciados de producción. Los escenarios demo quedan aislados. La telefonía de prueba emplea destinos controlados y una protección que impida llamadas reales accidentales a emergencias.

Comprobar antes de empezar identidad, vínculos, permisos, conectividad, zona horaria y fuentes de tiempo. Registrar qué capacidades del bastón están presentes. Si no existe medición de batería o luz controlada, el ensayo debe comprobar la ausencia correctamente presentada en vez de sustituirla por un valor inventado.

## 5. Recorridos principales

### V-01 — Configuración completa e interrumpida

**Preparación:** instalación sin configurar y cuentas de ensayo.  
**Acción:** elegir Persona o Cuidador, completar parte del recorrido, cerrar y volver.  
**Resultado:** progreso confirmado recuperado, sin duplicar perfil ni conservar identidad del cuidador como acceso personal del usuario.  
**Evidencia:** pasos, estado de instalación y resultado de vínculos.  
**Criterios:** FE-01, FE-02 y FE-21.

### V-02 — Igualdad de capacidades y revocación

**Preparación:** familiar y médico con acceso equivalente.  
**Acción:** consultar bastón, ubicación autorizada, incidentes, recordatorios y equipo; después revocar uno de los vínculos.  
**Resultado:** mismas capacidades iniciales y retirada efectiva del contexto revocado, incluida caché visible y nuevas acciones.  
**Criterios:** FE-02, FE-03 y FE-04.

### V-03 — Cancelación real durante prealerta

**Preparación:** episodio del bastón identificable, sin usar una caída real de una persona.  
**Acción:** generar señal de ensayo, cancelar desde app; repetir por mango y repetir acuses.  
**Resultado:** ventana total de 30 segundos, teléfono silencioso y una sola contabilización por episodio cancelado.  
**Evidencia:** hora de señal, cuenta, comando, acuse y agregado resultante.  
**Criterios:** FE-05–FE-07.

### V-04 — Vencimiento y comunicación entre teléfonos

**Acción:** dejar vencer prealerta en un episodio controlado.  
**Resultado:** registro remoto, aviso al cuidador correcto y detalle del mismo incidente, con estados de entrega honestos.  
**Evidencia:** identificadores correlacionados de bastón, teléfono, servicio y destinatario.  
**Criterios:** FE-05, FE-09 y FE-20.

### V-05 — Orden de contactos y respuesta humana

**Preparación:** dos números controlados y modalidad validada.  
**Acción:** ensayar fallos, ocupado, falta de respuesta, respuesta de contacto 1, respuesta de contacto 2 y buzón.  
**Resultado:** orden exacto, un intento activo según contrato y detención por respuesta que cumpla la política acordada.  
**Limitación:** si no se ha definido buzón o duración, esos casos quedan bloqueados, no aprobados.  
**Criterios:** FE-08 y FE-09.

### V-06 — Atención y concurrencia

**Acción:** dos cuidadores eligen «Yo me encargo» sobre el mismo incidente.  
**Resultado:** un cierre «Recibió asistencia», actor y hora vigentes en ambos clientes; sin segundo paso presencial obligatorio. Se crea seguimiento separado.  
**Evidencia:** respuestas de operación, estado final y referencias de consulta posterior.  
**Criterios:** FE-10 y FE-11.

### V-07 — Posposición y seguimiento

**Acción:** posponer y verificar programación de cinco minutos; recorrer falta de respuesta de dos horas según política definida; después probar seguimiento del día siguiente y segunda consulta.  
**Resultado:** tiempos remotos recuperables, usuario primero, derivación a cuidador y fin correcto de la última respuesta negativa.  
**Preparación especial:** se puede usar reloj de ensayo controlado, distinguiéndolo de una prueba de paso real del tiempo.  
**Criterios:** FE-12 y FE-13.

### V-08 — Recordatorios y autoría

**Acción:** crear desde ambos tipos de cuidador y Persona, editar concurrentemente, confirmar sin Internet y reintentar.  
**Resultado:** cambios compartidos, una ocurrencia correcta y prohibición efectiva de borrar recordatorio de cuidador desde Persona.  
**Comprobar:** no convertir falta de respuesta en omitido ni atribuir confirmación al mango.  
**Criterios:** FE-14 y FE-15.

### V-09 — Ubicación e historial

**Acción:** capturar ubicación real, impedir nueva captura, retrasar entrega y retirar consentimiento.  
**Resultado:** fuente, hora y precisión coherentes, última ubicación identificada y retirada de acceso. Historial conserva su posición histórica si la política lo permite.  
**Excepción:** si ubicación se difiere, registrar alcance afectado; no aprobar con un mapa demo.  
**Criterios:** FE-17 y FE-18.

### V-10 — Accesibilidad de tareas críticas

**Acción:** cancelar, atender, consultar resultado y confirmar medicamento con TalkBack y fuente al 200 %.  
**Resultado:** etiquetas comprensibles, foco lógico, controles alcanzables y ningún texto crítico cortado.  
**Evidencia:** tarea completada y obstáculos observados, además de controles automáticos pertinentes [R1].  
**Criterios:** FE-04, FE-05 y FE-19.

## 6. Matriz de condiciones Android y conectividad

| Condición | Comprobación |
|---|---|
| App en primer plano | Evento recibido sin duplicación visual |
| App en segundo plano | Aviso y recuperación del detalle según soporte |
| Pantalla bloqueada | Información mínima y acceso urgente autorizado |
| Rotación | Cuenta y contexto conservados |
| Recreación de actividad | Sin repetir acciones externas |
| Muerte del proceso | Datos persistidos y conciliación |
| Reinicio del teléfono | Recuperación documentada y límites visibles |
| Cierre forzado | Registrar restricciones reales; no prometer recepción universal |
| Ahorro de batería | Medir comportamiento y explicar límites |
| Notificaciones denegadas | Función afectada identificada |
| Bluetooth desactivado | Diferenciar falta de enlace local |
| Internet ausente | Cola y ausencia de confirmación remota |
| API temporalmente caída | Reintento controlado |
| Push duplicado o atrasado | Abrir estado vigente |
| Zona o reloj cambiados | No reiniciar plazos remotos |

No se declara compatibilidad con todas las versiones por ejecutar un único teléfono. P-15 define la matriz objetivo y los límites del piloto. Las restricciones de segundo plano y periféricos requieren pruebas específicas [R2].

## 7. Pruebas de datos y recuperación

Verificar aplicación repetida de la misma operación, eventos fuera de orden, respuesta perdida después de éxito remoto y consulta de resultado posterior. El resultado esperado es consistencia de negocio, no ausencia de reintentos.

La revocación debe probarse durante una pantalla abierta y al tocar una notificación anterior. Un perfil diferente no puede ocupar el lugar del anterior por respuesta tardía. La retención local y la limpieza de datos deben respetar operaciones pendientes y políticas de privacidad.

En una edición concurrente de recordatorio se exige explicación y conciliación; no se acepta guardar silenciosamente sobre una versión nueva. En incidentes, el estado cerrado no vuelve a abierto por un aviso viejo.

## 8. Severidad, bloqueos y excepciones

| Nivel propuesto | Ejemplo | Tratamiento |
|---|---|---|
| Bloqueante del recorrido | No llega incidente real al cuidador | No declarar entrega completa |
| Crítico | Acceso a perfil ajeno o cierre sin evidencia | Resolver antes del piloto |
| Alto | Reinicio crea otra cuenta de 30 segundos | Resolver o delimitar explícitamente alcance afectado |
| Medio | Error recuperable mal explicado | Corregir según impacto y prioridad |
| Menor | Inconsistencia visual sin impedir tarea | Registrar y planificar corrección |

La clasificación debe ajustarse al impacto real. Un defecto visual que oculta «Estoy bien» puede ser crítico. Ubicación diferida es la excepción ya permitida, con alcance explícito. La falta de vía automática al 911 sigue siendo brecha del requisito, no una excepción aprobada por esta matriz.

## 9. Evidencia y registro de resultados

Cada comprobación debe registrar identificador, fecha, responsable, versiones, precondiciones, pasos, resultado esperado, observado y referencias de evidencia. Usar estados «Pendiente», «Aprobado», «Fallido», «Bloqueado» o «No aplicable con justificación».

Las capturas ayudan a verificar UI, pero la entrega remota necesita correlación entre registros. Evitar incorporar datos personales o secretos innecesarios. La evidencia de llamada debe provenir de la modalidad validada y no de un temporizador que cambió el texto.

Los cambios que afecten un flujo reabren sólo las comprobaciones pertinentes y sus dependencias. No se ejecutan baterías repetidas sin un cambio o riesgo que las justifique.

## 10. Condiciones de entrega del frontend

La primera versión se considera verificable cuando Persona y Cuidador operan desde teléfonos reales, el bastón participa en el episodio, las decisiones se conservan y los fallos se presentan de forma honesta. También deben estar cubiertos recordatorios, historiales, seguimiento, acceso urgente y restricciones de permisos.

La documentación entregada debe incluir resultados reales, pendientes y limitaciones del entorno. Una casilla no comprobada no se marca aprobada por estar dibujada. La alternativa manual al 911 no se declara equivalente a automatización.

El paquete actual contiene diez documentos Markdown y conserva la propuesta original. No incluye código, compilaciones nuevas ni resultados de ejecución. El índice y la matriz de cobertura están en D01.

## 11. Referencias y continuidad

- [D01 — Alcance y registro de pendientes](01_Alcance_Estado_Actual_y_Roadmap.md).
- [D06 — Reglas de emergencia y seguimiento](06_Emergencias_Llamadas_Atencion_y_Seguimiento.md).
- [D09 — Contratos y recuperación](09_Integracion_Backend_Baston_Persistencia_y_Sincronizacion.md).
- [R1 — Pruebas de accesibilidad Compose](https://developer.android.com/develop/ui/compose/accessibility/testing).
- [R2 — BLE en segundo plano](https://developer.android.com/develop/connectivity/bluetooth/ble/background).
- [Arquitectura Android](https://developer.android.com/topic/architecture).
- [Funcionamiento sin conexión](https://developer.android.com/topic/architecture/data-layer/offline-first).
- [Room](https://developer.android.com/training/data-storage/room) y [DataStore](https://developer.android.com/topic/libraries/architecture/datastore).
- [FCM: recepción](https://firebase.google.com/docs/cloud-messaging/android/receive-messages).
- [Android Intent: ACTION_CALL y ACTION_DIAL](https://developer.android.com/reference/android/content/Intent).
