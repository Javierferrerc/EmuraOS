/**
 * gameDetailData.ts — pure helpers for the NEXUS ficha (game detail page).
 *
 * Real data (title, genre, year, developer, rating, players, size, play
 * history, cover/hero/screenshot) comes straight from the NexusGame /
 * AppContext. A few panels in the reference design (compatibility seal,
 * ratings distribution, save-state slots) don't yet have a backend in this
 * launcher — those are produced here as DETERMINISTIC placeholders, stable per
 * game id, and are clearly marked so they can be swapped for real sources when
 * the emulator/back-end exposes them.
 */

import type { NexusGame } from "../nexusModel";

/** Has this game actually been launched? Drives Continuar/Jugar, the resume
 *  button and whether the save-state list shows. */
export function hasPlayed(game: NexusGame): boolean {
  const p = game.play;
  return !!p && ((p.playCount ?? 0) > 0 || (p.totalPlayTime ?? 0) > 0);
}

/** sRGB hex → OKLCH hue (degrees). Lets the whole ficha tint (`--hue`) follow
 *  the game's real system/family accent colour instead of a random hash. */
export function oklchHueFromHex(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 224; // NEXUS default blue hue
  const int = parseInt(m[1], 16);
  const toLinear = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear((int >> 16) & 0xff);
  const g = toLinear((int >> 8) & 0xff);
  const b = toLinear(int & 0xff);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const mch = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(mch);
  const s_ = Math.cbrt(s);
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return Math.round(h);
}

/** Human size for the metadata grid. */
export function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${Math.max(1, Math.round(mb))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Players: real metadata first ("1", "1-2", "2 jugadores"…), else "—". */
export function playersLabel(game: NexusGame): string {
  const raw = (game.players || "").trim();
  if (!raw) return "—";
  if (/jugador/i.test(raw)) return raw;
  if (/^1$/.test(raw)) return "1 jugador";
  return `${raw} jugadores`;
}

/** ISO timestamp → relative Spanish label ("Hace 2 horas", "Ayer", …). */
export function relativeTime(iso: string | undefined): string {
  if (!iso) return "Nunca";
  const then = Date.parse(iso);
  if (!then) return "Nunca";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Justo ahora";
  if (min < 60) return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `Hace ${hrs} ${hrs === 1 ? "hora" : "horas"}`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `Hace ${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Hace ${months} ${months === 1 ? "mes" : "meses"}`;
  const years = Math.floor(days / 365);
  return `Hace ${years} ${years === 1 ? "año" : "años"}`;
}

/** Format accumulated seconds as "Xh Ym" / "Ym" for the activity stat. */
export function formatHours(totalSeconds: number | undefined): string {
  const s = totalSeconds ?? 0;
  if (s <= 0) return "0 h";
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

// ── Deterministic placeholders (no backend yet) ─────────────────────
// FNV-1a + xorshift, identical to the design so the placeholders stay stable.
function gdSeed(str: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
}

export type CompatId = "perfecto" | "jugable" | "problemas";
export interface Compat {
  id: CompatId;
  label: string;
}

/** PLACEHOLDER compatibility seal — deterministic per game id. Replace with a
 *  real per-core compatibility lookup when one exists. */
export function compatOf(game: NexusGame): Compat {
  const r = gdSeed(game.key + "c")();
  if (r < 0.7) return { id: "perfecto", label: "Perfecto" };
  if (r < 0.93) return { id: "jugable", label: "Jugable" };
  return { id: "problemas", label: "Con problemas" };
}

export interface RatingDist {
  lines: Array<{ star: number; pc: number }>;
  count: number;
}

/** Ratings distribution. The aggregate `rating` is real; the per-star spread
 *  and review count are a deterministic shape around it (no per-review backend
 *  in this launcher). */
export function ratingDist(game: NexusGame): RatingDist {
  const rng = gdSeed(game.key + "r");
  const dist = [5, 4, 3, 2, 1].map((star) => {
    const w = Math.max(2, 100 - Math.abs(star - game.rating) * 42 - rng() * 16);
    return { star, w };
  });
  const total = dist.reduce((s, d) => s + d.w, 0);
  const count = 200 + Math.floor(gdSeed(game.key + "n")() * 4800);
  return {
    lines: dist.map((d) => ({ star: d.star, pc: Math.round((d.w / total) * 100) })),
    count,
  };
}

export interface SaveSlot {
  slot: string;
  auto: boolean;
  when: string;
  idx: number;
}

/** Save-state slots. The launcher doesn't read the emulator's save states yet,
 *  so rather than fabricate "Ranura N" slots we surface a single honest entry —
 *  the autosave anchored to the real last-played time — and only when the game
 *  has actually been played. Replace with the real save-state list (per slot,
 *  with real thumbnails) once the emulator exposes it. */
export function savesOf(game: NexusGame): SaveSlot[] {
  if (!hasPlayed(game) || !game.play?.lastPlayed) return [];
  return [{ slot: "Última sesión", auto: true, when: relativeTime(game.play.lastPlayed), idx: 0 }];
}
