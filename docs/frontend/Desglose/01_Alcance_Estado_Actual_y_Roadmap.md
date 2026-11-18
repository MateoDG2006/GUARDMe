# GUARDMe — 01. Alcance, estado actual y hoja de ruta

**Documento:** FE-D01 · **Versión:** 1.2 · **Fecha:** 14 de noviembre de 2026.  
**Origen:** [propuesta de frontend 1.2](../Propuesta_Frontend_GUARDMe_20261114.md), aprobada por el responsable.  
**Naturaleza:** especificación documental y de codificación; no acredita implementación ni pruebas ejecutadas.

**Revisión 1.3 (17 nov 2026):** la identidad remota viva es **Better Auth + PostgreSQL** (implementado). FCM sigue como push. Historial que citaba Supabase Auth queda como registro; no es el proveedor actual. La documentación Arduino/firmware está en [ESP32](../../ESP32/README.md); las responsabilidades móviles, en [ESP-05](../../ESP32/05_Integracion_Android_Pasarela_y_Sincronizacion.md).

**Revisión 1.2:** este documento queda en la misma versión que la propuesta local. (Supersedida en identidad por 1.3.)

## 1. Propósito y forma de lectura

Este documento organiza los diez entregables de frontend y conserva las decisiones de alcance. Debe permitir que diseño, Android, backend y firmware trabajen con el mismo significado de persona, cuidador, incidente y confirmación. El detalle añadido concreta la propuesta aprobada; las recomendaciones nuevas siguen identificadas como propuestas y los puntos abiertos conservan ese estado.

