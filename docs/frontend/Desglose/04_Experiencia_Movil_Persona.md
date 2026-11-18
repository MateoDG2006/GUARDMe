# GUARDMe — 04. Experiencia móvil de la persona que utiliza el bastón

**Documento:** FE-D04 · **Versión:** 1.0 · **Fecha:** 14 de noviembre de 2026.  
**Base:** propuesta frontend v1.1, experiencia Persona y diseño móvil.  
**Alcance:** presentación, navegación y tareas de uso cotidiano; los estados de emergencia se definen en D06.

## 1. Objetivo de experiencia

La persona debe encontrar ayuda, entender el estado de su bastón y confirmar recordatorios con pocas decisiones. La interfaz no presupone familiaridad con términos como sincronización, token o API. Cuando la comunicación falle debe explicar la consecuencia y una acción posible.

Se conserva la estructura existente de cuatro pestañas: Inicio, Contactos, Recordatorios y Bastón. Historial, seguimiento y ajustes tienen accesos secundarios claros. No se añade una quinta pestaña para resolver una necesidad ocasional.

La aplicación presenta datos del perfil autorizado en este teléfono. Ayudar a configurarla no concede al cuidador acceso permanente mediante su cuenta personal en el dispositivo de la persona; ese recorrido se desarrolla en D03.

## 2. Mapa de navegación

| Origen | Destino | Contexto que se conserva |
|---|---|---|
| Inicio | Emergencia directa | Perfil y capacidad real de llamada |
| Inicio | Contacto prioritario | Nombre y teléfono que se utilizarán |
| Inicio | Próximo recordatorio | Identificador de ocurrencia |
| Inicio | Historial | Perfil y último filtro elegido |
| Inicio o aviso | Seguimiento | Consulta y ronda correspondientes |
| Contactos | Detalle o edición | Contacto estable, no posición de fila |
| Recordatorios | Detalle y confirmación | Ocurrencia y autor |
| Bastón | Detalle de conexión | Dispositivo y última comunicación |
| Cualquier pestaña | Ajustes protegidos | Retorno a tarea previa |
| Cualquier contexto | Posible caída | Episodio activo, sin perder trabajo cotidiano |

La navegación por «Atrás» cierra primero la capa secundaria pertinente. Salir de una presentación de emergencia no debe cancelar el episodio, detener la comunicación ni borrar una operación pendiente. Los detalles de bloqueo o minimización se validan sin convertir la app en una pantalla imposible de abandonar.

## 3. Inicio: jerarquía y contenido

| Zona | Contenido | Regla |
|---|---|---|
| Cabecera | Marca, saludo y acceso a configuración | Nombre real o estado de configuración |
| Estado | Conexión, datos disponibles y antigüedad | Sin conclusiones generales sobre salud |
| Acción de emergencia | «Llamar a emergencias» | Grande, reconocible y sin PIN |
| Contacto | «Llamar a mi contacto» y nombre | Mostrar destinatario antes de salir al mecanismo telefónico |
| Próximo aviso | Hora, nombre y estado | Abrir ocurrencia concreta |
| Seguimiento | Consulta pendiente | No modificar estado del incidente cerrado |
| Acceso secundario | Historial y ayuda | Consultable sin saturar |
| Navegación inferior | Cuatro pestañas | Selección y etiquetas accesibles |

«Bastón conectado» significa enlace disponible, no que la persona esté bien ni que el servidor pueda recibir avisos. Se distinguen conexión con bastón e Internet mediante iconos pequeños con descripción y acceso a explicación.

Si la batería no se puede medir, se muestra «Batería no disponible» o se omite el valor con explicación en detalle. No se utiliza 78 % u otro dato de muestra. El estado resumido no se basa en el ejemplo del prototipo.

## 4. Contactos y acciones de llamada

La lista permite reconocer a cada contacto, su número y su prioridad. Buscar no debe cambiar el orden de prioridades. La aplicación diferencia contacto telefónico de cuidador con acceso a GuardMe y puede mostrar «Invitación pendiente» cuando corresponda.

| Acción | Requisitos | Resultado visible |
|---|---|---|
| Llamar desde lista | Número válido y modalidad disponible | Marcador abierto o llamada iniciada según evidencia |
| Añadir contacto | PIN y perfil autorizado | Guardando, guardado o pendiente claramente indicado |
| Editar número | PIN y validación | Confirmación del cambio aplicado |
| Cambiar prioridad | PIN y orden coherente | Contacto 1 y contacto 2 identificados |
| Eliminar | PIN y confirmación de intención | Recalcular advertencia de configuración incompleta |

Una llamada cotidiana sin respuesta no se convierte en una emergencia ni incrementa falsas alarmas. Sólo el flujo de posible caída sigue la secuencia de D06.

Durante una emergencia, cambiar un número no debe alterar en pantalla el intento ya iniciado. El detalle puede explicar que el episodio utiliza su plan de contactos. La política de cómo afectan retiradas o revocaciones se ejecuta en backend.

## 5. Lista y detalle de recordatorios

La pestaña muestra medicamentos y citas por fecha. Se puede reutilizar la agrupación Hoy/Semana existente, verificando que el cambio no oculta ocurrencias vencidas o pospuestas. El usuario debe diferenciar una definición recurrente de la dosis que está confirmando hoy.

| Elemento de fila | Propósito |
|---|---|
| Hora local | Saber cuándo corresponde |
| Tipo y nombre | Distinguir medicamento de cita |
| Indicaciones | Mostrar sólo información guardada |
| Autor | Entender quién lo creó |
| Estado | Pendiente, tomado, pospuesto u omitido según corresponda |
| Estado de envío | Saber si el registro sólo está en este teléfono |
| Acceso a detalle | Leer información extensa sin truncarla |

