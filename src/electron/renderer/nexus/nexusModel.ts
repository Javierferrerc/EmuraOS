/**
 * NEXUS data model — adapts the real AppContext data (scanResult, metadata,
 * play history, added dates) into the shape the NEXUS shell renders.
 *
 * The design ships fictional games; here every "game" is a real DiscoveredRom
 * enriched with its cached metadata, system tint and a deterministic hue used
 * only for the procedural cover fallback (when no real cover exists yet).
 */

import type {
  CloudLibraryCache,
  Collection,
  DiscoveredRom,
  GameMetadata,
  PlayRecord,
  ScanResult,
} from "../../../core/types";
import { parseRomAttributes } from "../../../core/rom-attributes";
import { SYSTEM_COLORS } from "../utils/sliderItems";
import { resolveSystemMembers } from "../utils/systemGroups";

export interface NexusGame {
  rom: DiscoveredRom;
  key: string;
  title: string;
  genre: string;
  year: string;
  rating: number; // 0..5
  developer: string;
  players: string;
  blurb: string;
  coverPath: string | null;
  systemId: string;
  systemName: string;
  tint: string; // platform accent
  hue: number; // 0..360 for the procedural fallback cover
  addedTs: number; // ms epoch, 0 if unknown
  play: PlayRecord | null;
  // ── Filename-derived attributes (always available, no scrape needed) ──
  /** Localized region label ("EE.UU.", "Europa"…) parsed from the filename. */
  region: string;
  /** Uppercased language codes parsed from the filename ("EN", "FR"…). */
  languages: string[];
  /** Normalized revision/version descriptor ("Rev 1", "v1.1"). */
  revision: string;
  /** Disc number for multi-disc releases, 0 when not applicable. */
  disc: number;
  /** Known from the account's cloud library (another machine) but the ROM
   *  isn't on this one — shown dimmed and can't be launched until added. */
  missing?: boolean;
  /** Shareable cover URL from the cloud catalog (used when there's no local cover). */
  coverUrl?: string | null;
}

const SYSTEM_DISPLAY: Record<string, string> = {
  nes: "NES",
  snes: "SNES",
  n64: "N64",
  gb: "Game Boy",
  gbc: "Game Boy Color",
  gba: "Game Boy Advance",
  nds: "Nintendo DS",
  "3ds": "Nintendo 3DS",
  gamecube: "GameCube",
  wii: "Wii",
  wiiu: "Wii U",
  switch: "Switch",
  megadrive: "Mega Drive",
  mastersystem: "Master System",
  dreamcast: "Dreamcast",
  psx: "PlayStation",
  ps2: "PlayStation 2",
  ps3: "PlayStation 3",
  psp: "PSP",
};

export function systemDisplayName(systemId: string, fallback?: string): string {
  return SYSTEM_DISPLAY[systemId] ?? fallback ?? systemId.toUpperCase();
}

/** Deterministic hue (0..360) derived from a ROM key so its fallback cover is
 *  stable across renders and sessions. */
function hueFromKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) % 360;
  }
  return h;
}

/** Tint colour for a system, reusing the slider palette (groups share their
 *  primary member's colour via resolveSystemMembers fallthrough). */
export function tintForSystem(
  systemId: string,
  customColors?: Record<string, string>
): string {
  const custom = customColors?.[systemId];
  if (custom) return custom;
  return SYSTEM_COLORS[systemId]?.iconColor ?? "#9aa6c0";
}

function ratingToNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return 0;
  // Metadata stores a 0..5 scale; clamp defensively.
  return Math.max(0, Math.min(5, n));
}

interface BuildOpts {
  scanResult: ScanResult | null;
  getMetadataForRom: (systemId: string, fileName: string) => GameMetadata | null;
  romAddedDates: Record<string, string>;
  playHistory: Record<string, PlayRecord>;
  isRomHidden: (systemId: string, fileName: string) => boolean;
  customColors?: Record<string, string>;
}

/** Flatten the scan result into enriched NexusGame entries, skipping hidden
 *  ROMs. Returns one entry per discovered ROM. */
