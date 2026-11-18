# GUARDMe — Memoria de análisis para reconstrucción documental
Fecha de corte: 14 de noviembre de 2026.
Proyecto analizado: D:/PROYECTOS/GUARDMe.
Origen: archivos locales actuales. Este registro conserva contexto técnico; no implica que exista memoria global automática entre conversaciones.

## 1. Encargo y límites de esta fase
El usuario pidió reconstruir la documentación y, primero, analizar todo el proyecto, conservar su contexto y eliminar la documentación existente. Esta fase prepara la reconstrucción: no modifica firmware, aplicación, recursos, licencias, pruebas o configuración, ni redacta aún la nueva documentación oficial.
Los seis documentos originales se conservaron íntegros fuera de docs, con hashes SHA-256. El archivo ZIP final incluye esta memoria, los originales y los inventarios/verificaciones.
Para continuar: abrir esta memoria y contrastarla con los archivos de código actuales; no volver a presentar el handoff antiguo como descripción del estado actual.

## 2. Producto e intención documentada
GuardMe plantea un bastón de asistencia conectado a una aplicación Android para personas mayores o con movilidad reducida, con una experiencia Persona y otra Cuidador.
El rol Familiar contempla ubicación, alertas y atención de emergencias; el rol Médico contempla historial, medicamentos y recordatorios con acceso reducido.
Marca: GuardMe; lema “Que la distancia no sea un riesgo”.
La intención funcional incluye posibles caídas, petición de ayuda, contacto con familiares, escalado a 911, recordatorios, búsqueda sonora del bastón, actividad e información para el equipo de cuidado.
Hay que distinguir siempre intención de producto, interfaz simulada, funcionamiento local del firmware y funciones conectadas todavía ausentes.

## 3. Inventario y estructura técnica
Se inventariaron 72 archivos propios, excluyendo cachés, artefactos generados, metadatos del IDE y dependencias. Son 20 archivos Kotlin de producción (5703 líneas), 3 archivos Kotlin de pruebas, un sketch Arduino y recursos/configuración. strings.xml contiene 315 entradas string.
No se detectó repositorio Git en la raíz ni en las carpetas superiores de código inspeccionadas. No se dispone de historial Git para recuperar los documentos eliminados.
- Arduino/ESP32_main/ESP32_main.ino: único firmware.
- GuardMeMobile/: proyecto Android Gradle, un módulo app.
- GuardMeMobile/app/src/main/java/com/example/guardmemobile/: entrada, navegación, paquetes persona, cuidador, demo, ui.
- ui/components/: botones, tarjetas, campos, chips, avatares, pestañas, iconos, logo, mapa ilustrado, toast y sheet.
- ui/theme/: paleta, tipografía y tema.
- ui/a11y/Motion.kt: consulta de escalas de animación del sistema.
- res/font/: cinco archivos de fuentes Figtree y Atkinson.
- assets/licenses/: OFL-Atkinson.txt y OFL-Figtree.txt; forman parte de la distribución y se preservan.
- application.backup: archivo binario de respaldo de aplicación; no es documentación y se conserva.
- local.properties: configuración local; se conserva sin copiar su contenido a esta memoria.
El inventario JSON adjunto proporciona las rutas exactas, tamaños y hashes.

## 4. Android: configuración observada
Kotlin y Jetpack Compose con Material 3, Navigation Compose, Lifecycle/ViewModel y StateFlow.
Namespace/applicationId: com.example.guardmemobile.
minSdk 24, compileSdk y targetSdk 37, versión 1.0 (código 1).
Catálogo: AGP 9.5.1, Kotlin 2.2.10, Compose BOM 2026.02.01, Navigation 2.9.6, Lifecycle 2.11.0, Activity Compose 1.13.0.
Wrapper Gradle 9.6.0. Criterio del daemon: JDK 25; source/targetCompatibility: Java 11. Son valores del repositorio, no una validación de compatibilidad.
El manifiesto declara MainActivity; no declara permisos de Bluetooth, Internet, telefonía, ubicación ni notificaciones. Las dependencias no contienen clientes de backend, SDK de mapas, base de datos ni proveedor de push.

