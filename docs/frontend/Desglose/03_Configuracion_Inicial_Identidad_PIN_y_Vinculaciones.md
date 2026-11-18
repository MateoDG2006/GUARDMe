# GUARDMe — 03. Configuración inicial, identidad, PIN y vinculaciones

**Documento:** FE-D03 · **Versión:** 1.1 · **Fecha:** 14 de noviembre de 2026.  
**Base:** propuesta frontend v1.1, configuración inicial y seguridad.  
**Coordinación:** propuesta de backend sobre cuenta, perfil, instalación e identidad supervisada; sus mecanismos siguen siendo propuestas por validar.

## 1. Objetivo y modelo de acceso

La configuración debe identificar quién está usando el teléfono, qué persona puede consultar y cuál instalación se comunica con el bastón. Elegir «Cuidador» no concede acceso a otras personas. Desbloquear con PIN permite operar dentro de un contexto ya autorizado; no crea una identidad remota.

| Concepto | Qué representa | Consecuencia en pantalla |
|---|---|---|
| Cuenta | Identidad que inicia sesión | Nombre, recuperación y sesión |
| Perfil asistido | Persona que utiliza el bastón | Contexto de datos y consentimiento |
| Vinculación | Acceso de una cuenta al perfil | Determina capacidades vigentes |
| Categoría de cuidador | Familiar o personal médico | Etiqueta descriptiva, mismos permisos funcionales |
| Instalación | Esta copia de GuardMe en un teléfono | Registro de avisos y revocación |
| Pasarela | Teléfono que acompaña a la persona y enlaza el bastón | Estado de conexión y eventos locales |
| PIN | Protección propia de la app | Entrada a ajustes protegidos |

Una misma cuenta puede tener varias vinculaciones. No se introduce un cuidador principal ni un nivel de privilegio médico. Si en el futuro una cuenta combina contextos Persona y Cuidador, el cambio se basará en sus accesos reales y requerirá diseñar una selección comprensible.

## 2. Entrada y estados de configuración

La entrada de producción reemplaza el selector demo. Su pregunta inicial es «¿Quién está configurando GuardMe?», con las opciones «Soy quien utiliza el bastón» y «Estoy configurando como cuidador». Explicar que la elección adapta los pasos y que no sustituye el acceso a la cuenta.

Se propone conservar un progreso por instalación y perfil con estados conceptuales: no iniciada, identidad establecida, perfil preparado, dispositivo pendiente, contactos pendientes, permisos revisados, prueba pendiente y configuración comprobada. Estos nombres documentan la experiencia; no fijan un esquema de API.

| Estado | Presentación | Continuidad |
|---|---|---|
| Primer inicio | Explicación breve y pregunta de configuración | Comenzar recorrido |
| Sesión existente | Consultar vínculos y avance | Recuperar contexto válido |
| Interrupción voluntaria | Guardar pasos completados | Mostrar qué falta al volver |
| Permiso rechazado | Explicar capacidad afectada | Permitir continuar con limitación visible |
| Fallo remoto | Conservar formulario y progreso confirmado | Reintentar sin duplicar cuenta o perfil |
| Sesión revocada | Retirar acceso al contexto | Recuperar identidad según política |

No se marca «Listo» por haber visitado todas las pantallas. Cada requisito necesita evidencia: una asociación, una aceptación, un permiso o una prueba. El resumen debe separar configuración completa de capacidad operativa actual; un teléfono configurado puede perder Internet después.

## 3. Recorrido de quien utiliza el bastón

1. Seleccionar experiencia Persona y acceder con su identidad.
2. Crear o identificar su perfil sin duplicarlo.
3. Configurar el PIN local y explicar qué protege.
4. Incorporar el bastón con prueba de posesión.
5. Registrar este teléfono como pasarela autorizada.
6. Añadir contactos y ordenar las dos prioridades.
7. Invitar cuidadores o aceptar vínculos existentes.
8. Decidir la compartición de ubicación.
9. Revisar permisos del sistema.
10. Completar una prueba controlada y consultar limitaciones.

En cada paso, «Atrás» conserva los datos ya confirmados. Volver a crear perfil después de un fallo de red debe consultar si la operación anterior se completó. La app no debe generar un perfil nuevo por cada cuidador agregado.

## 4. Recorrido de configuración asistida

El cuidador entra con su cuenta y crea un perfil asistido o acepta una invitación. Debe identificar si está preparando el teléfono de la persona o utilizando el suyo. La ayuda en configuración no convierte su cuenta personal en la identidad permanente del otro teléfono.

