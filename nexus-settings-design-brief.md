# NEXUS — Rediseño de la Configuración (brief para Claude Design)

Documento fuente de verdad para generar el **nuevo diseño de la pantalla de
Configuración** del launcher **EmuraOS**, en la estética del tema **NEXUS**
(consola-híbrida, oscuro premium). Recoge: estética/tokens, estructura del
shell, catálogo de controles y **el inventario completo de secciones, pestañas,
grupos y filas** que el diseño debe cubrir.

> Es un launcher de emulación retro multiplataforma. La configuración es
> **schema-driven**: cada fila se declara con un `kind` (toggle, dropdown,
> slider, button, info, folder, path, color). El diseño debe representar todos
> esos tipos de control y todo el contenido listado abajo. El idioma de la UI
> es **español**.

---

## 1. Objetivo

Rediseñar la pantalla de Configuración para que case con el tema NEXUS (la
biblioteca ya tiene su shell NEXUS: barra de estado superior, selector de
plataforma tipo consola, cuadrícula con héroe). La configuración hoy usa el
shell genérico de la app; queremos una versión **acorde a NEXUS**: mismos
tokens, tipografía Sora, superficies *glass* neutras, acentos por tinte,
sombras suaves y microinteracciones.

Debe seguir siendo **navegable con teclado y mando** (modelo de foco 2D), con
una **barra de guardado** (los cambios se acumulan y se confirman con
"Guardar").

---

## 2. Estética NEXUS — Design Tokens

Reutiliza estos tokens (del tema NEXUS ya implementado). Tipografía **Sora**
(400/500/600/700/800), fallback system-ui.

```
--bg: #07080b;            /* fondo base */
--bg-2: #0a0c11;          /* fondo de paneles/gradientes */
--panel: rgba(255,255,255,0.045);   /* superficie nivel 1 */
--panel-2: rgba(255,255,255,0.07);  /* superficie nivel 2 */
--panel-3: rgba(255,255,255,0.10);  /* superficie nivel 3 */
--line: rgba(255,255,255,0.09);     /* borde sutil */
--line-2: rgba(255,255,255,0.16);   /* borde marcado */
--text: #eef1f7;                    /* texto principal */
--text-dim: rgba(238,241,247,0.64); /* texto secundario */
--text-faint: rgba(238,241,247,0.40);/* texto terciario / labels */
--accent: #3b82f6;        /* acento (foco, botón primario, sliders) */
--radius: 16px;  --r-sm: 11px;
--ease: cubic-bezier(.4,.8,.3,1);
```

Tonos semánticos usados por las filas `info`/botones:
`good #4ade80 · warn #f5c451 · bad/danger #f43f5e · estrella/oro #f5c451`.
Tintes por consola (acento por plataforma) — cada consola tiene su color (p. ej.
NES rojo, N64 verde, PS azul…); el diseño puede teñir acentos/realces por
sistema en la sección Apariencia › Colores.

Fondo del shell: capas de `radial-gradient` con el acento + degradado
`180deg, var(--bg-2), var(--bg)`. La app permite una **imagen de fondo**
personalizada; cuando existe, el gradiente de la pantalla baja a `opacity:.8`
para dejarla translucir.

Patrón "glass" (tarjetas/filas): superficie `--panel`/`--panel-2` con borde
`--line`/`--line-2` y radios `--r-sm`/`--radius`. Foco visible = anillo con
`--accent` (estilo `ring-focus`).

---

## 3. Estructura del shell (a rediseñar)

Layout actual (dos columnas, todo a pantalla completa, sin scroll de página):

