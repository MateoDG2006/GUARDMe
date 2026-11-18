# GUARDMe — Entrevista de producto
Fecha: 14 de noviembre de 2026.
Estado: síntesis de las decisiones funcionales expresadas por el responsable del proyecto durante la entrevista.
Propósito: servir de fuente para reconstruir la documentación. Describe el producto deseado; no acredita que las funciones estén implementadas.

## 1. Propósito y primera versión
GuardMe es un sistema de bastón inteligente y aplicación móvil para personas mayores o con movilidad reducida que utilizan bastón habitualmente. Busca detectar posibles caídas y facilitar el contacto con personas de asistencia.
Se utilizará dentro y fuera de casa, especialmente cuando la persona esté sola.
En la primera iteración, la persona llevará un teléfono y el bastón dependerá de ese teléfono para comunicarse con los cuidadores. No se exige funcionamiento remoto autónomo sin teléfono.
La detección automática de incidentes se limita a posibles caídas. No se incluye detección de inmovilidad prolongada.

La primera versión debe demostrar un recorrido real: bastón → teléfono del usuario → teléfono del cuidador → registro del incidente y su atención.
Los recordatorios forman parte de esta versión.
Se intentará integrar ubicación real; si no resulta viable en esta entrega, se trasladará a la siguiente. No debe presentarse una ubicación simulada como real.

## 2. Personas, roles y vinculaciones
Hay dos experiencias principales: usuario del bastón y cuidador.
Un cuidador puede ser familiar o personal médico; ambos tienen las mismas capacidades funcionales. La distinción no implica restricciones médicas o familiares diferentes.
Un cuidador puede supervisar varios usuarios/bastones; un usuario puede tener varios cuidadores, incluidos familiares y personal médico simultáneamente.
La aplicación debe permitir administrar los bastones vinculados, sin fijar todavía un límite máximo ni una tarifa por cantidad.

En el primer inicio se pregunta quién está configurando la aplicación: el usuario del bastón o un cuidador. La configuración posterior debe adaptarse a esa respuesta.
GuardMe tendrá protección propia mediante PIN. Quien pueda desbloquear la aplicación tendrá control de vinculaciones y permisos en el contexto correspondiente.
Las acciones de emergencia estarán disponibles sin introducir el PIN.
No se han definido todavía cuentas, recuperación de PIN, mecanismo de invitación ni procedimiento técnico de vinculación.

## 3. Detección y cancelación
Cuando se detecte una posible caída, se abre una espera de 30 segundos.
Durante esos 30 segundos suena únicamente el bastón.
La persona puede indicar que está bien y cancelar mediante la aplicación o mediante el botón físico del mango.
El botón del mango está cubierto por un seguro para evitar accionamientos accidentales.
No se ha definido un patrón de pulsación ni una duración para la acción de cancelación.

Una detección cancelada porque la persona está bien incrementa un contador agregado, por ejemplo: “Falsas alarmas detectadas”.
La entrevista solicita ese valor agregado; no exige mostrar cada falsa alarma como una incidencia individual en el historial.
Una llamada sin respuesta no se clasifica como falsa alarma.

## 4. Aviso y llamadas ante una caída
Si pasan los 30 segundos sin cancelación, comienza el aviso en los teléfonos y el contacto con los familiares/contactos prioritarios.
Orden exacto de intentos:
1. Primer contacto, primer intento.
2. Primer contacto, segundo intento.
3. Segundo contacto, primer intento.
4. Segundo contacto, segundo intento.
5. Si ninguno contesta, llamada al 911.

La secuencia de llamadas a contactos se detiene en cuanto uno contesta.
No se ha definido aún cuánto dura cada intento, la pausa entre intentos ni qué ocurre si faltan contactos configurados.

Al responder, el cuidador recibe información del incidente y las opciones:
- “Yo me encargo”.
- Llamar a emergencias.
- “Contestar más tarde”.

El objetivo de producto contempla llamadas reales. La modalidad de llamada, su integración con el sistema operativo y la detección fiable de respuesta siguen siendo decisiones técnicas por resolver.

## 5. Atención, posposición y cierre
### Yo me encargo
Al confirmarlo, el incidente queda cerrado y registrado como “Recibió asistencia”.
Ese texto es el resultado funcional acordado: la confirmación del cuidador es el disparador de cierre; no se requiere otro paso de comprobación presencial.
Se programa el seguimiento descrito en la sección 6.

### Contestar más tarde
Se envía una notificación al cuidador después de cinco minutos.
Si permanece sin responder durante un intervalo de dos horas, se notifica a los contactos.
En este recorrido no se llama automáticamente a la ambulancia/urgencias: una vez informado el cuidador, la decisión queda en la familia.
Esto no sustituye el escalamiento al 911 cuando ninguno de los dos primeros contactos contesta las llamadas iniciales.
Queda por precisar el origen exacto del plazo de dos horas y los destinatarios concretos del aviso colectivo.

### Emergencia iniciada directamente
La persona puede llamar a servicios de emergencia desde la aplicación.
La llamada directa a emergencias también genera una notificación a los familiares.
No se ha solicitado una función adicional de emergencia manual desde el botón físico: su función confirmada en la entrevista es cancelar la alarma de posible caída.

## 6. Seguimiento posterior
Al día siguiente, a las 7:00 a. m., se pregunta primero al usuario del bastón cómo se encuentra.
Si no responde en dos horas, la consulta se dirige al cuidador.
El responsable confirmó esta interpretación durante la entrevista.

Textos de respuesta aceptados como base:
- “Me encuentro bien”.
- “No me encuentro bien”.
- “Gracias por estar pendientes, no necesito seguimiento”.

