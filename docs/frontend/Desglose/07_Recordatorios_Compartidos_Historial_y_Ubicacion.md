# GUARDMe — 07. Recordatorios compartidos, historial, ubicación y estado del bastón

**Documento:** FE-D07 · **Versión:** 1.0 · **Fecha:** 14 de noviembre de 2026.  
**Base:** propuesta frontend v1.1, información compartida y monitoreo.  
**Alcance:** significado de los datos y comportamiento visible; almacenamiento y transporte se desarrollan en D09.

## 1. Objetivo y separación de dominios

Los datos cotidianos deben ser comprensibles y coherentes entre teléfonos. Un recordatorio describe una programación; una ocurrencia es una dosis o cita concreta; un registro indica una acción sobre esa ocurrencia. Un incidente y una llamada mantienen historiales distintos. Una ubicación o batería siempre tiene una fuente y un momento de observación.

La separación evita confirmar todas las dosis al tocar una, clasificar una llamada perdida como falsa alarma o mostrar información antigua como actual. La interfaz no deduce salud, ingesta o presencia física a partir de una etiqueta.

## 2. Modelo de recordatorios

| Objeto conceptual | Información visible o necesaria | Función |
|---|---|---|
| Definición | Perfil, tipo, título, indicaciones, autor y programación | Organizar la repetición |
| Ocurrencia | Identificador, fecha/hora y zona | Identificar el aviso concreto |
| Registro | Estado, actor, momento y condición de envío | Explicar la confirmación |
| Revisión | Versión de definición y resultado de cambios | Conciliar ediciones |
| Señal de bastón | Orden asociada, caducidad y acuse | Distinguir señal solicitada de ejecutada |

Crear un medicamento no confirma su toma. Editar una definición no reescribe los registros históricos de dosis anteriores. La política sobre qué ocurrencias futuras se regeneran debe acordarse con backend y mostrarse antes de confirmar una edición que afecte la agenda.

## 3. Creación y validación

El formulario propone seleccionar perfil destinatario, tipo, nombre, indicaciones, fecha/hora, repetición si corresponde y zona horaria. La frecuencia y días elegidos deben resumirse con lenguaje natural antes de guardar.

| Campo | Validación propuesta | Mensaje de ayuda |
|---|---|---|
| Persona | Perfil autorizado | Mostrar nombre en cabecera |
| Tipo | Medicamento o cita | No mezclar estados de confirmación |
| Nombre | Obligatorio y legible | Conservar entrada al fallar |
| Fecha/hora | Valor interpretable y zona | No aceptar una cadena ambigua |
| Repetición | Días/horas coherentes si se habilita | Resumen de próximos avisos |
| Indicaciones | Texto guardado por participante | No generar consejo clínico |
| Autor | Derivado de identidad | No editable como un texto libre |
| Permisos | Capacidades del perfil | No confiar sólo en botón visible |

No se fija una periodicidad clínica ni una dosis calculada por GuardMe. La app registra lo configurado. Las restricciones definitivas de fechas pasadas, longitudes y edición de recurrencia son decisiones de contrato, no números heredados de un formulario demo.

Después de guardar, se muestra confirmación local o remota según evidencia. Todos los participantes vinculados deben ver los cambios sincronizados. La entrega de una señal al bastón es otro resultado y puede seguir pendiente.

## 4. Permisos y autoría

| Operación | Persona | Familiar | Personal médico |
|---|---|---|---|
| Crear | Sí | Sí | Sí |
| Consultar cambios | Sí | Sí | Sí |
| Editar propio | Sí | Sí | Sí |
| Borrar propio | Sí | Sí | Sí |
| Borrar creado por cuidador | No | Sí, en contexto autorizado | Igual capacidad |
| Editar/desactivar creado por cuidador | P-10 | Dentro del contexto autorizado | Igual capacidad |
| Confirmar medicamento propio | Desde app | Registro en nombre de otro pendiente | Mismo criterio que familiar |

