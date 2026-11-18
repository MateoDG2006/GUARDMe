# Fundamentos de UI — GuardMe

**Estándares que gobiernan:** tablero «Marca · colores y tipografía» del prototipo HTML; WCAG 2.2 AA; Material 3 solo como patrón de navegación Android cuando el prototipo no define un valor.  
**Plataforma:** Android · Jetpack Compose · teléfono de referencia 390 × 844 px.  
**Tema:** claro fijo. Sin color dinámico del sistema.

---

## 1. Principios

1. **Seguridad primero.** El 911 y las alertas de caída tienen jerarquía visual máxima y nunca comparten color con acciones cotidianas.
2. **Una acción primaria por overlay de alerta.** En pantallas de crisis (caída, 911, pastilla), una decisión grande y clara.
3. **Legibilidad para baja visión.** Cuerpo en Atkinson Hyperlegible; títulos en Figtree; texto de persona ≥ 16 px; botones de persona ≥ 56 px de alto.
4. **Estado con texto e ícono.** El color refuerza; nunca es el único canal.
5. **Dos densidades, una marca.** Persona = botones grandes y pocos elementos. Cuidador = más información, mismos tokens.

---

## 2. Tokens de color

### 2.1 Marca

| Token | Hex | Uso |
|---|---|---|
| `brown` | `#8A5A35` | Botones primarios de familiar / acciones de cuidado; pestaña activa |
| `caramel` | `#C08A5B` | Bordes, detalles, botones outline |
| `sand` | `#F1E6D8` | Tarjetas suaves, chips de rol Familiar, métricas |
| `cream` | `#F8F4EE` | Fondo de pantalla |
| `navy` | `#1E2A38` | Texto primario, íconos, toast oscuro |
| `warmGray` | `#5C5650` | Texto secundario |
| `meAccent` | `#B07A4C` | Acento del wordmark «Me» |
| `white` | `#FFFFFF` | Superficies de tarjeta, botones outline sobre crema |
| `border` | `#E6DCCF` | Borde de tarjetas y divisores suaves |
| `dividerSoft` | `#EFE6DA` | Separadores internos de listas |
| `brownDark` | `#6B4426` | Texto sobre arena / CTAs secundarios en arena |
| `brownDeep` | `#4A3A2C` | Texto terciario sobre arena |

### 2.2 Estado

| Token | Hex | Uso | Siempre acompañar con |
|---|---|---|---|
| `ok` | `#2E7D4F` | Todo bien, confirmación, «Ya la tomé» | Label «Todo bien» / check |
| `emergency` | `#B3261E` | 911, alerta crítica, ayuda en camino | Label «Emergencia» / ícono alerta |
| `attention` | `#A8620A` | Atención / pendiente urgente | Label «Atención» |
| `meds` | `#2C4A6E` | Medicamentos, cita, chips azules | Label / ícono pastilla |
| `dangerText` | `#8C1D17` | Enlace destructivo suave («Me equivoqué…») | Texto subrayado |

### 2.3 Superficies de apoyo

| Token | Hex | Uso |
|---|---|---|
| `avatarWarm` | `#E9D3BC` | Avatar persona / familiar |
| `avatarBlue` | `#DCE6F2` | Avatar médico / pastilla |
| `avatarGreen` | `#DDEBDF` | Avatar / chip tomada |
| `chipPendingBg` | `#F6E3C8` | Chip «Pendiente» |
| `chipPendingFg` | `#7A4708` | Texto chip pendiente |
| `chipTakenFg` | `#1F5C39` | Texto chip tomada |
| `successSoft` | `#9FD6B0` | Check en toast oscuro |
| `handle` | `#D8CBBB` | Handle de bottom sheet |
| `scrim` | `rgba(30,42,56,0.45)` | Fondo de sheet modal |
| `mapBase` | `#ECE5DA` | Placeholder de mapa |
| `mapWater` | `#C9DCEC` | Agua en mapa ilustrado |
| `mapPark` | `#DFE6D3` | Parques en mapa |

### 2.4 Contraste (WCAG 2.2 AA)

Pares verificados del prototipo (texto normal ≥ 4,5:1; grande ≥ 3:1):

| Par | Ratio aprox. | Resultado |
|---|---|---|
| `navy` sobre `cream` | ~14:1 | AA OK |
| `warmGray` sobre `cream` | ~6,5:1 | AA OK |
| `white` sobre `brown` | ~6,3:1 (declarado en marca) | AA OK |
| `white` sobre `emergency` | ~5,5:1 | AA OK |
| `white` sobre `ok` | ~4,6:1 | AA OK (borde) |
| `brownDark` sobre `sand` | ~5,5:1 | AA OK |
| `warmGray` sobre `white` | ~6,2:1 | AA OK |

**Observaciones a corregir en implementación (sin cambiar la paleta en silencio):**

