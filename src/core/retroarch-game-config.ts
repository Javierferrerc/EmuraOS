import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  parseKeyValue,
  serializeKeyValue,
} from "./config-parsers.js";
import type { RetroArchGameConfig } from "./types.js";

/**
 * RetroArch per-game override writer (Phase 22).
 *
 * RetroArch natively auto-loads a per-game override config from
 * `<configDir>/config/<CoreDisplayName>/<romBasename>.cfg` whenever it
 * boots content with that core. We write a curated subset of keys there so
 * a game can carry its own tweaks (bilinear filter, integer scale, aspect
 * ratio, run-ahead, rewind) without touching the global retroarch.cfg.
 *
 * The fragile part — flagged before building — is the directory name.
 * RetroArch keys the folder on the core's *display name* (the libretro
 * `library_name`, e.g. "Snes9x", "Genesis Plus GX"), NOT the DLL filename.
 * That mapping isn't derivable from the filename, so we keep an explicit
 * table covering exactly the cores this launcher configures in
 * emulators.json. A core we don't recognise returns null from
 * `coreDisplayName`, and callers surface a "not supported" hint instead of
 * writing the override into the wrong folder.
 */

/** DLL short id (snes9x_libretro.dll → "snes9x") → RetroArch display name.
 *  Limited on purpose to the cores wired in src/data/emulators.json; extend
 *  this in lockstep when a new RetroArch core is added there. */
const CORE_DISPLAY_NAMES: Record<string, string> = {
  fceumm: "FCEUmm",
  snes9x: "Snes9x",
  mupen64plus_next: "Mupen64Plus-Next",
  gambatte: "Gambatte",
  mgba: "mGBA",
  genesis_plus_gx: "Genesis Plus GX",
  mednafen_psx_hw: "Beetle PSX HW",
};

/** Reduce a core argument (`cores\snes9x_libretro.dll`, `snes9x_libretro`,
 *  or a full path) to its short id (`snes9x`). */
export function coreShortId(coreArg: string): string {
  const base = path.basename(coreArg.replace(/\\/g, "/"));
  return base
    .replace(/\.(dll|so|dylib)$/i, "")
    .replace(/_libretro$/i, "");
}

/** Map a core argument to RetroArch's override folder name, or null when the
 *  core isn't one we have a verified display name for. */
export function coreDisplayName(coreArg: string): string | null {
  return CORE_DISPLAY_NAMES[coreShortId(coreArg)] ?? null;
}

/** Curated mapping between our high-level keys and RetroArch cfg keys.
 *  Centralised so the UI never needs to know cfg key names. */
const RA_KEY_MAP = {
  bilinearFilter: { key: "video_smooth", encode: boolStr },
  integerScale: { key: "video_scale_integer", encode: boolStr },
  aspectRatio: { key: "aspect_ratio_index", encode: intStr },
  runAhead: { key: "run_ahead_enabled", encode: boolStr },
  runAheadFrames: { key: "run_ahead_frames", encode: intStr },
  rewind: { key: "rewind_enable", encode: boolStr },
} as const satisfies Record<
  keyof RetroArchGameConfig,
  { key: string; encode: (value: never) => string }
>;

function boolStr(v: boolean): string {
  return v ? "true" : "false";
}
function intStr(v: number): string {
  return String(Math.round(v));
}

/**
 * Resolve RetroArch's config directory. RetroArch on Windows is portable by
 * default (config next to the exe), which is how this launcher installs it,
 * so `<emuDir>/config` is the primary candidate. We also honour an explicit
 * `portable.ini` marker and fall back to the roaming `%APPDATA%/RetroArch`
 * layout when that's the only one present.
 */
export function resolveRetroArchConfigDir(
  retroArchExecutablePath: string | null,
  appDataPath: string
): string | null {
  if (retroArchExecutablePath && !retroArchExecutablePath.startsWith("flatpak:")) {
    const installDir = path.dirname(retroArchExecutablePath);
    const portableConfig = path.join(installDir, "config");
    // portable.ini marker or an already-present config dir both confirm the
    // portable layout; otherwise still prefer it (RetroArch's Windows default).
    if (
      existsSync(path.join(installDir, "portable.ini")) ||
      existsSync(portableConfig)
    ) {
      return portableConfig;
    }
    const roaming = roamingRetroArchConfigDir(appDataPath);
    if (roaming) return roaming;
    // Neither exists yet — RetroArch will create the portable one on next
    // launch, so target it.
    return portableConfig;
  }
  return roamingRetroArchConfigDir(appDataPath);
}

