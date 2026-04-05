/**
 * PPSSPP first-run setup.
 *
 * PPSSPP stores its "memory stick" (save data, system config, etc.) in one of:
 *   1. A folder pointed to by `memstickpath.txt` next to PPSSPPWindows64.exe
 *      (portable mode)
 *   2. `%USERPROFILE%/Documents/PPSSPP/` (installed mode, first-run default)
 *
 * Our launcher writes `ppsspp.ini` into `{emuDir}/memstick/PSP/SYSTEM/`, which
 * only works if PPSSPP is in portable mode pointing at that exact memstick
 * folder. Without the marker file, settings written by the launcher are
 * silently ignored because PPSSPP reads its config from Documents/PPSSPP.
 *
 * This module ensures portable mode by writing `memstickpath.txt` next to the
 * executable with the absolute path to `{emuDir}/memstick`, and pre-creating
 * the `PSP/SYSTEM/` subdirectory PPSSPP expects.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function normalizePath(p: string): string {
  return path.resolve(p).replace(/\//g, "\\");
}

function pathsEqual(a: string, b: string): boolean {
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}

/**
 * Ensure PPSSPP is set up in portable mode with its memory stick folder
 * inside the launcher's emulator directory.
 *
 * Idempotent: calling this repeatedly with the same executable is a no-op
 * once the marker file exists and points at the expected folder.
 */
export function ensurePpssppPortable(
  ppssppExecutablePath: string
): { updated: boolean; memstickPath: string; markerPath: string } {
  const emuDir = path.dirname(ppssppExecutablePath);
  const memstickDir = path.join(emuDir, "memstick");
  const markerPath = path.join(emuDir, "memstickpath.txt");

  // Make sure the PPSSPP memstick tree exists so PPSSPP doesn't blank the
  // marker file on first launch (it refuses paths that don't exist).
  const systemDir = path.join(memstickDir, "PSP", "SYSTEM");
  if (!existsSync(systemDir)) {
    mkdirSync(systemDir, { recursive: true });
  }

  // Skip if marker file already points at the expected folder.
  if (existsSync(markerPath)) {
    try {
      const existing = readFileSync(markerPath, "utf-8").trim();
      if (existing && pathsEqual(existing, memstickDir)) {
        return { updated: false, memstickPath: memstickDir, markerPath };
      }
    } catch {
      // fall through to rewrite
    }
  }

  writeFileSync(markerPath, normalizePath(memstickDir) + "\n", "utf-8");
  return { updated: true, memstickPath: memstickDir, markerPath };
}
