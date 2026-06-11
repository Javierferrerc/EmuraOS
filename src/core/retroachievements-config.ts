import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  parseIni,
  serializeIni,
  parseKeyValue,
  serializeKeyValue,
  type IniData,
} from "./config-parsers.js";

/**
 * RetroAchievements credential injection into emulator configs.
 *
 * We log the user in once (deriving a token) and write that token plus the
 * username and the enable/hardcore flags straight into each emulator's
 * config file, so achievements light up on launch without the user logging
 * in inside every emulator.
 *
 * Only emulators that persist the token *in their config file* are
 * supported here:
 *   - RetroArch   retroarch.cfg            cheevos_* keys (keyvalue)
 *   - Dolphin     Config/Dolphin.ini       [Achievements] (ini)
 *   - DuckStation settings.ini             [Cheevos] (ini)
 *
 * PCSX2 and PPSSPP deliberately moved their token to OS secret storage /
 * a separate secrets.ini (PPSSPP marks it DONT_SAVE), so writing the plain
 * ini would NOT log them in. Those are reported as "manual login" by
 * `isRaInjectable` rather than half-injected.
 */

export interface RaCredentials {
  username: string;
  token: string;
  enabled: boolean;
  hardcore: boolean;
}

/** Emulator ids whose config file reliably carries the RA token. */
const INJECTABLE = new Set(["retroarch", "dolphin", "duckstation"]);

export function isRaInjectable(emulatorId: string): boolean {
  return INJECTABLE.has(emulatorId);
}

// ── Path resolution ────────────────────────────────────────────────

/** retroarch.cfg sits next to the executable (portable Windows layout),
 *  falling back to %APPDATA%/RetroArch/retroarch.cfg. */
export function resolveRetroArchCfgPath(
  executablePath: string | null,
  appDataPath: string
): string | null {
  if (executablePath) {
    const dir = path.dirname(executablePath);
    const portable = path.join(dir, "retroarch.cfg");
    if (existsSync(portable) || existsSync(path.join(dir, "config"))) {
      return portable;
    }
    const roaming = path.join(appDataPath, "RetroArch", "retroarch.cfg");
    if (existsSync(roaming)) return roaming;
    return portable; // RetroArch creates it portable on first run
  }
  const roaming = path.join(appDataPath, "RetroArch", "retroarch.cfg");
  return existsSync(roaming) ? roaming : null;
}

/** Dolphin.ini lives under the resolved User dir in Config/. Reuses the
 *  same User-dir conventions as dolphin-game-config. */
export function resolveDolphinIniPath(dolphinUserDir: string): string {
  return path.join(dolphinUserDir, "Config", "Dolphin.ini");
}

/** DuckStation settings.ini: portable (next to exe) or Documents. */
export function resolveDuckStationIniPath(
  executablePath: string | null,
  documentsPath: string
): string | null {
  if (executablePath) {
    const portable = path.join(path.dirname(executablePath), "settings.ini");
    if (existsSync(portable)) return portable;
  }
  const docs = path.join(documentsPath, "DuckStation", "settings.ini");
  if (existsSync(docs)) return docs;
  // Prefer portable for a fresh install next to the exe.
  return executablePath
    ? path.join(path.dirname(executablePath), "settings.ini")
    : null;
}

// ── Writers ────────────────────────────────────────────────────────

function iniBool(v: boolean): string {
  return v ? "True" : "False";
}
function lowerBool(v: boolean): string {
  return v ? "true" : "false";
}

function writeIniSection(
  filePath: string,
  section: string,
  entries: Record<string, string>
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const ini: IniData = existsSync(filePath)
    ? parseIni(readFileSync(filePath, "utf-8"))
    : {};
  if (!ini[section]) ini[section] = {};
  for (const [k, v] of Object.entries(entries)) ini[section][k] = v;
  writeFileSync(filePath, serializeIni(ini), "utf-8");
}

/** RetroArch — cheevos_* keys in retroarch.cfg (flat keyvalue). */
export function injectRetroArch(cfgPath: string, creds: RaCredentials): void {
  mkdirSync(path.dirname(cfgPath), { recursive: true });
  const kv: Record<string, string> = existsSync(cfgPath)
    ? parseKeyValue(readFileSync(cfgPath, "utf-8"))
    : {};
  kv.cheevos_enable = lowerBool(creds.enabled);
  kv.cheevos_username = creds.username;
  kv.cheevos_token = creds.token;
  kv.cheevos_hardcore_mode_enable = lowerBool(creds.hardcore);
  writeFileSync(cfgPath, serializeKeyValue(kv), "utf-8");
}

/** Dolphin — [Achievements] section in Dolphin.ini. */
export function injectDolphin(iniPath: string, creds: RaCredentials): void {
  writeIniSection(iniPath, "Achievements", {
    Enabled: iniBool(creds.enabled),
    Username: creds.username,
    ApiToken: creds.token,
    HardcoreEnabled: iniBool(creds.hardcore),
  });
}

/** DuckStation — [Cheevos] section in settings.ini. */
export function injectDuckStation(iniPath: string, creds: RaCredentials): void {
  writeIniSection(iniPath, "Cheevos", {
    Enabled: lowerBool(creds.enabled),
    Username: creds.username,
    Token: creds.token,
    ChallengeMode: lowerBool(creds.hardcore),
  });
}
