# Handoff: NEXUS — Biblioteca de videojuegos (UI estilo consola)

## Overview
NEXUS es la interfaz de una **biblioteca de videojuegos multiplataforma** con la estética de una consola moderna de última generación. Es un híbrido que combina lo mejor de tres referencias: el héroe cinematográfico y el glassmorphism (estilo PS5), el dashboard oscuro con tiles (estilo Xbox), y la barra de estado limpia + cambio rápido de plataforma (estilo Switch).

La app permite:
- Cambiar entre plataformas (Orbis / Helix / Pulse + "Biblioteca" agregada).
- Explorar juegos en distintos layouts (héroe, carrusel, cuadrícula).
- Abrir un panel lateral de detalle con descripción, estadísticas y logros.
- Buscar juegos.
- Navegar con teclado (foco tipo mando) **y** ratón.
- Sonidos de navegación y una animación de "Iniciando juego".

## About the Design Files
Los archivos de este paquete son **referencias de diseño creadas en HTML/CSS/JSX (React vía Babel en el navegador)** — son prototipos que muestran el aspecto y comportamiento deseados, **no código de producción para copiar tal cual**.

La tarea es **recrear estos diseños en el entorno del codebase destino** (React, Vue, SwiftUI, native, etc.) usando sus patrones y librerías establecidas. Si aún no existe entorno, elige el framework más apropiado (se recomienda **React + TypeScript**, ya que el prototipo es React) e impleméntalo allí. El prototipo usa React 18 sin build (Babel standalone) y `<script>` por componente; en un codebase real conviene migrar cada archivo `.jsx` a un módulo/componente con imports normales.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciado, radios e interacciones son finales. Recrea la UI de forma pixel-perfect usando las librerías y patrones del codebase. Todos los valores exactos están en la sección **Design Tokens**.

---

## Design Tokens

### Colores (tema oscuro)
| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#07080b` | Fondo base |
| `--bg-2` | `#0a0c11` | Fondo de paneles/gradientes |
| `--panel` | `rgba(255,255,255,0.045)` | Superficie nivel 1 |
| `--panel-2` | `rgba(255,255,255,0.07)` | Superficie nivel 2 |
| `--panel-3` | `rgba(255,255,255,0.10)` | Superficie nivel 3 |
| `--line` | `rgba(255,255,255,0.09)` | Borde sutil |
| `--line-2` | `rgba(255,255,255,0.16)` | Borde marcado |
| `--text` | `#eef1f7` | Texto principal |
| `--text-dim` | `rgba(238,241,247,0.64)` | Texto secundario |
| `--text-faint` | `rgba(238,241,247,0.40)` | Texto terciario / labels |
| `--accent` | `#3b82f6` (configurable) | Color de acento (foco, botón jugar, progreso) |

**Opciones de acento (tweakable):** `#3b82f6` (azul, default), `#22d3ee` (cian), `#a855f7` (violeta), `#22c55e` (verde), `#f97316` (naranja), `#f43f5e` (coral).

**Tintes de plataforma** (cada plataforma colorea su sección/estado activo):
| Plataforma | Tinte | Glifo | Carácter |
|---|---|---|---|
| Biblioteca (todo) | `#9aa6c0` | 4 puntos | Agregado de todas |
| Orbis | `#3b82f6` | círculo con núcleo | Cine AAA |
| Helix | `#22c55e` | hexágono | Mundos abiertos / potencia |
| Pulse | `#f43f5e` | cuadrado redondeado | Portátil / familiar |

Los acentos derivados se calculan con **oklch** para mantener armonía. Las carátulas usan `oklch(L C H)` con un `hue` por juego (ver sección Assets).