```
┌───────────────────────────────────────────────────────────────┐
│  [Topbar opcional]                                             │
├──────────────┬────────────────────────────────────────────────┤
│  SIDEBAR     │  [Tab bar de la sección activa (si tiene tabs)] │
│  (secciones) │  ┌──────────────────────────────────────────┐  │
│              │  │  CONTENIDO (scroll vertical):            │  │
│  · Logo +    │  │   grupos → filas (controles)             │  │
│    "volver"  │  │                                          │  │
│  · Lista de  │  │                                          │  │
│    8 secciones│ │                                          │  │
│              │  └──────────────────────────────────────────┘  │
│              │  [SaveBar: "Tienes cambios sin guardar"]        │
└──────────────┴────────────────────────────────────────────────┘
```

- **Sidebar de secciones** (ancho `--sidebar-width`, ~260px): logo EmuraOS +
  botón "volver al menú" arriba; debajo una **tarjeta flotante** (`--panel`,
  borde `--line`, radio `--radius`, sombra) con la lista de las **8 secciones**
  (icono + label). La activa se resalta con el acento.
- **Tab bar** (solo en secciones con pestañas): píldoras redondeadas
  (radio 999px, estilo glass); la activa con anillo de foco/acento.
- **Contenido**: lista vertical de **grupos**; cada grupo tiene `title`
  opcional + `description` opcional + filas. Algunos grupos son **colapsables**.
- **SaveBar** (aparece al haber cambios): banda glass abajo con texto
  "Tienes cambios sin guardar" + botones **Descartar** (ghost) y **Guardar**
  (acento). Anímala con slide-up.
- **Cabecera/Back**: botón "Volver" (flecha) que sale de la configuración o
  sube al nivel anterior dentro de una subruta.

NEXUS puede reinterpretar esto (p. ej. sidebar tipo "consola", cabecera con
reloj como en la biblioteca NEXUS) siempre que conserve: navegación por
secciones, pestañas dentro de sección, grupos con título/descr., y la SaveBar.

---

## 4. Catálogo de controles (widgets)

El diseño debe definir el aspecto NEXUS de **cada `kind`** y sus estados
(reposo / hover / foco-mando / activo / deshabilitado):

| kind | Descripción | Estados/variantes |
|---|---|---|
| **toggle** | Interruptor on/off | on/off; variante `glass` |
| **dropdown** | Selector de opciones | `variant: "dropdown"` (menú) o `variant: "selector"` (picker inline con flechas ◀ ▶ estilo consola) |
| **slider** | Deslizador numérico | `min/max/step`; muestra valor |
| **button** | Acción | `variant: primary | danger | ghost`; opcional `confirmLabel` (confirmación en 2 pasos) y `status` (texto al lado, p. ej. "Guardado", "3/120", "Escaneando…") |
| **info** | Texto de solo lectura (label + valor) | `tone: default | good | warn | bad`; `column` (apila label/valor); `variant: glass` |
| **folder** | Ruta de carpeta | input + botón "examinar"; `hint` (ruta absoluta resuelta debajo); `openable` (botón abrir en explorador) |
| **path** | Ruta/clave de texto | input; `secret: true` → enmascarado (password) |
| **color** | Color de consola | muestra de color + selector; `defaultValue` (botón "restablecer") |

Cada fila tiene `label` y, casi siempre, `description` (texto de ayuda). El foco
de mando recorre las filas; algunas son `nonFocusable`. Filas/botones pueden
estar `disabled` según contexto.

---

## 5. Modelo de interacción

- **Staging + Guardar:** los cambios NO se aplican al instante; se acumulan en
  un buffer y se confirman con **Guardar** (o se tiran con **Descartar**).
  Excepción: la sección **Apariencia › Fondo** aplica en vivo (preview).
- **Teclado / mando (foco 2D):** flechas mueven el foco entre sidebar ↔ tabs ↔
  filas; activar con A/Enter; volver con B/Esc/flecha "Volver". El foco visible
  usa el anillo de acento.
- **Confirmaciones:** acciones destructivas (borrar historial, caché, reset)
  piden confirmación inline (`confirmLabel`).

---

## 6. Inventario completo de contenido

**Orden de las 8 secciones (sidebar):**
`General · Apariencia · Biblioteca · Portadas · Rutas · Emuladores · RetroAchievements · Avanzado`

