# GUARDMe — Identidad, usuarios, permisos y configuración inicial

**Documento:** BE-03 de 10 · **Versión:** 1.1 · **Fecha:** 14 de noviembre de 2026  
**Estado:** desglose documental de la propuesta aprobada; no acredita implementación.  
**Origen:** secciones 6, 7, 11 y 20 de [Propuesta de backend](https://chatgpt.com/library?file_id=libfile_856c231c19bc819186a42b13a9a6c5c4&account_id=personal).  
**Lectura del conjunto:** [BE-01 — Índice y trazabilidad](01_Vision_Alcance_Requisitos_y_Trazabilidad.md).

Las reglas confirmadas del producto se conservan. Las precisiones nuevas se identifican como diseño propuesto; los puntos abiertos de la propuesta original siguen pendientes de definición. Este documento no contiene código de aplicación ni despliega servicios.

**Revisión 1.3 (17 nov 2026):** identidad viva = **Better Auth** (`POST /v1/auth/...`) + PostgreSQL. Supabase Auth ya no es el proveedor actual (ver plan BetterAuth_20261117 — implementado).

**Revisión 1.1:** autenticación con Supabase Auth (histórico).

## 1. Objetivo y conceptos

Esta especificación desarrolla el acceso de las dos experiencias móviles y su incorporación al sistema. La selección inicial “usuario” o “cuidador” adapta el recorrido, pero no es autenticación ni concede acceso a otros perfiles.

| Concepto | Identifica | Ejemplo |
| --- | --- | --- |
| Cuenta | Principal autenticado | Una cuidadora con su sesión propia |
| Perfil asistido | Persona que usa bastón | Una persona con dos bastones asignados |
| Acceso | Relación cuenta–perfil | Cuidadora autorizada sobre ese perfil |
| Categoría | Contexto de cuidador | Familiar o médico, con iguales capacidades |
| Instalación | Copia de app en un teléfono | Teléfono de la persona con token push |
| Pasarela | Instalación autorizada para un bastón | Teléfono que recibe sus eventos BLE |

Una cuenta puede ser cuidadora de un perfil y usuario de otro. Un teléfono puede iniciar una sesión nueva sin convertirse por eso en la pasarela de todos sus perfiles.

## 2. Autenticación remota con Better Auth

La cuenta del dominio se vincula al usuario de Better Auth. Better Auth administra credenciales en PostgreSQL; GuardMe conserva nombres, estado, vinculaciones y preferencias sin duplicar contraseñas.

La app inicia sesión con `POST /v1/auth/sign-in/email` y presenta el bearer token a NestJS. Una sesión revocada o ausente no autoriza dominio.

Como base de incorporación de cuidadores se usa cuenta recuperable con correo y contraseña. El correo o teléfono no concede acceso por coincidir con un contacto.

GuardMe comprueba además cuenta, instalación y accesos vigentes. La sesión se asocia a la instalación. El cierre local/global se especifica de forma explícita: cerrar una instalación no debe retirar silenciosamente todas las sesiones de un cuidador. Retirar una vinculación se aplica inmediatamente en GuardMe y RLS.

## 3. Autorización por perfil

Cada petición a datos asistidos requiere una vinculación activa. No se aceptan como prueba el perfil seleccionado en pantalla, el número telefónico, el rol enviado en la petición ni el código de serie del bastón.

| Operación | Usuario del perfil | Familiar vinculado | Médico vinculado |
| --- | --- | --- | --- |
| Leer estado e historial | Permitido | Permitido | Permitido |
| Crear recordatorio | Permitido | Permitido | Permitido |
| Borrar recordatorio del usuario | Permitido | Permitido | Permitido |
| Borrar recordatorio de cuidador | Denegado | Permitido dentro del perfil | Permitido dentro del perfil |
| Gestionar contactos y vinculaciones | Permitido tras desbloqueo local | Igual | Igual |
| Leer ubicación remota | Según contexto propio | Consentimiento y acceso vigentes | Idéntica condición |
| Confirmar asistencia de cuidador | No se atribuye como cuidador por defecto | Permitido | Permitido |
| Retirar acceso ajeno | Dentro del perfil autorizado | Misma capacidad | Misma capacidad |

La matriz conserva la propuesta aprobada. No crea un rol “médico administrador”, ni un familiar principal obligatorio. La consulta remota de ubicación puede estar deshabilitada para todos aunque las vinculaciones estén activas.

Modificar/desactivar recordatorios creados por un cuidador y registrar medicación en nombre de la persona son políticas abiertas PD-08. Hasta resolverlas, el contrato no las presentará como capacidades ya definidas.

## 4. PIN y emergencias

El PIN protege la entrada y administración de GuardMe en la instalación. Su comprobación local no autentica al servidor. Una sesión ya establecida permite enviar una emergencia sin volver a introducir el PIN.

Si la sesión no puede usarse, la acción local de contactar emergencias no debe desaparecer; la app debe mostrar por separado que el aviso remoto no fue enviado. No se crea una API pública para consultar el perfil o reportar incidentes ajenos sin autenticación.

El verificador del PIN requiere almacenamiento protegido, limitación de intentos y un procedimiento de recuperación. Android Keystore puede proteger claves; no implementa por sí mismo el PIN de GuardMe. No se envía ni registra el PIN como texto.

La recuperación del PIN propio y la recuperación de la cuenta remota son operaciones diferentes. Restablecer una no debe incorporar bastones ni ampliar vinculaciones silenciosamente.

## 5. Configuración por el usuario del bastón

| Paso | Acción | Estado comprobable |
| --- | --- | --- |
| 1 | Indicar que configura su propio uso | Intención de incorporación guardada |
| 2 | Autenticarse | Cuenta local vinculada a identidad válida |
| 3 | Crear o recuperar su perfil | No hay duplicado por repetir el paso |
| 4 | Definir PIN | Protección local configurada |
| 5 | Incorporar bastón | Posesión/proximidad y asignación confirmadas |
| 6 | Asociar teléfono pasarela | Instalación autorizada y enlace probado |
| 7 | Registrar contactos | Prioridades y formato validados |
| 8 | Invitar cuidadores | Invitaciones o accesos con estado real |
| 9 | Decidir ubicación | Consentimiento separado de permisos Android |
| 10 | Probar el recorrido | Evidencias reales o limitaciones visibles |

La configuración es reanudable. Cerrar la app no debe perder un perfil creado ni consumir otra vez un secreto ya utilizado. Los pasos incompletos conservan su motivo: permiso no concedido, bastón no encontrado, invitación pendiente o proveedor no integrado.

## 6. Configuración por un cuidador

El cuidador usa su cuenta. Selecciona su categoría con finalidad descriptiva, crea un perfil asistido o acepta una invitación existente y configura los dispositivos correspondientes.

Crear otro perfil solo por añadir un segundo cuidador es un error de modelado. El acceso se agrega al perfil ya existente mediante una invitación emitida desde ese contexto.

La persona asistida puede tener identidad propia o una identidad supervisada para su teléfono. El cuidador no debe dejar su sesión personal con acceso a todos sus perfiles en el teléfono de la persona.

Antes de dar por completada la incorporación se verifica que el teléfono que llevará la persona, y no solamente el del cuidador, recibe eventos del bastón y puede enviar una incidencia.

## 7. Incorporación asistida con identidad Supabase

El usuario puede tener cuenta propia recuperable. Para el teléfono de una persona que no gestiona credenciales, la propuesta revisada utiliza una sesión anónima de Supabase Auth como identidad técnica, seguida de incorporación autorizada al perfil. No se comparte la sesión personal del cuidador ni se fabrican tokens de Firebase.

Recorrido:
1. Un cuidador autenticado y autorizado genera un código temporal para un perfil.
2. El teléfono de la persona crea una sesión anónima de Supabase Auth, si esta capacidad está habilitada.
3. Esa identidad todavía no tiene acceso a perfiles, bastones, ubicación o historial.
4. Presenta su sesión y el código a la operación de consumo de GuardMe.
5. El servidor valida emisor, vigencia, uso único, instalación y propósito.
6. Una transacción crea/resuelve la cuenta de dominio y su vinculación al perfil correcto.
7. Se registra la pasarela, y las funciones de usuario se autorizan por esa vinculación.

Los usuarios anónimos de Auth tienen un UUID y sesión, y no equivalen a una petición sin autenticar. La pertenencia al rol authenticated por sí sola no concede acceso de producto; antes de vincular solo se permiten las operaciones acotadas de incorporación.

Una identidad anónima no puede recuperarse como si tuviera correo/contraseña después de perder la sesión. La recuperación exige reincorporar una identidad nueva al perfil existente, revocar la instalación anterior y conservar su autoría histórica; alternativamente puede añadirse un método recuperable. El PIN local no sustituye esos pasos.

Antes del piloto se concretarán protección antiabuso, límites, limpieza de identidades nunca vinculadas y procedimiento de recuperación. La limpieza no elimina usuarios ya vinculados solo por tener is_anonymous; podría dejar sin sesión a una persona. Esta precisión desarrolla PD-09 sin cambiar las capacidades equivalentes de los cuidadores.

## 8. Invitaciones de cuidadores

| Estado | Significado | Acción disponible |
| --- | --- | --- |
| Pendiente | Invitación emitida y aún no consumida | Aceptar, retirar o caducar |
| Aceptada | Cuenta autenticada incorporada | Consultar acceso creado |
| Retirada | Emisor autorizado la invalidó | No puede aceptarse |
| Caducada | Terminó su vigencia | Emitir otra invitación |
| Rechazada | Destinatario decidió no incorporarse | Conservar evidencia mínima |

La invitación de cuidado es una operación de GuardMe distinta de una invitación de registro enviada por Supabase Auth. Aceptar un correo de Auth no agrega por sí solo una vinculación asistencial. El secreto de GuardMe se guarda resumido y no se escribe completo en auditoría. La invitación no permite enumerar perfiles ni consultar datos antes de aceptarse.

Si se envía a un destinatario concreto, la aceptación debe resolver esa identidad conforme al método elegido. Conocer un nombre no basta. Una invitación ya consumida devuelve su resultado idempotente al mismo principal; no incorpora una segunda cuenta.

No se envían invitaciones reales durante esta entrega documental.

## 9. Bastón y pasarela

El registro de fábrica o de prototipo contiene identificador y mecanismo de incorporación. La serie puede ser pública y no debe funcionar como contraseña. El desafío de posesión y la confirmación BLE se desarrollan en BE-08.

Se propone una sola pasarela activa por bastón. El backend utiliza una operación transaccional para cerrar la autorización anterior y abrir la nueva, evitando dos instalaciones activas por una carrera de peticiones.

La reasignación conserva el historial de titularidad. La persona nueva no hereda eventos ni ubicación de la anterior. El cuidador anterior no puede consultar la nueva asignación.

El estado “vinculado” no prueba conexión BLE presente. El estado “conectado” necesita una observación reciente de la pasarela.

## 10. Consentimiento de ubicación

Se registra qué perfil comparte, quién autorizó, en qué momento, alcance y revocación. El permiso Android es independiente: puede existir consentimiento y faltar permiso del sistema, o viceversa.

La autorización se comprueba al publicar y consultar. Una revocación invalida lecturas posteriores aunque el cliente conserve un identificador o una notificación antigua. Los avisos no incluirán coordenadas exactas que sobrevivan a ese control de acceso.

La condición de familiar o médico no exime del consentimiento. La incorporación no debe activar ubicación mediante una opción preseleccionada sin reflejar la decisión tomada.

## 11. Retirada, recuperación y casos límite

Retirar un cuidador impide nuevas operaciones, notificaciones dirigidas y consultas por cursor. El historial conserva su autoría. La aplicación recibe una señal de sincronización y limpia datos de consulta cuando corresponda; el servidor no puede garantizar borrar copias que un teléfono desconectado ya haya guardado.

Cuenta bloqueada, instalación revocada y acceso revocado tienen consecuencias distintas. No se debe borrar el perfil para desactivar un teléfono perdido.

Si se pretende retirar el último acceso capaz de administrar un perfil, se recomienda advertir y ofrecer recuperación o transferencia. Esa política es una precisión propuesta que debe validarse; no introduce un cuidador principal.

La verificación de identidad para recuperar una cuenta no se sustituye por saber el nombre o el número del bastón.

## 12. Aceptación documental y referencias

Debe poder recorrerse la incorporación desde ambas posiciones, distinguir PIN de autenticación y demostrar equivalencia familiar/médico. Los ensayos incluyen invitación repetida, caducada y retirada; cuenta ajena con identificador correcto; cambio de pasarela; recuperación y revocación.

Relacionado: [BE-04](04_Modelo_de_Datos_Diccionario_y_Persistencia.md) para entidades, [BE-05](05_Contratos_API_Eventos_y_Sincronizacion.md) para contratos y [BE-09](09_Seguridad_Privacidad_Despliegue_y_Operacion.md) para protección y auditoría. Fuentes de la propuesta: S8, S9, S10 y S20, incluidos [JWT de Supabase](https://supabase.com/docs/guides/auth/jwts), [sesiones](https://supabase.com/docs/guides/auth/sessions) y [acceso anónimo](https://supabase.com/docs/guides/auth/auth-anonymous).

