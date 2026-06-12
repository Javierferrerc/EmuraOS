// settings-schema.jsx — full EmuraOS settings schema (schema-driven). Exposes window.SETTINGS_SCHEMA, DEFAULT_VALUES.
// Every row has a stable `id`. Default values live in `value`.

const CONSOLE_COLORS = [
  ["nes", "NES", "#e23b3b"], ["snes", "SNES", "#7b6ef6"], ["n64", "Nintendo 64", "#22c55e"],
  ["gb", "Game Boy", "#9bbc4f"], ["gbc", "Game Boy Color", "#f25fa6"], ["gba", "Game Boy Advance", "#5a4fcf"],
  ["nds", "Nintendo DS", "#9aa6c0"], ["n3ds", "Nintendo 3DS", "#d23b3b"], ["gcn", "GameCube", "#6a5acd"],
  ["wii", "Wii", "#22b6e6"], ["wiiu", "Wii U", "#16b7d6"], ["switch", "Nintendo Switch", "#e2473b"],
  ["md", "Mega Drive", "#2f86c4"], ["sms", "Master System", "#c0392b"], ["dc", "Dreamcast", "#ee7f3b"],
  ["ps1", "PlayStation", "#3b6fd4"], ["ps2", "PlayStation 2", "#4f6bff"], ["ps3", "PlayStation 3", "#8a93a6"],
  ["psp", "PSP", "#5b6473"],
];

const colorRows = CONSOLE_COLORS.map(([id, label, def]) => ({
  id: "color." + id, kind: "color", label, value: def, defaultValue: def,
}));