## 5. Arquitectura real de la aplicación
MainActivity activa edge-to-edge y monta GuardMeMobileTheme + GuardMeRoot.
GuardMeRoot utiliza NavHost con gate, persona/{scenario} y cuidador/{role}/{scenario}.
La pantalla inicial es un selector de demostración. Permite entrar como Persona, Familiar o Médico y abrir escenarios de caída, pastilla y 911 automático; no es autenticación.
PersonaApp recoge PersonaViewModel.state con collectAsStateWithLifecycle. Los eventos se procesan mediante PersonaReducer. PersonaState es inmutable y contiene datos, pestaña, contacto en edición, dosis, overlays y estado del episodio de ayuda.
PersonaViewModel mantiene StateFlow, temporizadores y toasts con coroutines en viewModelScope.
CuidadorApp recoge CuidadorViewModel.state; usa una pila propia de CareScreen para detalles y pestañas.
CuidadorViewModel actualiza estado local para navegación, filtros, toma de responsabilidad, resolución de alertas, recordatorios, invitaciones, avisos y llamadas simuladas.
DemoHub.auto911Announced es un booleano global en memoria que enlaza la demostración de Persona con la inicialización de Cuidador dentro del mismo proceso. No es push, sincronización entre teléfonos ni un bus persistente.
No se encontró backend, persistencia de datos, repositorios de datos, BLE, conexión entre sketch y Android, ni API/contrato de eventos.
Los datos editados viven en los ViewModels; no hay persistencia duradera acreditada ante muerte del proceso.

## 6. Persona: interfaz y comportamiento existente
Pestañas: Inicio, Contactos, Recordatorios y Bastón.
Inicio: estado, batería, 911, llamada al contacto preferido, localizar bastón, próxima dosis y actividad.
Contactos: búsqueda, alta/edición/borrado con confirmación, preferido único y llamada simulada. Se valida nombre y teléfono no vacíos; cambiar foto muestra un aviso pendiente.
Recordatorios: Hoy/Semana, lista de dosis y citas, confirmar o deshacer toma mediante sheet, overlay de hora de pastilla y toast.
Bastón: batería, conexión, sensores, último uso y guía de botón físico, todos alimentados por datos de ejemplo.
PersonaOverlays incluye cuenta 911, llamada 911, llamada familiar, familiar sin respuesta, caída, escalado, auto911, ayuda en camino, familiar que contesta, búsqueda sonora y pastilla.
La app bloquea Atrás en overlays críticos y oculta semánticamente el fondo modal.

Flujo temporal implementado en el modelo de demostración:
1. 911 manual abre una cuenta de 5 segundos; cancelar la detiene.
2. Caída abre una pregunta de 30 segundos. “Estoy bien” cierra el episodio.
3. “Necesito ayuda” o el timeout inicia intento 1 al familiar preferido.
4. Cada intento tiene 28 segundos simulados. El primer fallo abre una pausa de 2500 ms y luego el intento 2.
5. El segundo fallo abre Auto911Notice durante 3000 ms; después inicia cuenta de 5 segundos y estado Calling911 automático.
6. Contestar en cualquiera de los intentos cancela el autoescalado.
7. Cancelar la cuenta automática vuelve a Escalation y no reinicia los intentos en bucle.
8. Una llamada normal desde Inicio/Contactos, fuera de un episodio de ayuda, termina con un toast de no respuesta y no escala al 911.
9. Si no hay familiar preferido, beginAttempt deriva a Escalation con intentos cerrados; el flujo requiere una decisión posterior.
10. Cerrar una llamada automática al 911 muestra HelpOnTheWay; es una transición visual, sin llamada real acreditada.

La respuesta del familiar se simula con un botón. No se detecta el estado de una llamada telefónica real.
Posponer una pastilla muestra “Te recordamos en 10 minutos”, pero el reducer no programa una alarma futura.