---

### 6.1. General  (icono ⚙)
Grupo único:

- **Tema** · dropdown · "Apariencia visual de la interfaz." · opciones: Oscuro,
  Claro, Retro CRT verde, CRT Ámbar, Game Boy verde, SNES púrpura, Neon
  Synthwave, **Nexus**.
- **Idioma** · dropdown · "Idioma de la interfaz." · Español / English.
- **Pantalla completa al iniciar** · toggle · "Abrir la aplicación en pantalla completa."
- **Escanear ROMs al iniciar** · toggle · "Buscar nuevas ROMs automáticamente al abrir la app."
- **Búsqueda fuzzy** · toggle · "Tolera typos, abreviaturas y matches no contiguos (smbros → Super Mario Bros)…"
- **Juegos ocultos** · button (ghost) · "Restaura a la biblioteca los juegos marcados como ocultos…" · status: "Ninguno oculto" / "N ocultos".

---

### 6.2. Apariencia  (icono 🎨)  — **pestañas:** Efectos · Fondo · Colores · Sonidos

**Efectos**
- **Efecto 3D en tarjetas** · toggle · "Inclinar las tarjetas de juego con reflejo de cristal…"
- **Pantalla de carga al abrir un juego** · toggle · "Mostrar un cubo 3D con la portada del juego mientras se lanza el emulador."
- **Efecto dock en el slider de consolas** · toggle · "Aumentar el tamaño de los iconos del slider horizontal al pasar el cursor."

**Fondo** *(aplica en vivo)*
- **Elegir imagen** · button · "Selecciona una imagen de fondo… (JPG, PNG, WebP)."
- **Quitar imagen** · button (danger) · "Eliminar la imagen de fondo…" · deshabilitado si no hay imagen.
- **Brillo** · slider 0–200 (step 5) · "Ajusta el brillo de la imagen de fondo (100 = normal)."
- **Desenfoque** · slider 0–20 (step 1) · "Nivel de desenfoque (px)."
- **Opacidad** · slider 0–100 (step 5) · "Opacidad de la imagen de fondo (%)."

**Colores** — grupo "Consolas": "Personaliza el color de cada consola en el
slider y las tarjetas." · **una fila `color` por consola** (≈19): NES, SNES,
Nintendo 64, Game Boy, Game Boy Color, Game Boy Advance, Nintendo DS, Nintendo
3DS, GameCube, Wii, Wii U, Nintendo Switch, Mega Drive, Master System,
Dreamcast, PlayStation, PlayStation 2, PlayStation 3, PSP. Cada una con muestra
de color + botón restablecer al color por defecto.

**Sonidos**
- **Sonido de navegación** · toggle · "Reproducir un sonido al navegar con el mando."
- **Volumen** · slider 0–100 (step 5).

---

### 6.3. Biblioteca  (icono 📚)  — **pestañas:** Ordenación · Filtros · Estadísticas · Acciones

**Ordenación**
- *Juegos* → **Orden de juegos** · dropdown · Alfabético A→Z, Alfabético Z→A, Últimos jugados, Últimos añadidos.
- *Interacción* → **Acción al hacer doble clic** · dropdown · Lanzar juego / Abrir ficha del juego.
- *Interacción* → **Vista de biblioteca** · dropdown · Cuadrícula / Lista / Compacta.
- *Consolas* → **Orden de consolas** · dropdown · Por defecto / Recientes primero.

**Filtros** — grupo "Filtros de metadata" ("…se aplican automáticamente…")
- **Género** · dropdown (opciones dinámicas según la biblioteca; "Todos" + géneros).
- **Año / Década** · dropdown · Todos, 2020s, 2010s, 2000s, 1990s, 1980s, 1970s.
- **Rating mínimo** · dropdown · Sin filtro, 1+, 2+, 3+, 4+.
- **Jugadores** · dropdown · Todos, 1 jugador, 2 jugadores, Multijugador.
- **Portada** · dropdown · Todos, Solo con portada, Solo sin portada.