/** OS roaming `config/` dir: %APPDATA%/RetroArch (Windows), ~/Library/
 *  Application Support/RetroArch (macOS), ~/.config/retroarch (Linux —
 *  lowercase) or the Flatpak sandbox variant. */
function roamingRetroArchConfigDir(appDataPath: string): string | null {
  const dirName = process.platform === "linux" ? "retroarch" : "RetroArch";
  const roaming = path.join(appDataPath, dirName, "config");
  if (existsSync(roaming)) return roaming;
  if (process.platform === "linux") {
    const flatpak = path.join(
      os.homedir(),
      ".var",
      "app",
      "org.libretro.RetroArch",
      "config",
      "retroarch",
      "config"
    );
    if (existsSync(flatpak)) return flatpak;
  }
  return null;
}

/** Per-game override file path. RetroArch uses the content basename without
 *  its extension as the file stem. */
function overridePath(
  configDir: string,
  coreName: string,
  romPath: string
): string {
  const stem = path.basename(romPath, path.extname(romPath));
  return path.join(configDir, coreName, `${stem}.cfg`);
}

/** Read the curated subset of keys for a game's override file. Missing file
 *  / missing keys surface as `undefined` so the UI renders "(default)". */
export function readRetroArchGameConfig(
  configDir: string,
  coreName: string,
  romPath: string
): RetroArchGameConfig {
  const filePath = overridePath(configDir, coreName, romPath);
  if (!existsSync(filePath)) return {};
  const kv = parseKeyValue(readFileSync(filePath, "utf-8"));
  const out: RetroArchGameConfig = {};

  if (kv.video_smooth !== undefined)
    out.bilinearFilter = kv.video_smooth.toLowerCase() === "true";
  if (kv.video_scale_integer !== undefined)
    out.integerScale = kv.video_scale_integer.toLowerCase() === "true";
  if (kv.aspect_ratio_index !== undefined) {
    const n = Number(kv.aspect_ratio_index);
    if (n === 0 || n === 1) out.aspectRatio = n;
  }
  if (kv.run_ahead_enabled !== undefined)
    out.runAhead = kv.run_ahead_enabled.toLowerCase() === "true";
  if (kv.run_ahead_frames !== undefined) {
    const n = Number(kv.run_ahead_frames);
    if (Number.isFinite(n)) out.runAheadFrames = n;
  }
  if (kv.rewind_enable !== undefined)
    out.rewind = kv.rewind_enable.toLowerCase() === "true";

  return out;
}

/** Persist a per-game patch. Only keys present in `patch` are written; a key
 *  set to undefined/null is removed so it falls back to the global cfg. The
 *  file is round-tripped so any key the user hand-added survives. */
export function writeRetroArchGameConfig(
  configDir: string,
  coreName: string,
  romPath: string,
  patch: RetroArchGameConfig
): { configPath: string } {
  const filePath = overridePath(configDir, coreName, romPath);
  mkdirSync(path.dirname(filePath), { recursive: true });

  const kv: Record<string, string> = existsSync(filePath)
    ? parseKeyValue(readFileSync(filePath, "utf-8"))
    : {};

  for (const [field, value] of Object.entries(patch) as Array<
    [keyof RetroArchGameConfig, RetroArchGameConfig[keyof RetroArchGameConfig]]
  >) {
    const mapping = RA_KEY_MAP[field];
    if (!mapping) continue;
    if (value === undefined || value === null) {
      delete kv[mapping.key];
    } else {
      kv[mapping.key] = (mapping.encode as (v: unknown) => string)(value);
    }
  }

  writeFileSync(filePath, serializeKeyValue(kv), "utf-8");
  return { configPath: filePath };
}