La prohibición confirmada se refiere al borrado. La interfaz no afirma que también se prohibió editar, pero tampoco habilita esa operación pendiente por omisión. Puede presentar «Permiso pendiente de definición» en un entorno de diseño; una versión de producción no debe incluir una opción incompleta que aparente funcionar.

Un participante con vínculo revocado pierde acceso a registros del perfil. La regla se comprueba en servidor y en el cliente. Ocultar un botón no basta para proteger una operación remota.

## 5. Estados de medicamentos y citas

Para medicamentos se aceptan «Tomado», «Pospuesto» y «Omitido». La ausencia de acción se muestra como pendiente o sin confirmar, sin convertirse automáticamente en omitido.

| Estado registrado | Significado | Información complementaria |
|---|---|---|
| Tomado | La persona registró la confirmación | Hora y actor; no prueba ingesta |
| Pospuesto | Solicitó un nuevo momento según política | Próxima hora cuando esté definida |
| Omitido | Registró que omitió esa ocurrencia | Hora y actor |
| Sin confirmar | No existe registro aplicable | No deducir incumplimiento |
| Pendiente de sincronización | Registro local aún no conciliado | Conservar estado elegido y aviso de envío |

El estado funcional y la condición de envío son dimensiones separadas. Puede existir «Tomado — pendiente de sincronización». Esto es más preciso que reemplazar todo por un único estado «enviado».

Las citas no reciben «Tomado». Sus respuestas y política de cierre necesitan definición. P-11 conserva duración de posposición, repetición de avisos, notificación por falta de respuesta y confirmación asistida.

## 6. Agenda local y señales del bastón

Android debe disponer de las próximas ocurrencias necesarias para presentar avisos aunque falte Internet. El horizonte de agenda y la precisión de programación se decidirán al validar restricciones de Android. No se promete exactitud por utilizar una biblioteca de trabajos diferibles.

La señal al bastón contiene referencia de ocurrencia y vigencia propuestas. Un reintento no debe repetir luz/sonido de una ocurrencia ya atendida. La aplicación muestra si solicitó la señal y si se confirmó, cuando exista acuse.

La persona confirma desde la app. El mango se mantiene para cancelación de posible caída. Si coincide una caída con un medicamento, se propone prioridad para la señal de emergencia, conservando el recordatorio pendiente. Los patrones de luces y sonido requieren P-12 y pruebas en hardware.

## 7. Ediciones, borrado y conflictos

Al editar mientras otro participante cambia la definición, el cliente recibe una versión vigente y explica el conflicto. No se aplica una política silenciosa de «último que guarda gana» para todas las situaciones.

Si una operación se envió pero el cliente perdió su respuesta, se consulta su resultado antes de crear otra. Los identificadores de definición, ocurrencia y operación permiten evitar duplicados; el mecanismo concreto se desarrolla en D09.

Al borrar, se informa qué programación futura se elimina. No se destruye evidencia histórica necesaria sin una política de retención. La distinción entre borrado lógico, cancelación de ocurrencias y conservación de registros debe formalizarse antes de construir ese comportamiento.

## 8. Historial de incidentes

Cada elemento presenta persona, fecha/hora, origen de posible caída, estado de atención y acceso a cronología. El detalle puede mostrar llamadas y seguimiento asociados, conservando su identidad independiente.

| Hecho | Presentación |
|---|---|
| Incidente activado | Momento original y registro remoto |
| Decisión de cuidador | Acción, actor y hora |
| Cierre | «Recibió asistencia» cuando corresponda |
| Seguimiento pendiente | Ronda y destinatario, sin reabrir incidente |
| Registro sincronizado tarde | Hora del hecho y condición de retraso |
| Ubicación de ese momento | Captura histórica, no sustituida por posición actual |

El historial no requiere listar cada cancelación como incidencia individual. El contador agregado de falsas alarmas se consulta por separado. La granularidad temporal de ese contador y la retención son P-14; no se inventa un total semanal si sólo existe un agregado general.

## 9. Historial de llamadas

La apariencia puede seguir patrones de telefonía habitual, pero sólo representa intentos de GuardMe. No se exige permiso para importar todas las llamadas del dispositivo.

