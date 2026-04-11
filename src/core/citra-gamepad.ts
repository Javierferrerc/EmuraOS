/**
 * Citra gamepad profile management.
 *
 * This module patches the `[Controls]` section of Citra's `qt-config.ini`
 * so users don't have to navigate Emulation → Configure → Controls →
 * Auto-Assign before their gamepad works. On the first launch of a 3DS
 * game we write a known-good profile (see `CITRA_GAMEPAD_PROFILES`) and
 * flip `config.citraGamepadAutoConfigured` so we never touch the file
 * again unless the user explicitly asks.
 *
 * ── Format context ─────────────────────────────────────────────────
 *
 * Citra stores controller bindings in Qt's nested-INI style inside a
 * `[Controls]` section. Keys use a literal backslash as separator in
 * the key name itself (not as a path), e.g.:
 *
 *     profiles\1\button_a="button:1,engine:sdl,guid:...,port:0"
 *     profiles\1\button_a\default=false
 *
 * Every binding has a sibling `\default` line. If it says `true` Citra
 * ignores the value next to it and reapplies its own defaults, so both
 * lines MUST be written together — forgetting the `\default=false`
 * sibling silently reverts the binding.
 *
 * The value grammar for an SDL gamepad binding is:
 *
 *     "<input>:<N>[,<more>],engine:sdl,guid:<32hex>,port:0"
 *
 * where `<input>` is `button` for digital buttons, `axis` for analog
 * triggers bound as a single axis, or `axis_x`/`axis_y` pair for
 * analog sticks. Note `port:0` (not `joystick:0`) is used when a GUID
 * is present — that's the format Auto-Assign produces.
 *
 * ── What this module DOES NOT touch ────────────────────────────────
 *
 * The `[Controls]` section also contains non-gamepad keys we leave
 * alone, because overwriting them would break the user's customisation
 * or Citra's own defaults:
 *
 *   - motion_device       (emulated gyro)
 *   - touch_device        (touchscreen mapping)
 *   - udp_input_*         (DSU protocol client)
 *   - use_touch_from_button / touch_from_button_map
 *   - touch_from_button_maps\*
 *   - button_debug / button_gpio14 / button_power (keyboard-only)
 *
 * Only the keys produced by `buildProfileKeyValues()` are replaced or
 * inserted.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface CitraGamepadProfile {
  id: string;
  displayName: string;
  /** SDL joystick GUID, 32 hex chars, no separators. */
  guid: string;
  /**
   * Raw SDL_Joystick button indices. Note these are NOT SDL_GameController
   * semantic indices — different controllers report different raw numbers
   * for the same physical button, which is why each profile is tied to a
   * specific GUID.
   */
  buttons: {
    a: number;
    b: number;
    x: number;
    y: number;
    up: number;
    down: number;
    left: number;
    right: number;
    l: number;
    r: number;
    start: number;
    select: number;
    home: number;
  };
  /** ZL/ZR triggers bound to SDL axis indices (analog triggers). */
  triggerAxes: {
    zl: number;
    zr: number;
  };
  /** Circle pad analog stick axes. */
  circlePadAxes: {
    x: number;
    y: number;
  };
  /** C-stick analog stick axes. */
  cStickAxes: {
    x: number;
    y: number;
  };
}

/**
 * PlayStation DualShock 4 / DualSense profile matching the layout Citra
 * writes after "Auto-Assign" with a PS controller connected. Captured
 * from GUID `03008fe54c050000c405000000016800` (Sony DualShock 4 v2 on
 * Windows SDL).
 *
 * Naming convention (Citra label ↔ 3DS button ↔ PS physical button):
 *   button_a = east  = Circle
 *   button_b = south = Cross
 *   button_x = north = Triangle
 *   button_y = west  = Square
 *
 * The D-pad is reported as raw SDL buttons 11–14 (not a hat) on this
 * controller. Triggers (L2/R2) are bound to axes 4/5 so ZL/ZR feel
 * analog in N3DS games that use them.
 */