La fuente principal es la [propuesta aprobada](https://chatgpt.com/library?file_id=libfile_ca27f3775390819194d98ece7cfdf85c&account_id=personal). La entrevista de producto determina las reglas funcionales y el código observado determina qué existe. La propuesta de backend es una referencia de coordinación: su recomendación de infraestructura no prueba que esos servicios estén construidos.

### Catálogo y orden recomendado

| Documento | Responsabilidad principal | Lectura relacionada |
|---|---|---|
| [01. Alcance y hoja de ruta](01_Alcance_Estado_Actual_y_Roadmap.md) | Inventario, reglas, dependencias y registro de pendientes | Todos |
| [02. Sistema visual](02_Sistema_Visual_Componentes_y_Accesibilidad.md) | Marca, componentes, adaptación y accesibilidad | 04, 05 y 10 |
| [03. Configuración e identidad](03_Configuracion_Inicial_Identidad_PIN_y_Vinculaciones.md) | Entrada, cuenta, PIN, permisos y vínculos | 08 y 09 |
| [04. Experiencia Persona](04_Experiencia_Movil_Persona.md) | Pantallas y recorridos cotidianos del usuario del bastón | 02, 06 y 07 |
| [05. Experiencia Cuidador](05_Experiencia_Movil_Cuidador.md) | Supervisión, atención y varios perfiles | 03, 06 y 07 |
| [06. Emergencias y seguimiento](06_Emergencias_Llamadas_Atencion_y_Seguimiento.md) | Ventana de caída, llamadas, atención y consultas posteriores | 09 y 10 |
| [07. Recordatorios e información](07_Recordatorios_Compartidos_Historial_y_Ubicacion.md) | Recordatorios, historial, ubicación y telemetría visible | 04, 05 y 09 |
| [08. Arquitectura Android](08_Arquitectura_Android_Stack_y_Organizacion.md) | Stack, capas, estado, navegación y evolución | 03 y 09 |
| [09. Integración y sincronización](09_Integracion_Backend_Baston_Persistencia_y_Sincronizacion.md) | Contratos conceptuales, acuses, persistencia y desconexiones | 06, 07 y 08 |
| [10. Verificación y entrega](10_Verificacion_Criterios_Aceptacion_y_Entrega.md) | Matriz FE-01–FE-21, escenarios y evidencias | Todos |

## 2. Producto y primera versión

GuardMe combina un bastón inteligente y una aplicación Android. La persona lleva el teléfono que actúa como pasarela; el cuidador recibe avisos en otro teléfono. Persona y Cuidador son experiencias móviles de una sola aplicación, con el mismo stack y una densidad de información diferente.

La primera versión debe demostrar un evento real que sale del bastón, llega al teléfono de la persona, se comunica a otro teléfono y queda registrado con la atención del cuidador. Incluye recordatorios y sus cambios compartidos. La ubicación real es un objetivo que puede pasar a la siguiente entrega si no se consigue integrar; esta excepción no se extiende automáticamente a las demás funciones.

| Compromiso | Consecuencia para frontend |
|---|---|
| Detectar posibles caídas | Presentar posibilidad, sin afirmar diagnóstico |
| Esperar 30 segundos | Recuperar el tiempo restante; durante la espera sólo suena el bastón |
| Cancelar desde app o mango | Mostrar un resultado coherente para el mismo episodio |
| Dos contactos, dos intentos por contacto | Presentar orden y resultado de cada intento |
| Detener llamadas al responder | Consumir evidencia real de respuesta; definir tratamiento de buzón |
| «Yo me encargo» cierra | Registrar «Recibió asistencia» sin otra comprobación obligatoria |
| Seguimiento independiente | El incidente cerrado no vuelve a abierto por una consulta de bienestar |
| Confirmar medicamentos desde app | El mango no se presenta como confirmador de dosis |
| Familiar y médico equivalentes | No bloquear funciones por categoría de cuidador |
| Emergencia sin PIN | Separar protección local de sesión y autorización remota |

El panel de soporte es opcional y posterior. React, TypeScript y Vite sólo se conservan como una alternativa para esa interfaz operativa. No se incluye un portal web de cuidado, una aplicación de escritorio ni iOS en la primera entrega.

## 3. Estado base que debe aprovecharse

| Elemento observado | Qué puede reutilizarse | Qué falta demostrar |
|---|---|---|
| Kotlin, Compose y Material 3 | Proyecto y forma de construir pantallas | Compilación reproducible y compatibilidad de herramientas |
| Navigation Compose y ViewModels | Entrada y estado de presentación | Autenticación, restauración duradera y entradas remotas |
| Persona: cuatro pestañas | Organización y componentes | Datos reales, persistencia e integración |
| Cuidador: cinco áreas | Estructura principal | Igualdad de capacidades y múltiples perfiles reales |
| Tokens y fuentes | Paleta, Figtree, Atkinson Hyperlegible | Contraste y usabilidad medidos |
| Reducers y StateFlow | Transiciones locales y observación de estado | Conciliación con hechos del servidor y del bastón |
| DemoHub | Soporte de demostración aislada | No sirve para comunicar teléfonos |
| ESP32 y MPU6050 | Sketch con golpe local y buzzer | Validación de caída, enlace BLE y protocolo de cancelación. El sketch no acredita la ventana de 30 s |

Los porcentajes de batería, pasos, firmware y posiciones precargados no son telemetría. La lectura estática tampoco certifica el funcionamiento del botón o del detector. Los documentos describen la base revisada a la fecha de corte; cada implementación posterior debe actualizar su evidencia.

## 4. Brechas y orden de corrección

Primero se debe eliminar la contradicción entre interfaz y producto: quitar restricciones al cuidador médico, corregir la guía del mango y sustituir la secuencia de un solo contacto. Después se conecta cada pantalla a repositorios y hechos persistentes, evitando que una corrección visual se declare integración completa.

La codificación de ese primer corte está en la sección 9 y se limita a reglas visibles dentro de la app actual. Las etapas B–G tienen contratos de módulo en la sección 10. Las políticas P-01–P-16 siguen abiertas: el código las muestra como pendientes y no les asigna un valor de producto.

El objetivo no es borrar los escenarios de prueba. Deben quedar aislados del uso real, identificados como demostración y sin capacidad para disparar avisos reales por accidente. Las pantallas de producción no deben heredar nombres, tiempos o resultados de ejemplos como si fueran configuración aprobada.

| Brecha | Riesgo visible | Responsable de coordinación |
|---|---|---|
| Cierre sólo en memoria | Otro cuidador ve el incidente abierto | Android y backend |
| Llamada simulada | Se anuncia contacto sin haberlo realizado | Telefonía y Android |
| Cancelación sin acuse | El teléfono muestra silencio mientras el bastón sigue sonando | Firmware y Android |
| Datos antiguos sin fecha | El cuidador interpreta presencia o conexión actual | Android y backend |
| Permisos por categoría | El médico pierde capacidades acordadas | Android y autorización |
| Agenda no persistente | Se pierde un aviso tras reiniciar | Android y backend |

## 5. Matriz de cobertura de la propuesta original

| Sección original | Desarrollo principal |
|---|---|
| 1. Recomendación | D01 y D08 |
| 2. Fuentes y autoridad | D01 y referencias específicas |
| 3. Estado actual | D01, D08 y D10 |
| 4. Interfaces y etapas | D01 y D08 |
| 5. Diseño móvil | D02, D04 y D05 |
| 6. Navegación y configuración | D03, D04, D05 y D08 |
| 7. Emergencias | D06 y D09 |
| 8. Recordatorios, ubicación e historial | D07 |
| 9. Arquitectura e integración | D08 y D09 |
| 10. Stack móvil | D08 |
| 11. Experiencia móvil del cuidador | D05 |
| 12. Estados transversales | D02, D08 y D09 |
| 13. Seguridad y permisos | D03 y D09 |
| 14. Plan de evolución | D01 y D10 |
| 15. Criterios de aceptación | D10 |
| 16. Decisiones abiertas | Registro de este documento y detalle por dominio |
| 17. Archivos y límites de revisión | D01 y D08 |
| 18. Referencias | Fuentes de cada documento y catálogo de D10 |

Esta matriz es el control para evitar que la división deje una sección sin dueño. Los documentos especializados amplían el tema y remiten al dueño de las reglas compartidas.

## 6. Registro único de decisiones pendientes

| ID | Tema por resolver | Dueño del detalle |
|---|---|---|
| P-01 | Método concreto de acceso, recuperación de cuenta e identidad supervisada. El proveedor remoto vivo es Better Auth | D03 |
| P-02 | Longitud, intentos y recuperación del PIN | D03 |
| P-03 | Transporte, posesión, emparejamiento y cambio de pasarela | D03/D09 |
| P-04 | Patrón físico y conciliación de cancelación al vencer la ventana | D06/D09 |
| P-05 | Modalidad de llamadas, respuesta humana y buzón | D06 |
| P-06 | Vía viable para escalamiento automático al 911 | D06 |
| P-07 | Duración, pausas y casos con cero o un contacto | D06 |
| P-08 | Inicio del plazo de posposición y destinatarios del aviso colectivo | D06 |
| P-09 | Segunda consulta, zona horaria y plazo de respuesta del cuidador | D06 |
| P-10 | Edición/desactivación de recordatorios de cuidador por el usuario | D07 |
| P-11 | Posposición, repetición, falta de respuesta y registro asistido | D07 |
| P-12 | Capacidades reales de batería, sensor, luces y sonidos | D07/D09 |
| P-13 | Ubicación: cadencia, precisión, antigüedad y proveedor | D07 |
| P-14 | Retención, datos atrasados y ventana de deduplicación | D07/D09 |
| P-15 | Versiones compatibles, Android objetivo y restricciones verificadas | D08/D10 |
| P-16 | Alcance de panel interno u otras plataformas | D08 |

La aprobación de la propuesta confirma su dirección, pero no convierte una celda pendiente en un valor numérico definido. Las decisiones posteriores deberán registrar fecha, responsable, opción elegida, consecuencias y documentos afectados.

## 7. Hoja de ruta y condiciones de salida

| Etapa | Alcance | Evidencia de salida |
|---|---|---|
| A | Reconciliar reglas en la app actual y conseguir compilación base | Sección 9 cumplida y proyecto reproducible |
| B | Configuración, sesión, PIN y vinculaciones | Dos instalaciones conservan contextos autorizados |
| C | Evento físico, ventana y cancelación | Un episodio con trazabilidad de bastón a teléfono |
| D | Aviso remoto, llamadas y atención | Cuidador en otro teléfono confirma resultado persistente |
| E | Recordatorios, seguimiento y recuperación | Ocurrencias y plazos sobreviven a pérdida de UI |
| F | Ubicación si es viable | Captura real, consentimiento y antigüedad visibles |
| G | Expansión opcional | Necesidad concreta y alcance separado |

No se asignan semanas ficticias sin disponibilidad del equipo ni validación de hardware. La dependencia de telefonía debe estudiarse temprano: una demostración con marcador manual no cumple por sí sola el requisito automático al 911.

## 8. Control documental y preparación para desarrollo

El paquete conserva la propuesta original sin reemplazarla. Cada documento tiene identificador FE-D01–FE-D10; los criterios aprobados conservan FE-01–FE-21. Las ampliaciones pueden crear comprobaciones de diseño, pero deben enlazarse a un criterio existente o identificarse como propuesta.

Una entrega documental se considera coherente cuando cubre todas las secciones, no introduce un portal del cuidador, distingue demostración de funcionamiento real y mantiene los puntos abiertos visibles. La aceptación del software se controla en D10 y exige evidencias distintas de esta documentación.

## 9. Spec de codificación — etapa A

> **Para:** Cursor AI — Rol: Developer
> **Autor del plan:** Tech Lead
> **Stack:** Kotlin, Jetpack Compose, Material 3, Navigation Compose, ViewModel, StateFlow. Paquete observado `com.example.guardmemobile`.
> **Fecha:** 14 de noviembre de 2026
> **Alcance de esta sección:** solo la etapa A. No crea paquetes nuevos, no añade dependencias y no integra Supabase, Room, BLE, FCM ni telefonía.

### Instrucciones para Cursor

No tomes decisiones de arquitectura. Implementa esta sección al pie de la letra.
Si algo no está especificado, pregunta antes de asumir.
Archivos de contexto: `@GuardMeMobile/app/src/main/java/com/example/guardmemobile/persona/PersonaState.kt` `@GuardMeMobile/app/src/main/java/com/example/guardmemobile/cuidador/CuidadorViewModel.kt` `@docs/frontend/Desglose/01_Alcance_Estado_Actual_y_Roadmap.md` `@docs/frontend/Propuesta_Frontend_GUARDMe_20261114.md`

La app sigue siendo demostración en memoria. La etapa A corrige las reglas que la interfaz enseña. `DemoHub` permanece como indicador dentro del mismo proceso y no se usa para afirmar una llamada, un aviso remoto ni un cierre compartido.

### Objetivo

La interfaz deja de enseñar tres reglas que contradicen el producto: el cuidador médico pierde pantallas, el mango confirma una dosis o pide el 911, y una caída llama dos veces a un solo contacto y luego anuncia una llamada automática al 911. Tras la etapa A, familiar y médico recorren las mismas pantallas, el mango se describe como cancelación de posible caída con el patrón aún abierto, y el plan de avisos muestra contacto 1 dos veces y contacto 2 dos veces. El 911 automático queda visible como capacidad pendiente.

### Archivos

| Acción | Ruta | Descripción |
|---|---|---|
| MODIFICAR | `GuardMeMobile/app/src/main/java/com/example/guardmemobile/persona/PersonaState.kt` | Plan de dos contactos, cierre al contestar y emergencia manual sin anunciar el 911 |
| MODIFICAR | `GuardMeMobile/app/src/main/java/com/example/guardmemobile/persona/PersonaOverlays.kt` | Textos de intento, plan agotado y marcador no integrado |
| MODIFICAR | `GuardMeMobile/app/src/main/java/com/example/guardmemobile/persona/PersonaScreens.kt` | Guía del mango y botón de emergencia sin PIN |
| MODIFICAR | `GuardMeMobile/app/src/main/java/com/example/guardmemobile/cuidador/CuidadorState.kt` | Categoría de cuidador como etiqueta; avisos visibles para ambos |
| MODIFICAR | `GuardMeMobile/app/src/main/java/com/example/guardmemobile/cuidador/CuidadorViewModel.kt` | Quitar bloqueos por `CareRole.Medico`; un solo cierre «Yo me encargo» |
| MODIFICAR | `GuardMeMobile/app/src/main/java/com/example/guardmemobile/cuidador/CuidadorScreens.kt` | Mismas tarjetas y acciones para familiar y médico |
| MODIFICAR | `GuardMeMobile/app/src/main/java/com/example/guardmemobile/cuidador/CuidadorApp.kt` | Overlay de llamada local sin afirmar que el teléfono marcó |
| MODIFICAR | `GuardMeMobile/app/src/main/res/values/strings.xml` | Copys de la tabla de textos |
| MODIFICAR | `GuardMeMobile/app/src/test/java/com/example/guardmemobile/persona/PersonaReducerTest.kt` | El plan ya no abre el 911 automático al segundo intento |
| CREAR | `GuardMeMobile/app/src/test/java/com/example/guardmemobile/cuidador/CuidadorRulesTest.kt` | Médico con las mismas entradas; un solo cierre de atención |

No se renombra el paquete `com.example.guardmemobile`. No se toca Gradle, el manifiesto ni `DemoHub` más allá de dejar de tratar su indicador como prueba de una llamada real.

### Modelo de datos

```kotlin
// PersonaState.kt — junto a los tipos de overlay existentes
data class PrioritySlot(val slot: Int, val contactId: String)

data class PlannedAttempt(val slot: Int, val contactId: String, val index: Int)

enum class EpisodeCallOutcome { InProgress, Answered, PlanExhausted, NoPriorityContacts }

data class DialerUnavailable(val contactId: String?) : PersonaOverlay

data class CallPlanExhausted(val outcome: EpisodeCallOutcome) : PersonaOverlay
```

`slot` vale 1 o 2. `index` vale 1 o 2 dentro de ese contacto. Un contacto prioritario ausente no se rellena con otro número de la agenda. `DialerUnavailable` y `CallPlanExhausted` son overlays nuevos. `CallingFamily` y `FamilyAnswered` se conservan. `CallPlanExhausted` usa `PlanExhausted` cuando el plan tenía intentos y `NoPriorityContacts` cuando no había huecos. `FALL_SECONDS` sigue en 30.

`Contact.preferred: Boolean` pasa a `Contact.priority: Int?`, con valores `1`, `2` o `null`. `ContactDraft` usa el mismo campo. `preferred()` devuelve el contacto con `priority == 1` y sigue alimentando el botón de Inicio. En el estado demo, Ana queda en `1` y Luis en `2`; el resto queda en `null`. El editor de contacto ofrece prioridad 1, prioridad 2 o ninguna. Asignar un número retira ese mismo número del contacto que ya lo tenía.

```kotlin
// CuidadorState.kt
enum class AttentionOutcome { Open, ReceivedAssistance }

// CareRole se conserva como etiqueta descriptiva: Familiar o Medico.
// Deja de ser condición de acceso.
```

`Notice.hiddenFromDoctor` se elimina. `visibleToRole` devuelve todos los avisos del estado demo para `Familiar` y para `Medico`.

### Contratos de funciones

#### `PersonaReducer.buildCallPlan`
```kotlin
// Archivo: persona/PersonaState.kt, objeto PersonaReducer
fun buildCallPlan(slots: List<PrioritySlot>): List<PlannedAttempt>
```
**Responsabilidad:** recibe los huecos ya resueltos, como máximo uno de slot 1 y uno de slot 2, y expande cada hueco a dos intentos, en orden de hueco y luego de índice. El reducer construye esa lista solo con contactos `priority == 1` y `priority == 2`. Con Ana y Luis el resultado es Ana 1, Ana 2, Luis 1, Luis 2. Con un solo hueco, dos elementos. Con cero huecos, lista vacía. No consulta red ni abre el marcador.

#### `PersonaReducer.reduce` — eventos de episodio y emergencia
```kotlin
fun reduce(state: PersonaState, event: PersonaEvent): PersonaState
```
**Responsabilidad:** conserva el reducer puro. Cambia solo estas transiciones:

| Evento | Resultado |
|---|---|
| `FallDetected` seguido de los ticks de la ventana demo | `CallingFamily` del primer `PlannedAttempt`, o `CallPlanExhausted(NoPriorityContacts)` si el plan está vacío |
| Timbre demo agotado con otro intento en el plan | `CallingFamily` del siguiente `PlannedAttempt` |
| `FamilyAnswered` durante `CallingFamily` | Overlay `FamilyAnswered` del intento en curso, resultado `Answered`, plan detenido |
| Plan agotado | `CallPlanExhausted(PlanExhausted)`. No crea `Auto911Notice`, `Countdown911` ni `HelpOnTheWay` |
| `Tap911` o `Manual911` | `DialerUnavailable(contactId = null)`. No inicia cuenta atrás ni `Calling911` |
| `CallContact` desde Inicio o Contactos | `DialerUnavailable(contactId = id)`. Identifica a quién se llamaría y no abre el marcador |

`FamilyAnswered` es el evento que ya existe. No se crea un evento `Answered`. La etiqueta «Marcador abierto» de la propuesta queda para la etapa en que el marcador del teléfono se abra de verdad. En la etapa A el texto es «Marcador no integrado».

`DEMO_RING_TICKS` sustituye a `RING_SECONDS` como número de ticks para avanzar la demo. Su valor puede seguir siendo 28 para no reescribir el reloj de la demo. La interfaz no muestra ese número como duración aprobada: P-07 sigue abierto. `COUNTDOWN_911` deja de usarse.

#### `CuidadorViewModel.acceptResponsibility`
```kotlin
// Archivo: cuidador/CuidadorViewModel.kt
fun acceptResponsibility()
```
**Responsabilidad:** única acción de cierre del incidente demo. Escribe `AttentionOutcome.ReceivedAssistance`, guarda el nombre del cuidador de la sesión como actor, añade un evento de historial con badge «Recibió asistencia», limpia `alert` y `call`, y vuelve a Inicio. No llama a red. Una segunda pulsación con el incidente ya cerrado no agrega otro evento.

`takeCharge()` y `resolveOk()` se eliminan. La pantalla de alerta deja un solo botón, «Yo me encargo», enlazado a `acceptResponsibility()`. El badge es estado local de la demo: no representa un cierre compartido confirmado por el servidor. La confirmación breve de intención que D06 permite no entra en esta etapa, y tampoco se conserva el segundo botón de resolución.

#### `CuidadorViewModel.selectTab`, `open`, `startCall`, `openNotice`
```kotlin
fun selectTab(tab: CareTab)
fun open(screen: CareScreen)
fun startCall(target: CareCall)
fun openNotice(id: String)
```
**Responsabilidad:** estas funciones dejan de leer `CareRole.Medico` para rechazar Bastón, alerta, llamada de emergencia o un aviso. `startCall` abre el overlay local de «marcador no integrado» para familiar y para médico. `openNotice` abre la alerta cuando el aviso lo pide, también si el rol es `Medico`.

`sendInvite` puede seguir guardando `CareRole` en el miembro invitado. El avatar puede seguir distinguiendo la etiqueta visual. Esa etiqueta no oculta pantallas.

#### Presentación

`CuidadorHome` deja de calcular `familiar = state.role == CareRole.Familiar` para mostrar u ocultar alerta, estado y acciones. Familiar y médico renderizan el mismo árbol.

`CuidadorCane` muestra el estado del bastón para ambos roles. Desaparece el texto de `medico_cane_hidden`.

`CuidadorApp.CareCallOverlay` muestra el destino elegido y el texto «Marcador no integrado». No muestra «Llamando» como hecho consumado.

`PersonaScreens` mantiene la guía del mango en Bastón, con los tres textos nuevos. El botón «Llamar a emergencias» sigue en Inicio, sin PIN, y dispara `Tap911` con el resultado de capacidad pendiente.

### Textos

| Clave | Texto |
|---|---|
| `guide_1` | El botón del bastón cancela la alarma de una posible caída. |
| `guide_2` | El patrón de pulsación todavía no está definido. |
| `guide_3` | La confirmación de un medicamento se hace en la aplicación. |
| `demo_medico_hint` | Dr. Pérez · mismas capacidades que un familiar |
| `dialer_not_integrated` | Marcador no integrado |
| `call_plan_attempt` | Contacto %1$d · intento %2$d de 2 |
| `call_plan_exhausted` | Terminaron los intentos a los contactos prioritarios. La llamada automática al 911 está pendiente. |
| `call_plan_answered` | Este intento quedó marcado como contestado. Los siguientes no se inician. |
| `call_plan_empty` | No hay contactos prioritarios. No se inventa un número. |
| `i_handle` | Yo me encargo |
| `received_assistance` | Recibió asistencia |
| `help_title` | Resultado local de la demostración |
| `episode_note` | Contacto 1, dos intentos. Contacto 2, dos intentos. Se detiene si alguien contesta. |

Se dejan de usar `medico_blocked`, `medico_cane_hidden`, `auto_body`, `help_auto` y `help_family` en la UI. Esas claves se borran de `strings.xml` si ninguna llamada restante las referencia.

La guía no menciona 3 segundos, el 911 ni una dosis confirmada con el mango. Los overlays dejan de decir «La ayuda va en camino» y «GuardMe llamó al 911».

### Dependencias

| Paquete | Versión | Ya instalado | Comando |
|---|---|---|---|
| Ninguno nuevo | — | — | No ejecutar instalación |

### Edge cases y errores

- **Cero contactos prioritarios:** el vencimiento de la ventana muestra `call_plan_empty`. No abre el 911.
- **Un solo contacto prioritario:** el plan tiene dos intentos de ese contacto y luego `PlanExhausted`.
- **Contestación en el intento 1.1:** no hay intento 1.2 ni contacto 2.
- **Médico en Bastón, alerta y emergencia:** las tres entradas abren la misma pantalla que para un familiar.
- **Doble toque en «Yo me encargo»:** un solo evento de historial.
- **`DemoHub.auto911Announced`:** deja de activarse. Un indicador en el mismo proceso no cuenta como llamada.
- **Tiempos 5 s y 28 s:** siguen fuera de los textos de producto. P-05, P-06 y P-07 no se cierran en esta etapa.
- **Inmovilidad y «bastón quieto»:** el aviso demo `n3` se retira del listado inicial. La detección automática que la interfaz enseña es la posible caída.

### Orden de implementación

1. Sustituir `Contact.preferred` y `ContactDraft.preferred` por `priority: Int?`. Dejar a Ana en 1 y a Luis en 2 en el demo. Añadir `PrioritySlot`, `PlannedAttempt`, `EpisodeCallOutcome`, `DialerUnavailable` y `CallPlanExhausted`.
2. Implementar `buildCallPlan` y cambiar `reduce` para el plan, la contestación y el marcador no integrado. Actualizar el editor para las dos prioridades.
3. Actualizar overlays y pantallas de Persona, incluida la guía del mango.
4. Quitar `hiddenFromDoctor` y los retornos por `CareRole.Medico` en el cuidador.
5. Sustituir `takeCharge` y `resolveOk` por `acceptResponsibility` y un solo botón.
6. Reemplazar los textos de la tabla y borrar las claves que ya no se referencian.
7. Actualizar `PersonaReducerTest` y crear `CuidadorRulesTest`.
8. Compilar el módulo app y ejecutar las pruebas unitarias. No añadir dependencias si la compilación falla: registrar el error y detenerse.

### Criterios de aceptación

- [ ] Entrar como médico abre Bastón, la alerta y la acción de emergencia que también ve el familiar.
- [ ] La guía del bastón describe cancelación de posible caída, patrón sin definir y confirmación de medicamento en la app.
- [ ] Tras una caída demo con Ana en prioridad 1 y Luis en prioridad 2, el orden visible es Ana 1, Ana 2, Luis 1, Luis 2.
- [ ] Marcar contestado en Ana 1 no muestra Ana 2 ni a Luis.
- [ ] Al agotar los cuatro intentos no aparece cuenta atrás ni texto de llamada al 911. Aparece `call_plan_exhausted`.
- [ ] «Llamar a emergencias» y «Llamar a mi contacto» muestran «Marcador no integrado» y siguen disponibles sin PIN.
- [ ] «Yo me encargo» deja el historial en «Recibió asistencia» sin un segundo botón de resolución.
- [ ] `DemoHub` no pasa a verdadero por una llamada de la demo.
- [ ] `PersonaReducerTest` y `CuidadorRulesTest` pasan.
- [ ] El paquete, Gradle y el manifiesto quedan como estaban.

## 10. Contratos de codificación — etapas B a G

Estas etapas no se implementan junto con la sección 9. Cada una espera a que la anterior compile y sus pruebas pasen. `CaneBleClient`, `CaneRepository`, `FallEpisodeCoordinator` y `GatewaySyncRepository` conservan los nombres de [ESP-05](../../ESP32/05_Integracion_Android_Pasarela_y_Sincronizacion.md). `SessionGateway` es el nombre de código del gestor de sesión de ese documento. `ReminderRepository` es el nombre de esta hoja para la etapa E. Las carpetas salen de [D08](08_Arquitectura_Android_Stack_y_Organizacion.md). Crear la clase antes de su etapa queda fuera de este plan.

El paquete raíz sigue siendo `com.example.guardmemobile`. Las carpetas nuevas cuelgan de ese paquete. No se crea un módulo Gradle por pantalla.

| Etapa | Paquete | Contrato que aparece en esa etapa | Se detiene ante |
|---|---|---|---|
| B | `access` | Sesión Better Auth, instalación NestJS, PIN local y vínculos | P-01, P-02 |
| C | `devices` | Cliente BLE, repositorio del bastón y coordinador del episodio | P-03, P-04 |
| D | `incidents` | Cola remota, plan de llamadas del servidor y decisión de atención | P-05, P-06, P-07, P-08 |
| E | `reminders` | Recordatorios, ocurrencias, seguimiento e historial persistidos | P-09, P-10, P-11, P-14 |
| F | `location` | Consentimiento, última ubicación y antigüedad | P-13 |
| G | — | Panel interno u otra plataforma, en un alcance separado | P-16 |

### Contratos que el desarrollador no adelanta

```kotlin
// access/SessionGateway.kt — etapa B
interface SessionGateway {
    suspend fun currentSession(): SessionSnapshot
    suspend fun bootstrapInstallation(): InstallationId
}

// devices/CaneBleClient.kt — etapa C
interface CaneBleClient {
    suspend fun connect(caneId: CaneId): LinkSnapshot
}

// devices/CaneRepository.kt — etapa C
interface CaneRepository {
    fun observe(caneId: CaneId): Flow<CaneSnapshot>
}

// devices/FallEpisodeCoordinator.kt — etapa C
interface FallEpisodeCoordinator {
    suspend fun onFallCandidate(record: FallRecord)
    suspend fun requestCancel(commandId: CommandId): CancelResult
}

// incidents/GatewaySyncRepository.kt — etapa D
interface GatewaySyncRepository {
    suspend fun publish(operation: GatewayOperation): ItemResult
    suspend fun acceptResponsibility(incidentId: IncidentId, expectedVersion: Int): DecisionResult
}

// reminders/ReminderRepository.kt — etapa E
interface ReminderRepository {
    fun observe(profileId: ProfileId): Flow<List<Occurrence>>
    suspend fun confirm(occurrenceId: OccurrenceId): Occurrence
}
```

**Responsabilidad común:** cada interfaz vive en su etapa y habla con el repositorio de esa etapa. El composable observa un modelo de presentación. El ViewModel no es el dueño del cronómetro de 30 s, del enlace BLE ni de la cola remota.

`SessionGateway` usa el access token de Better Auth contra NestJS. El PIN no sustituye ese token. `publish` conserva `sourceEventId` en los reintentos. `acceptResponsibility` de la etapa D envía la versión esperada; un conflicto vuelve a leer el incidente y muestra el resultado ya guardado. La etapa A no llama a estas interfaces.

### Políticas abiertas en código futuro

Cuando exista `access`, las políticas abiertas se leen de una configuración y la UI muestra la etiqueta «Pendiente». La etapa A no crea ese archivo. Los identificadores reservados son:

| Identificador | Tema | Etapa que lo lee |
|---|---|---|
| `P01_ACCESS_METHOD` | Método de acceso y recuperación | B |
| `P02_PIN_POLICY` | Longitud, intentos y recuperación del PIN | B |
| `P03_GATEWAY_TRANSPORT` | Transporte, posesión y cambio de pasarela | C |
| `P04_CANCEL_PATTERN` | Patrón físico y arbitraje al vencer la ventana | C |
| `P05_CALL_MODALITY` | Modalidad, respuesta humana y buzón | D |
| `P06_EMERGENCY_AUTOCALL` | Escalamiento automático al 911 | D |
| `P07_CALL_TIMING` | Duración, pausas y cero o un contacto | D |
| `P08_POSTPONE_POLICY` | Inicio del plazo y destinatarios del aviso colectivo | D |
| `P09_FOLLOWUP_POLICY` | Segunda consulta, zona y plazo del cuidador | E |
| `P10_REMINDER_EDIT` | Edición de recordatorios creados por el cuidador | E |
| `P11_REMINDER_RESPONSE` | Posposición, repetición y registro asistido | E |
| `P12_CANE_CAPABILITIES` | Batería, sensor, luces y sonidos reales | C |
| `P13_LOCATION_POLICY` | Cadencia, precisión, antigüedad y proveedor | F |
| `P14_RETENTION` | Retención y deduplicación | E |
| `P15_ANDROID_BASELINE` | Versiones y restricciones verificadas | A, solo como registro; no cambia Gradle en A |
| `P16_EXTRA_CLIENTS` | Panel interno u otras plataformas | G |

P-15 en la etapa A se limita a dejar constancia de lo ya observado: `minSdk` 24, `compileSdk` y `targetSdk` 37, JDK de compilación 11. Esos números no se modifican en la etapa A y no certifican una compilación.

### Criterios de salida de B–G

La salida de cada etapa sigue la tabla de la sección 7. Una etapa posterior no empieza con la anterior en rojo. La ubicación de la etapa F puede aplazarse sin arrastrar a B–E. El panel de la etapa G no forma parte de la aplicación Android de Persona y Cuidador.

**Siguiente lectura:** [D02 — Sistema visual](02_Sistema_Visual_Componentes_y_Accesibilidad.md).
