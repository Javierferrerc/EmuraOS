import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  cpSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const SENTINEL = ".migrated";

/**
 * Migrate user data from the old install-relative location (e.g.
 * `C:\Program Files\EmuraOS\`) to the new per-user location
 * (`%USERPROFILE%\EmuraOS\`).
 *
 * The function is intentionally synchronous — it runs once at startup
 * before IPC handlers are registered, so no race conditions are possible.
 */
export function migrateDataIfNeeded(oldRoot: string, newRoot: string): void {
  // 1. Already migrated
  if (existsSync(path.join(newRoot, SENTINEL))) {
    return;
  }

  // 2. No old data — fresh install
  const oldConfigFile = path.join(oldRoot, "config", "retro-launcher.json");
  if (!existsSync(oldConfigFile)) {
    return;
  }

  // 3. New location already has config — another migration path or manual copy
  const newConfigFile = path.join(newRoot, "config", "retro-launcher.json");
  if (existsSync(newConfigFile)) {
    writeSentinel(newRoot);
    return;
  }

  // 4. Read config BEFORE copying (renameSync moves the source)
  let config: { romsPath?: string; emulatorsPath?: string };
  try {
    config = JSON.parse(readFileSync(oldConfigFile, "utf-8"));
  } catch {
    config = {};
  }

  // Ensure destination exists
  mkdirSync(newRoot, { recursive: true });

  // 5. Copy config/ (always — it's small)
  copyDir(path.join(oldRoot, "config"), path.join(newRoot, "config"));

  // 6. Copy metadata/ and covers/ if they exist
  copyDirIfExists(path.join(oldRoot, "metadata"), path.join(newRoot, "metadata"));
  copyDirIfExists(path.join(oldRoot, "covers"), path.join(newRoot, "covers"));

  // 7. Only migrate roms/emulators when the user left the default relative paths.
  // Absolute paths (e.g. "D:\Games\Roms") point to user-chosen locations that
  // don't need moving — they resolve the same regardless of projectRoot.
  if (isRelativePath(config.romsPath)) {
    copyDirIfExists(path.join(oldRoot, "roms"), path.join(newRoot, "roms"));
  }

  if (isRelativePath(config.emulatorsPath)) {
    copyDirIfExists(
      path.join(oldRoot, "emulators"),
      path.join(newRoot, "emulators")
    );
  }

  // 8. Copy user-library.json if present
  copyFileIfExists(
    path.join(oldRoot, "user-library.json"),
    path.join(newRoot, "user-library.json")
  );

  // 9. Sentinel
  writeSentinel(newRoot);
}

function isRelativePath(p: string | undefined): boolean {
  if (!p) return true; // undefined / empty → treated as default relative
  return p.startsWith("./") || p.startsWith(".\\") || p === "." || !path.isAbsolute(p);
}

function writeSentinel(root: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, SENTINEL), new Date().toISOString(), "utf-8");
}

function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) return;

  // Try rename first (instant on same drive), fall back to recursive copy
  try {
    mkdirSync(path.dirname(dest), { recursive: true });
    renameSync(src, dest);
  } catch {
    cpSync(src, dest, { recursive: true });
  }
}

function copyDirIfExists(src: string, dest: string): void {
  if (existsSync(src)) {
    copyDir(src, dest);
  }
}

function copyFileIfExists(src: string, dest: string): void {
  if (!existsSync(src)) return;
  try {
    mkdirSync(path.dirname(dest), { recursive: true });
    renameSync(src, dest);
  } catch {
    cpSync(src, dest);
  }
}