export const PS_DUALSHOCK_PROFILE: CitraGamepadProfile = {
  id: "ps-dualshock",
  displayName: "PlayStation DualShock / DualSense",
  guid: "03008fe54c050000c405000000016800",
  buttons: {
    a: 1, // east — Circle
    b: 0, // south — Cross
    x: 3, // north — Triangle
    y: 2, // west — Square
    up: 11,
    down: 12,
    left: 13,
    right: 14,
    l: 9,
    r: 10,
    start: 6,
    select: 4,
    home: 5,
  },
  triggerAxes: { zl: 4, zr: 5 },
  circlePadAxes: { x: 0, y: 1 },
  cStickAxes: { x: 2, y: 3 },
};

/**
 * Registry of available profiles. Keyed by `profile.id`. Future
 * controllers (Xbox, Switch Pro, generic XInput) can be added here
 * without touching the apply logic.
 */
export const CITRA_GAMEPAD_PROFILES: Record<string, CitraGamepadProfile> = {
  "ps-dualshock": PS_DUALSHOCK_PROFILE,
};

// ── Internal: build the set of Citra Controls keys we own ────────────

/**
 * Build a `Map<key, value>` containing every `[Controls]` line this
 * module writes for the given profile. Key strings use literal
 * backslashes to match exactly what Citra writes on disk.
 *
 * We emit both the binding line and its companion `\default=false`
 * sibling — Citra ignores custom values when `\default=true`, so
 * skipping the sibling would silently revert the binding.
 *
 * Map insertion order is preserved and drives the order of inserted
 * lines when `[Controls]` is empty or missing.
 */
function buildProfileKeyValues(
  profile: CitraGamepadProfile
): Map<string, string> {
  const m = new Map<string, string>();
  const suffix = `engine:sdl,guid:${profile.guid},port:0`;

  // Profile header. Citra expects these even for a single-profile setup;
  // omitting them leaves the profile list empty and Citra ignores all
  // bindings below.
  m.set("profile\\default", "true");
  m.set("profile", "0");
  m.set("profiles\\1\\name\\default", "true");
  m.set("profiles\\1\\name", "default");

  const setButton = (name: string, idx: number): void => {
    m.set(`profiles\\1\\button_${name}\\default`, "false");
    m.set(`profiles\\1\\button_${name}`, `"button:${idx},${suffix}"`);
  };

  setButton("a", profile.buttons.a);
  setButton("b", profile.buttons.b);
  setButton("x", profile.buttons.x);
  setButton("y", profile.buttons.y);
  setButton("up", profile.buttons.up);
  setButton("down", profile.buttons.down);
  setButton("left", profile.buttons.left);
  setButton("right", profile.buttons.right);
  setButton("l", profile.buttons.l);
  setButton("r", profile.buttons.r);
  setButton("start", profile.buttons.start);
  setButton("select", profile.buttons.select);
  setButton("home", profile.buttons.home);

  // Triggers — bound as axes so ZL/ZR are analog.
  m.set("profiles\\1\\button_zl\\default", "false");
  m.set(
    "profiles\\1\\button_zl",
    `"axis:${profile.triggerAxes.zl},${suffix}"`
  );
  m.set("profiles\\1\\button_zr\\default", "false");
  m.set(
    "profiles\\1\\button_zr",
    `"axis:${profile.triggerAxes.zr},${suffix}"`
  );

  // Analog sticks.
  m.set("profiles\\1\\circle_pad\\default", "false");
  m.set(
    "profiles\\1\\circle_pad",
    `"axis_x:${profile.circlePadAxes.x},axis_y:${profile.circlePadAxes.y},${suffix}"`
  );
  m.set("profiles\\1\\c_stick\\default", "false");
  m.set(
    "profiles\\1\\c_stick",
    `"axis_x:${profile.cStickAxes.x},axis_y:${profile.cStickAxes.y},${suffix}"`
  );

  m.set("profiles\\size", "1");

  return m;
}