### Tipografía
- **Fuentes** (Google Fonts, tweakable): **Sora** (default), Space Grotesk, Manrope. Pesos 400/500/600/700/800.
- Escala observada:
  - Título de héroe: **52px / 800 / -0.03em**, line-height 0.98
  - Título de detalle: 30px / 800 / -0.02em
  - Reloj barra estado: 22px / 600, tabular-nums
  - Títulos de fila (`row-title`): 18px / 700
  - Nombre de tarjeta: 13.5px / 600
  - Género de tarjeta: 11.5px / 400, `--text-faint`
  - Eyebrow / labels en mayúsculas: 10–11px / 600/700, letter-spacing 0.06–0.1em, uppercase
  - Body / blurb: 14.5–15px, line-height 1.55–1.6, `--text-dim`

### Espaciado y radios
- Padding horizontal de secciones: **26px**.
- Gaps: filas de tarjetas 18px; cuadrícula 22px(v)/18px(h); rows entre sí 30px.
- Radios: tarjetas 14px; héroe 24px; botones 12px; tiles de nav 12–18px; chips/pills 999px; `--radius` global 16px.
- Sombras: tarjeta `0 6px 20px rgba(0,0,0,.4)`; tarjeta enfocada `0 14px 40px rgba(0,0,0,.55)`; héroe `0 20px 60px rgba(0,0,0,.45)`; panel detalle `-30px 0 80px rgba(0,0,0,.6)`.
- Easing estándar: `--ease: cubic-bezier(.4,.8,.3,1)`.

---

## Screens / Views

### 1. Shell / Layout global
- **Estructura:** grid de 3 filas → `StatusBar` (60px) / `main` (1fr, scroll interno) / `HintBar` (48px). Ocupa `100vh`, `overflow:hidden` (es una app, no una web con scroll de página).
- **Fondo:** capas de `radial-gradient` tintadas con el acento + `linear-gradient(180deg,var(--bg-2),var(--bg))` + capa `app-ambient` con glow superior del acento.
- Cuando el selector de plataforma es **Barra** (sidebar), `main` es flex-row: sidebar (230px) | contenido. En **Pestañas/Consola** la nav va arriba del contenido.

### 2. Barra de estado superior (`StatusBar`)
- **Izquierda:** botón de perfil → avatar circular 38px (gradiente `135deg,#3b82f6,#a855f7`, iniciales "AX") + nombre (14px/600, `--text`) + subtítulo "Nivel 42 · 1.2k créditos" (11px, `--text-faint`).
- **Centro:** reloj en vivo `HH:MM` (22px/600, los dos puntos parpadean cada 2s) + fecha capitalizada (`Mié, 10 Jun`).
- **Derecha:** pill de logros (icono trofeo color `#f5c451` + total acumulado), iconos bluetooth y wifi (`--text-dim`), batería (cuerpo 26×13 con relleno al 78%, color acento; rojo si <20%) + "%".
- Altura 60px, `backdrop-filter: blur(18px)`, borde inferior `--line`.

### 3. Selector de plataforma (`PlatformNav`) — 3 variantes tweakables
- **Barra (sidebar, default):** ancho 230px. Logo "NEXUS" (marca cuadrada con gradiente acento). Botón "Buscar juegos". Label "PLATAFORMAS". Lista de items: glifo + nombre; activo = fondo `color-mix(in oklab, var(--tint) 14%, transparent)`, borde tintado, barra lateral de 3px del tinte. Colapsa a 72px (solo iconos) <820px.
- **Pestañas (tabs):** fila de píldoras (radius 999px) arriba; activa con fondo/borde tintado y sombra del tinte. Botón de búsqueda circular 44px a la derecha.
- **Consola (switch):** carrusel de cards grandes; la card activa se expande (`flex:1`), muestra glow radial del tinte y un tagline. Botón búsqueda circular a la derecha.

