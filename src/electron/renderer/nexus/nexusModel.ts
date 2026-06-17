/**
 * NEXUS data model — adapts the real AppContext data (scanResult, metadata,
 * play history, added dates) into the shape the NEXUS shell renders.
 *
 * The design ships fictional games; here every "game" is a real DiscoveredRom
 * enriched with its cached metadata, system tint and a deterministic hue used
 * only for the procedural cover fallback (when no real cover exists yet).
 */

import type {
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
