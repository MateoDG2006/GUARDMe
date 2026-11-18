# GUARDMe — 02. Sistema visual, componentes y accesibilidad

**Documento:** FE-D02 · **Versión:** 1.0 · **Fecha:** 14 de noviembre de 2026.  
**Base:** propuesta frontend v1.1 aprobada, sección 5 y reglas transversales.  
**Estado:** especificación ampliada; dimensiones y verificaciones no son una auditoría ya ejecutada.

## 1. Objetivo y principios

El sistema visual debe hacer reconocible GuardMe en ambas experiencias móviles, disminuir errores en emergencias y permitir el uso cotidiano por personas con baja visión o menor precisión motora. Persona necesita pocas decisiones grandes; Cuidador puede mostrar más información, sin utilizar otra marca ni otro lenguaje de estados.

Se conserva el tema claro, el lema «Que la distancia no sea un riesgo», Figtree para títulos y botones y Atkinson Hyperlegible para lectura. Material 3 aporta patrones y componentes, mientras los tokens propios conservan la identidad. Se mantienen las licencias OFL de las fuentes.

Los principios operativos son jerarquía de emergencia, texto comprensible, estados verificables y adaptación al contenido. Un botón no debe ser más llamativo por animación que por su función. Un dato desconocido no recibe el tratamiento visual de un resultado favorable.

## 2. Colores y uso semántico

| Token | Valor | Uso | Restricción |
|---|---|---|---|
| Cream | #F8F4EE | Fondo general | Mantener consistencia entre pestañas |
| White | #FFFFFF | Superficies y campos | Separar con espacio y borde cuando haga falta |
| Brown | #8A5A35 | Acción cotidiana y selección | No usar como alarma crítica |
| Sand | #F1E6D8 | Agrupación secundaria | Revisar el texto sobre esta superficie |
| Navy | #1E2A38 | Texto principal e iconos | Base de lectura |
| WarmGray | #5C5650 | Texto secundario | No reducir opacidad sin comprobar contraste |
| Emergency | #B3261E | Emergencia | Acompañar de texto e icono |
| Ok | #2E7D4F | Confirmación | Sólo con evidencia de resultado |
| Attention | #A8620A | Advertencia | No equiparar a caída confirmada |
| Meds | #2C4A6E | Medicamentos y citas | Diferenciar contenido de alarma |
| Caramel | #C08A5B | Acento y decoración | No asumir contraste suficiente en controles |
| Border | #E6DCCF | Separación suave | No depender de este borde para identificar una acción |

Los valores se reutilizan desde Color.kt. La asociación semántica debe ser estable: rojo para emergencia, verde para confirmación, marrón para acciones cotidianas. Esto no exime de comprobar cada combinación de primer plano y fondo.

El objetivo es contraste mínimo de 4,5:1 en texto normal y 3:1 en texto grande, conforme a WCAG. La conformidad debe verificarse sin redondear un resultado inferior al umbral. Los iconos que transmiten estado y el foco requieren revisión independiente. Los colores de marca no constituyen una certificación de accesibilidad [R1].

## 3. Escala tipográfica y espacio

| Uso | Familia y referencia | Comportamiento |
|---|---|---|
| Título de pantalla | Figtree, 26 sp | Admite salto de línea |
| Título de crisis | Figtree, 34 sp | Prioridad máxima sin recortar contenido |
| Título de sección | Figtree, 20 sp | Distingue grupos |
| Cuerpo | Atkinson, 16 sp | Ensayar 18 sp en Persona |
| Metadatos | Atkinson, 14–15 sp existentes | Reservar para información secundaria |
| Botón Persona | Figtree, 24 sp | Texto breve y altura adaptable |
| Botón Cuidador | Figtree, 18 sp | Etiqueta explícita, sin abreviaturas crípticas |

El texto secundario no debe contener la única indicación de un fallo crítico. En una llamada, «Resultado no disponible» tiene que ser legible; no puede perderse en una nota pequeña.