**Estadísticas** (filas `info`, solo lectura)
- *Resumen*: Favoritos · Jugados recientemente · Partidas totales · Tiempo total jugado · Colecciones.
- *Top juegos (por tiempo)* — colapsable: #1…#5 ("Nombre — Xh Ym").
- *Top juegos (por partidas)* — colapsable: #1…#5 ("Nombre — N partidas").
- *Tiempo por consola* — colapsable: "Desglose" (lista multilínea SISTEMA: tiempo).

**Acciones**
- **Re-escanear biblioteca** · button (primary) · status "Escaneando…".
- **Borrar historial de juego** · button (danger) · confirm "¿Borrar historial?" · "…Los favoritos y colecciones se mantienen."
- **Limpiar caché de metadatos** · button (danger) · confirm "¿Eliminar caché?".
- **Exportar biblioteca** · button (ghost) · "…a un archivo JSON."

---

### 6.4. Portadas  (icono 🖼️)  — *vista custom* (fuentes + credenciales + acciones)

Grupo **Fuentes** (filas glass):
- **Libretro Thumbnails** · toggle · "Descargar carátulas automáticamente desde Libretro (sin credenciales)."
- **Prioridad de fuentes** · dropdown (variant **selector**) · Libretro primero / SteamGridDB primero / Solo Libretro / Solo SteamGridDB.

Grupo **SteamGridDB** ("Fuente de carátulas para Switch, sistemas modernos… Requiere API key gratuita" + pasos para obtenerla):
- **SteamGridDB API Key** · path (secret).
- **Abrir SteamGridDB** · button (ghost) · abre la web para crear cuenta/API key.

Grupo **ScreenScraper** ("Descarga descripciones, géneros, años y carátulas adicionales. Requiere credenciales."):
- **ScreenScraper Dev ID** · path.
- **ScreenScraper Dev Password** · path (secret).
- **ScreenScraper User ID** · path · "Opcional."
- **ScreenScraper User Password** · path (secret) · "Opcional."

Grupo **Acciones**:
- **Descargar carátulas** · button (primary) · status "N/M" o "X encontradas".
- **Scrape metadatos completos** · button (primary) · deshabilitado sin credenciales SS · status "N/M" o "X encontrados".

*(La vista custom puede incluir además una previsualización/galería de portadas.)*

---

### 6.5. Rutas  (icono 📁)
Grupo único (filas `folder` con ruta absoluta resuelta como hint):
- **Directorio de ROMs** · folder (openable) · "Carpeta raíz donde se buscan las ROMs."
- **Directorio de emuladores** · folder (openable) · "Carpeta donde se buscan/instalan emuladores."
- **Directorio de metadatos** · folder · "Carpeta para metadatos y carátulas descargadas."
- **Directorio de guardados** · folder · "Carpeta donde se almacenan las partidas guardadas."

---

### 6.6. Emuladores  (icono 🎮)  — *vista custom* (lista + detalle con pestañas)

- **Lista** en **3 columnas**: una tarjeta por emulador + 1 acción "Detectar
  emuladores" arriba. Cada tarjeta muestra estado (Instalado / Disponible para
  descargar / No disponible) y nombre/icono del emulador.
- **Detalle de un emulador** → pestañas: **Estado · Configuración · Mandos ·
  Descarga · Avanzado**.
  - *Estado*: instalado/ruta, readiness (cores listos/errores), claves Cemu (Wii U).
  - *Configuración*: ajustes del emulador (gráficos, audio, input, rutas) editables desde el launcher.
  - *Mandos*: mapeo de controles (incluye captura de botón en vivo).
  - *Descarga*: descargar/instalar el emulador (con barra de progreso).
  - *Avanzado*: opciones extra del emulador.