export function buildNexusGames(opts: BuildOpts): NexusGame[] {
  const { scanResult, getMetadataForRom, romAddedDates, playHistory, isRomHidden, customColors } = opts;
  if (!scanResult) return [];
  const games: NexusGame[] = [];
  for (const system of scanResult.systems) {
    for (const rom of system.roms) {
      if (isRomHidden(rom.systemId, rom.fileName)) continue;
      const key = `${rom.systemId}:${rom.fileName}`;
      const meta = getMetadataForRom(rom.systemId, rom.fileName);
      const addedRaw = romAddedDates[key];
      const addedTs = addedRaw ? Date.parse(addedRaw) || 0 : 0;
      const attrs = parseRomAttributes(rom.fileName);
      games.push({
        rom,
        key,
        title: meta?.title || attrs.cleanTitle,
        genre: meta?.genre || "",
        year: meta?.year || "",
        rating: ratingToNumber(meta?.rating),
        developer: meta?.developer || meta?.publisher || "",
        players: meta?.players || "",
        blurb: meta?.description || "",
        coverPath: meta?.coverPath || null,
        systemId: rom.systemId,
        systemName: systemDisplayName(rom.systemId, rom.systemName),
        tint: tintForSystem(rom.systemId, customColors),
        hue: hueFromKey(key),
        addedTs,
        play: playHistory[key] ?? null,
        region: attrs.region ?? "",
        languages: attrs.languages ?? [],
        revision: attrs.revision ?? "",
        disc: attrs.disc ?? 0,
      });
    }
  }
  return games;
}

/** Normalized title used to match the same game across differently named
 *  files ("Zelda (USA).sfc" vs "zelda.zip"). */
export function titleMatchKey(systemId: string, title: string): string {
  return `${systemId}|${title.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "")}`;
}

interface GhostOpts {
  cloud: CloudLibraryCache | null;
  localGames: NexusGame[];
  playHistory: Record<string, PlayRecord>;
  favorites: Set<string>;
  collections: Collection[];
  pinned: string[];
  customColors?: Record<string, string>;
  /** Local metadata cache — a cover fetched on THIS machine for a game that
   *  lives on another one (see useGhostCovers) is used before the cloud one. */
  getMetadataForRom?: (systemId: string, fileName: string) => GameMetadata | null;
}

/**
 * Games the account has on OTHER machines (or played / favourited / pinned
 * there) whose ROM isn't on this one. Built from the cloud-synced catalog so the
 * library, profile and ficha can show them — dimmed, with "not on this
 * machine" instead of "Jugar". A game already here under another file name
 * (same system + title) is not duplicated.
 */
export function buildGhostGames(opts: GhostOpts): NexusGame[] {
  const { cloud, localGames, playHistory, favorites, collections, pinned, customColors, getMetadataForRom } =
    opts;
  const localKeys = new Set(localGames.map((g) => g.key));
  const localTitles = new Set(localGames.map((g) => titleMatchKey(g.systemId, g.title)));
  const keys = new Set<string>(cloud?.remoteLib ?? []);
  for (const [k, r] of Object.entries(playHistory)) if ((r.playCount ?? 0) > 0) keys.add(k);
  favorites.forEach((k) => keys.add(k));
  for (const c of collections) if (c.kind !== "smart") c.roms.forEach((k) => keys.add(k));
  pinned.forEach((k) => keys.add(k));

  const ghosts: NexusGame[] = [];
  for (const key of keys) {
    if (localKeys.has(key)) continue;
    const idx = key.indexOf(":");
    if (idx <= 0) continue;
    const systemId = key.slice(0, idx);
    const fileName = key.slice(idx + 1);
    const attrs = parseRomAttributes(fileName);
    const entry = cloud?.games[key];
    const title = entry?.t || attrs.cleanTitle;
    if (localTitles.has(titleMatchKey(systemId, title))) continue;
    const systemName = systemDisplayName(systemId, entry?.s);
    ghosts.push({
      rom: { systemId, systemName, fileName, filePath: "", sizeBytes: 0 },
      key,
      title,
      genre: "",
      year: "",
      rating: 0,
      developer: "",
      players: "",
      blurb: "",
      coverPath: getMetadataForRom?.(systemId, fileName)?.coverPath || null,
      coverUrl: entry?.c ?? null,
      systemId,
      systemName,
      tint: tintForSystem(systemId, customColors),
      hue: hueFromKey(key),
      addedTs: 0,
      play: playHistory[key] ?? null,
      region: attrs.region ?? "",
      languages: attrs.languages ?? [],
      revision: attrs.revision ?? "",
      disc: attrs.disc ?? 0,
      missing: true,
    });
  }
  return ghosts;
}

/** A game from ANOTHER user's profile (their library / likes / pinned), shaped
 *  as a NexusGame so it renders with the same card as the viewer's own games.
 *  Only title/system/cover are known; it is never launchable here. `systemId`
 *  may be unknown (pinned entries only carry the display name) — it is then
 *  resolved from the name for the platform tint. */
export function remoteGame(
  g: { title: string; systemId?: string | null; systemName?: string | null; cover?: string | null },
  index: number
): NexusGame {
  const systemId = g.systemId || systemIdFromName(g.systemName) || "unknown";
  const systemName =
    systemId === "unknown" ? g.systemName ?? "" : systemDisplayName(systemId, g.systemName ?? undefined);
  const key = `remote:${index}:${systemId}:${g.title}`;
  return {
    rom: { systemId, systemName, fileName: g.title, filePath: "", sizeBytes: 0 },
    key,
    title: g.title,
    genre: "",
    year: "",
    rating: 0,
    developer: "",
    players: "",
    blurb: "",
    coverPath: null,
    coverUrl: g.cover ?? null,
    systemId,
    systemName,
    tint: tintForSystem(systemId),
    hue: hueFromKey(key),
    addedTs: 0,
    play: null,
    region: "",
    languages: [],
    revision: "",
    disc: 0,
  };
}