// ── Internal: locate the [Controls] section ─────────────────────────

interface SectionBounds {
  /** Index of the first content line AFTER `[Controls]`. */
  start: number;
  /**
   * Exclusive end: one past the last content line we consider part of
   * the section. Trailing blank lines that sit just before the next
   * section header (or EOF) are excluded so inserted lines land right
   * after real content without adding visual gaps.
   */
  end: number;
}

/**
 * Locate the `[Controls]` section boundaries in a line array. Returns
 * `null` if the section does not exist.
 *
 * `end` is computed exclusive of trailing blank lines so `splice(end, 0, …)`
 * inserts immediately after the last real content line in the section.
 */
function findControlsSection(lines: string[]): SectionBounds | null {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "[Controls]") {
      start = i + 1;
      continue;
    }
    if (start >= 0 && t.startsWith("[") && t.endsWith("]")) {
      let end = i;
      while (end > start && lines[end - 1].trim() === "") {
        end--;
      }
      return { start, end };
    }
  }
  if (start >= 0) {
    let end = lines.length;
    while (end > start && lines[end - 1].trim() === "") {
      end--;
    }
    return { start, end };
  }
  return null;
}

// ── Public: read status ─────────────────────────────────────────────

export interface CitraGamepadStatus {
  /** Whether qt-config.ini exists at the given path. */
  configExists: boolean;
  /** Whether a `[Controls]` section is present in the file. */
  hasControlsSection: boolean;
  /**
   * Whether a custom gamepad binding is already present. True when any
   * `profiles\1\button_*` key we care about has `\default=false` AND
   * an SDL engine binding. Lets us skip auto-config when the user has
   * already set up their own layout via Citra's Auto-Assign flow.
   */
  hasCustomGamepad: boolean;
  /**
   * GUID from the first custom SDL binding found, if any. Useful for
   * logging and future dynamic profile matching.
   */
  currentGuid: string | null;
}

/**
 * Snapshot the current gamepad state of a Citra config without modifying
 * anything. Returns `configExists: false` when the file is missing so
 * callers can decide whether to create a fresh config or bail.
 */
export function readCitraGamepadStatus(
  configPath: string
): CitraGamepadStatus {
  if (!existsSync(configPath)) {
    return {
      configExists: false,
      hasControlsSection: false,
      hasCustomGamepad: false,
      currentGuid: null,
    };
  }

  const raw = readFileSync(configPath, "utf-8");
  const lines = raw.split(/\r?\n/);
  const bounds = findControlsSection(lines);
  if (!bounds) {
    return {
      configExists: true,
      hasControlsSection: false,
      hasCustomGamepad: false,
      currentGuid: null,
    };
  }

  // Matches the gamepad keys we own. Excludes button_debug/button_gpio14/
  // button_power (keyboard-only) since those are tied to Citra defaults
  // and don't indicate a custom gamepad setup.
  const gamepadKeyRe =
    /^profiles\\1\\(button_a|button_b|button_x|button_y|button_up|button_down|button_left|button_right|button_l|button_r|button_start|button_select|button_home|button_zl|button_zr|circle_pad|c_stick)$/;
  const guidRe = /guid:([0-9a-f]{32})/i;

  // First pass: collect keys whose `\default` sibling is false. We do
  // this in one sweep so the order of `\default` vs value lines doesn't
  // matter.
  const defaultFalse = new Set<string>();
  for (let i = bounds.start; i < bounds.end; i++) {
    const line = lines[i];
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.substring(0, eq);
    const value = line.substring(eq + 1);
    if (key.endsWith("\\default") && value === "false") {
      defaultFalse.add(key.substring(0, key.length - "\\default".length));
    }
  }

  // Second pass: look for any non-default gamepad binding with an SDL
  // engine. The first one wins for `currentGuid` reporting.
  let hasCustomGamepad = false;
  let currentGuid: string | null = null;
  for (let i = bounds.start; i < bounds.end; i++) {
    const line = lines[i];
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.substring(0, eq);
    if (!gamepadKeyRe.test(key)) continue;
    if (!defaultFalse.has(key)) continue;
    const value = line.substring(eq + 1);
    if (value.includes("engine:sdl")) {
      hasCustomGamepad = true;
      if (!currentGuid) {
        const m = value.match(guidRe);
        if (m) currentGuid = m[1];
      }
    }
  }

  return {
    configExists: true,
    hasControlsSection: true,
    hasCustomGamepad,
    currentGuid,
  };
}