En el detalle de medicamento se muestran «Tomado», «Pospuesto» y «Omitido». La falta de respuesta no se transforma automáticamente en omitido. Las citas no usan «Tomado» y esperan una política de estados propia.

La app es la vía de confirmación. El botón físico no confirma dosis. Al confirmar sin Internet, se conserva el registro local con «Pendiente de sincronización»; al reconectar, el resultado se concilia sin duplicar la ocurrencia.

El usuario no puede borrar un recordatorio creado por cuidador. La interfaz muestra su autor y una explicación. No se habilitan por omisión editar o desactivar como una forma indirecta de resolver esa prohibición: esa política está pendiente en P-10.

## 6. Pestaña Bastón

El contenido se organiza en identidad, conexión, capacidades y guía de uso.

| Grupo | Contenido permitido |
|---|---|
| Identidad | Nombre y referencia del bastón realmente asociado |
| Enlace local | Conectado, conectando o sin conexión |
| Última comunicación | Hora y antigüedad |
| Batería y carga | Sólo si el hardware aporta medición válida |
| Sensor | Estado comunicado por dispositivo; no «correcto» por defecto |
| Guía del mango | Cancelación de posible caída según patrón finalmente validado |
| Administración | Vincular, retirar o cambiar pasarela con PIN |

No se presenta búsqueda sonora como función disponible mientras no exista comando real. Tampoco se conservan pasos, kilómetros o sensores probados sólo porque se dibujaron en una tarjeta.

La guía distingue «La alarma se canceló» de «El teléfono envió una solicitud». Si el enlace se pierde, la persona necesita saber que el mango sigue siendo la vía física de cancelación acordada, sin imponer una duración no definida.

## 7. Historial y falsas alarmas

El acceso desde Inicio conduce a dos secciones: incidentes y llamadas de GuardMe. Cada evento muestra hora, resultado y detalle suficiente para comprender qué ocurrió. No se importa el historial completo de telefonía del dispositivo como requisito.

Las falsas alarmas se muestran mediante contador agregado. Cancelar el mismo episodio desde dos vías no cuenta dos veces. Una llamada sin respuesta es otro hecho y no se suma a ese contador.

Un incidente cerrado como «Recibió asistencia» puede mostrar seguimiento pendiente. El lenguaje evita que la persona interprete la consulta posterior como una nueva caída detectada.

## 8. Seguimiento de bienestar

La pantalla de consulta presenta una pregunta clara y las tres respuestas acordadas:

- «Me encuentro bien».
- «No me encuentro bien».
- «Gracias por estar pendientes, no necesito seguimiento».

Después de responder, se muestra el resultado de envío. Si todavía no está confirmado remotamente, no se afirma que el cuidador ya vio la respuesta. Una respuesta negativa informa sobre la última consulta prevista, conservando la programación que entregue el servicio.

En la segunda consulta, una nueva respuesta negativa recibe palabras de aliento y finaliza el seguimiento programado. No se añade una interpretación clínica, nueva llamada automática ni serie indefinida de consultas.

## 9. Emergencia y acceso sin PIN

La persona puede cancelar la prealerta y acceder a emergencia directa sin PIN. Durante los 30 segundos sólo suena el bastón; la pantalla del teléfono es visual y silenciosa según la propuesta aprobada.

| Hecho | Presentación |
|---|---|
| Detección recibida | «Detectamos una posible caída» y tiempo restante |
| Cancelación en curso | «Cancelando…» |
| Bastón confirma apagado | «Alarma cancelada» |
| Sin acuse local | Explicar que no se confirmó apagado y recordar botón |
| Vencimiento sin cancelación | Estado real de registro y aviso remoto |
| Marcador de emergencia abierto | No afirmar llamada conectada |
| Atención confirmada | «Recibió asistencia» y cuidador |

La emergencia tiene prioridad sobre recordatorios y formularios, pero no destruye un borrador. La presentación no debe revelar datos de otros perfiles por evitar el PIN.

## 10. Errores y uso sin conexión

| Situación | Qué debe comprender la persona |
|---|---|
| Sin Internet | Puede consultar datos locales; el aviso remoto no está confirmado |
| Sin bastón | El teléfono no está recibiendo eventos nuevos del dispositivo |
| Servidor sin respuesta | GuardMe conserva la operación pendiente y permitirá reintento |
| Permiso de avisos denegado | Los avisos del teléfono pueden no mostrarse |
| Ubicación sin permiso | No hay posición actual disponible |
| Sesión remota inválida | Es necesario recuperar acceso para funciones remotas; el marcador sigue accesible |

No se promete que una cola local entregue una emergencia a tiempo. Su valor es conservar el hecho y explicar su estado. El detalle de sincronización pertenece a D09.

## 11. Casos de diseño y aceptación

Antes de validar la interfaz, preparar recorridos con nombre largo, dos recordatorios coincidentes, cero contactos, bastón desconectado, incidente durante edición y reinicio del proceso. Son escenarios futuros de verificación, no pruebas ya ejecutadas.

La persona debe completar cancelar, llamar y confirmar un medicamento con fuente al 200 % y TalkBack. El acceso urgente no solicita PIN; cambiar un vínculo sí lo solicita según la política.

**Criterios relacionados:** FE-04–FE-07, FE-14–FE-19 y FE-21.  
**Reglas detalladas:** [D06 — Emergencias](06_Emergencias_Llamadas_Atencion_y_Seguimiento.md) y [D07 — Recordatorios e información](07_Recordatorios_Compartidos_Historial_y_Ubicacion.md).  
**Diseño común:** [D02 — Sistema visual](02_Sistema_Visual_Componentes_y_Accesibilidad.md).