### 4. Vista principal (`HomeView`) — 3 layouts tweakables
- **Héroe (default):** banner 380px (radius 24px) con la carátula del juego destacado a sangre, scrim en gradiente, eyebrow (plataforma + género + rating estrella `#f5c451`), título 52px, blurb, botones **Continuar/Jugar** (acento) + **Ver detalles** (ghost) + "% completado". Debajo: filas horizontales ("Continuar jugando", "Toda la biblioteca", "Recién llegados", "Mejor valorados"). En "Biblioteca" agregada: una fila por plataforma.
- **Carrusel:** mismas filas sin el héroe.
- **Cuadrícula:** header con conteo + grid responsive (`repeat(auto, minmax(~172px,1fr))`), tarjetas con nombre+género debajo.

### 5. Tarjeta de juego (`GameCard`)
- Carátula (aspect 3/4, radius 14px) generada proceduralmente (ver Assets). Chip arriba-derecha: punto verde `#4ade80` si instalado, icono descarga si no. Barra de progreso inferior (acento, con glow) si `progress>0`.
- **Enfocada (teclado/hover):** `transform: scale(1.05)`, anillo interior `inset 0 0 0 2.5px var(--accent)` + halo `0 0 0 4px accent@30%`.
- En cuadrícula/búsqueda muestra pie con nombre (13.5/600) + género; la carátula oculta su título para no duplicar.

### 6. Panel de detalle (`DetailPanel`)
- **Aside fijo a la derecha**, ancho 440px (max 92vw), entra con `transform: translateX(100%)→0` en **0.36s** `--ease`; backdrop `rgba(4,5,8,.55)` + blur. Cierra con la X, click en backdrop o **Esc**.
- Contenido: hero 280px con carátula + scrim; eyebrow plataforma; título 30px; meta (dev · año · tamaño). Acciones: **Continuar/Jugar/Instalar** (acento, ancho) + botones icono favorito/más. Barra de "% · última sesión". Chips de tags. Blurb. **3 stats** (horas, valoración, completado). **Logros**: barra de progreso dorada (`linear-gradient(90deg,#f5c451,#f59e0b)`) + lista de 5 logros (bloqueados al 55% opacidad, desbloqueados con check verde).

### 7. Búsqueda (`SearchOverlay`)
- Overlay full-screen, fondo `rgba(4,5,8,.72)` + blur 10px. Barra de búsqueda 64px con icono y `Esc`. Sugerencias (chips) cuando está vacío. Grid de resultados (`minmax(150px,1fr)`). Filtra por título, género, tags y plataforma. **Esc** cierra.

### 8. Animación "Iniciando juego" (`LaunchSplash`)
- Overlay negro full-screen: fondo de carátula difuminada (blur 40px), carátula flotante centrada (168px, animación float 2.4s), plataforma, título 30px, "Iniciando…" con puntos animados, barra de progreso que se llena en 2.2s. Auto-cierra a los ~2.3s.

