# GUARDMe — 05. Experiencia móvil del cuidador

**Documento:** FE-D05 · **Versión:** 1.0 · **Fecha:** 14 de noviembre de 2026.  
**Base:** propuesta frontend v1.1, experiencias y diseño de Cuidador.  
**Plataforma:** misma app Android, Kotlin y Compose; familiar y personal médico con capacidades equivalentes.

## 1. Objetivo y alcance

La experiencia Cuidador permite acompañar a una o varias personas, recibir incidentes, decidir atención y administrar información compartida. Se ejecuta en el teléfono del cuidador y consulta datos remotos autorizados. No exige mantener cercanía Bluetooth con el bastón ni depende de un portal web.

Se reutilizan Inicio, Historial, Recordatorios, Bastón y Equipo. El trabajo adicional se concentra en seleccionar perfiles, unificar permisos, mostrar hechos reales y coordinar decisiones concurrentes. La categoría familiar/médico puede aparecer como descripción, nunca como una diferencia funcional injustificada.

Una notificación leída, una llamada respondida y un incidente cerrado son resultados distintos. El diseño debe permitir reconocerlos sin tener que interpretar detalles técnicos.

## 2. Contextos y selección de persona

El contexto se identifica por perfil estable, no sólo por nombre. Dos personas pueden compartir nombre; se puede añadir un dato visual secundario autorizado para distinguirlas. El selector no muestra perfiles ajenos ni conserva una selección revocada.

| Contexto | Uso | Regla de datos |
|---|---|---|
| Vista general | Priorizar tareas de varias personas | Sólo vínculos activos de la cuenta |
| Perfil seleccionado | Consultar y administrar su cuidado | Nombre siempre visible |
| Incidente abierto desde aviso | Atender evento de otra persona | Cambiar contexto explícitamente al perfil del incidente |
| Perfil sin acceso | Vínculo retirado o sesión inválida | Retirar contenido y acciones |
| Invitación pendiente | Preparar incorporación | No equivale a acceso efectivo |

Cambiar de persona no reutiliza el detalle anterior mientras llega la consulta nueva. Se muestra carga contextual o se mantiene el dato anterior claramente identificado. Una respuesta de red de un perfil anterior no puede sobrescribir la pantalla del perfil actual.

Los borradores se asocian al perfil de origen. Si se permite recuperarlos después de cambiar contexto, se informa a qué persona pertenecen antes de guardar.

## 3. Inicio general y prioridad

| Orden | Contenido | Acción principal |
|---|---|---|
| 1 | Cabecera y avisos | Abrir notificaciones y configuración |
| 2 | Selector o vista general | Elegir perfil |
| 3 | Incidentes activos | Abrir decisión urgente |
| 4 | Seguimientos pendientes | Consultar destinatario y responder si corresponde |
| 5 | Recordatorios del día | Revisar pendientes y registros |
| 6 | Personas vinculadas | Consultar estado y última comunicación |
| 7 | Barra inferior | Acceso a las cinco áreas |

Una tarjeta activa identifica persona, hora del hecho, antigüedad, estado y acción. Si existen dos incidentes, ambos permanecen identificables; el diseño no sustituye uno por otro usando una única variable de alerta global.

La ordenación por urgencia no afirma una gravedad médica calculada. Se propone priorizar incidentes no atendidos frente a tareas cotidianas y, dentro de cada grupo, utilizar tiempo y política del servicio.

## 4. Inicio de una persona

El resumen contiene incidentes abiertos, seguimiento pendiente, próximo recordatorio, conexión y última señal. Puede incluir contador de falsas alarmas e historial reciente. No muestra métricas de actividad sin fuente real.

La ubicación sólo aparece si existe consentimiento y acceso vigente. Debe incluir hora y precisión, o indicar que no está disponible. No se mantiene un mapa ilustrado como si representara a la persona.

| Dato | Presentación correcta |
|---|---|
| Bastón conectado hace tiempo | Última señal y su antigüedad |
| Teléfono sin conexión | Información conocida anteriormente, sin promesa de actualidad |
| Batería no medida | «No disponible» |
| Incidente cerrado | Resultado, actor y hora |
| Recordatorio tomado | Confirmación registrada, no ingesta comprobada |
| Equipo con invitación | Diferenciar invitado de miembro activo |

## 5. Recepción de avisos y entrada directa

Al tocar una notificación se resuelve identidad, vínculo y estado actual del incidente antes de habilitar decisiones. El aviso contiene una referencia; el detalle autorizado aporta la información vigente.

Si el incidente ya fue atendido, se abre su resultado en lugar de un formulario de decisión obsoleto. Si la cuenta perdió acceso, se informa sin filtrar contenido del perfil. La pantalla bloqueada recibe información mínima de acuerdo con la configuración del producto.

Se distinguen lista de notificaciones y registro de atención. Marcar todo como leído no cierra incidentes. La acción de abrir no cuenta como respuesta humana a una llamada salvo que el contrato de telefonía incorpore otra confirmación explícita y validada.

## 6. Pantalla de incidente

| Bloque | Información |
|---|---|
| Identidad | Persona y dispositivo asociado |
| Hecho | Posible caída, momento y origen |
| Comunicación | Registro remoto, avisos e intentos con evidencia disponible |
| Ubicación | Fuente, captura y precisión si se comparte |
| Decisiones | «Yo me encargo», llamada a emergencias y «Contestar más tarde» |
| Coordinación | Resultado de otra persona o intento de envío propio |
| Historia | Cronología del episodio |