Se propone una escala de 4, 8, 12, 16 y 24 dp y márgenes laterales de 18–24 dp. Los botones principales de Persona conservan un mínimo habitual de 64 dp y crecen con el contenido. Los controles interactivos pequeños disponen de al menos 48 × 48 dp de área táctil; en elementos propios hay que verificarla expresamente [R2].

## 4. Catálogo de componentes

| Componente | Contenido | Estados requeridos |
|---|---|---|
| Botón principal | Etiqueta y, si ayuda, icono | Disponible, pulsado, enviando, no disponible |
| Botón secundario | Acción complementaria | Disponible y no disponible con explicación |
| Tarjeta de estado | Título, valor, hora y fuente | Actual, antiguo, desconocido, error |
| Chip | Estado corto | No transmite significado sólo por color |
| Campo | Etiqueta, entrada y ayuda | Vacío, válido, inválido, sólo lectura |
| Selector de persona | Nombre y contexto | Seleccionado, cargando, acceso retirado |
| Fila de recordatorio | Hora, título, autor y estado | Pendiente, registrado, pospuesto, omitido, sincronización |
| Fila de llamada | Contacto, intento y resultado | Resultado comprobado o desconocido |
| Navegación inferior | Icono y etiqueta | Selección accesible, sin duplicar anuncios |
| Hoja inferior | Título, acción y cierre | Desplazable y con foco controlado |
| Pantalla de emergencia | Hecho, tiempo y decisiones | Interrupción prioritaria persistente |
| Mensaje de error | Problema y acción siguiente | Persistente cuando afecte a una operación crítica |

GuardPrimaryButton y GuardOutlineButton son bases existentes. Antes de añadir nuevas variantes se revisa si la diferencia es funcional o sólo decorativa. Las pantallas no definen por su cuenta otro rojo, otra altura o un texto alternativo para el mismo estado.

Un componente en carga explica qué operación espera. «Guardando…» corresponde a un recordatorio; «Enviando confirmación…» a una decisión de cuidado. Un indicador genérico no debe tapar la disponibilidad de acceso al marcador de emergencia.

## 5. Prioridad y composición

Se propone este orden de presentación: emergencia activa, consulta de seguimiento pendiente, recordatorio que requiere respuesta, información cotidiana. La prioridad visual no debe eliminar información de menor prioridad: un recordatorio interrumpido debe seguir disponible después.

| Situación | Regla de composición |
|---|---|
| Posible caída y recordatorio simultáneos | La caída ocupa la presentación principal |
| Cuidador editando cuando llega un incidente | Conservar borrador y permitir acceso urgente |
| Error de sincronización | Mantener contenido anterior marcado con su fecha |
| Sin registros | Explicar ausencia y ofrecer una acción pertinente |
| Falta de permisos | Mostrar capacidad afectada y acceso contextual a configuración |
| Confirmación de cierre | Sustituir acciones obsoletas por resultado y autor |

La prealerta de 30 segundos en el teléfono es visual y silenciosa. No se añade sonido, vibración ni lectura automática desde la aplicación; el usuario conserva el uso voluntario de su tecnología de asistencia.

## 6. Adaptación a teléfonos y tabletas

La referencia histórica de 390 × 844 es una guía de composición, no un tamaño obligatorio. Se documentan comportamientos por espacio disponible en vez de depender de un modelo concreto.

En ancho compacto, contenido y formularios utilizan una columna. La barra inferior no debe quedar debajo de las zonas del sistema ni del teclado. Si la fuente ampliada impide encajar una etiqueta, se cambia la composición; no se reduce automáticamente el tamaño de texto para conservar la apariencia.

En tableta puede aparecer una lista y su detalle. El contexto de persona debe permanecer visible y el foco de lectura tiene que recorrer primero la lista o el detalle según la interacción. Una tarjeta vacía a la derecha no se presenta como un fallo de datos.

La orientación horizontal debe permitir completar las acciones críticas. No se impone una orientación fija como sustituto de comprobar el contenido, y los temporizadores no se reinician por cambiarla.

## 7. Semántica y lector de pantalla

Las descripciones identifican propósito y resultado. «Cancelar posible caída» es más útil que describir la forma del icono. El nombre de persona y la hora deben diferenciar filas repetidas. Los elementos decorativos no generan anuncios redundantes.

