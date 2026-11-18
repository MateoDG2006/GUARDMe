# GUARDMe — Visión, alcance, requisitos y trazabilidad

**Documento:** BE-01 de 10 · **Versión:** 1.2 · **Fecha:** 14 de noviembre de 2026  
**Estado:** desglose documental de la propuesta aprobada; no acredita implementación.  
**Origen:** secciones 1, 2, 18, 19, 20, 21 y 22 de [Propuesta de backend](https://chatgpt.com/library?file_id=libfile_856c231c19bc819186a42b13a9a6c5c4&account_id=personal).  
**Lectura del conjunto:** [BE-01 — Índice y trazabilidad](01_Vision_Alcance_Requisitos_y_Trazabilidad.md).

**Revisión 1.2:** documentación Arduino centralizada en [ESP32](../../ESP32/README.md). [ESP-06](../../ESP32/06_Integracion_Backend_BetterAuth_y_Contratos_API.md) aclara mapeo a API y arbitraje de cancelación/vencimiento. La propuesta local pasa a 1.2 y los documentos no revisados conservan su versión. Los nuevos borradores no cierran PD-12 ni acreditan servicios implementados.

Las reglas confirmadas del producto se conservan. Las precisiones nuevas se identifican como diseño propuesto; los puntos abiertos de la propuesta original siguen pendientes de definición. Este documento no contiene código de aplicación ni despliega servicios.

**Revisión 1.3 (17 nov 2026):** identidad viva = **Better Auth + PostgreSQL** (implementado). Las menciones a Supabase Auth en revisiones 1.1/1.2 quedan como historial.

**Revisión 1.1:** autenticación con Supabase Auth y persistencia en PostgreSQL de Supabase (histórico; reemplazado por Better Auth). NestJS, Prisma, trabajador y FCM se conservan.

## 1. Propósito y alcance del conjunto

Este conjunto transforma la propuesta general en diez especificaciones complementarias. Su destinatario es quien diseñará, implementará, integrará o revisará el backend de GuardMe. Debe permitir localizar una regla, conocer su responsable y comprobar qué evidencia se necesitará para declararla cumplida.

La unidad de trabajo es la persona asistida, no una cuenta global ni un único bastón. La persona puede tener varios cuidadores y dispositivos; el cuidador puede atender varios perfiles. Familiar y personal médico son categorías equivalentes en capacidades. Ambas experiencias de uso son móviles. No se introduce un portal web para cuidadores ni se condiciona el producto a construirlo.

El recorrido buscado comprende dispositivo físico, Android de la persona, servidor y Android del cuidador. El backend no convierte una detección de aceleración en un diagnóstico ni garantiza por sí mismo la disponibilidad del teléfono, la conectividad o los servicios de telefonía.

## 2. Índice de los diez documentos

| ID | Documento | Pregunta que resuelve |
| --- | --- | --- |
| BE-01 | [Visión, alcance, requisitos y trazabilidad](01_Vision_Alcance_Requisitos_y_Trazabilidad.md) | Qué se debe construir y cómo se rastrea cada regla. |
| BE-02 | [Arquitectura, stack, módulos y decisiones](02_Arquitectura_Stack_Modulos_y_Decisiones.md) | Cómo se distribuyen responsabilidades y dependencias. |
| BE-03 | [Identidad, usuarios, permisos y configuración inicial](03_Identidad_Usuarios_Permisos_y_Configuracion_Inicial.md) | Quién accede, a qué perfiles y cómo se incorpora. |
| BE-04 | [Modelo de datos, diccionario y persistencia](04_Modelo_de_Datos_Diccionario_y_Persistencia.md) | Qué se guarda y qué invariantes protegen su consistencia. |
| BE-05 | [Contratos API, eventos y sincronización](05_Contratos_API_Eventos_y_Sincronizacion.md) | Cómo intercambian información las apps y el servidor. |
| BE-06 | [Incidencias, llamadas, escalamiento y atención](06_Incidencias_Llamadas_Escalamiento_y_Atencion.md) | Cómo progresa una emergencia y se detienen los intentos. |
| BE-07 | [Notificaciones, tareas, recordatorios y seguimientos](07_Notificaciones_Tareas_Recordatorios_y_Seguimientos.md) | Cómo se ejecutan los procesos diferidos sin perder estado. |
| BE-08 | [Integración móvil, bastón, telemetría y ubicación](08_Integracion_Movil_Baston_Telemetria_y_Ubicacion.md) | Cómo se conserva el significado de los datos físicos y móviles. |
| BE-09 | [Seguridad, privacidad, despliegue y operación](09_Seguridad_Privacidad_Despliegue_y_Operacion.md) | Cómo se protege y recupera el sistema desplegado. |
| BE-10 | [Implementación, pruebas y aceptación](10_Plan_de_Implementacion_Pruebas_y_Aceptacion.md) | Cómo avanzar y qué evidencia habilita cada entrega. |

Orden recomendado: BE-01 y BE-02 para contexto; BE-03 a BE-05 para contratos; BE-06 a BE-08 para comportamiento; BE-09 y BE-10 para operación y validación. No es necesario leerlos todos para resolver una consulta, pero ninguna especificación individual reemplaza a las demás.

## 3. Frontera del producto

### Incluido

Identidad remota, perfiles, vinculaciones, incorporación del teléfono y bastón, contactos prioritarios, recepción de incidencias, historial de llamadas e incidentes, contador agregado de falsas alarmas, decisiones del cuidador, tareas persistentes, recordatorios compartidos y seguimiento posterior. Se incluyen protección local mediante PIN y acceso a emergencias sin solicitarlo.

Se intenta última ubicación real con consentimiento; puede trasladarse a una entrega posterior. Esa excepción no permite presentar datos simulados como actuales.

### Excluido de esta primera iteración

Autonomía remota del bastón sin teléfono, diagnóstico clínico, detección de inmovilidad, interpretación automática de ingesta de medicación y almacenamiento continuo de aceleración bruta. Tampoco se proponen microservicios, Kubernetes, broker MQTT ni un historial de recorridos por defecto.

Que un componente quede fuera del backend no significa que no forme parte del producto. El detector, el botón y las señales físicas siguen siendo requisitos de firmware y Android, cuya integración se verifica de extremo a extremo.

## 4. Catálogo de requisitos

Los identificadores permanecen estables aunque cambie la organización de los documentos.

| ID | Requisito verificable | Responsable principal | Desarrollo |
| --- | --- | --- | --- |
| BE-R01 | Una cuenta puede estar vinculada a varios perfiles y un perfil a varias cuentas. | Identidad y datos | BE-03, BE-04 |
| BE-R02 | Familiar y médico poseen las mismas capacidades sobre perfiles autorizados. | Autorización | BE-03 |
| BE-R03 | La configuración distingue usuario del bastón y cuidador. | Configuración inicial | BE-03 |
| BE-R04 | El PIN protege GuardMe sin bloquear emergencias. | Android e identidad | BE-03, BE-09 |
| BE-R05 | Se acredita incorporación de bastón y pasarela; la serie no basta. | Dispositivos | BE-03, BE-08 |
| BE-R06 | La cancelación dura 30 segundos y solo suena el bastón. | Firmware y Android | BE-06, BE-08 |
| BE-R07 | Cancelación física y móvil resuelven la misma detección. | Integración | BE-05, BE-08 |
| BE-R08 | La falsa alarma incrementa una sola vez un contador agregado. | Eventos y datos | BE-04, BE-05 |
| BE-R09 | Una incidencia vencida se persiste antes de confirmar su registro. | Incidencias | BE-04 a BE-06 |
| BE-R10 | Reenviar un evento no duplica incidencia, llamadas ni seguimiento. | Consistencia | BE-04, BE-05, BE-07 |
| BE-R11 | Se llama en orden contacto 1, contacto 1, contacto 2, contacto 2. | Contacto | BE-06 |
| BE-R12 | Una respuesta válida detiene nuevos intentos. | Contacto | BE-06 |
| BE-R13 | El 911 automático conserva un estado de viabilidad pendiente hasta validarse. | Telefonía | BE-06, BE-10 |
| BE-R14 | Una emergencia manual notifica a familiares y registra lo que realmente ocurrió. | Incidencias | BE-05, BE-06 |
| BE-R15 | “Yo me encargo” cierra como “Recibió asistencia”. | Atención | BE-06 |
| BE-R16 | Posponer genera aviso a cinco minutos y control de dos horas sin ambulancia automática. | Tareas | BE-06, BE-07 |
| BE-R17 | El seguimiento inicial ocurre al día siguiente a las 7:00 a. m. | Seguimientos | BE-07 |
| BE-R18 | El usuario es consultado primero; tras dos horas sin respuesta, el cuidador. | Seguimientos | BE-07 |
| BE-R19 | Hay una última consulta a tres días tras respuesta negativa. | Seguimientos | BE-07 |
| BE-R20 | Recordatorios y cambios son compartidos; el usuario no borra los de cuidador. | Recordatorios | BE-03, BE-07 |
| BE-R21 | La confirmación de medicamento es desde la app y conserva sus estados. | Recordatorios | BE-07 |
| BE-R22 | Ubicación requiere consentimiento, origen y antigüedad visibles. | Ubicación | BE-08, BE-09 |
| BE-R23 | Desconexión no aparece como estado actualizado ni aviso entregado. | Integración y operación | BE-08, BE-09 |
| BE-R24 | Aceptación de push, recepción, apertura y atención son evidencias diferentes. | Notificaciones | BE-05, BE-07 |
| BE-R25 | La revocación impide nuevas lecturas y acciones remotas. | Seguridad | BE-03, BE-09 |
| BE-R26 | Reinicios y reintentos conservan trabajo y evitan acciones obsoletas. | Tareas y operación | BE-07, BE-09 |
| BE-R27 | La identidad se verifica con Better Auth y sesión vigente; el PIN es local. | Identidad | BE-03, BE-05 |
| BE-R28 | PostgreSQL de Supabase mantiene dominio privado, roles limitados y RLS con contexto correcto. | Datos y seguridad | BE-04, BE-09 |
| BE-R29 | La incorporación asistida vincula una identidad Supabase sin compartir sesión del cuidador. | Incorporación | BE-03 |
| BE-R30 | Las migraciones del dominio y sus políticas tienen una autoridad única y no alteran esquemas gestionados. | Persistencia | BE-04, BE-10 |

Los casos de prueba asociados se reúnen en BE-10. El backend no puede demostrar BE-R06 por una prueba de API únicamente: requiere el bastón y la aplicación.

## 5. Trazabilidad con las 22 secciones originales

| Sección de la propuesta | Documento de desarrollo principal | Complemento |
| --- | --- | --- |
| 1. Recomendación y objetivo | BE-01 | BE-02 |
| 2. Requisitos | BE-01 | BE-10 |
| 3. Arquitectura y responsabilidades | BE-02 | BE-08 |
| 4. Comparación de stacks | BE-02 | BE-10 |
| 5. Stack por componente | BE-02 | BE-09 |
| 6. Identidad y permisos | BE-03 | BE-09 |
| 7. Configuración inicial | BE-03 | BE-08 |
| 8. Comunicación de caída | BE-05 | BE-06, BE-08 |
| 9. Llamadas y 911 | BE-06 | BE-10 |
| 10. Estados y temporizadores | BE-06 | BE-07 |
| 11. Base de datos | BE-04 | BE-09 |
| 12. Interfaces | BE-05 | BE-03 |
| 13. Persistencia de tareas | BE-07 | BE-04 |
| 14. Desconexión y sincronización | BE-08 | BE-05 |
| 15. Recordatorios | BE-07 | BE-03 |
| 16. Ubicación | BE-08 | BE-09 |
| 17. Operación y costes | BE-09 | BE-10 |
| 18. Plan de implementación | BE-10 | BE-02 |
| 19. Aceptación | BE-10 | BE-01 |
| 20. Decisiones abiertas | BE-01 | Documento temático correspondiente |
| 21. Fuentes | BE-01 | Referencias de cada documento |
| 22. Entregables posteriores | Los diez documentos | Cobertura conjunta |

Esta tabla asegura cobertura; no obliga a repetir íntegramente cada sección en varios archivos.

## 6. Vocabulario y evidencias

**Incidencia** es un episodio activado, no todo golpe del sensor. **Falsa alarma** es una detección cancelada porque la persona indica estar bien. **Intento de llamada** es una ejecución a un destinatario, no el incidente completo. **Atención** es la decisión del cuidador. **Seguimiento** es una consulta posterior a un incidente ya cerrado.

“Recibió asistencia” es el nombre acordado del cierre disparado por “Yo me encargo”; no se documenta como comprobación clínica independiente. “Tomado” es una declaración registrada, no evidencia física de ingesta. “Llamada conectada” no prueba respuesta humana. “Marcador abierto” no prueba comunicación con el 911.

Cada pantalla e integración debe utilizar estas distinciones. Cambiar una etiqueta puede crear una afirmación falsa aun cuando los datos internos sean correctos.

## 7. Registro compartido de decisiones abiertas

| ID | Decisión | Documento propietario |
| --- | --- | --- |
| PD-01 | Telefonía convencional o voz dentro de GuardMe; conversación o aviso de voz. | BE-06 |
| PD-02 | Vía viable para escalamiento automático al 911. | BE-06 |
| PD-03 | Confirmación humana y tratamiento del buzón. | BE-06 |
| PD-04 | Duración/pausa de intentos y casos con menos de dos contactos. | BE-06 |
| PD-05 | Destinatarios definitivos de push y avisos colectivos. | BE-07 |
| PD-06 | Origen exacto de dos horas tras posponer. | BE-06 |
| PD-07 | Ventana del cuidador y destinatario/hora de última consulta. | BE-07 |
| PD-08 | Modificar/desactivar recordatorio de cuidador y aviso por falta de confirmación. | BE-03, BE-07 |
| PD-09 | Incorporación y recuperación de identidad supervisada. | BE-03 |
| PD-10 | Retención, deduplicación y antigüedad de incidencias sincronizadas. | BE-04, BE-08 |
| PD-11 | Tamaño, disponibilidad y presupuesto del piloto. | BE-09, BE-10 |
| PD-12 | Contrato BLE, cancelación tardía y fallos durante la ventana local. | BE-08 |

La aprobación de la propuesta no se interpreta como una respuesta implícita a preguntas que el propio texto dejó abiertas. Los documentos desarrollan opciones y criterios para resolverlas sin volver a entrevistar sobre reglas ya confirmadas.

## 8. Control documental

Ante discrepancia se conserva la memoria de producto para reglas funcionales, la propuesta aprobada para arquitectura y este desglose para precisiones expresamente identificadas. Un cambio posterior debe registrar motivo, alcance y documentos afectados. Ningún documento convierte una propuesta en funcionalidad existente.

Las fuentes técnicas son las referencias S1–S22 de la sección 21 de la propuesta actualizada. Se amplían sus implicaciones de diseño, sin copiar documentación de proveedor ni congelar versiones no verificadas. Las restricciones de Android, FCM y telefonía deben revalidarse al implementar o cambiar de proveedor.

### Revisión de plataforma 1.1

Supabase Auth sustituye al proveedor de identidad de la revisión 1.0 y PostgreSQL de Supabase se convierte en la base gestionada seleccionada. Los requisitos BE-R27 a BE-R30 registran este cambio. Se mantienen reglas de caída, llamadas, roles y agenda. FCM continúa solo como canal push; las menciones a alternativas previas no son dependencias activas.

## 9. Cierre de revisión

El conjunto está listo para orientar el diseño detallado cuando cada regla tenga responsable, toda decisión abierta esté identificada y las interfaces no contradigan los estados. La construcción seguirá las puertas de aceptación de BE-10; un prototipo visual o un estado simulado no sustituye esa evidencia.