/** Reverse of systemDisplayName ("Game Boy" → "gb"), null when unknown. */
function systemIdFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  for (const [id, label] of Object.entries(SYSTEM_DISPLAY)) {
    if (label.toLowerCase() === n || id === n) return id;
  }
  return null;
}

/** Filter games to a platform selection. `"all"` returns everything; a system
 *  or group id resolves to its member systems. */
export function filterByPlatform(games: NexusGame[], platform: string): NexusGame[] {
  if (platform === "all") return games;
  const members = new Set(resolveSystemMembers(platform));
  return games.filter((g) => members.has(g.systemId));
}

export interface NexusRow {
  id: string;
  title: string;
  games: NexusGame[];
}

const ROW_LIMIT = 20;

/** Build the carousel rows for the home view from a platform-filtered set. */
export function buildRows(
  games: NexusGame[],
  recentlyPlayed: string[]
): NexusRow[] {
  const rows: NexusRow[] = [];
  const byKey = new Map(games.map((g) => [g.key, g]));

  const continueGames = recentlyPlayed
    .map((k) => byKey.get(k))
    .filter((g): g is NexusGame => !!g)
    .slice(0, ROW_LIMIT);
  if (continueGames.length > 0) {
    rows.push({ id: "continue", title: "Continuar jugando", games: continueGames });
  }

  const byAdded = [...games]
    .filter((g) => g.addedTs > 0)
    .sort((a, b) => b.addedTs - a.addedTs)
    .slice(0, ROW_LIMIT);
  if (byAdded.length > 0) {
    rows.push({ id: "recent", title: "Recién llegados", games: byAdded });
  }

  const byRating = [...games]
    .filter((g) => g.rating > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, ROW_LIMIT);
  if (byRating.length > 0) {
    rows.push({ id: "top", title: "Mejor valorados", games: byRating });
  }

  const alpha = [...games].sort((a, b) => a.title.localeCompare(b.title)).slice(0, ROW_LIMIT);
  rows.push({ id: "all", title: "Toda la biblioteca", games: alpha });

  return rows;
}

const SYSTEM_TAGLINE: Record<string, string> = {
  nes: "8-bit clásico",
  snes: "16-bit dorado",
  n64: "3D pionero",
  gb: "Portátil legendaria",
  gbc: "Color de bolsillo",
  gba: "32-bit portátil",
  gameboy: "Portátiles Nintendo",
  nds: "Doble pantalla",
  "3ds": "3D sin gafas",
  gamecube: "Cubo de potencia",
  wii: "Juego con movimiento",
  wiiu: "GamePad HD",
  switch: "Híbrida moderna",
  megadrive: "Velocidad Sega",
  mastersystem: "8-bit Sega",
  dreamcast: "Adelantada a su época",
  psx: "Discos y polígonos",
  ps2: "La más vendida",
  ps3: "Alta definición",
  psp: "Portátil multimedia",
};

/** Short characterful descriptor for a platform card (switch nav). Falls back
 *  to a real game count so it always says something true. */
export function taglineForSystem(systemId: string | null, count: number): string {
  if (systemId === null) return "Toda tu colección";
  return SYSTEM_TAGLINE[systemId] ?? `${count} ${count === 1 ? "juego" : "juegos"}`;
}

/** The most-recently-played game within a set, or null. Drives the "Continuar"
 *  hero — only returns a genuinely recent game (no rating/alpha fallback). */
export function pickContinue(games: NexusGame[], recentlyPlayed: string[]): NexusGame | null {
  if (games.length === 0) return null;
  const byKey = new Map(games.map((g) => [g.key, g]));
  for (const k of recentlyPlayed) {
    const g = byKey.get(k);
    if (g) return g;
  }
  return null;
}

/** Pick the hero game: most recently played in the current set, else the
 *  highest rated, else the first alphabetically. */
export function pickHero(games: NexusGame[], recentlyPlayed: string[]): NexusGame | null {
  if (games.length === 0) return null;
  const byKey = new Map(games.map((g) => [g.key, g]));
  for (const k of recentlyPlayed) {
    const g = byKey.get(k);
    if (g) return g;
  }
  const topRated = [...games].sort((a, b) => b.rating - a.rating)[0];
  if (topRated && topRated.rating > 0) return topRated;
  return [...games].sort((a, b) => a.title.localeCompare(b.title))[0];
}