// ── Public: apply profile ───────────────────────────────────────────

export interface ApplyResult {
  success: boolean;
  /** Number of existing lines whose value was changed by the write. */
  linesReplaced: number;
  /** Number of new lines inserted into the file. */
  linesInserted: number;
  error?: string;
}

/**
 * Patch qt-config.ini so its `[Controls]` section contains the given
 * gamepad profile. Existing `profiles\1\...` keys we own are replaced
 * in place; any missing ones are inserted immediately after the last
 * non-blank content line of the section. Keys we don't own
 * (motion_device, touch_device, udp_*, button_debug/gpio14/power,
 * touch_from_button_maps) are left untouched.
 *
 * If the file has no `[Controls]` section, a fresh one is appended at
 * the end. If the file does not exist, the function returns
 * `{ success: false }` — we never create qt-config.ini ourselves
 * because Citra uses the file's presence to decide initial defaults
 * at first launch.
 *
 * Idempotent: running twice on the same file produces identical bytes.
 */
export function applyCitraGamepadProfile(
  configPath: string,
  profile: CitraGamepadProfile
): ApplyResult {
  if (!existsSync(configPath)) {
    return {
      success: false,
      linesReplaced: 0,
      linesInserted: 0,
      error: `Config file not found: ${configPath}`,
    };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    const lines = raw.split(/\r?\n/);

    const desired = buildProfileKeyValues(profile);

    const bounds = findControlsSection(lines);
    let linesReplaced = 0;
    let linesInserted = 0;

    if (!bounds) {
      // No [Controls] section — append one at the end. Keep exactly one
      // blank line between the existing content and our new section so
      // the file stays readable.
      const trailingEmpty =
        lines.length > 0 && lines[lines.length - 1] === "";
      if (trailingEmpty) lines.pop();
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
      lines.push("[Controls]");
      for (const [k, v] of desired) {
        lines.push(`${k}=${v}`);
        linesInserted++;
      }
      // Restore trailing newline so the file still ends with EOL.
      lines.push("");
    } else {
      // Replace existing keys in place, track which were handled so we
      // know what still needs to be inserted.
      const handled = new Set<string>();
      for (let i = bounds.start; i < bounds.end; i++) {
        const line = lines[i];
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.substring(0, eq);
        if (desired.has(key)) {
          const newValue = desired.get(key)!;
          const newLine = `${key}=${newValue}`;
          if (line !== newLine) {
            lines[i] = newLine;
            linesReplaced++;
          }
          handled.add(key);
        }
      }

      // Insert any keys we didn't find right at `bounds.end` (after the
      // last non-blank line of the section). Preserves Map insertion
      // order so related keys stay grouped.
      const toInsert: string[] = [];
      for (const [k, v] of desired) {
        if (!handled.has(k)) {
          toInsert.push(`${k}=${v}`);
          linesInserted++;
        }
      }
      if (toInsert.length > 0) {
        lines.splice(bounds.end, 0, ...toInsert);
      }
    }

    writeFileSync(configPath, lines.join(eol), "utf-8");
    return { success: true, linesReplaced, linesInserted };
  } catch (err) {
    return {
      success: false,
      linesReplaced: 0,
      linesInserted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
