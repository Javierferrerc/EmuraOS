// games-data.jsx — fictional library data. Exposes window.PLATFORMS, window.GAMES, helpers.
// All names are invented to avoid real brands. Three "console" platforms, each with
// its own signature tint (a nod to blue/green/coral hybrids).

const PLATFORMS = [
  { id: "all",   name: "Biblioteca", short: "Todo",   tint: "#9aa6c0", glyph: "all" },
  { id: "orbis", name: "Orbis",      short: "Orbis",  tint: "#3b82f6", glyph: "circle",
    tagline: "Cine interactivo de gran presupuesto" },
  { id: "helix", name: "Helix",      short: "Helix",  tint: "#22c55e", glyph: "hex",
    tagline: "Potencia bruta y mundos abiertos" },
  { id: "pulse", name: "Pulse",      short: "Pulse",  tint: "#f43f5e", glyph: "square",
    tagline: "Diversión portátil para todos" },
];

// art.style: beam | orb | grid | wave | split | rings — drives the procedural cover.
const GAMES = [
  // ───────────── ORBIS (cinematic AAA, blue) ─────────────
  { id: "aetheron", title: "Aetheron", platform: "orbis", genre: "Action RPG",
    dev: "Vael Interactive", year: 2025, size: "112 GB", rating: 4.8,
    hours: 64, lastPlayed: "Hace 2 horas", progress: 73, installed: true, featured: true,
    achU: 38, achT: 51,
    art: { hue: 224, style: "rings", motif: 2 },
    blurb: "Un reino flotante se desmorona y solo el último Custodio puede reescribir su destino. Combate fluido, decisiones con peso y un mundo que recuerda cada elección.",
    tags: ["Un jugador", "Mundo abierto", "Historia rica"] },
  { id: "nightfall", title: "Nightfall Protocol", platform: "orbis", genre: "Shooter táctico",
    dev: "Ironline Studios", year: 2024, size: "88 GB", rating: 4.5,
    hours: 41, lastPlayed: "Ayer", progress: 55, installed: true, featured: false,
    achU: 22, achT: 40,
    art: { hue: 250, style: "beam", motif: 1 },
    blurb: "Operaciones encubiertas en una ciudad bajo apagón permanente. Sigilo, gadgets y cooperativo de hasta cuatro agentes.",
    tags: ["Cooperativo", "Sigilo", "Online"] },
  { id: "vermillion", title: "Vermillion Shores", platform: "orbis", genre: "Aventura",
    dev: "Lantern Bay", year: 2025, size: "64 GB", rating: 4.7,
    hours: 19, lastPlayed: "Hace 3 días", progress: 31, installed: true, featured: false,
    achU: 12, achT: 33,
    art: { hue: 12, style: "wave", motif: 0 },
    blurb: "Una expedición a unas islas que aparecen solo durante la marea roja. Exploración pausada, secretos y una banda sonora memorable.",
    tags: ["Un jugador", "Exploración", "Relajante"] },
  { id: "covenant", title: "Iron Covenant", platform: "orbis", genre: "Estrategia",
    dev: "Bastion Forge", year: 2023, size: "47 GB", rating: 4.3,
    hours: 88, lastPlayed: "Hace 1 semana", progress: 90, installed: false, featured: false,
    achU: 44, achT: 60,
    art: { hue: 205, style: "grid", motif: 2 },
    blurb: "Forja alianzas, traiciona imperios y comanda flotas en una guerra fría interestelar por turnos.",
    tags: ["Estrategia", "Por turnos", "Multijugador"] },
  { id: "solstice", title: "Solstice Drift", platform: "orbis", genre: "Carreras",
    dev: "Apex Motion", year: 2024, size: "72 GB", rating: 4.6,
    hours: 27, lastPlayed: "Hace 4 días", progress: 48, installed: true, featured: false,
    achU: 18, achT: 35,
    art: { hue: 196, style: "split", motif: 1 },
    blurb: "Carreras nocturnas de derrape por costas neón. Conducción arcade afilada con clima dinámico.",
    tags: ["Carreras", "Online", "Arcade"] },
  { id: "hollow", title: "Hollow Saints", platform: "orbis", genre: "Soulslike",
    dev: "Grimveil", year: 2025, size: "58 GB", rating: 4.9,
    hours: 53, lastPlayed: "Hace 5 horas", progress: 62, installed: true, featured: false,
    achU: 27, achT: 48,
    art: { hue: 268, style: "orb", motif: 2 },
    blurb: "Desciende a una catedral invertida donde los santos caídos custodian la verdad. Desafío exigente y diseño de niveles entrelazado.",
    tags: ["Difícil", "Un jugador", "Atmosférico"] },

  // ───────────── HELIX (raw power, open worlds, green) ─────────────
  { id: "mechanica", title: "Frontier Mechanica", platform: "helix", genre: "Simulación",
    dev: "Cogwork Labs", year: 2025, size: "39 GB", rating: 4.4,
    hours: 71, lastPlayed: "Hace 6 horas", progress: 44, installed: true, featured: true,
    achU: 30, achT: 70,
    art: { hue: 140, style: "grid", motif: 1 },
    blurb: "Construye, automatiza y coloniza un planeta hostil. Cadenas de producción sin límites y física de verdad.",
    tags: ["Construcción", "Sandbox", "Cooperativo"] },
  { id: "stormrelic", title: "Storm Relic", platform: "helix", genre: "Acción-Aventura",
    dev: "Tideborn", year: 2024, size: "76 GB", rating: 4.6,
    hours: 34, lastPlayed: "Ayer", progress: 58, installed: true, featured: false,
    achU: 20, achT: 45,
    art: { hue: 168, style: "wave", motif: 2 },
    blurb: "Cabalga tormentas vivientes en busca de reliquias antiguas. Mundo abierto vertical con escalada libre.",
    tags: ["Mundo abierto", "Un jugador", "Épico"] },
  { id: "apexcircuit", title: "Apex Circuit", platform: "helix", genre: "Carreras",
    dev: "Velocity Nine", year: 2025, size: "61 GB", rating: 4.5,
    hours: 22, lastPlayed: "Hace 2 días", progress: 37, installed: true, featured: false,
    achU: 14, achT: 38,
    art: { hue: 152, style: "split", motif: 1 },
    blurb: "Fórmula del futuro a 480 km/h. Simulación profunda con telemetría y ligas online.",
    tags: ["Simulación", "Online", "Competitivo"] },
  { id: "dustdiesel", title: "Dust & Diesel", platform: "helix", genre: "Mundo abierto",
    dev: "Rustbelt", year: 2023, size: "94 GB", rating: 4.2,
    hours: 105, lastPlayed: "Hace 3 días", progress: 81, installed: false, featured: false,
    achU: 51, achT: 64,
    art: { hue: 96, style: "beam", motif: 0 },
    blurb: "Un páramo postindustrial donde tu convoy es tu hogar. Saqueo, comercio y facciones en guerra.",
    tags: ["Supervivencia", "Mundo abierto", "Conducción"] },
  { id: "cinder", title: "Cinder Tactics", platform: "helix", genre: "Estrategia",
    dev: "Emberline", year: 2024, size: "28 GB", rating: 4.7,
    hours: 46, lastPlayed: "Hace 1 semana", progress: 66, installed: true, featured: false,
    achU: 33, achT: 52,
    art: { hue: 124, style: "grid", motif: 2 },
    blurb: "Escuadrones tácticos por turnos en cuadrícula. Permadeath opcional y campañas generadas.",
    tags: ["Táctico", "Por turnos", "Un jugador"] },
  { id: "quantum", title: "Quantum Break Line", platform: "helix", genre: "Puzzle-Shooter",
    dev: "Paradox Cell", year: 2025, size: "33 GB", rating: 4.4,
    hours: 16, lastPlayed: "Hace 5 días", progress: 29, installed: true, featured: false,
    achU: 9, achT: 30,
    art: { hue: 176, style: "rings", motif: 1 },
    blurb: "Manipula el tiempo para resolver arenas imposibles. Acción cerebral con física temporal.",
    tags: ["Puzzle", "Acción", "Un jugador"] },

  // ───────────── PULSE (playful, portable, coral) ─────────────
  { id: "pebble", title: "Pebble Pals", platform: "pulse", genre: "Aventura",
    dev: "Marigold Games", year: 2025, size: "8 GB", rating: 4.9,
    hours: 23, lastPlayed: "Hace 1 hora", progress: 52, installed: true, featured: true,
    achU: 16, achT: 28,
    art: { hue: 350, style: "orb", motif: 1 },
    blurb: "Cuida una isla de criaturas-guijarro, decora y resuelve acertijos suaves. Encantador y sin estrés.",
    tags: ["Familiar", "Relajante", "Cooperativo local"] },
  { id: "bloomtown", title: "Bloomtown", platform: "pulse", genre: "Simulación de vida",
    dev: "Cozy Quarter", year: 2024, size: "6 GB", rating: 4.8,
    hours: 119, lastPlayed: "Hace 4 horas", progress: 70, installed: true, featured: false,
    achU: 40, achT: 55,
    art: { hue: 330, style: "wave", motif: 0 },
    blurb: "Hereda una granja, revive un pueblo y haz amigos a lo largo de las estaciones. Sin prisa, mucho corazón.",
    tags: ["Simulación", "Relajante", "Romance"] },
  { id: "kart", title: "Kart Rumble", platform: "pulse", genre: "Carreras",
    dev: "Turbo Tail", year: 2025, size: "11 GB", rating: 4.7,
    hours: 38, lastPlayed: "Ayer", progress: 60, installed: true, featured: false,
    achU: 21, achT: 32,
    art: { hue: 18, style: "split", motif: 2 },
    blurb: "Carreras locas con objetos y pistas que se transforman. Fiesta para ocho jugadores en el sofá.",
    tags: ["Fiesta", "Multijugador local", "Familiar"] },
  { id: "skynoodles", title: "Sky Noodles", platform: "pulse", genre: "Plataformas",
    dev: "Wobble Works", year: 2024, size: "4 GB", rating: 4.6,
    hours: 14, lastPlayed: "Hace 2 días", progress: 41, installed: true, featured: false,
    achU: 11, achT: 24,
    art: { hue: 36, style: "beam", motif: 1 },
    blurb: "Estira, rebota y vuela por islas de gelatina. Plataformas elásticas con física disparatada.",
    tags: ["Plataformas", "Familiar", "Cooperativo local"] },
  { id: "mochi", title: "Mochi Quest", platform: "pulse", genre: "RPG",
    dev: "Sugar Forge", year: 2025, size: "9 GB", rating: 4.8,
    hours: 57, lastPlayed: "Hace 6 horas", progress: 49, installed: true, featured: false,
    achU: 26, achT: 46,
    art: { hue: 312, style: "rings", motif: 1 },
    blurb: "Un RPG de bolsillo lleno de postres con vida propia. Combate por turnos chispeante y mundo adorable.",
    tags: ["RPG", "Por turnos", "Familiar"] },
  { id: "puzzlepop", title: "Puzzle Pop!", platform: "pulse", genre: "Puzzle",
    dev: "Bubble Logic", year: 2023, size: "2 GB", rating: 4.5,
    hours: 31, lastPlayed: "Hace 3 días", progress: 88, installed: false, featured: false,
    achU: 35, achT: 40,
    art: { hue: 286, style: "grid", motif: 0 },
    blurb: "Cientos de niveles de lógica adictiva con un giro cada mundo. Perfecto para ratos cortos.",
    tags: ["Puzzle", "Casual", "Un jugador"] },
];

function gamesByPlatform(pid) {
  if (pid === "all") return GAMES;
  return GAMES.filter((g) => g.platform === pid);
}
function gameById(id) { return GAMES.find((g) => g.id === id); }
function platformById(id) { return PLATFORMS.find((p) => p.id === id); }
function recentGames(limit = 6) {
  // crude recency from lastPlayed wording
  const rank = (s) => {
    if (s.includes("hora")) return 0 + (parseInt(s) || 1);
    if (s.includes("Ayer")) return 24;
    if (s.includes("día")) return 24 * (parseInt(s) || 1);
    if (s.includes("semana")) return 24 * 7 * (parseInt(s) || 1);
    return 999;
  };
  return [...GAMES].filter((g) => g.progress > 0)
    .sort((a, b) => rank(a.lastPlayed) - rank(b.lastPlayed))
    .slice(0, limit);
}

Object.assign(window, { PLATFORMS, GAMES, gamesByPlatform, gameById, platformById, recentGames });