## 7. Cuidador y roles
Familiar: cinco pestañas, Inicio, Historial, Recordar, Bastón y Equipo.
Médico: cuatro pestañas; se excluye Bastón, se ocultan ubicación y alertas, y se bloquean las pantallas Alert/Live y las llamadas de emergencia desde el ViewModel.
Detalles: Alert, Live, Notifications, NewReminder, Invite y Profile.
Inicio muestra estado, métricas, adherencia, recordatorios y equipo; Familiar añade ubicación, alertas y estado/avisos del bastón.
Alerta incluye mapa ilustrado, dirección de ejemplo, llamada 911/persona, búsqueda sonora, “Yo me encargo”, timeline y cierre positivo.
En modo Auto911 se indica seguimiento de la llamada automática. takeCharge y resolveOk modifican solo estado local; resolveOk agrega un HistoryEvent.
Historial filtra Todo/Caídas/Medicamentos/Actividad.
Notificaciones filtra Todas/Urgentes, marca leídas y excluye algunas entradas mediante hiddenFromDoctor.
Nuevo recordatorio exige nombre, al menos un horario y un día. addTime acepta texto sin validar formato; los toggles de aviso y repetición son estado de formulario.
saveReminder crea filas locales, pero no conserva toda la semántica del borrador (tipo, días y políticas de repetición/compartición) en CareReminder.
Invitar exige nombre y contacto no vacíos; crea un miembro pendiente local y un toast, sin envío real.
Ficha de salud: solo lectura, datos de ejemplo.
Ubicación: IllustratedMap es Canvas decorativo; ruta, precisión, frescura y desplazamientos son datos demostrativos.
Probar sensores, hacer sonar el bastón, cómo llegar y preferencias muestran avisos locales; no representan comandos ejecutados.
Revisar posteriormente la política de rol en ficha e historial: existen campos/detalles con dirección para ambos roles, mientras la restricción explícita se aplica principalmente a ubicación en vivo/alertas. No asumir protección de datos de servidor.
Los roles se eligen desde una puerta demo; no hay autorización autenticada.

## 8. Marca, componentes y accesibilidad
Tema claro fijo en Theme.kt; sin dynamic color y sin esquema oscuro.
Colores: Brown #8A5A35, Caramel #C08A5B, Sand #F1E6D8, Cream #F8F4EE, Navy #1E2A38, WarmGray #5C5650, MeAccent #B07A4C.
Estado: Ok #2E7D4F, Emergency #B3261E, Attention #A8620A, Meds #2C4A6E.
Figtree para títulos/botones; Atkinson Hyperlegible para cuerpo. Body 16 sp; ScreenTitle 26 sp; CrisisTitle 34 sp; botón Persona 24 sp; Cuidador 18 sp.
Base histórica de diseño: 390 × 844. Referencia, no tamaño fijo obligatorio de dispositivo.
El 911 se diferencia con rojo y el familiar con marrón; no comunicar estado solo por color.
Ya existen semántica de headings/dialog/paneTitle, anuncios liveRegion, etiquetas, foco inicial y reducción de movimiento.
Motion.kt consulta ANIMATOR_DURATION_SCALE y TRANSITION_ANIMATION_SCALE al recordar el resolver; no es una verificación dinámica continua.
No se ejecutó una auditoría visual ni TalkBack; los ratios de contraste de los documentos originales eran afirmaciones de la especificación, no resultados verificados en esta fase.

## 9. Firmware existente: funcionalidad real local
Bibliotecas: Wire, Adafruit_MPU6050, Adafruit_Sensor y math.
MPU6050 por I2C: SDA GPIO21, SCL GPIO22.
Botón GPIO4 con INPUT_PULLDOWN, activo en HIGH. El esquema de alimentación/conexión física no está documentado en archivos.
Buzzer GPIO5 con digitalWrite HIGH/LOW; no se configura PWM. El tipo exacto y la etapa de potencia no quedan acreditados.
Serial 115200 baudios.
Acelerómetro ±8 g, filtro 94 Hz, lectura nominal cada 10 ms y logs cada 100 ms.
Umbral actual umbralGolpe = 100.0. No usar como valor vigente el 50.0 de conversaciones anteriores.
La intensidad calcula sqrt((ax-axAnterior)^2 + (ay-ayAnterior)^2 + (az-azAnterior)^2), en unidades de aceleración; es diferencia entre muestras, no jerk dividido por tiempo.
El sketch lee el evento del giroscopio, pero el algoritmo de activación solo usa aceleración. No implementa una confirmación de caída por giro corporal.
Estados:
- ESPERANDO_GOLPE: espera intensidad mayor al umbral y botón liberado.
- ALARMA_ACTIVA: activa buzzer; se apaga al mantener botón durante 600 ms.
- ESPERANDO_LIBERACION: exige 80 ms continuos sin pulsación.
- REARMANDO: espera 400 ms liberado; una pulsación reinicia este temporizador.
Si falla mpu.begin, imprime error y queda en un bucle de espera.
No hay BLE, Wi-Fi, GPS, lectura real de batería, podómetro, LED controlado, transmisión de alertas ni conexión móvil.
La detección actual es de golpe; no está acreditado un detector de caídas validado.
La guía de la app (“pulsación pide 911”, “3 segundos cancelan”, “pulsación confirma pastilla”) todavía no coincide con el sketch: allí el botón solo gestiona la alarma local con los tiempos anteriores.