Si responde que no está bien, se realiza una última consulta tres días después.
Si vuelve a responder que está mal en la segunda consulta, se muestran palabras de aliento y GuardMe continúa funcionando regularmente; no se acordó iniciar nuevas consultas ni escalamiento automático por esa respuesta.
Si la consulta queda sin respuesta, el seguimiento se cierra por inconcluso, conforme a la confirmación del responsable.
El incidente ya cerrado como “Recibió asistencia” y el seguimiento posterior deben representarse por separado para no confundir sus estados.
La hora exacta de la segunda consulta y el tratamiento de cambios de zona horaria quedan pendientes de diseño.

## 7. Historial
Debe existir historial de incidencias y de llamadas.
El historial de llamadas tomará como referencia los historiales habituales de los teléfonos, reflejando los intentos y si fueron contestados o quedaron sin respuesta.
Se conserva por separado el contador de falsas alarmas.
Los campos exactos, filtros, plazos de conservación y exportación no se han definido.

## 8. Ubicación
La fuente será la ubicación del teléfono que lleva la persona.
Los cuidadores autorizados podrán consultarla en cualquier momento, siempre que se haya aprobado compartirla desde la configuración inicial.
No se exige GPS propio en el bastón para esta iteración.
La ubicación real es un objetivo de la primera entrega que puede pasar a la siguiente si no se consigue integrar.
Todavía deben definirse actualización, precisión, consumo y manejo de permisos.
Como criterio de presentación, se debe distinguir la última ubicación conocida de una ubicación actual.

## 9. Monitoreo y desconexiones
El estado de batería y la conexión forman parte de la intención del producto.
El responsable delegó los detalles restantes de monitoreo y conectividad al criterio de diseño.

Indicaciones explícitas:
- Mostrar la falta de conexión mediante un icono pequeño en la aplicación.
- Ante desconexión, el bastón debe hacer parpadear una luz.

Criterios propuestos durante la entrevista bajo esa delegación:
- Mostrar batería, carga, conexión, última comunicación y estado del sensor, según disponibilidad real del hardware.
- Distinguir desconexión bastón–teléfono de falta de internet.
- Mantener detección y alarma local sin conexión.
- Conservar eventos pendientes para sincronizarlos al reconectar.
- Mostrar la antigüedad de los datos.

Estos criterios no acreditan soporte actual de medición de batería, indicador luminoso, almacenamiento local o comunicaciones. Deben convertirse en requisitos técnicos verificables.
No se han fijado colores/patrones de luz, umbral de batería baja ni política para avisar de incidentes antiguos al recuperar conexión.

## 10. Recordatorios
Se incluyen medicamentos y citas.
Los avisos aparecen en la aplicación y se reflejan en el bastón mediante luz y sonido.
Tanto el usuario como los cuidadores pueden crear, editar y eliminar recordatorios, con esta restricción explícita: el usuario del bastón no puede borrar los creados por un cuidador.
Todos los participantes vinculados ven los cambios.

La restricción confirmada afecta al borrado; no se ha definido si el usuario puede modificar o desactivar un recordatorio creado por un cuidador.
La confirmación del recordatorio se realiza desde la aplicación.
Para medicamentos se aceptan los registros “Tomado”, “Pospuesto” y “Omitido”.
No se debe interpretar “Tomado” como una comprobación automática de ingesta.
Quedan por definir duración de posposición, repetición de avisos y notificación al cuidador cuando no hay confirmación. La respuesta aceptó los estados de registro, sin resolver expresamente esa última política.

## 11. Separación respecto del prototipo anterior
La aplicación demostrativa y el firmware analizados antes de la entrevista no son evidencia de integración completa.
Las decisiones de esta entrevista prevalecen sobre propuestas anteriores que entren en conflicto:
- Los cuidadores familiares y médicos tienen las mismas capacidades.
- Las llamadas recorren dos contactos, dos intentos consecutivos por contacto.
- La posposición y seguimiento tienen los plazos acordados aquí.
- La confirmación de recordatorios es desde la aplicación.
- El flujo de entrega debe funcionar entre dispositivos reales; ubicación puede diferirse.

## 12. Pendientes para el diseño técnico
Sin reabrir decisiones funcionales ya tomadas, resolver y documentar:
1. Comunicación bastón–teléfono, intercambio remoto, identificación y vinculación.
2. Modalidad real de llamadas y detección de respuesta; viabilidad del escalamiento al 911.
3. Tiempos por intento de llamada y casos con cero o un contacto disponible.
4. Inicio del plazo de dos horas de posposición, destinatarios y coordinación entre cuidadores.
5. Funcionamiento en segundo plano, persistencia, recuperación tras reinicios y sincronización.
6. Hardware para batería, carga y luz; patrones distinguibles para caída, recordatorio y desconexión.
7. Política de recordatorios sin confirmar y permisos de modificación.
8. Datos del historial y criterios de aceptación del recorrido real.
9. Pruebas del detector que diferencien una posible caída de la persona de la caída aislada del bastón.

## 13. Criterios de entrega derivados
- Una detección real llega del bastón al teléfono.
- Durante la ventana de 30 segundos suena el bastón y se permite cancelar desde ambas vías.
- Una cancelación incrementa el contador de falsas alarmas.
- Sin cancelación, se ejecuta el flujo de aviso y contactos acordado, con detención al responder.
- Un cuidador en otro teléfono puede recibir el incidente y registrar su decisión.
- Los incidentes, intentos de llamada, estados de recordatorio y cambios compartidos se conservan.
- PIN y acceso a emergencias respetan las decisiones de esta entrevista.
- No se presenta la integración con el 911 o la ubicación como validada hasta comprobarla.

