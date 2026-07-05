import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseIni, serializeIni, type IniData } from "./config-parsers.js";
import type { DolphinGameConfig } from "./types.js";
import { getPlatform, userDataDir } from "./platform.js";

/**
 * Dolphin per-game configuration writer.
 *
 * Dolphin reads `<User>/GameSettings/<GameID>.ini` whenever it boots a
 * disc whose 6-char id matches the filename. The format is a normal INI
 * with sections like `[Core]`, `[Video_Settings]`, `[Video_Hacks]`,
 * `[Controls]`. Round-tripping preserves any key the user hand-edited
 * (or that other Dolphin features wrote) — we only touch the curated
 * subset declared in `DolphinGameConfig`.
 *
 * GameID resolution is best-effort: we read the first 6 bytes of the ROM
 * file, which covers the common Wii/GameCube containers (ISO, GCM, plain
 * WBFS). Compressed containers (RVZ, CISO, WIA) have a header that hides
 * those bytes; for those the caller has to prompt the user for the ID,
 * which Dolphin always shows in its game list.
 */

/** Curated mapping between our high-level keys and Dolphin's INI keys.
 *  Centralised here so the UI doesn't need to know INI section names. */
const DOLPHIN_KEY_MAP = {
  overclockEnable: { section: "Core", key: "OverclockEnable", encode: boolStr },
  overclockFactor: { section: "Core", key: "Overclock", encode: floatStr },
  emulationSpeed: { section: "Core", key: "EmulationSpeed", encode: floatStr },
  aspectRatio: { section: "Video_Settings", key: "AspectRatio", encode: intStr },
  wideScreenHack: {
    section: "Video_Settings",
    key: "wideScreenHack",
    encode: boolStr,
  },
  skipEFBAccess: {
    section: "Video_Hacks",
    key: "EFBAccessEnable",
    encode: (v: boolean) => boolStr(!v),
  },
  disablePort2: { section: "Controls", key: "PadType2", encode: disabledPortStr },
} as const satisfies Record<
  keyof DolphinGameConfig,
  {
    section: string;
    key: string;
    encode: (value: never) => string;
  }
>;

function boolStr(v: boolean): string {
  return v ? "True" : "False";
}
function intStr(v: number): string {
  return String(Math.round(v));
}
function floatStr(v: number): string {
  return v.toFixed(2);
}
function disabledPortStr(v: boolean): string {
  // Dolphin PadType 0 = standard controller, 6 = none.
  return v ? "6" : "0";
}

/**
 * Resolve Dolphin's User directory. Honors portable mode (a `portable.txt`
 * next to the executable — supported by Dolphin on every OS) and falls back
 * to the platform's well-known locations:
 *  - Windows: Documents/Dolphin Emulator, then %APPDATA%/Dolphin Emulator
 *  - macOS:   ~/Library/Application Support/Dolphin
 *  - Linux:   ~/.local/share/dolphin-emu (also the Flatpak data variant)
 * Returns null when no installation we know about is detectable — the
 * caller surfaces a "Dolphin not installed?" error rather than guessing.
 */
export function resolveDolphinUserDir(
  dolphinExecutablePath: string | null,
  appDataPath: string,
  documentsPath: string,
  platform: NodeJS.Platform = process.platform
): string | null {
  if (dolphinExecutablePath) {
    const installDir = path.dirname(dolphinExecutablePath);
    if (existsSync(path.join(installDir, "portable.txt"))) {
      return path.join(installDir, "User");
    }
  }

  switch (getPlatform(platform)) {
    case "darwin": {
      // macOS builds keep everything under Application Support/Dolphin.
      return path.join(appDataPath, "Dolphin");
    }
    case "linux": {
      // GameSettings live under the XDG *data* dir, not the config dir.
      // Flatpak installs keep it inside the app sandbox under ~/.var/app.
      const xdgData = path.join(userDataDir(platform), "dolphin-emu");
      if (existsSync(xdgData)) return xdgData;
      const flatpakData = path.join(
        os.homedir(),
        ".var",
        "app",
        "org.DolphinEmu.dolphin-emu",
        "data",
        "dolphin-emu"
      );
      if (existsSync(flatpakData)) return flatpakData;
      return xdgData;
    }
    case "win32":
    default: {
      const documentsCandidate = path.join(documentsPath, "Dolphin Emulator");
      if (existsSync(documentsCandidate)) return documentsCandidate;
      const appDataCandidate = path.join(appDataPath, "Dolphin Emulator");
      if (existsSync(appDataCandidate)) return appDataCandidate;
      // Even if neither dir exists yet, prefer the Documents convention so
      // Dolphin picks up our file the next time it launches.
      return documentsCandidate;
    }
  }
}