## 10. Brechas entre documentación antigua y realidad
04-handoff.md todavía afirmaba que MainActivity era “Hello Android”, el tema era morado/dinámico, la tipografía era la predeterminada y faltaban Navigation/ViewModel. Todo eso quedó desactualizado respecto del código actual.
Los cinco documentos de docs/ui eran especificaciones UI de un prototipo HTML; ese HTML no está presente en el árbol propio inventariado.
Los documentos hablaban de dos experiencias/apps; la implementación actual es una sola aplicación Android con experiencias seleccionables.
Se deben preservar como intención histórica los dos intentos familiares y la cuenta 911, pero documentarlos como simulados en el estado actual.
La aplicación afirma visualmente funciones conectadas (avisos enviados, sensores probados, bastón sonando, ayuda en camino) que todavía no tienen integración.
El número de firmware “1.4.2”, batería 78 %, métricas y datos clínicos son valores de ejemplo; no se verifican contra el dispositivo.
La documentación antigua no cubría arquitectura completa, integración hardware, contrato, instalación reproducible ni operación del sistema.
Las decisiones abiertas originales incluían autenticación/onboarding, rol, emparejamiento, preferencias, edición de ficha, mapas reales, localización, multicuenta y política de escalado.

## 11. Pruebas y límites de verificación
PersonaReducerTest contiene 15 pruebas sobre cancelación y cuenta 911, timeout de caída, uno/dos fallos familiares, respuesta del familiar, cancelación sin bucle, llamada común sin escalado, confirmación/deshacer dosis, preferido único y constantes.
También existen ExampleUnitTest y ExampleInstrumentedTest de plantilla.
Se intentó ejecutar gradlew.bat --offline testDebugUnitTest --console=plain. No llegó a ejecutar pruebas: el wrapper falló por acceso denegado al archivo de bloqueo del ZIP Gradle 9.6.0 en C:/Users/mateo/.gradle/wrapper/dists.
Por tanto no se declara compilación exitosa ni pruebas aprobadas. No se cambió el entorno global.
Observación estática a revisar cuando se pueda compilar: PersonaReducer.reduce usa cuerpo de expresión (= when) con retornos directos “?: return state” en varias ramas. Requiere comprobar/corregir con el compilador; no se modificó en esta fase.
No se cargó firmware en hardware ni se ejecutó la UI en un emulador.
La verificación de esta operación consiste en copia exacta de originales y hashes de los 66 archivos propios restantes; los resultados están en Resultado_verificacion.json.

## 12. Alcance exacto de eliminación autorizado
Se retiran del árbol activo únicamente:
- README.md (archivo vacío).
- docs/ui/README.md.
- docs/ui/01-fundamentos.md.
- docs/ui/02-persona.md.
- docs/ui/03-cuidador.md.
- docs/ui/04-handoff.md.
Se eliminan las carpetas docs/ui y docs solo después de quedar vacías.
No se eliminan licencias OFL, comentarios de código, recursos, configuraciones, fuentes, pruebas ni el respaldo binario de la aplicación.
La copia Originales mantiene rutas y bytes previos. Alcance_eliminacion.json conserva tamaños y SHA-256.
El ZIP es un punto de recuperación, no la nueva documentación oficial.

## 13. Guía para la siguiente fase
Antes de redactar, acordar alcance de producto y MVP; documentar por separado lo implementado, lo simulado y lo pendiente.
Posible estructura a evaluar: README, visión/alcance, requisitos y roles, arquitectura, hardware/firmware, contrato de comunicación/datos, UI/accesibilidad, instalación/pruebas y decisiones/pendientes.
No fijar un contrato BLE, backend, permisos definitivos, detector de caída o política real de llamadas sin decisiones y evidencia.
Prioridades derivadas del análisis: reconciliar guía del botón con firmware; definir integración ESP32-teléfono y transporte a familiares; delimitar persistencia y permisos; formalizar identificación/roles; verificar build y pruebas; conectar recordatorios, alertas y mapas.
Usar como evidencia principal el código actual, el mapa de funciones adjunto y los inventarios. Los originales son referencias históricas.