Al abrir una pantalla crítica se coloca el foco en su título y luego en las decisiones. El fondo modal deja de ser navegable por accesibilidad, preservando el trabajo ya observado en PersonaApp y PersonaOverlays. Al cerrar una hoja se devuelve el foco a un punto lógico.

No se anuncia cada segundo de la cuenta, porque puede impedir escuchar «Estoy bien». Se deben validar hitos de anuncio compatibles con la presentación silenciosa de prealerta; cualquier aviso automático añadido exige revisar esa regla. La cuenta sigue siendo consultable voluntariamente.

## 8. Movimiento, señales y tiempo de lectura

Las animaciones son breves y accesorias. Se mantiene la adaptación a reducción de movimiento y se comprueba el cambio durante uso, ya que el helper existente no acredita una observación continua de ajustes.

No utilizar destellos ni alternancia rápida de color para alertar en el teléfono. El parpadeo del bastón pertenece a firmware y requiere patrones específicos; no se define mediante una animación de la app.

Los toasts sirven para resultados no críticos. Un fallo de cancelación, un incidente pendiente o una revocación de acceso necesitan información persistente. El tiempo de lectura no debe depender de poder tocar un mensaje antes de que desaparezca.

## 9. Catálogo de textos y errores

| Situación | Texto base propuesto | Acción asociada |
|---|---|---|
| Bastón sin enlace | «Sin conexión con el bastón» | Ver detalle y pasos de reconexión |
| Internet ausente | «Sin Internet. Hay cambios pendientes» | Consultar estado de envío |
| Batería desconocida | «Batería no disponible» | Ningún porcentaje ficticio |
| Posición anterior | «Última ubicación conocida» | Mostrar hora y antigüedad |
| Cancelación en curso | «Cancelando alarma…» | Esperar resultado sin duplicar órdenes |
| Apagado sin acuse | «No pudimos confirmar el apagado del bastón» | Recordar botón físico |
| Cierre aceptado | «Recibió asistencia» | Mostrar cuidador y hora |
| Otro cuidador confirmó | «Este incidente ya fue atendido» | Consultar resultado vigente |
| Marcador abierto | «Marcador abierto con el número de emergencia» | No afirmar llamada conectada |

Los errores se colocan junto a los campos que necesitan corrección y en un resumen accesible si hay varios. El contenido ingresado se conserva. No mostrar códigos internos o trazas técnicas a la persona como única explicación.

## 10. Verificación del sistema visual

Cada componente se revisará con estado normal, error, espera, ausencia de datos y texto largo. La revisión incluye fuente ampliada al 200 %, TalkBack, navegación táctil y contraste. La automatización ayuda a encontrar problemas, pero no sustituye comprobar si alguien puede cancelar una alerta o atender un incidente [R3].

| Evidencia prevista | Resultado esperado |
|---|---|
| Captura de componentes | Variantes y estados reconocibles |
| Registro de contraste | Pares medidos, umbral y resultado |
| Prueba con TalkBack | Tarea completada y foco lógico |
| Fuente ampliada | Sin instrucciones críticas cortadas |
| Pantalla compacta y horizontal | Acciones disponibles y zonas del sistema respetadas |
| Movimiento reducido | Sin animación necesaria para entender estado |

**Relación con aceptación:** FE-04, FE-05, FE-09, FE-16, FE-17 y FE-19. Las tareas de producto concretas se verifican en D10.

## 11. Referencias y documentos relacionados

- **R1:** [WCAG 2.2, contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum).
- **R2:** [Android, accesibilidad de componentes Compose](https://developer.android.com/develop/ui/compose/accessibility/api-defaults).
- **R3:** [Android, pruebas de accesibilidad en Compose](https://developer.android.com/develop/ui/compose/accessibility/testing).
- [D04 — Persona](04_Experiencia_Movil_Persona.md) y [D05 — Cuidador](05_Experiencia_Movil_Cuidador.md) aplican estas reglas.
- [D10 — Verificación](10_Verificacion_Criterios_Aceptacion_y_Entrega.md) organiza la evidencia.