La propuesta de backend contempla una identidad supervisada para el teléfono de la persona cuando no utilizará inicio de sesión propio. El cuidador genera una incorporación temporal y el otro teléfono la consume. El frontend debe tratar ese recorrido como una capacidad por validar: no se muestran códigos funcionales simulados ni se presupone recuperación ya resuelta.

| Paso asistido | Teléfono del cuidador | Teléfono de la persona |
|---|---|---|
| Preparar perfil | Crea o selecciona contexto autorizado | Aún no recibe datos de otros perfiles |
| Incorporar instalación | Solicita código temporal | Escanea o ingresa código |
| Confirmar identidad | Ve instalación esperada | Ve nombre de la persona a configurar |
| Asociar pasarela | Comprueba instalación elegida | Realiza enlace con el bastón |
| Verificar aviso | Recibe prueba controlada | Inicia prueba autorizada |

La expiración, recuperación y revocación de la identidad supervisada son P-01. Mientras no exista esa integración, la documentación no la declara disponible.

## 5. Incorporación del bastón y cambio de pasarela

Pantallas propuestas: explicación de proximidad, búsqueda, lista de dispositivos, confirmación de identidad física, comprobación de posesión y resultado. Mostrar un nombre reconocible y un identificador parcial; el número de serie por sí solo no demuestra posesión.

El transporte BLE es la primera opción a evaluar. El protocolo, UUID, credenciales y patrón físico de confirmación no se fijan en UI como hechos implementados. La experiencia debe poder recibir «no compatible», «asignado», «no autorizado», «sin respuesta» o «vinculación completada».

Como política de piloto propuesta por backend, cada bastón tendría una sola pasarela activa. Cambiarla debe ser explícito, explicar qué instalación deja de recibir eventos y quedar confirmado por servidor y enlace local. Si el bastón admite otra política futura, se revisa esa decisión antes de adaptar las pantallas.

| Fallo | Respuesta de la interfaz |
|---|---|
| Bluetooth desactivado | Explicar y ofrecer acción del sistema disponible |
| Dispositivo no encontrado | Revisar cercanía, alimentación y nuevo intento |
| Dispositivo de otra persona | Impedir apropiación sólo por conocer su serie |
| Asociación ya existente | Mostrar contexto autorizado o vía de resolución |
| Caída de red durante incorporación | Conservar operación identificada y consultar resultado |
| Enlace sin prueba completa | Mostrar configuración pendiente, no protección comprobada |

## 6. Invitaciones y equipo de cuidado

Se propone código o QR de un solo uso con caducidad, alcance a un único perfil y confirmación de aceptación. El vínculo tiene estados visibles: pendiente, aceptado, caducado, retirado o revocado. Enviar una invitación no equivale a que el cuidador ya reciba alertas.

Antes de aceptar, se presenta a qué persona dará acceso y qué categoría se registra. Elegir familiar o personal médico no cambia las capacidades. Al revocar, el cliente retira datos y acciones de ese perfil y deja de ofrecer su ubicación.

Un contacto telefónico prioritario y una cuenta de cuidador son conceptos distintos. Una persona puede estar como número de contacto sin haber instalado GuardMe; la pantalla debe aclarar si recibirá llamadas, avisos de app o ambos según disponibilidad real. La política de destinatarios iniciales de push sigue pendiente de concreción en P-08/P-05.

## 7. Contactos prioritarios

La configuración permite identificar contacto 1 y contacto 2 y mostrar el orden de llamadas. Los teléfonos se validan y normalizan con el backend. La ausencia de contactos no se corrige inventando un contacto por defecto.

Cambiar prioridades requiere PIN según la propuesta aprobada. Durante un incidente se muestra el plan ya iniciado; el backend propone conservar una copia de los contactos al comenzar. El cambio cotidiano no debe reordenar silenciosamente una secuencia activa.

La política para cero o un contacto permanece P-07. La pantalla identifica la limitación y permite terminar más tarde. Completar una lista de contactos no demuestra que los números sean contestables; la prueba de disponibilidad debe diseñarse aparte.

## 8. PIN local y acceso urgente