Las acciones urgentes no requieren un nuevo PIN local para un cuidador ya autenticado y vinculado. Siguen necesitando autorización del servidor. El flujo no expone un perfil ajeno por estar en modo emergencia.

«Yo me encargo» cierra como «Recibió asistencia». Puede haber confirmación breve de intención, pero no se añade un paso de comprobación presencial. Mientras la respuesta remota está pendiente, se muestra envío en curso; no se comunica cierre compartido anticipado.

Si dos cuidadores actúan a la vez, el resultado vigente se presenta con actor y hora. La segunda interfaz no crea otro cierre ni muestra un error genérico que deje dudas sobre si el incidente sigue abierto.

## 7. Llamadas y posposición

La línea temporal presenta contacto 1/intento 1, contacto 1/intento 2, contacto 2/intento 1 y contacto 2/intento 2. El cuidador no modifica esos resultados desde una pantalla como si fueran apuntes manuales.

La modalidad de llamada sigue pendiente. Un proveedor puede informar conexión de transporte sin probar respuesta humana; la aplicación debe reflejar lo que se sabe. Un marcador abierto no es una llamada conectada.

«Contestar más tarde» programa notificación a cinco minutos. Se muestra el vencimiento confirmado por servicio. La regla de dos horas y sus destinatarios requieren P-08; la propuesta de contar desde la posposición aceptada se mantiene como convención por confirmar.

Ese recorrido no llama automáticamente a la ambulancia. La falta de respuesta a las llamadas iniciales y la posposición después de informar a un cuidador son ramas distintas.

## 8. Historial, recordatorios y seguimiento

El historial separa incidentes y llamadas. En vista general se puede filtrar por persona; al entrar desde un perfil, el filtro queda limitado a ese contexto hasta cambiarlo explícitamente. Las fechas se presentan en la zona correspondiente.

Los recordatorios muestran autor, ocurrencias y estados. Ambos tipos de cuidador pueden crear, editar y borrar dentro del perfil autorizado según las reglas aprobadas. Confirmar en nombre de la persona sigue pendiente en P-11; no se habilita por inferir que «médico» tiene permiso especial.

Una consulta de seguimiento deriva al cuidador si el usuario no responde en dos horas. La interfaz identifica que se trata de una consulta posterior, no de un incidente reabierto. El destinatario de la segunda consulta y los plazos adicionales pendientes no se completan con valores de ejemplo.

## 9. Bastones y equipo

La pestaña Bastón presenta dispositivos del perfil seleccionado. No se fija un máximo comercial ni un precio por cantidad. Cada dispositivo incluye identidad, capacidades disponibles y última comunicación.

La pestaña Equipo muestra participantes, categoría descriptiva y estado del vínculo. La gestión de invitaciones, cambios de contactos y revocaciones requiere PIN y autorización dentro del contexto. La categoría de cuidador no se usa como mecanismo de autorización.

| Operación | Confirmación requerida |
|---|---|
| Invitar | Operación registrada; aceptación pendiente visible |
| Aceptar vínculo | Acceso vigente al perfil indicado |
| Revocar | Resultado remoto y retirada del contexto afectado |
| Cambiar prioridad de llamada | Orden persistido y advertencias actualizadas |
| Cambiar pasarela | Procedimiento explícito y capacidad de enlace real |

No se deduce posesión de bastón por ver su número de serie en esta pantalla. Las operaciones de incorporación siguen el recorrido de D03.

## 10. Diseño móvil y adaptación

En teléfono compacto se conserva una columna, con decisiones de incidente accesibles sin desplazamiento innecesario. Los cinco destinos de navegación deben probarse con etiquetas en español y fuente ampliada. Si no encajan, se adapta la composición preservando los destinos; no se reduce texto de forma arbitraria.

En tableta Android puede usarse lista y detalle. Una rotación no reinicia llamadas, temporizadores ni formularios. El cuidador debe poder reconocer a qué persona pertenece cada acción incluso al volver desde otra aplicación telefónica.

La capacidad de consultar más datos no justifica tamaños táctiles menores ni instrucciones ambiguas. Se aplican los componentes y objetivos de D02.

## 11. Desconexión, concurrencia y recuperación

| Situación | Resultado esperado |
|---|---|
| Cuidador sin Internet | Mostrar datos locales con fecha |
| Cierre enviado sin respuesta | Mantener operación pendiente y consultar resultado |
| Otro cuidador ya confirmó | Mostrar «Recibió asistencia» con responsable |
| Push duplicado | Un único incidente y navegación estable |
| Aviso atrasado | Abrir el estado actual, no repetir decisiones vencidas |
| Vínculo retirado | Eliminar acceso a datos y solicitudes nuevas |
| Reinicio del proceso | Recuperar contexto y consultar hechos persistentes |

El teléfono no debe asumir que una llamada fue contestada por regresar de la aplicación de telefonía. Debe recibir el resultado del subsistema validado o mantenerlo como desconocido.

## 12. Revisión y aceptación

Comprobar dos perfiles con nombres similares, incidentes simultáneos, invitación sin aceptar, cambio de perfil durante carga y cierre concurrente en dos teléfonos. Verificar las mismas acciones con cuidador familiar y médico.

**Criterios relacionados:** FE-02, FE-03, FE-08–FE-13, FE-18–FE-21.  
**Detalle temporal:** [D06 — Emergencias](06_Emergencias_Llamadas_Atencion_y_Seguimiento.md).  
**Datos compartidos:** [D07 — Información](07_Recordatorios_Compartidos_Historial_y_Ubicacion.md).  
**Control de acceso:** [D03 — Configuración](03_Configuracion_Inicial_Identidad_PIN_y_Vinculaciones.md).
