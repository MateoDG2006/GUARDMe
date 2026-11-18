# Hand-off — implementación en GuardMeMobile

**Para:** agente de código / desarrollador Android (Jetpack Compose).  
**Apps:** experiencia Persona + experiencia Cuidador en [GuardMeMobile](../../GuardMeMobile).  
**Specs:** [01-fundamentos.md](01-fundamentos.md) · [02-persona.md](02-persona.md) · [03-cuidador.md](03-cuidador.md).  
**Este documento no incluye código de producción.** Define orden, restricciones y criterios verificables.

---

## 1. Estado actual del proyecto

- [MainActivity.kt](../../GuardMeMobile/app/src/main/java/com/example/guardmemobile/MainActivity.kt): plantilla «Hello Android».
- Tema en [Color.kt](../../GuardMeMobile/app/src/main/java/com/example/guardmemobile/ui/theme/Color.kt) / [Theme.kt](../../GuardMeMobile/app/src/main/java/com/example/guardmemobile/ui/theme/Theme.kt): paleta morada Material + **dynamic color activo**. Debe reemplazarse por tokens GuardMe y **desactivar `dynamicColor`** (tema claro fijo).
- Tipografía: default; embeber Figtree + Atkinson Hyperlegible (licencia SIL OFL, ya referenciada en el prototipo).
- Dependencias: Compose BOM + Material 3. Falta Navigation Compose, ViewModel, etc. según el plan de implementación (fuera de esta spec de UI).

---

## 2. Orden sugerido de construcción

1. **Tokens y tema**
   - Colores, tipografías, shapes (radios), tipografía roles.
   - `GuardMeMobileTheme(dynamicColor = false)`, solo light scheme.
2. **Componentes base**
   - PrimaryButton (brown / emergency / ok), OutlineButton, Card, Chip, Avatar, TabBar (4 y 5 ítems), Toast, BottomSheet, FullScreenOverlay.
3. **Navegación Persona**
   - 4 tabs + overlays (911, caída, pastilla, bastón sonando, ayuda).
4. **Pantallas Persona de detalle**
   - Contactos (lista + editar), Recordatorios (Hoy/Semana), Bastón.
5. **Navegación Cuidador**
   - 5 tabs.
6. **Pantallas Cuidador críticas**
   - Alerta de caída → Ubicación en vivo → Notificaciones.
7. **Cuidador resto**
   - Historial, Recordatorios + Nuevo, Bastón, Equipo + Invitar + Ficha.
8. **Cableado de datos / BLE / backend** (fuera de UI docs)
   - Temporizadores 5 s / 30 s, notificaciones push, mapa real.

Cada paso debe pasar los criterios de aceptación de la spec correspondiente antes de seguir.

---

## 3. Qué del design system se toca

| Área | Acción |
|---|---|
| `ui/theme/Color.kt` | Reemplazar Purple* por tokens GuardMe |
| `ui/theme/Type.kt` | Figtree + Atkinson; escalas de §3 fundamentos |
| `ui/theme/Theme.kt` | Light only; sin dynamic color |
| Componentes nuevos | Paquete `ui/components/` (o similar) |
| Pantallas | `ui/persona/`, `ui/cuidador/` |
| Recursos | Fuentes en `res/font/`; strings en `strings.xml` (ES) |

**No tocar:** firmware ESP32, lógica de sensores, ni inventar pantallas de auth en esta fase de UI (ver §5).

---

## 4. Criterios de aceptación globales

1. Paleta y tipografía coinciden con el tablero de marca (hex y familias).
2. En persona: texto cuerpo ≥ 16 sp; CTAs ≥ 56 dp de alto; 911 rojo; familiar marrón.
3. Estado nunca solo por color (chip/label/ícono).
4. Overlays de crisis: una acción primaria clara; cuenta atrás 5 s y 30 s implementada.
5. Autoescalado: tras 2 intentos consecutivos de llamada al familiar sin respuesta en un episodio de ayuda → cuenta atrás 911; un solo fallo no dispara 911; contestar en intento 1 o 2 cancela el autoescalado.
6. Cuidador: matriz Familiar vs Médico respetada en navegación visible; push cuando el 911 es automático.
7. Contraste AA en pares de [01-fundamentos.md §2.4](01-fundamentos.md).
8. TalkBack: labels en acciones solo-ícono; dialogs y status anunciados; anunciar «intento n de 2».
9. Reduced motion: sin ondas animadas del bastón.
10. Frame de diseño 390 dp de ancho como referencia; layouts fluidos en teléfonos 360–412 dp.
11. Sin Material Dynamic Color ni tema oscuro hasta que producto lo pida.

---

## 5. Decisiones abiertas (bloquean o condicionan)

El prototipo HTML **no incluye** estas pantallas. No inventar UI en la implementación hasta que producto las defina; dejar stubs o flujos temporales solo si el equipo lo acuerda explícitamente.

| Decisión | Impacto |
|---|---|
| Onboarding / login / registro | Entrada a la app |
| Elección o asignación de rol (Persona vs Cuidador vs Médico) | Qué grafo de navegación se muestra |
| Emparejamiento Bluetooth del bastón | Primera vez en «Mi bastón» |
| Preferencias de notificaciones del cuidador («Elegir qué avisos recibo») | Pantalla enlazada pero no diseñada |
| Edición de la ficha de salud | Solo lectura en prototipo |
| Mapa real (SDK) vs ilustración | Alerta y ubicación en vivo |
| Idioma / localización más allá de ES | Copy actual en español |
| Tema oscuro | No existe en marca |
| Multicuenta / varias personas cuidadas | Home cuidador asume una persona (Rosa) |
| Timeout exacto de «sin respuesta» en cada intento al familiar | Spec asume ~25–30 s de timbre; ajustar con producto/legal |
| ¿Llamar a un segundo familiar antes del 911? | Spec actual: solo familiar preferido, 2 intentos, luego 911 |

---

## 6. Reconciliación de fuentes del prototipo

| Conflicto posible | Resolución |
|---|---|
| Lista de contactos embebida en app interactiva vs tablero «Mis contactos» | Usar tablero estático (búsqueda, preferido, secciones) |
| Bastón persona en tab interactivo vs tablero «Mi bastón» | Usar tablero estático (batería hero + guía del botón) |
| Home cuidador embebida vs pantallas sueltas | Interacción de home + layouts de Alerta, Equipo, etc. desde tableros dedicados |
| Labels «Recordatorios» vs tab «Recordar» | Tab bar: **Recordar**; título de pantalla: **Recordatorios** |

---

## 7. Datos de prototipo

Hardcodear solo en previews/demos:

- Persona: Rosa Del Giudice, 78 años, Calle 50…
- Familiar preferido: Ana (hija)
- Medicamentos: Losartán 50 mg, Metformina 850 mg
- Ubicación demo: San Francisco (Panamá en el copy de ejemplo)

Producción: nombres, teléfonos y direcciones vienen del backend / perfil.

---

## 8. Verificación recomendada

1. Revisar cada pantalla contra el HTML en un teléfono o emulador ~390 dp.
2. Checklist a11y de fundamentos §8.
3. Flujos E2E manuales:
   - Persona: 911 cancelado · 911 completado · caída → escalado · 2 fallos familiar → auto 911 · familiar contesta en 2.º intento (no 911) · pastilla · sonar bastón.
   - Cuidador: alerta → 911 / encargarse / resolver OK · push de auto 911 · crear recordatorio · invitar Familiar vs Médico.
4. Capturas side-by-side prototipo vs app para hand-off visual.