| Dato | Regla de presentación |
|---|---|
| Contacto | Nombre y referencia de número según privacidad |
| Orden | Contacto e intento dentro del episodio |
| Inicio/fin | Mostrar si se conocen |
| Duración | No calcular conversación a partir de tiempo de pantalla |
| Resultado | Sin respuesta, ocupado, fallido, cancelado o evidencia equivalente |
| Respuesta humana | Separada de conexión de transporte cuando el contrato lo requiera |
| Resultado desconocido | Texto explícito; no traducirlo a «Sin respuesta» |

Los filtros por persona, fecha y resultado son propuestas de consulta. El backend define paginación, fechas y retención. Si la carga falla, no se sustituye el historial por una lista vacía que parezca ausencia de incidentes.

## 10. Ubicación real y consentimiento

La fuente es el teléfono que lleva la persona. El cuidador puede consultarla si la compartición fue aprobada y el vínculo sigue autorizado. Tener permiso Android no concede automáticamente acceso a todos los cuidadores; tener vínculo tampoco habilita una compartición rechazada.

| Estado | Presentación |
|---|---|
| Captura válida reciente | Fuente, hora y precisión disponible |
| Captura anterior | «Última ubicación conocida» y antigüedad |
| Sin permiso Android | Explicación y acceso contextual a ajustes |
| Compartición retirada | «La ubicación no se comparte» |
| Teléfono sin posición | «Ubicación no disponible» |
| Actualización solicitada | «Solicitando ubicación», con resultado posterior |
| Función diferida | Capacidad pendiente sin marcador ficticio |

La interfaz debe conservar hora de captura, distinta de hora de recepción. Un evento entregado ahora puede contener una posición antigua. No se afirma ubicación actual por haber actualizado la pantalla.

Si la posición es aproximada, no se dibuja un punto con apariencia de precisión exacta. La precisión o su desconocimiento debe estar disponible en texto. El mapa necesita una alternativa textual accesible, sin depender sólo de color o de mover un marcador.

P-13 conserva cadencia, antigüedad máxima, precisión suficiente, consumo y proveedor de mapas. No se incluye seguimiento continuo ilimitado como consecuencia de permitir consulta. Si no se integra en la primera entrega, se documenta explícitamente la excepción prevista.

## 11. Estado del bastón y capacidades

| Capacidad | Dato mínimo | Si no existe |
|---|---|---|
| Batería | Valor, unidad y observación | «No disponible» |
| Carga | Estado informado y fecha | No deducir de batería alta |
| Conexión | Enlace y última comunicación | Icono pequeño con explicación |
| Sensor | Estado o fallo comunicado | No mostrar correcto por defecto |
| Firmware | Versión leída del dispositivo | No conservar un valor de muestra |
| Luz y sonido | Orden y ejecución si se conocen | No afirmar que se ejecutó |
| Actividad | Medición validada si se incorpora | Mantener fuera del alcance comprometido |

Se diferencia desconexión bastón–teléfono de teléfono–Internet. La luz intermitente de desconexión es una función de firmware pendiente de validación, no un indicador que la app pueda certificar al perder contacto.

## 12. Privacidad, retención y verificación

Cambiar perfil, cerrar sesión o revocar un vínculo debe impedir recuperar ubicación o información del contexto anterior desde caché visible. La eliminación o conservación local seguirá una política documentada y no se aplica una limpieza ciega que pierda incidentes pendientes sin tratamiento.

Retención, exportación y datos clínicos adicionales no están definidos. La presencia de campos médicos en el prototipo no obliga a construir un expediente clínico ni una función de diagnóstico.

**Criterios relacionados:** FE-14–FE-18, FE-02 y FE-03.  
**Pendientes:** P-10–P-14.  
**Dependencias:** [D03 — Acceso](03_Configuracion_Inicial_Identidad_PIN_y_Vinculaciones.md), [D09 — Sincronización](09_Integracion_Backend_Baston_Persistencia_y_Sincronizacion.md) y [D10 — Verificación](10_Verificacion_Criterios_Aceptacion_y_Entrega.md).