| Acción | PIN local | Condición adicional |
|---|---|---|
| Cancelar posible caída | No | Episodio y dispositivo correspondientes |
| Acceder a emergencia directa | No | Mecanismo telefónico disponible |
| Abrir incidente urgente del cuidador | Sin nuevo desafío local | Sesión remota y vínculo válidos |
| «Yo me encargo» en incidente autorizado | Sin nuevo desafío local | Confirmación remota de la decisión |
| Cambiar vinculaciones | Sí | Capacidad remota para el perfil |
| Cambiar permisos de compartición | Sí | Consentimiento y autorización |
| Ordenar contactos | Sí | Contexto autorizado |
| Cambiar bastón o pasarela | Sí | Prueba y operación confirmadas |

No se define una longitud de PIN ni número de intentos sin decisión. Deben quedar descritos en P-02 antes del piloto. El PIN no se registra en logs ni se envía como contraseña de API. El mecanismo local de verificación requiere diseño de almacenamiento protegido; usar Keystore para claves no convierte automáticamente un PIN propio en un control completo.

La recuperación no debe permitir acceso a perfiles ajenos ni borrar silenciosamente vinculaciones. Si aún no está implementada, se informa la vía real disponible en lugar de ofrecer un restablecimiento ficticio.

## 9. Permisos y consentimiento

| Capacidad | Solicitud contextual | Efecto al denegar |
|---|---|---|
| Enlace con bastón | Al incorporar o recuperar conexión | No afirmar recepción local |
| Notificaciones | Al preparar recepción de avisos | Explicar limitación de avisos visibles |
| Ubicación | Al habilitar captura necesaria | Mostrar ubicación no disponible |
| Compartición de ubicación | Decisión dentro de GuardMe | Ningún cuidador obtiene ubicación por el permiso Android solamente |
| Funciones telefónicas | Según modalidad elegida | Mostrar alternativa realmente disponible |

No se piden todos los permisos al abrir la app sin explicación. El comportamiento exacto por versión Android se concreta durante implementación. Se conserva la distinción entre denegar una función opcional y tener el recorrido esencial incompleto.

## 10. Sesiones, privacidad y errores

La identidad remota seleccionada es Supabase Auth, conforme al backend vigente. Android administra su propia sesión y presenta el access token a NestJS; el servidor determina los perfiles y acciones autorizados. El PIN local no sustituye esa identidad y FCM se utiliza solo para push. El mecanismo concreto de acceso y recuperación se implementa conforme a BE-03; no se comparte la sesión del cuidador con el teléfono de la persona [R1].

Si el token puede renovarse, la app recupera sesión sin pedir PIN en medio de una emergencia. Si fue revocada, deja de presentar acciones remotas como disponibles y conserva acceso al marcador de emergencias. La interfaz explica que no pudo enviar el aviso familiar.

Los errores diferencian identidad ausente, permiso denegado, vínculo retirado, invitación caducada y operación ya completada. El mensaje nunca muestra token, código secreto completo ni detalles de otro perfil.

## 11. Criterios de revisión y dependencias

Comprobar primer inicio, reanudación interrumpida, cambio de teléfono, invitación repetida, permiso denegado y vínculo revocado. Se debe verificar que un médico y un familiar con vínculos equivalentes reciben las mismas capacidades.

**Criterios relacionados:** FE-01, FE-02, FE-03, FE-04, FE-20 y FE-21.  
**Pendientes:** P-01, P-02, P-03 y P-07.  
**Referencia:** [R1 — Supabase Auth](https://supabase.com/docs/guides/auth).  
**Continuidad:** [D09 — Integración](09_Integracion_Backend_Baston_Persistencia_y_Sincronizacion.md) y [D10 — Verificación](10_Verificacion_Criterios_Aceptacion_y_Entrega.md).

## 12. Vinculación física y pasarela ESP32

La incorporación remota con serie y código, la autorización BLE y la designación de pasarela son pasos distintos. Guardar el bastón en backend no demuestra que el teléfono pueda controlarlo. El flujo debe completar identidad física, protocolo compatible, suscripción, consulta de estado y una prueba local antes de presentar conexión operativa.

El teléfono que lleva la persona utiliza la vinculación `user` y es la pasarela. Cambiarla en backend no revoca por sí solo las claves BLE guardadas en el bastón; la recuperación y sustitución local se diseñan en [ESP-04](../../ESP32/04_Contrato_BLE_Eventos_Comandos_y_Seguridad.md). La secuencia y recuperación de una incorporación parcial se detallan en [ESP-05](../../ESP32/05_Integracion_Android_Pasarela_y_Sincronizacion.md).
