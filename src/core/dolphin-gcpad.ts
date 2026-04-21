import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseIni, serializeIni, type IniData } from "./config-parsers.js";

/**
 * Manages Dolphin's GameCube controller configuration (GCPadNew.ini).
 *
 * File layout (simplified):
 *   [GCPad1]               ← one section per GameCube port (1..4)
 *   Device = SDL/0/...     ← input backend + device name
 *   Buttons/A = `Button S` ← button assignment (backticks optional)
 *   Main Stick/Up = `Left Y+`
 *   Main Stick/Calibration = 100.00 101.96 ...   ← preserved verbatim
 *   ...
 *
 * Round-trip preserves every key we don't explicitly manage — calibration data,
 * modifiers, and any user-added section — so editing in the app never clobbers
 * values set from Dolphin's native dialog.
 */

export const GCPAD_PORTS = [1, 2, 3, 4] as const;
export type GcPadPort = (typeof GCPAD_PORTS)[number];

export interface GcPadPortConfig {
  /** The full `[GCPadN]` section key/value map (ordered by insertion). */
  entries: Record<string, string>;
}

export interface GcPadConfig {
  configPath: string;
  exists: boolean;
  ports: Record<GcPadPort, GcPadPortConfig>;
  /** Sections other than the 4 ports — preserved on write. */
  otherSections: IniData;
}

export function getGcPadConfigPath(appDataPath: string): string {
  return path.join(appDataPath, "Dolphin Emulator", "Config", "GCPadNew.ini");
}

export function readGcPadConfig(appDataPath: string): GcPadConfig {
  const configPath = getGcPadConfigPath(appDataPath);

  const ports = {
    1: { entries: {} },
    2: { entries: {} },
    3: { entries: {} },
    4: { entries: {} },
  } satisfies Record<GcPadPort, GcPadPortConfig>;

  if (!existsSync(configPath)) {
    return { configPath, exists: false, ports, otherSections: {} };
  }

  const raw = readFileSync(configPath, "utf-8");
  const data = parseIni(raw);

  const otherSections: IniData = {};
  for (const [section, entries] of Object.entries(data)) {
    const match = section.match(/^GCPad([1-4])$/);
    if (match) {
      const port = Number(match[1]) as GcPadPort;
      ports[port].entries = { ...entries };
    } else if (section !== "__global__") {
      otherSections[section] = entries;
    }
  }

  return { configPath, exists: true, ports, otherSections };
}

export interface GcPadUpdate {
  port: GcPadPort;
  /** Keys to set. Pass an empty string to remove a key from the section. */
  changes: Record<string, string>;
}

/**
 * Apply a batch of updates to GCPadNew.ini. Creates the file (and parent dirs)
 * if missing. Merges into the existing INI so keys we don't touch survive.
 */
export function writeGcPadConfig(
  appDataPath: string,
  updates: GcPadUpdate[]
): { configPath: string } {
  const configPath = getGcPadConfigPath(appDataPath);

  // Start from whatever is on disk (or an empty structure if the file doesn't
  // exist yet — this mirrors Dolphin's behaviour of lazily creating the file
  // once controller settings are touched).
  let data: IniData = {};
  if (existsSync(configPath)) {
    data = parseIni(readFileSync(configPath, "utf-8"));
  }

  for (const { port, changes } of updates) {
    const section = `GCPad${port}`;
    if (!data[section]) data[section] = {};
    for (const [key, value] of Object.entries(changes)) {
      if (value === "") {
        delete data[section][key];
      } else {
        data[section][key] = value;
      }
    }
  }

  // Ensure all 4 port sections exist in output (Dolphin expects them, even
  // if empty — it falls back to an empty Device assignment).
  for (const port of GCPAD_PORTS) {
    const section = `GCPad${port}`;
    if (!data[section]) data[section] = {};
  }

  const dir = path.dirname(configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, serializeIni(data), "utf-8");

  return { configPath };
}

/**
 * The set of actions we expose in the UI. Each entry maps an INI key to a
 * user-facing label. Ordered roughly the way Dolphin's own dialog lays them
 * out. Any key not in this list is preserved on write but not shown.
 */
export interface GcPadAction {
  key: string;
  label: string;
  group: "buttons" | "main-stick" | "c-stick" | "triggers" | "d-pad";
}

export const GCPAD_ACTIONS: readonly GcPadAction[] = [
  { key: "Buttons/A", label: "A", group: "buttons" },
  { key: "Buttons/B", label: "B", group: "buttons" },
  { key: "Buttons/X", label: "X", group: "buttons" },
  { key: "Buttons/Y", label: "Y", group: "buttons" },
  { key: "Buttons/Z", label: "Z", group: "buttons" },
  { key: "Buttons/Start", label: "Start", group: "buttons" },
  { key: "Main Stick/Up", label: "Stick Izq. Arriba", group: "main-stick" },
  { key: "Main Stick/Down", label: "Stick Izq. Abajo", group: "main-stick" },
  { key: "Main Stick/Left", label: "Stick Izq. Izquierda", group: "main-stick" },
  { key: "Main Stick/Right", label: "Stick Izq. Derecha", group: "main-stick" },
  { key: "C-Stick/Up", label: "Stick C Arriba", group: "c-stick" },
  { key: "C-Stick/Down", label: "Stick C Abajo", group: "c-stick" },
  { key: "C-Stick/Left", label: "Stick C Izquierda", group: "c-stick" },
  { key: "C-Stick/Right", label: "Stick C Derecha", group: "c-stick" },
  { key: "Triggers/L", label: "Gatillo L", group: "triggers" },
  { key: "Triggers/R", label: "Gatillo R", group: "triggers" },
  { key: "D-Pad/Up", label: "Cruceta Arriba", group: "d-pad" },
  { key: "D-Pad/Down", label: "Cruceta Abajo", group: "d-pad" },
  { key: "D-Pad/Left", label: "Cruceta Izquierda", group: "d-pad" },
  { key: "D-Pad/Right", label: "Cruceta Derecha", group: "d-pad" },
] as const;

export const GCPAD_GROUP_LABELS: Record<GcPadAction["group"], string> = {
  buttons: "Botones",
  "main-stick": "Stick principal",
  "c-stick": "Stick C",
  triggers: "Gatillos",
  "d-pad": "Cruceta",
};