| Par problemático | Problema | Alternativa |
|---|---|---|
| Labels de pestaña cuidador inactiva a 12 px en `warmGray` | Texto pequeño; AA más exigente | Mantener color; subir a 13–14 px o peso 700 en activa únicamente (el prototipo ya usa 700 en activa) |
| Placeholder de mapa ilustrado | Decorativo | `aria-hidden`; la ubicación se lee en texto debajo |
| Chip «Médico» pendiente sobre `#EFE6DA` con `#4A3A2C` | Aceptable | Preferir `brownDark` si el contraste cae en dispositivos |

Regla de marca: **nunca** usar el mismo color para 911 y para llamar al familiar.

---

## 3. Tipografía

| Rol | Familia | Pesos | Tamaños de referencia (px ≈ sp) |
|---|---|---|---|
| Display / wordmark | Figtree | 800 | 26–38 |
| Título de pantalla | Figtree | 800 | 26–28 |
| Título de sección | Figtree | 700–800 | 20–24 |
| Título de overlay de crisis | Figtree | 800 | 30–36 |
| Cuerpo | Atkinson Hyperlegible | 400, 700 | ≥ 16 (persona); 14–16 (cuidador) |
| Caption / meta | Atkinson Hyperlegible | 400 | 14–15 (persona); 12–14 (cuidador, solo labels de nav y chips) |
| Botón primario persona | Figtree | 800 | 24–30 |
| Botón primario cuidador | Figtree | 800 | 18–19 |

**Wordmark:** `Guard` en `navy` + `Me` en `meAccent` (`#B07A4C`). Tagline cuidador: «Que la distancia no sea un riesgo».

**Android:** embebidas Atkinson Hyperlegible (SIL OFL) y Figtree (SIL OFL). Fallback: `sans-serif`.

---

## 4. Espaciado, radio y elevación

### 4.1 Espaciado

| Token | Valor | Uso |
|---|---|---|
| `space-xs` | 6–8 px | Gaps internos compactos |
| `space-sm` | 10–12 px | Gap entre tarjetas / grid |
| `space-md` | 14–16 px | Padding de tarjeta |
| `space-lg` | 18–22 px | Padding horizontal de pantalla |
| `space-xl` | 24–28 px | Separación de bloques en overlays |

Padding de contenido típico persona: `22px 18px 16px`.  
Padding de contenido típico cuidador: `14–16px` laterales.

### 4.2 Radios

| Token | Valor | Uso |
|---|---|---|
| `radius-sm` | 12–14 px | Chips pequeños |
| `radius-md` | 18–20 px | Tarjetas, botones outline |
| `radius-lg` | 22–26 px | Botones primarios grandes |
| `radius-xl` | 28 px | Bottom sheet superior |
| `radius-pill` | 50 % del alto | Avatares, FAB-like, indicadores |

### 4.3 Elevación

El prototipo usa bordes (`1px solid #E6DCCF`) más que sombras. En Compose: `elevation = 0` + borde; toast oscuro sin sombra fuerte. Overlays de pantalla completa = capa absoluta sobre el contenido, sin blur obligatorio.

---

## 5. Componentes compartidos

### 5.1 Botón primario relleno

| Variante | Fondo | Texto | Alto mínimo | Radio |
|---|---|---|---|---|
| Familiar / cuidado | `brown` | `white` | Persona 64–84 px · Cuidador 52–60 px | 20–26 |
| Emergencia 911 | `emergency` | `white` | Persona 72–150 px · Cuidador 60 px | 20–24 |
| Confirmación OK | `ok` | `white` | Persona 76–84 px | 26 |
| Oscuro (encargarse) | `navy` | `white` | 40–44 px | 20 |

Estados: default · pressed (oscurecer 8 %) · disabled (opacity 0.4) · loading (spinner blanco + label «Llamando…»).

### 5.2 Botón outline / secundario

| Variante | Borde | Fondo | Texto | Alto mín. |
|---|---|---|---|---|
| Caramelo | 2 px `caramel` | `white` | `navy` | 56–64 |
| OK outline | 2 px `ok` | `white` | `ok` | 52–64 |
| Dashed CTA | 2 px dashed `caramel` | transparent | `brownDark` | 52–60 |

### 5.3 Tarjeta

- Fondo `white`, borde `1px border`, radio 20–22, padding 14–18.
- Variante suave: fondo `sand`, sin borde o borde `border`.
- Variante estado: mismo layout + ícono circular 48–60 px a la izquierda.

### 5.4 Chip de estado

| Estado | Fondo | Texto |
|---|---|---|
| Tomada | `#DDEBDF` | `#1F5C39` |
| Pendiente | `#F6E3C8` | `#7A4708` |
| Cita / info | `#DCE6F2` | `#2C4A6E` |
| Rol Familiar | `sand` | `brownDark` |
| Rol Médico | `#DCE6F2` | `meds` |

Padding tipico: `5px 11px`, radio 13, texto 13 px / weight 700.

### 5.5 Avatar iniciales

Círculo 46–56 px (persona contactos 56; cuidador lista 46). Fondo según rol (`avatarWarm`, `avatarBlue`, `avatarGreen`). Inicial Figtree 800, 19–24 px, color `navy`.