Emuladores típicos: RetroArch, Dolphin, DuckStation, PCSX2, PPSSPP, Cemu,
Citra, Ryujinx… (la lista es dinámica). Diséñalo como **galería de tarjetas de
hardware** + panel de detalle con pestañas, en clave NEXUS.

---

### 6.7. RetroAchievements  (icono 🏆)

Grupo **Cuenta** ("Conecta tu cuenta de retroachievements.org…"):
- **Estado** · info · "✓ Conectado como <usuario>" / "○ No conectado".
- **Usuario** · path.
- **Contraseña** · path (secret) · "Solo se usa una vez para obtener tu token…"
- **Web API Key** · path (secret) · "retroachievements.org → Settings → Keys…"
- **Conectar** · button (primary) · deshabilitado si ya conectado · status "Conectando…/✓/✗".
- **Desconectar** · button (danger) · deshabilitado si no conectado.

Grupo **Opciones**:
- **Activar RetroAchievements** · toggle · "Inyecta tus credenciales en RetroArch, Dolphin y DuckStation al lanzar un juego."
- **Modo hardcore** · toggle · "Sin save states ni trucos — la forma 'oficial' de ganar logros."

Grupo **Compatibilidad**:
- **Login automático** · info (tone warn, column) · "RetroArch, Dolphin y DuckStation reciben credenciales automáticamente. PCSX2 y PPSSPP… login una vez dentro de cada uno."

---

### 6.8. Avanzado  (icono 🔧)  — **pestañas:** General · Diagnóstico · Restablecer

**General**
- *Desarrollo* → **Modo desarrollador** · toggle · "Muestra información adicional de depuración."
- *Acerca de* → **Versión** · info · "EmuraOS".
- *Mando* → **Mando conectado** · info · "Sí/No" · **Remapear controles** · button (ghost, deshabilitado) · "Próximamente."
- *Scripts de lanzamiento* (con descripción larga de variables EMURA_*):
  - **Script pre-lanzamiento** · path · "Ruta absoluta. Vacío = sin hook. Timeout 5s…"
  - **Script post-cierre** · path · "Ruta absoluta… Recibe además EMURA_EXIT_CODE."
  - **Cuenta atrás de pre-lanzamiento** · toggle · "Muestra 3-2-1 con la portada antes de abrir el emulador…"

**Diagnóstico**
- **Abrir carpeta de logs** · button (ghost).
- **Exportar diagnóstico** · button (ghost) · "Genera un archivo con configuración, biblioteca y versiones…"
- **Abrir archivo de configuración** · button (ghost).

**Restablecer**
- **Restablecer configuración** · button (danger) · confirm "¿Restablecer configuración?" · "…restaura valores por defecto. La app se recargará."

---

## 7. Qué entregar

Un diseño NEXUS para la pantalla de Configuración que cubra:

1. **Shell**: sidebar de secciones (8) en clave NEXUS, tab bar de píldoras,
   área de contenido con grupos (título + descripción + filas), SaveBar y back.
2. **Catálogo de los 8 tipos de control** (sección 4) con sus estados
   (reposo/hover/foco-mando/activo/deshabilitado), usando los tokens de la
   sección 2.
3. Variantes especiales: dropdown **selector** (picker inline con flechas),
   info **glass** y por `tone`, **color** por consola, **folder** con hint +
   abrir, **path secret**, button con **confirmLabel** y **status**.
4. Las **vistas custom**: Portadas (fuentes + credenciales + acciones, con
   posible galería de portadas) y **Emuladores** (galería de tarjetas de
   emulador + panel de detalle con 5 pestañas).
5. Coherencia con el shell NEXUS de la biblioteca (barra de estado superior con
   reloj, tipografía Sora, glass neutro, acentos por tinte, sombras suaves,
   foco con anillo de acento, respeto a `prefers-reduced-motion`).

> Las carátulas y portadas reales son imágenes (aspect 3/4); no uses arte
> procedural. Mantén toda la copy en español, tal cual aparece arriba.