const SETTINGS_SCHEMA = [
  // ───────────────────────── GENERAL ─────────────────────────
  {
    id: "general", label: "General", icon: "gear",
    groups: [{
      rows: [
        { id: "gen.theme", kind: "dropdown", label: "Tema", description: "Apariencia visual de la interfaz.",
          value: "Nexus", options: ["Oscuro", "Claro", "Retro CRT verde", "CRT Ámbar", "Game Boy verde", "SNES púrpura", "Neon Synthwave", "Nexus"] },
        { id: "gen.lang", kind: "dropdown", label: "Idioma", description: "Idioma de la interfaz.",
          value: "Español", options: ["Español", "English"] },
        { id: "gen.fullscreen", kind: "toggle", label: "Pantalla completa al iniciar", description: "Abrir la aplicación en pantalla completa.", value: true },
        { id: "gen.scan", kind: "toggle", label: "Escanear ROMs al iniciar", description: "Buscar nuevas ROMs automáticamente al abrir la app.", value: true },
        { id: "gen.fuzzy", kind: "toggle", label: "Búsqueda fuzzy", description: "Tolera typos, abreviaturas y matches no contiguos (smbros → Super Mario Bros).", value: true },
        { id: "gen.hidden", kind: "button", label: "Juegos ocultos", description: "Restaura a la biblioteca los juegos marcados como ocultos.", variant: "ghost", btnLabel: "Gestionar", status: "Ninguno oculto" },
      ],
    }],
  },

  // ─────────────────────── APARIENCIA ───────────────────────
  {
    id: "apariencia", label: "Apariencia", icon: "palette",
    tabs: [
      { id: "efectos", label: "Efectos", groups: [{ rows: [
        { id: "ap.3d", kind: "toggle", label: "Efecto 3D en tarjetas", description: "Inclinar las tarjetas de juego con reflejo de cristal al pasar el cursor.", value: true },
        { id: "ap.loading", kind: "toggle", label: "Pantalla de carga al abrir un juego", description: "Mostrar un cubo 3D con la portada del juego mientras se lanza el emulador.", value: true },
        { id: "ap.dock", kind: "toggle", label: "Efecto dock en el slider de consolas", description: "Aumentar el tamaño de los iconos del slider horizontal al pasar el cursor.", value: false },
      ] }] },
      { id: "fondo", label: "Fondo", live: true, groups: [{
        description: "Estos ajustes se aplican en vivo (vista previa inmediata).",
        rows: [
          { id: "ap.bgpick", kind: "button", label: "Elegir imagen", description: "Selecciona una imagen de fondo personalizada (JPG, PNG, WebP).", variant: "primary", btnLabel: "Elegir imagen…" },
          { id: "ap.bgremove", kind: "button", label: "Quitar imagen", description: "Eliminar la imagen de fondo actual.", variant: "danger", btnLabel: "Quitar", disabledKey: "noBg" },
          { id: "ap.bright", kind: "slider", label: "Brillo", description: "Ajusta el brillo de la imagen de fondo (100 = normal).", min: 0, max: 200, step: 5, unit: "", value: 100 },
          { id: "ap.blur", kind: "slider", label: "Desenfoque", description: "Nivel de desenfoque (px).", min: 0, max: 20, step: 1, unit: "px", value: 4 },
          { id: "ap.opacity", kind: "slider", label: "Opacidad", description: "Opacidad de la imagen de fondo (%).", min: 0, max: 100, step: 5, unit: "%", value: 80 },
        ],
      }] },
      { id: "colores", label: "Colores", groups: [{
        title: "Consolas", description: "Personaliza el color de cada consola en el slider y las tarjetas.",
        rows: colorRows,
      }] },
      { id: "sonidos", label: "Sonidos", groups: [{ rows: [
        { id: "ap.navsound", kind: "toggle", label: "Sonido de navegación", description: "Reproducir un sonido al navegar con el mando.", value: true },
        { id: "ap.vol", kind: "slider", label: "Volumen", min: 0, max: 100, step: 5, unit: "%", value: 60 },
      ] }] },
    ],
  },

  // ──────────────────────── BIBLIOTECA ────────────────────────
  {
    id: "biblioteca", label: "Biblioteca", icon: "books",
    tabs: [
      { id: "orden", label: "Ordenación", groups: [
        { title: "Juegos", rows: [
          { id: "lib.sortgames", kind: "dropdown", label: "Orden de juegos", value: "Alfabético A→Z", options: ["Alfabético A→Z", "Alfabético Z→A", "Últimos jugados", "Últimos añadidos"] },
        ] },
        { title: "Interacción", rows: [
          { id: "lib.dblclick", kind: "dropdown", label: "Acción al hacer doble clic", value: "Lanzar juego", options: ["Lanzar juego", "Abrir ficha del juego"] },
          { id: "lib.view", kind: "dropdown", label: "Vista de biblioteca", value: "Cuadrícula", options: ["Cuadrícula", "Lista", "Compacta"] },
        ] },
        { title: "Consolas", rows: [
          { id: "lib.sortcons", kind: "dropdown", label: "Orden de consolas", value: "Por defecto", options: ["Por defecto", "Recientes primero"] },
        ] },
      ] },
      { id: "filtros", label: "Filtros", groups: [{
        title: "Filtros de metadata", description: "Se aplican automáticamente a la biblioteca.",
        rows: [
          { id: "fil.genero", kind: "dropdown", label: "Género", value: "Todos", options: ["Todos", "Acción", "Aventura", "RPG", "Plataformas", "Carreras", "Lucha", "Puzzle", "Deportes", "Shooter"] },
          { id: "fil.year", kind: "dropdown", label: "Año / Década", value: "Todos", options: ["Todos", "2020s", "2010s", "2000s", "1990s", "1980s", "1970s"] },
          { id: "fil.rating", kind: "dropdown", label: "Rating mínimo", value: "Sin filtro", options: ["Sin filtro", "1+", "2+", "3+", "4+"] },
          { id: "fil.players", kind: "dropdown", label: "Jugadores", value: "Todos", options: ["Todos", "1 jugador", "2 jugadores", "Multijugador"] },
          { id: "fil.cover", kind: "dropdown", label: "Portada", value: "Todos", options: ["Todos", "Solo con portada", "Solo sin portada"] },
        ],
      }] },
      { id: "estadisticas", label: "Estadísticas", groups: [
        { title: "Resumen", rows: [
          { id: "st.fav", kind: "info", label: "Favoritos", value: "37", nonFocusable: true },
          { id: "st.recent", kind: "info", label: "Jugados recientemente", value: "12", nonFocusable: true },
          { id: "st.total", kind: "info", label: "Partidas totales", value: "1 284", nonFocusable: true },
          { id: "st.time", kind: "info", label: "Tiempo total jugado", value: "612 h 40 m", tone: "good", nonFocusable: true },
          { id: "st.col", kind: "info", label: "Colecciones", value: "8", nonFocusable: true },
        ] },
        { title: "Top juegos (por tiempo)", collapsible: true, collapsed: true, rows: [
          { id: "st.t1", kind: "info", label: "#1", value: "Chrono Trigger — 58h 12m", nonFocusable: true },
          { id: "st.t2", kind: "info", label: "#2", value: "The Legend of Zelda: OoT — 47h 03m", nonFocusable: true },
          { id: "st.t3", kind: "info", label: "#3", value: "Final Fantasy VII — 44h 50m", nonFocusable: true },
          { id: "st.t4", kind: "info", label: "#4", value: "Metroid Prime — 31h 22m", nonFocusable: true },
          { id: "st.t5", kind: "info", label: "#5", value: "Super Metroid — 28h 41m", nonFocusable: true },
        ] },
        { title: "Top juegos (por partidas)", collapsible: true, collapsed: true, rows: [
          { id: "st.p1", kind: "info", label: "#1", value: "Tetris — 213 partidas", nonFocusable: true },
          { id: "st.p2", kind: "info", label: "#2", value: "Street Fighter II — 168 partidas", nonFocusable: true },
          { id: "st.p3", kind: "info", label: "#3", value: "Mario Kart 64 — 142 partidas", nonFocusable: true },
          { id: "st.p4", kind: "info", label: "#4", value: "Super Mario Bros. — 119 partidas", nonFocusable: true },
          { id: "st.p5", kind: "info", label: "#5", value: "Sonic the Hedgehog — 97 partidas", nonFocusable: true },
        ] },
        { title: "Tiempo por consola", collapsible: true, collapsed: true, rows: [
          { id: "st.bd", kind: "info", column: true, label: "Desglose",
            value: "SNES: 184h 20m\nNintendo 64: 96h 40m\nPlayStation: 88h 05m\nGame Boy Advance: 61h 15m\nMega Drive: 47h 30m\nGameCube: 39h 10m", nonFocusable: true },
        ] },
      ] },
      { id: "acciones", label: "Acciones", groups: [{ rows: [
        { id: "ac.rescan", kind: "button", label: "Re-escanear biblioteca", description: "Busca nuevas ROMs y actualiza metadatos.", variant: "primary", btnLabel: "Re-escanear", busyStatus: "Escaneando…" },
        { id: "ac.history", kind: "button", label: "Borrar historial de juego", description: "Los favoritos y colecciones se mantienen.", variant: "danger", btnLabel: "Borrar historial", confirmLabel: "¿Borrar historial?" },
        { id: "ac.cache", kind: "button", label: "Limpiar caché de metadatos", description: "Elimina las descripciones y portadas cacheadas.", variant: "danger", btnLabel: "Limpiar caché", confirmLabel: "¿Eliminar caché?" },
        { id: "ac.export", kind: "button", label: "Exportar biblioteca", description: "Exporta tu biblioteca a un archivo JSON.", variant: "ghost", btnLabel: "Exportar…" },
      ] }] },
    ],
  },

  // ───────────────────────── PORTADAS ─────────────────────────
  {
    id: "portadas", label: "Portadas", icon: "image", custom: "portadas",
    groups: [
      { title: "Fuentes", rows: [
        { id: "cov.libretro", kind: "toggle", label: "Libretro Thumbnails", description: "Descargar carátulas automáticamente desde Libretro (sin credenciales).", value: true },
        { id: "cov.priority", kind: "dropdown", variant: "selector", label: "Prioridad de fuentes",
          value: "Libretro primero", options: ["Libretro primero", "SteamGridDB primero", "Solo Libretro", "Solo SteamGridDB"] },
      ] },
      { title: "SteamGridDB", description: "Fuente de carátulas para Switch y sistemas modernos. Requiere API key gratuita (steamgriddb.com → Preferences → API).", rows: [
        { id: "cov.sgdbkey", kind: "path", label: "SteamGridDB API Key", secret: true, value: "" },
        { id: "cov.sgdbopen", kind: "button", label: "Abrir SteamGridDB", description: "Crea una cuenta y genera tu API key.", variant: "ghost", btnLabel: "Abrir web", icon: "external" },
      ] },
      { title: "ScreenScraper", description: "Descarga descripciones, géneros, años y carátulas adicionales. Requiere credenciales.", rows: [
        { id: "cov.ssdevid", kind: "path", label: "ScreenScraper Dev ID", value: "" },
        { id: "cov.ssdevpass", kind: "path", label: "ScreenScraper Dev Password", secret: true, value: "" },
        { id: "cov.ssuserid", kind: "path", label: "ScreenScraper User ID", description: "Opcional.", value: "" },
        { id: "cov.ssuserpass", kind: "path", label: "ScreenScraper User Password", secret: true, description: "Opcional.", value: "" },
      ] },
      { title: "Acciones", rows: [
        { id: "cov.download", kind: "button", label: "Descargar carátulas", description: "Busca y descarga portadas faltantes desde las fuentes activas.", variant: "primary", btnLabel: "Descargar", busyStatus: "Descargando…", doneStatus: "118/120 encontradas" },
        { id: "cov.scrape", kind: "button", label: "Scrape metadatos completos", description: "Descripciones, géneros y años desde ScreenScraper.", variant: "primary", btnLabel: "Scrape", disabledKey: "noSScreds", busyStatus: "Scrapeando…", doneStatus: "96/120 encontrados" },
      ] },
    ],
  },

  // ────────────────────────── RUTAS ──────────────────────────
  {
    id: "rutas", label: "Rutas", icon: "folder",
    groups: [{ rows: [
      { id: "path.roms", kind: "folder", label: "Directorio de ROMs", description: "Carpeta raíz donde se buscan las ROMs.", openable: true, value: "~/Games/ROMs", hint: "/home/alex/Games/ROMs" },
      { id: "path.emus", kind: "folder", label: "Directorio de emuladores", description: "Carpeta donde se buscan/instalan emuladores.", openable: true, value: "~/Games/Emulators", hint: "/home/alex/Games/Emulators" },
      { id: "path.meta", kind: "folder", label: "Directorio de metadatos", description: "Carpeta para metadatos y carátulas descargadas.", value: "~/.emura/metadata", hint: "/home/alex/.emura/metadata" },
      { id: "path.saves", kind: "folder", label: "Directorio de guardados", description: "Carpeta donde se almacenan las partidas guardadas.", value: "~/.emura/saves", hint: "/home/alex/.emura/saves" },
    ] }],
  },

  // ──────────────────────── EMULADORES ────────────────────────
  { id: "emuladores", label: "Emuladores", icon: "gamepad", custom: "emuladores" },

  // ─────────────────────── RETROACHIEVEMENTS ───────────────────
  {
    id: "retro", label: "RetroAchievements", icon: "trophy",
    groups: [
      { title: "Cuenta", description: "Conecta tu cuenta de retroachievements.org para sincronizar logros.", rows: [
        { id: "ra.status", kind: "info", label: "Estado", value: "○ No conectado", nonFocusable: true },
        { id: "ra.user", kind: "path", label: "Usuario", value: "" },
        { id: "ra.pass", kind: "path", label: "Contraseña", secret: true, description: "Solo se usa una vez para obtener tu token; no se almacena.", value: "" },
        { id: "ra.apikey", kind: "path", label: "Web API Key", secret: true, description: "retroachievements.org → Settings → Keys.", value: "" },
        { id: "ra.connect", kind: "button", label: "Conectar", variant: "primary", btnLabel: "Conectar", busyStatus: "Conectando…" },
        { id: "ra.disconnect", kind: "button", label: "Desconectar", variant: "danger", btnLabel: "Desconectar", disabledKey: "raDisconnected" },
      ] },
      { title: "Opciones", rows: [
        { id: "ra.enable", kind: "toggle", label: "Activar RetroAchievements", description: "Inyecta tus credenciales en RetroArch, Dolphin y DuckStation al lanzar un juego.", value: false },
        { id: "ra.hardcore", kind: "toggle", label: "Modo hardcore", description: "Sin save states ni trucos — la forma 'oficial' de ganar logros.", value: false },
      ] },
      { title: "Compatibilidad", rows: [
        { id: "ra.compat", kind: "info", tone: "warn", column: true, label: "Login automático",
          value: "RetroArch, Dolphin y DuckStation reciben credenciales automáticamente. PCSX2 y PPSSPP requieren login una vez dentro de cada uno.", nonFocusable: true },
      ] },
    ],
  },

  // ───────────────────────── AVANZADO ─────────────────────────
  {
    id: "avanzado", label: "Avanzado", icon: "wrench",
    tabs: [
      { id: "adv-general", label: "General", groups: [
        { title: "Desarrollo", rows: [
          { id: "adv.dev", kind: "toggle", label: "Modo desarrollador", description: "Muestra información adicional de depuración.", value: false },
        ] },
        { title: "Acerca de", rows: [
          { id: "adv.version", kind: "info", label: "Versión", value: "EmuraOS 1.4.2", nonFocusable: true },
        ] },
        { title: "Mando", rows: [
          { id: "adv.padconn", kind: "info", label: "Mando conectado", value: "Sí", tone: "good", nonFocusable: true },
          { id: "adv.remap", kind: "button", label: "Remapear controles", description: "Próximamente.", variant: "ghost", btnLabel: "Remapear", disabledKey: "always" },
        ] },
        { title: "Scripts de lanzamiento", description: "Hooks opcionales. Reciben variables de entorno EMURA_* (EMURA_GAME, EMURA_SYSTEM, EMURA_EMULATOR…).", rows: [
          { id: "adv.pre", kind: "path", label: "Script pre-lanzamiento", description: "Ruta absoluta. Vacío = sin hook. Timeout 5s.", value: "" },
          { id: "adv.post", kind: "path", label: "Script post-cierre", description: "Ruta absoluta. Recibe además EMURA_EXIT_CODE.", value: "" },
          { id: "adv.countdown", kind: "toggle", label: "Cuenta atrás de pre-lanzamiento", description: "Muestra 3-2-1 con la portada antes de abrir el emulador.", value: true },
        ] },
      ] },
      { id: "adv-diag", label: "Diagnóstico", groups: [{ rows: [
        { id: "adv.logs", kind: "button", label: "Abrir carpeta de logs", variant: "ghost", btnLabel: "Abrir", icon: "folder-open" },
        { id: "adv.diag", kind: "button", label: "Exportar diagnóstico", description: "Genera un archivo con configuración, biblioteca y versiones.", variant: "ghost", btnLabel: "Exportar…" },
        { id: "adv.config", kind: "button", label: "Abrir archivo de configuración", variant: "ghost", btnLabel: "Abrir", icon: "external" },
      ] }] },
      { id: "adv-reset", label: "Restablecer", groups: [{ rows: [
        { id: "adv.reset", kind: "button", label: "Restablecer configuración", description: "Restaura los valores por defecto. La app se recargará.", variant: "danger", btnLabel: "Restablecer", confirmLabel: "¿Restablecer configuración?" },
      ] }] },
    ],
  },
];

// Build default values map from every row that has a `value`.
function collectDefaults(schema) {
  const out = {};
  const walk = (rows) => rows && rows.forEach((r) => { if ("value" in r) out[r.id] = r.value; });
  schema.forEach((sec) => {
    if (sec.groups) sec.groups.forEach((g) => walk(g.rows));
    if (sec.tabs) sec.tabs.forEach((t) => t.groups.forEach((g) => walk(g.rows)));
  });
  return out;
}
const DEFAULT_VALUES = collectDefaults(SETTINGS_SCHEMA);

Object.assign(window, { SETTINGS_SCHEMA, DEFAULT_VALUES, CONSOLE_COLORS });