### 5.6 Barra de pestañas inferior

**Persona (4):** Inicio · Contactos · Recordatorios · Bastón.  
**Cuidador (5):** Inicio · Historial · Recordar · Bastón · Equipo.

| Propiedad | Valor |
|---|---|
| Fondo | `white` |
| Borde superior | `1px border` |
| Alto mínimo ítem | 52 px |
| Ícono | 24 × 24, stroke 2 |
| Label inactiva | `warmGray`, weight 400 |
| Label activa | `brownDark` / `#6B4426`, weight 700 |
| Indicador | barra 26 × 3, radio 2, color `brown` |
| Padding inferior | 16 px (safe area) |

### 5.7 Header con wordmark

Logo pin 40×44 + wordmark Figtree 26/800 + saludo/tagline 15–16 `warmGray`. A la derecha: chip de batería (persona) o campana/notificaciones (cuidador, si aplica).

### 5.8 Bottom sheet / diálogo de pregunta

- Scrim `scrim`.
- Panel crema, radio superior 28, padding `14 22 30`.
- Handle 44×5, `handle`, centrado.
- Título Figtree 30/800 centrado.
- Botones apilados: primario OK → secundario outline.

### 5.9 Toast / aviso breve

Posición: absolute, left/right 18, bottom ~104 (sobre la tab bar). Fondo `navy`, texto `white` 18 px, radio 18, padding 16–18, ícono check `successSoft`. Auto-dismiss ~3 s. Rol `status`.

### 5.10 Overlay de pantalla completa

Cubre todo el frame (incluido tab bar). Fondo `cream` salvo «ayuda en camino» (`emergency`) y cuenta 911 (puede usar fondo de emergencia en la llamada). Contenido centrado verticalmente con botones anclados abajo.

### 5.11 Campo de formulario (cuidador / editar contacto)

Label Atkinson 15–16, input fondo `white`, borde `border`, radio 16–18, alto mín. 52, texto 17–18. Grupos con gap 12–14.

### 5.12 Lista con fila de acciones

Izquierda: avatar. Centro: título + subtítulo. Derecha: botón editar (48 circular outline) + botón llamar (56 circular `brown`). Gap 14.

---

## 6. Iconografía

- Estilo: stroke redondo, width 2–2.6, fill none salvo logos.
- Color: `navy` / `white` sobre rellenos / `brown` en secundarios.
- Tamaños: 20 / 24 / 26 / 32 / 40 / 48 / 54 según jerarquía.
- Logo GuardMe: pin de ubicación con silueta + ondas; stroke caramelo en base.
- Decorativos: `aria-hidden="true"`. Acciones solo-ícono: `aria-label` obligatorio («Editar contacto», «Llamar», «Cerrar»).

---

## 7. Motion

| Interacción | Duración | Notas |
|---|---|---|
| Press de botón | 100–150 ms | Oscurecer / scale 0.98 |
| Cambio de pestaña | 200 ms | Crossfade contenido |
| Overlay abrir/cerrar | 250–300 ms | Fade + slide up en sheets |
| Cuenta atrás 911 / caída | 1 s tick | Número grande; anunciar cambios a TalkBack |
| Ondas «bastón sonando» | loop 1.5–2 s | Respetar `prefers-reduced-motion`: mostrar círculo estático |
| Toast | entrar 200 ms · salir 200 ms · visible 3 s | |

---

## 8. Accesibilidad — checklist

- [ ] Contraste AA en todos los pares texto/fondo de la sección 2.4
- [ ] Objetivos táctiles ≥ 44×44; persona ≥ 56 de alto en CTAs
- [ ] Estado no solo por color (chip + label; ícono + texto)
- [ ] Overlays de alerta: foco inicial en el CTA primario; Escape/atrás cierra solo si es seguro (no en cuenta 911 sin Cancelar)
- [ ] `role="dialog"` en sheets; `role="status"` en toasts y alertas vivas
- [ ] Labels en botones solo-ícono
- [ ] Motion reducida: sin ondas animadas
- [ ] Tipografía embebida Atkinson + Figtree; no sustituir por Roboto para el cuerpo de persona
- [ ] Texto dinámico (nombres largos): ellipsis de 1–2 líneas; nunca truncar el CTA de emergencia

---

## 9. Contenido de prototipo vs. copy de UI

Usar como **datos de ejemplo** (no hardcodear en producción): Rosa Del Giudice, Ana, Luis, Dr. Pérez, Marta, Carmen, Losartán, Metformina, Calle 50, San Francisco, +507…

Usar como **microcopy de producto** (sí documentado en pantallas): «Estoy bien», «Necesito ayuda», «Ya la tomé», «Recordar en 10 min», «Llamar al 911», «¿Dónde está mi bastón?», «Lo encontré», «Yo me encargo», «Ya hablé con Rosa, está bien», «intento {n} de 2», «no contestó», autoescalado a 911, tagline, labels de pestañas y roles Familiar / Médico.
