# GUARDMe — Seguridad, privacidad, despliegue y operación

**Documento:** BE-09 de 10 · **Versión:** 1.1 · **Fecha:** 14 de noviembre de 2026  
**Estado:** desglose documental de la propuesta aprobada; no acredita implementación.  
**Origen:** secciones 6, 7, 13, 14, 16, 17 y 20 de [Propuesta de backend](https://chatgpt.com/library?file_id=libfile_856c231c19bc819186a42b13a9a6c5c4&account_id=personal).  
**Lectura del conjunto:** [BE-01 — Índice y trazabilidad](01_Vision_Alcance_Requisitos_y_Trazabilidad.md).

Las reglas confirmadas del producto se conservan. Las precisiones nuevas se identifican como diseño propuesto; los puntos abiertos de la propuesta original siguen pendientes de definición. Este documento no contiene código de aplicación ni despliega servicios.

**Revisión 1.3 (17 nov 2026):** identidad viva = Better Auth + PostgreSQL (implementado).

**Revisión 1.1:** autenticación con Supabase Auth (histórico).

## 1. Objetivo

Este documento define controles y procedimientos que deberán existir al desplegar GuardMe. No acredita una auditoría, certificación ni cumplimiento legal; tampoco crea infraestructura.

El objetivo operativo es conservar el significado de una emergencia aun cuando fallen red, procesos o proveedores. Un sistema que sigue respondiendo peticiones puede estar degradado si no entrega avisos o no procesa llamadas. Esa diferencia debe ser visible.

## 2. Superficies y controles

| Superficie | Riesgo concreto | Control propuesto |
| --- | --- | --- |
| Identidad | Uso de sesión retirada | Validación de token, revocación e instalación |
| Perfil | Acceso por conocer un identificador | Autorización por relación vigente |
| Incorporación | Apropiación por serie pública | Secreto temporal y posesión/proximidad |
| Invitaciones | Reutilización o enumeración | Uso único, caducidad, límites y respuesta discreta |
| Proveedor | Webhook falso o repetido | Firma, deduplicación y correlación |
| Push | Exposición en pantalla bloqueada | Resumen mínimo y detalle protegido |
| Ubicación | Consulta tras revocación | Consentimiento actual en cada lectura |
| Recordatorios | Borrado prohibido desde cliente modificado | Regla de autoría en servidor |
| Operación | Reenvío masivo de llamadas | Reconciliación y límites por acción |
| Logs/copias | Exposición de datos y secretos | Minimización, acceso restringido y conservación |

Familiar y médico siguen teniendo las mismas capacidades funcionales. Los controles se aplican a ambos sin introducir jerarquías nuevas.

## 3. Identidad y autorización

La API valida el access token de Better Auth y el estado local. Cada operación con perfil verifica relación vigente, instalación cuando corresponda y condiciones del recurso.

Un token firmado con acceso retirado no conserva privilegios sobre el perfil. La app no amplía permisos enviando categoría o un perfil distinto. El cierre de sesión de Auth no vuelve inválido criptográficamente todo JWT aún vigente: GuardMe valida sesión activa mediante comprobación restringida de session_id y conserva su registro de instalaciones revocadas y vínculos actuales. No se deduce revocación inmediata solo de validar firma.

Las credenciales del proveedor, claves de telefonía y acceso a base de datos pertenecen al servidor. No se distribuyen a Android. El token push identifica un destino de entrega, no autoriza a consultar datos.

### Capas de autorización de Supabase

| Capa | Decisión de esta base |
| --- | --- |
| Identidad | Better Auth y sesión/bearer verificados |
| Sesión | Comprobación restringida de sesión e instalación vigente |
| Negocio | Vinculación al perfil, origen y estado de operación |
| Esquema | guardme privado; Data API deshabilitada en esta arquitectura |
| Filas | RLS aplicada al rol ordinario no propietario de API |
| Operación interna | Rol del trabajador separado; acciones limitadas y auditadas |

La conexión Prisma no hereda el contexto del SDK de Auth. NestJS debe establecer claims verificados y locales a cada transacción, con políticas para el rol SQL real. Los permisos de ese rol no incluyen propiedad de tablas ni BYPASSRLS. Las conexiones de administrador no se usan para demostrar que RLS funciona.

Si se emplean auxiliares de autorización o comprobación de auth.sessions, solo devuelven la información mínima necesaria; el cliente no recibe acceso al esquema auth. Revisar recursión, privilegios del creador y permisos de ejecución de funciones.

Los procesos tendrán los permisos necesarios para su función. Las migraciones requieren privilegios distintos de los de consulta/operación ordinaria. Se documentará quién puede cambiar secretos, restaurar datos o reprocesar trabajo.

## 4. Protección de comunicaciones y datos

HTTPS protege operaciones remotas. La configuración del almacenamiento y sus copias debe incluir cifrado y acceso controlado según el servicio elegido; se verificará en la infraestructura real en lugar de asumirlo por usar una marca comercial.

Se minimizan datos: última ubicación sin recorridos por defecto; evento de caída sin aceleración continua; resultados de llamada sin grabación por defecto; contador agregado de falsas alarmas.

La información guardada localmente en Android requiere políticas de caché, copia y revocación. El servidor no puede garantizar retirar una captura o una copia descargada por un teléfono desconectado.

La retención debe acordarse por clase de dato. No se impone un período legal ni un registro médico adicional no solicitado.

## 5. Auditoría y trazabilidad

Registrar actor, perfil, operación, resultado, instante y correlación para incorporación, revocación, cambio de prioridad, consentimiento, decisión de atención y modificación relevante de agenda.

No registrar PIN, contraseñas, tokens completos, secretos de invitación ni contenidos innecesarios de ubicación o medicación. Los diagnósticos de transporte deben usar identificadores y códigos de error.

La auditoría no se utiliza como una segunda base de datos completa de todos los datos personales. Su acceso se restringe y su finalidad es explicar cambios y operaciones.

## 6. Límites y abuso

Los límites deben considerar categoría de operación. El exceso de telemetría no debe consumir la capacidad destinada a enviar una incidencia legítima. La autenticación y deduplicación se mantienen incluso en rutas urgentes.

Se proponen límites por instalación y principal, presupuestos de llamadas, caducidad de órdenes y reintentos acotados. Su configuración se medirá en el piloto; no se fija una cuota arbitraria en el producto.

Una secuencia de fallos de proveedor puede activar degradación operativa y conciliación. No se responde con nuevas llamadas ilimitadas ni se borra el incidente para reducir carga.

## 7. Entornos y configuración

| Entorno | Datos | Integraciones | Finalidad |
| --- | --- | --- | --- |
| Desarrollo | Ficticios | Dobles de prueba o servicios aislados | Reglas y contratos |
| Integración | Perfiles de prueba | Dos teléfonos y bastón; canales autorizados | Recorrido real |
| Piloto | Participantes y configuración definidos | Proveedores validados | Medición y operación supervisada |

Cada entorno separa identidad, credenciales, base de datos y destinos. Una incidencia de pruebas no debe llegar a contactos reales no participantes.

El inventario de configuración incluye proyecto/URL de Supabase, emisor y claves públicas de verificación, publishable key para el SDK de Auth, conexiones SQL por rol, opciones de incorporación, SMTP y redirecciones autorizadas, FCM, telefonía, zona y políticas de tareas. Los clientes solo reciben configuración pública de Auth. Las claves secretas o service_role se reservan a operaciones administrativas aisladas del servidor y nunca se incluyen en Android, documentos de distribución ni logs. Los secretos no se incorporan a documentos públicos.

Las capacidades no integradas se anuncian como tales. No se activa una bandera de “911 disponible” sin evidencia de la fase de viabilidad.

## 8. Topología de despliegue

Se propone API y trabajador en ejecución continua, con PostgreSQL y Auth gestionados por Supabase. Cada entorno usa su proyecto y configuración de identidad independientes; un JWT de desarrollo debe rechazarse en piloto. Comparten dominio y datos, pero pueden reiniciarse por separado.

Un entorno que se suspenda por inactividad afecta al tiempo de respuesta de avisos. El plan del proveedor debe revisarse con los requisitos del piloto; no se asume aptitud por tener un nivel gratuito.

La publicación debe mantener compatibilidad con aplicaciones ya instaladas. Los cambios de esquema se prueban con datos de ensayo y se prefieren ampliaciones compatibles antes de retirar campos.

Las migraciones del dominio, roles y RLS se publican desde un único historial Supabase CLI. Prisma deriva el modelo de consulta y no aplica migraciones paralelas. Auth y otros esquemas gestionados quedan fuera de esa autoridad. El trabajador usa pool dedicado y conexión directa o de sesión cuando lo requiera su operación; la API puede usar pool transaccional si se verifica el aislamiento del contexto.

El trabajador deja de tomar trabajo nuevo durante una parada ordenada y conserva acciones en curso para recuperación. Detener el proceso no equivale a cancelar una llamada externa ya creada.

## 9. Salud, métricas y alarmas operativas

| Señal | Qué revela | Acción de diagnóstico |
| --- | --- | --- |
| Antigüedad de trabajo disponible | Retraso del trabajador | Revisar proceso, base y cuotas |
| Latencia registro–publicación | Tiempo interno hasta intentar aviso | Separar API, cola y proveedor |
| Ratio de fallos por canal | Integración degradada | Revisar credenciales y servicio |
| Llamadas de resultado incierto | Posible efecto externo sin confirmación | Conciliar antes de reintentar |
| Pasarela sin actividad | Datos potencialmente desactualizados | Mostrar antigüedad, no inferir caída |
| Entregas sin recepción | Falta de evidencia de dispositivo | Revisar permisos/conectividad |
| Conflictos de versión | Decisiones simultáneas | Comprobar coordinación |
| Conexiones y almacenamiento | Saturación de datos | Ajustar consultas y dimensionado |

La salud del proceso y la disponibilidad de función se exponen por separado. La API puede aceptar y guardar un incidente mientras FCM está caído, pero debe mostrarse entrega pendiente y modo degradado.

Los umbrales se fijan con mediciones del piloto. No se anuncia disponibilidad contractual ni una latencia garantizada sin evidencia.

## 10. Procedimientos de recuperación

### Base de datos no disponible

No confirmar persistencia que no ocurrió. Android conserva el evento para reenvío. Al recuperar, se procesan las claves originales y se aplica antigüedad. El monitoreo distingue fallo de base y corte del cliente.

### FCM degradado

Conservar las notificaciones pendientes y sus fallos; reintentar dentro de vigencia. No marcar cuidador informado. Las llamadas siguen siendo un canal independiente solo si están integradas y la política permite ejecutarlas.

### Telefonía degradada o incierta

Registrar intento y error. Una solicitud de resultado ambiguo se consulta antes de repetir. Si no hay capacidad, conservar escalamiento requerido y avisar de la limitación mediante canales disponibles.

### Trabajador detenido

Reiniciarlo y recuperar trabajos compatibles. Verificar cierres y decisiones antes de ejecutar vencidos. Reprocesar no significa repetir todo el historial.

### Instalación perdida o acceso retirado

Revocar instalación/pasarela o vinculación según el caso. Conservar historial, emitir nueva incorporación y comprobar que la instalación anterior ya no accede.

Estos procedimientos son instrucciones documentales, no acciones ejecutadas en el equipo del usuario.

## 11. Copias, restauración y reconciliación

Definir objetivos de pérdida máxima de datos y tiempo de recuperación para el piloto, su mecanismo de copia y responsable. La disponibilidad de copias, restauración puntual y retención se comprueba en el plan de Supabase seleccionado. La restauración debe revisar datos de Auth y asociaciones del dominio, sin reutilizar sesiones reales en entornos de prueba ni perder revocaciones recientes. La evidencia debe incluir una restauración ensayada y tiempo medido, no solo una opción activada en un panel.

Después de restaurar se revisan:
1. Incidencias que pudieron confirmarse externamente después de la copia.
2. Llamadas y notificaciones ya ejecutadas.
3. Claves idempotentes y referencias de proveedor.
4. Revocaciones y consentimientos recientes.
5. Vencimientos y trabajo atrasado.

Restaurar puede devolver a pendiente una acción que ya llamó a alguien. La conciliación evita repetir ese efecto. Los resultados externos son hechos que la base restaurada puede desconocer temporalmente.

## 12. Presupuesto y capacidad

| Partida | Variables que se medirán |
| --- | --- |
| Supabase PostgreSQL | Plan, tamaño, copias, conexiones y tráfico |
| API/trabajador | Instancias, memoria, CPU y disponibilidad |
| Supabase Auth | Método, usuarios activos y correo/SMS según configuración elegida |
| Telefonía | Minutos, países, números y funciones |
| Logs/métricas | Volumen y conservación |
| Ubicación/mapas | Capturas, consultas y servicios elegidos |

El tamaño del piloto PD-11 debe indicar bastones, personas, cuidadores por perfil, teléfonos, incidencias de prueba, recordatorios y llamadas estimadas. Con esos datos se solicita presupuesto actual al proveedor; este documento no inventa precios.

## 13. Puerta de operación

Antes de un piloto deben estar resueltos acceso, secretos, restauración, observabilidad, reconciliación, límites de llamada y capacidades realmente disponibles. Se añade verificación de RLS con los roles reales, esquemas no expuestos, aislamiento entre usuarios al reutilizar conexiones, cierre de sesiones y recuperación de identidad supervisada. El escalamiento 911 se verifica por separado.

Relacionado: [BE-03](03_Identidad_Usuarios_Permisos_y_Configuracion_Inicial.md), [BE-04](04_Modelo_de_Datos_Diccionario_y_Persistencia.md), [BE-07](07_Notificaciones_Tareas_Recordatorios_y_Seguimientos.md) y [BE-10](10_Plan_de_Implementacion_Pruebas_y_Aceptacion.md). Las capacidades técnicas proceden de S3, S5, S8–S22 de la propuesta vigente; las prácticas operativas aquí descritas son diseño específico para GuardMe, no certificaciones del proveedor.

