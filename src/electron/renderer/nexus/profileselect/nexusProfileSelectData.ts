/**
 * Persistence + model for the EMURA profile selector (PS5-style "¿Quién está
 * jugando?"). Profiles live in localStorage as a small JSON list so the
 * selector survives reloads. The model matches the design's handoff:
 *   { id, name, hue, avatar?, online, level, xp, last, kind }
 *
 * `avatar` (a data URL) wins over `hue` when present; otherwise the avatar is a
 * color orb derived from `hue`. The active profile's hue tints the whole stage.
 */

export type ProfileKind = "adult" | "kid";

export interface NexusProfileEntry {
  id: string;
  name: string;
  hue: number;
  /** Optional uploaded avatar as a data URL; takes priority over `hue`. */
  avatar?: string;
  online: boolean;
  level: number;
  /** 0..1 progress into the current level (for the optional meta view). */
  xp: number;
  last: string;
  kind: ProfileKind;
  /** True for profiles backed by a real EMURA (Supabase) account on this device. */
  account?: boolean;
}

const STORE_KEY = "nexus.profiles.v1";
const ACTIVE_KEY = "nexus.profiles.active";

/** Default profile seeded the first time the selector is shown. */
function defaultProfiles(): NexusProfileEntry[] {
  return [
    {
      id: "local",
      name: "Jugador",
      hue: 224,
      online: true,
      level: 1,
      xp: 0.05,
      last: "Ahora",
      kind: "adult",
    },
  ];
}

export function loadProfiles(): NexusProfileEntry[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultProfiles();
    const parsed = JSON.parse(raw) as NexusProfileEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultProfiles();
    return parsed.map(sanitize);
  } catch {
    return defaultProfiles();
  }
}

export function saveProfiles(list: NexusProfileEntry[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.map(sanitize)));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

export function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* non-fatal */
  }
}

function sanitize(p: NexusProfileEntry): NexusProfileEntry {
  return {
    id: String(p.id),
    name: String(p.name ?? "").slice(0, 24) || "Jugador",
    hue: Number.isFinite(p.hue) ? p.hue : 224,
    avatar: typeof p.avatar === "string" ? p.avatar : undefined,
    online: !!p.online,
    level: Number.isFinite(p.level) ? p.level : 1,
    xp: Number.isFinite(p.xp) ? p.xp : 0.05,
    last: String(p.last ?? "Ahora"),
    kind: p.kind === "kid" ? "kid" : "adult",
    account: !!p.account,
  };
}

/** Unique-ish id for a new profile (no Date.now in shared workflow scope, but
 * fine here in the renderer). */
export function newProfileId(): string {
  return "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