### 9. Barra de ayuda inferior (`HintBar`)
- Hints con `<kbd>`: flechas "Navegar", **A** (verde) "Abrir", **B**/Esc (coral) "Volver", **/** "Buscar". 48px, borde superior `--line`.

---

## Interactions & Behavior
- **Navegación por teclado (foco 2D tipo mando):** flechas mueven el foco entre tarjetas/filas (modelo `{fila, columna}` sobre `navRows`); Enter abre el detalle; el foco hace auto-scroll horizontal (dentro de la fila) y vertical (contenedor) **sin** `scrollIntoView` (se ajusta `scrollLeft/scrollTop` con márgenes). Hover del ratón mueve el foco a esa tarjeta.
- **`/`** abre búsqueda (si no hay overlay abierto). **Esc** cierra detalle/búsqueda.
- **Cambio de plataforma:** reinicia el foco a `{0,0}` y hace scroll al top; persiste en `localStorage` (`gc.platform`).
- **Sonidos** (WebAudio, lazy en primera interacción): `move`, `select`, `open`, `back`, `switch`, `launch`, `toggle`. Toggle on/off.
- **Transiciones:** detalle 0.36s; tarjetas hover/foco ~0.2s `--ease`; nav activo ~0.15–0.22s. Respeta `prefers-reduced-motion`.
- **Responsive:** héroe y sidebar se reducen <1080px; sidebar colapsa a iconos <820px.

## State Management
- `platform` (string id, persistido en localStorage) — plataforma activa.
- `detail` (game | null) — juego abierto en el panel.
- `search` (bool) — overlay de búsqueda.
- `launch` (game | null) — splash de inicio.
- `focus` ({r,c}) dentro de `HomeView` — posición del foco; se resetea al cambiar plataforma/layout.
- `cols` dentro de `HomeView` — columnas medidas con `ResizeObserver` (solo cuadrícula).
- `q` dentro de `SearchOverlay` — texto de búsqueda.
- **Tweaks** (persistidos por el host del prototipo): `accent`, `font`, `nav` (sidebar/tabs/switch), `layout` (hero/carousels/grid), `sound`. En producción, mapéalos a config/tema de usuario.
- `navEnabled = !detail && !search && !launch` — habilita la navegación por teclado del home.

## Assets
- **Sin imágenes externas.** Las carátulas son **procedurales** (`CoverArt`): por juego se define `{ hue, style, motif }` y se componen capas CSS (`radial/linear-gradient` en `oklch` + sheen + viñeta + motivo geométrico). `style ∈ {rings, beam, grid, wave, split, orb}`. Importante: el alfa en oklch va **dentro** de la función — `oklch(L C H / a)`, nunca concatenando hex.
  - **En producción**: sustituye `CoverArt` por las portadas reales de los juegos (componente `<img>` con el mismo aspect 3/4 y radios). Conserva el sistema de carátula procedural solo como fallback.
- **Iconos:** SVGs inline simples (`Icon`): search, play, wifi, bluetooth, chevrons, close, trophy, clock, download, check, star, grid, heart, dots. Reemplazables por la librería de iconos del codebase.
- **Datos:** 18 juegos ficticios en `games-data.jsx` (título, plataforma, género, dev, año, tamaño, rating, horas, progreso, logros, blurb, tags, `art`). Reemplazar por datos reales de la API.

## Files
Archivos del prototipo (en la raíz del proyecto, copiados también en este paquete):
- `Game Console.html` — documento principal: fuentes, orden de carga de scripts, montaje de `<GameConsoleApp/>`.
- `styles.css` — **toda** la hoja de estilos (tokens + componentes). Fuente de verdad para valores exactos.
- `app.jsx` — shell, estado, tweaks, splash de inicio, hint bar.
- `games-data.jsx` — plataformas + 18 juegos + helpers (`gamesByPlatform`, `gameById`, `recentGames`…).
- `home-view.jsx` — layouts, builder de filas, navegación 2D por teclado, helpers de scroll.
- `detail-panel.jsx` — panel lateral con stats y logros.
- `search-overlay.jsx` — búsqueda.
- `platform-nav.jsx` — 3 variantes del selector de plataforma.
- `game-card.jsx` — tarjeta.
- `cover-art.jsx` — generador de carátulas procedurales.
- `status-bar.jsx` — barra superior + glifos de plataforma + batería.
- `icons.jsx` — set de iconos SVG.
- `sound-engine.jsx` — motor de sonido WebAudio (`useSound`).
- `tweaks-panel.jsx` — panel de tweaks (andamiaje del prototipo; **no necesario en producción**, los tweaks se convierten en preferencias reales).

## Notas de implementación
- El prototipo usa React 18 sin bundler; cada `.jsx` expone componentes a `window`. En producción: módulos ESM con imports, y un store/context para el estado global (plataforma, detalle, búsqueda, preferencias).
- No usar `scrollIntoView` (rompe layouts embebidos); replicar el ajuste manual de scroll de `home-view.jsx`.
- Alturas mínimas de texto y hit-targets: el diseño ya cumple buenas prácticas (botones ≥44px en controles principales).
