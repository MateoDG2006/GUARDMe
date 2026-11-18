# GUARDMe — Plan de implementación, pruebas y aceptación

**Documento:** BE-10 de 10 · **Versión:** 1.2 · **Fecha:** 14 de noviembre de 2026  
**Estado:** desglose documental de la propuesta aprobada; no acredita implementación.  
**Origen:** secciones 18, 19, 20, 21 y 22 de [Propuesta de backend](https://chatgpt.com/library?file_id=libfile_856c231c19bc819186a42b13a9a6c5c4&account_id=personal).  
**Lectura del conjunto:** [BE-01 — Índice y trazabilidad](01_Vision_Alcance_Requisitos_y_Trazabilidad.md).

Las reglas confirmadas del producto se conservan. Las precisiones nuevas se identifican como diseño propuesto; los puntos abiertos de la propuesta original siguen pendientes de definición. Este documento no contiene código de aplicación ni despliega servicios.

**Revisión 1.3 (17 nov 2026):** identidad viva = Better Auth + PostgreSQL (implementado).

**Revisión 1.1:** autenticación con Supabase Auth (histórico).

## 1. Propósito y estado de esta entrega

Este documento convierte la propuesta y los nueve documentos anteriores en un plan verificable. Describe trabajo futuro; no se ha construido el backend, ejecutado pruebas de integración ni desplegado infraestructura como parte del desglose.

Una entrega se considera completa por evidencia del comportamiento acordado, no por número de pantallas ni por responder con datos simulados. Se distinguen reglas del dominio, transporte real y capacidad física.

## 2. Fases y dependencias

| Fase | Alcance | Evidencia para avanzar | Dependencias |
| --- | --- | --- | --- |
| F0. Viabilidad | BLE en segundo plano, push entre teléfonos, voz y emergencias | Informe de capacidades y limitaciones reales | Prototipo físico y destinos de prueba |
| F1. Identidad e incorporación | Better Auth, cuentas de dominio, accesos, pasarela y contactos | Sesiones y perfiles aislados; incorporación sin compartir cuenta del cuidador | BE-03 a BE-05 |
| F2. Incidencia y persistencia | Ventana local, cancelación y evento remoto | Reenvío sin duplicar y registro durable | F1 y contrato BLE |
| F3. Contacto y atención | Notificaciones, llamadas y decisiones | Orden 1–1–2–2 y detención verificable | Canal validado en F0 |
| F4. Agenda y seguimiento | Recordatorios compartidos y trabajo temporal | Reinicios sin pérdida; tiempos correctos | Consistencia de F2/F3 |
| F5. Ubicación y operación | Consentimiento, última posición y piloto | Posición real o exclusión explícita; restauración ensayada | Permisos y BE-09 |

F0 no es un permiso para implementar en esta entrega. Es la primera fase propuesta cuando se inicie construcción. Si el 911 automático no resulta viable, el alcance parcial se documentará antes de aceptar una versión como cumplimiento completo.

Las fases pueden solaparse en tareas independientes, pero no se presenta telefonía como disponible porque la base de datos ya funciona.

## 3. Paquetes de trabajo

| Paquete | Resultado documental previo | Resultado futuro de construcción |
| --- | --- | --- |
| Identidad | Matriz de acceso e incorporación resueltas | Cuenta y vínculos verificables |
| Persistencia | Diccionario, esquemas, RLS y autoridad de migración revisados | PostgreSQL de Supabase reproducible, sin alterar esquemas gestionados |
| Interfaces | Rutas, errores y eventos acordados | Contrato implementado y comprobado |
| Integración física | Protocolo, acuses y cancelación tardía definidos | Detección y comandos reales |
| Incidencias | Estados y casos alternativos cerrados | Transiciones idempotentes |
| Canales | Proveedor/modalidad y evidencia humana elegidos | Entrega y contacto observables |
| Agenda | Horarios, posposición y omisión definidos | Ocurrencias compartidas sin duplicados |
| Operación | Recuperación, límites y capacidad del piloto | Entorno supervisado |

No se asignan responsables personales ni fechas sin conocer el equipo. Cada paquete deberá tener un responsable y una evidencia de cierre al planificar ejecución.

## 4. Preparación antes de programar

Para cada paquete se necesita una regla clara, datos requeridos, entradas y salidas, errores, política de reenvío y criterio de aceptación. Las decisiones abiertas relevantes se cierran o se excluyen explícitamente de la entrega.

Ejemplos: no iniciar el adaptador de llamadas sin PD-01 a PD-04; no publicar edición de recordatorios de cuidador como permitida sin PD-08; no declarar ubicación en vivo cuando solo se dispone de una muestra antigua.

El resto de módulos puede diseñarse sin fingir que estos puntos están resueltos. Los contratos deben declarar capacidades disponibles y errores de integración no habilitada.

## 5. Niveles de prueba futuros

| Nivel | Qué verifica | Qué no demuestra |
| --- | --- | --- |
| Revisión documental | Coherencia y trazabilidad | Funcionamiento ejecutado |
| Unidad de dominio | Estados, permisos y reglas temporales | Entrega real de proveedor |
| Integración con datos | Transacciones, unicidad y recuperación | BLE ni teléfono |
| Contrato | Compatibilidad móvil/API/proveedor | Accesibilidad física |
| Extremo a extremo | Bastón, dos teléfonos y backend | Todas las condiciones de campo |
| Piloto | Comportamiento y medidas en contexto definido | Garantía universal |

Los dobles de prueba se identifican como tales. Un proveedor simulado es útil para ocupado, error y eventos desordenados, pero no demuestra que un número de Panamá reciba una llamada.

## 6. Matriz de aceptación

| Caso | Precondición y acción | Resultado esperado | Requisitos |
| --- | --- | --- | --- |
| T01 | Un cuidador accede a dos perfiles y otro se suma a uno | Relaciones compartidas sin duplicar personas | R01 |
| T02 | Mismo caso con familiar y médico | Capacidades equivalentes | R02 |
| T03 | Configurar desde cada posición inicial | Recorrido correspondiente, reanudable | R03 |
| T04 | App bloqueada con PIN; iniciar emergencia | Acción disponible; datos remotos siguen protegidos | R04 |
| T05 | Intentar incorporar por serie sin secreto | No obtiene posesión ni acceso | R05 |
| T06 | Caída detectada; observar primeros 30 segundos | Solo alarma de bastón, sin llamadas remotas | R06 |
| T07 | Cancelar por botón y por app en ejecuciones separadas | Misma semántica y evento resuelto | R07 |
| T08 | Reenviar dos veces la misma cancelación | Contador aumenta una vez | R08, R10 |
| T09 | Corte después de persistir y antes del acuse | Reenvío devuelve la misma incidencia | R09, R10 |
| T10 | Ningún contacto contesta | Orden 1–1–2–2, sin intentos simultáneos | R11 |
| T11 | Primer o segundo contacto responde | No se inician posiciones restantes | R12 |
| T12 | Responde un buzón | No se clasifica como humano sin política/evidencia | R12, PD-03 |
| T13 | Se agotan intentos | Escalamiento requerido; integración real identificada | R13 |
| T14 | Emergencia iniciada directamente | Registro manual y notificación; sin falsa llamada conectada | R14 |
| T15 | Dos cuidadores confirman encargarse a la vez | Un cierre y un seguimiento | R15, R10 |
| T16 | Posponer y avanzar cinco minutos | Aviso si sigue pendiente | R16 |
| T17 | Posponer y vencer dos horas | Aviso colectivo, sin ambulancia automática | R16 |
| T18 | Cerrar antes y después de las 7 a. m. | Consulta el día siguiente local a las 7 a. m. | R17 |
| T19 | Usuario no responde dos horas | Derivación al cuidador; plazo definido | R18 |
| T20 | Respuesta negativa y última consulta | Una sola consulta a tres días | R19 |
| T21 | Última respuesta negativa o ausencia de respuesta | Aliento/operación habitual o cierre inconcluso | R19 |
| T22 | Usuario intenta borrar recordatorio de cuidador directamente | Denegado y definición conservada | R20 |
| T23 | Dos participantes editan/consultan agenda | Cambios compartidos; conflicto explícito | R20 |
| T24 | Confirmar medicamento desde app y pulsar botón | Solo la acción de app declara estado | R21 |
| T25 | Publicar ubicación sin consentimiento o con muestra antigua | Control de acceso y antigüedad correctos | R22 |
| T26 | Quitar BLE o internet y reconectar | Estado discreto y eventos retrasados identificados | R23 |
| T27 | FCM acepta sin acuse del dispositivo | No figura leído ni atendido | R24 |
| T28 | Revocar cuidador con cursor/notificación antiguos | Sin nuevas lecturas o acciones | R25 |
| T29 | Reiniciar trabajador después de crear efecto pendiente | Recuperación sin perder trabajo | R26 |
| T30 | Repetir/desordenar eventos de proveedor tras cierre | Sin reabrir ni duplicar llamadas | R10, R26 |
| T31 | JWT de otro proyecto, expirado o inválido | Rechazo antes de acceder al dominio | R27 |
| T32 | Consultas como rol real de API, sin propietario ni BYPASSRLS | RLS permite solo perfiles autorizados y deniega contexto ausente | R28 |
| T33 | Publishable key o acceso directo a Data API intenta leer guardme | Dominio no expuesto ni accesible por esa vía | R28 |
| T34 | Revisar configuración que recibe Android | Sin claves secretas, service_role ni contraseña SQL | R27, R28 |
| T35 | Identidad anónima sin código; código reutilizado; reincorporación autorizada | Sin acceso antes de vincular; uso único; mismo perfil sin compartir sesión | R29 |
| T36 | Sesión cerrada o instalación revocada con JWT todavía no expirado | GuardMe rechaza nuevas operaciones por comprobación activa | R27 |
| T37 | Reproducir migraciones del dominio y comparar esquema ORM | Una sola autoridad; roles/RLS incluidos; Auth gestionado preservado | R30 |
| T38 | Intercalar peticiones A/B reutilizando conexiones del pool | Contexto limitado a transacción, sin fuga de filas entre usuarios | R28 |

Los códigos Rxx corresponden a BE-Rxx del catálogo BE-01. Cada ejecución deberá adjuntar fecha, versión, entorno, resultado y evidencia. “Pendiente por integración” no se registra como aprobado.

## 7. Ensayos temporales y calendario

Las pruebas de reglas utilizan un reloj controlado, sin esperas reales de horas o días. Se cubren cinco minutos, dos horas, siguiente día a las 7:00 a. m. y tres días, incluidos cambios de fecha.

Los ensayos reales comprueban que Android conserva los avisos en segundo plano, tras bloqueo y tras reinicio, según las capacidades elegidas. La simulación temporal no valida por sí sola esas restricciones.

Si la zona del perfil cambia, la política elegida debe producir un único vencimiento explicable. El historial conserva tiempo previsto y efectivo.

## 8. Ensayos de fallo y concurrencia

Inyectar cortes antes/después de confirmar transacción, fallo del trabajador durante envío, respuesta externa incierta, webhook repetido y cambio de acceso durante una tarea.

Comprobar que ningún reintento inventa una segunda identidad del evento. La afirmación “entrega al menos una vez” se traduce en pruebas de repetición, no en confianza de que el gestor de cola ejecutará una sola vez.

Después de restaurar una copia, comprobar llamadas ya hechas y revocaciones recientes. La recuperación no debe repetir acciones antiguas automáticamente.

El volumen de prueba se dimensiona con PD-11; no se anuncian cifras de usuarios concurrentes sin ensayo.

## 9. Evidencia de recorrido real

El expediente de una prueba de caída debe permitir reconstruir:
1. Detección física e ID.
2. Ventana de 30 segundos y resultado.
3. Persistencia local y envío.
4. Incidencia remota y confirmación.
5. Aviso e intento de contacto.
6. Respuesta humana y decisión.
7. Cierre o escalamiento requerido.
8. Seguimiento programado.

Se conservan identificadores, tiempos y resultados mínimos, sin grabar audio, PIN ni datos personales innecesarios. Los destinos de telefonía deben ser de participantes o servicios de prueba autorizados.

No se usa una llamada rutinaria al 911 para comprobar una integración. Cualquier validación específica debe estar coordinada y documentada.

## 10. Decisiones y riesgos que condicionan la entrega

| Pendiente | Impacto si sigue abierto | Tratamiento |
| --- | --- | --- |
| Canal y respuesta humana | No puede aceptarse contacto automático completo | Cerrar PD-01/PD-03 en F0 |
| Vía al 911 | Requisito automático no cumplido | Validar o declarar alcance parcial |
| Menos de dos contactos | Secuencia no definida | Resolver PD-04 antes del piloto |
| Tiempos y destinatarios | Tareas no tienen expectativa verificable | Cerrar PD-05/PD-06/PD-07 |
| Autoría y cambios de agenda | Posible permiso ambiguo | Cerrar PD-08 |
| Identidad supervisada | Recuperación/integración incompletas | Cerrar PD-09 |
| Antigüedad y conservación | Reenvíos podrían activar acciones indebidas | Cerrar PD-10 |
| Contrato BLE | Cancelación y eventos no interoperables | Cerrar PD-12 |

Una limitación de alcance debe aparecer tanto en la documentación como en la interfaz y en los resultados del piloto. No se compensa con una animación o texto de éxito.

## 11. Definición de terminado

Para un módulo: reglas revisadas, interfaz acordada, persistencia consistente, errores observables y pruebas pertinentes con evidencia. Para una integración: además transporte real y límites conocidos.

Para el recorrido completo: bastón y dos teléfonos reales, decisiones compartidas, historial persistente, recuperación ensayada y capacidad de emergencia declarada con precisión. Ubicación puede quedar para siguiente versión conforme a la excepción acordada.

Se entrega una lista explícita de pruebas aprobadas, fallidas y no ejecutadas, versiones probadas y decisiones pendientes. La documentación actual solo prepara esa futura lista; no la rellena con resultados supuestos. La matriz de la revisión 1.1 contiene 38 casos, incluidos los ocho específicos de Supabase. Se verifican sesión y RLS con las conexiones de ejecución reales, no con el rol administrador de la consola.

### Transición de la base documental

La revisión 1.1 reemplaza Firebase Authentication por Supabase Auth y selecciona PostgreSQL de Supabase. No existe una migración de usuarios o datos ejecutada en esta entrega. Si más adelante aparece una instalación previa, se deberá inventariar y planificar la correspondencia de identidades antes de modificar datos. FCM sigue siendo el canal push.

## 12. Revisión de este conjunto documental

La revisión ESP32 agrega las dependencias de [ESP-07](../../ESP32/07_Plan_Implementacion_Pruebas_y_Aceptacion.md) sin renumerar los casos backend. Para cerrar la integración se exigen especialmente cancelación y vencimiento en ambos órdenes y concurrentes (ESP-T21–23), reenvío tras respuesta perdida (ESP-T11), reinicio con tiempo incierto (ESP-T12) y recorrido real entre teléfonos (ESP-T18). Los contratos y el arbitraje necesarios están en [ESP-06](../../ESP32/06_Integracion_Backend_BetterAuth_y_Contratos_API.md). No se marcan pruebas aprobadas por añadirlas al plan.

La revisión debe confirmar exactamente diez documentos, cobertura de las 22 secciones originales, enlaces internos válidos y ausencia de cambios a reglas confirmadas. Los desarrollos adicionales se mantienen como propuestas.

La aplicación y el firmware no se modifican como parte de esta entrega. No se crean migraciones, endpoints, scripts de despliegue ni recursos facturables. Los únicos entregables del desglose son documentos y su paquete de descarga.

Relacionado: [BE-01](01_Vision_Alcance_Requisitos_y_Trazabilidad.md) para índice y requisitos; [BE-06](06_Incidencias_Llamadas_Escalamiento_y_Atencion.md) para telefonía; [BE-07](07_Notificaciones_Tareas_Recordatorios_y_Seguimientos.md) para calendario; [BE-08](08_Integracion_Movil_Baston_Telemetria_y_Ubicacion.md) para físico/móvil; [BE-09](09_Seguridad_Privacidad_Despliegue_y_Operacion.md) para operación.