/** Try to extract a 6-char ASCII GameID from a Wii/GC ROM. Returns null
 *  for compressed formats or unreadable files. */
export function detectGameId(romPath: string): string | null {
  let fd: number | null = null;
  try {
    if (!existsSync(romPath)) return null;
    fd = openSync(romPath, "r");
    const buf = Buffer.alloc(6);
    const bytesRead = readSync(fd, buf, 0, 6, 0);
    if (bytesRead < 6) return null;
    const candidate = buf.toString("ascii");
    if (/^[A-Z0-9]{6}$/.test(candidate)) return candidate;
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* swallow */
      }
    }
  }
}

function gameSettingsPath(userDir: string, gameId: string): string {
  return path.join(userDir, "GameSettings", `${gameId}.ini`);
}

/** Read the curated subset of keys for a game. Missing file / missing keys
 *  surface as `undefined` so the UI can render "(default)" instead of a
 *  forced state. */
export function readDolphinGameConfig(
  userDir: string,
  gameId: string
): DolphinGameConfig {
  const filePath = gameSettingsPath(userDir, gameId);
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, "utf-8");
  const ini = parseIni(raw);
  const out: DolphinGameConfig = {};

  const core = ini["Core"] ?? {};
  if (core.OverclockEnable !== undefined) {
    out.overclockEnable = core.OverclockEnable.toLowerCase() === "true";
  }
  if (core.Overclock !== undefined) {
    const n = Number(core.Overclock);
    if (Number.isFinite(n)) out.overclockFactor = n;
  }
  if (core.EmulationSpeed !== undefined) {
    const n = Number(core.EmulationSpeed);
    if (Number.isFinite(n)) out.emulationSpeed = n;
  }

  const video = ini["Video_Settings"] ?? {};
  if (video.AspectRatio !== undefined) {
    const n = Number(video.AspectRatio);
    if (n === 0 || n === 1 || n === 2 || n === 3) out.aspectRatio = n;
  }
  if (video.wideScreenHack !== undefined) {
    out.wideScreenHack = video.wideScreenHack.toLowerCase() === "true";
  }

  const hacks = ini["Video_Hacks"] ?? {};
  if (hacks.EFBAccessEnable !== undefined) {
    out.skipEFBAccess = hacks.EFBAccessEnable.toLowerCase() === "false";
  }

  const controls = ini["Controls"] ?? {};
  if (controls.PadType2 !== undefined) {
    out.disablePort2 = controls.PadType2 === "6";
  }

  return out;
}

/** Persist a per-game patch. Only keys explicitly present in `patch` are
 *  written; absent keys are left untouched so the user can clear an
 *  individual override by setting it to `undefined`. */
export function writeDolphinGameConfig(
  userDir: string,
  gameId: string,
  patch: DolphinGameConfig
): { configPath: string } {
  const filePath = gameSettingsPath(userDir, gameId);
  mkdirSync(path.dirname(filePath), { recursive: true });

  const ini: IniData = existsSync(filePath)
    ? parseIni(readFileSync(filePath, "utf-8"))
    : {};

  for (const [field, value] of Object.entries(patch) as Array<
    [keyof DolphinGameConfig, DolphinGameConfig[keyof DolphinGameConfig]]
  >) {
    const mapping = DOLPHIN_KEY_MAP[field];
    if (!mapping) continue;
    if (!ini[mapping.section]) ini[mapping.section] = {};
    if (value === undefined || value === null) {
      delete ini[mapping.section][mapping.key];
      if (Object.keys(ini[mapping.section]).length === 0) {
        delete ini[mapping.section];
      }
    } else {
      // Encoder signatures are typed against `never` so the switch table
      // stays branch-free; the value is always the matching primitive.
      ini[mapping.section][mapping.key] = (
        mapping.encode as (v: unknown) => string
      )(value);
    }
  }

  writeFileSync(filePath, serializeIni(ini), "utf-8");
  return { configPath: filePath };
}
