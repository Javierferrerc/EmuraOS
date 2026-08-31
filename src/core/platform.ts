/**
 * Platform abstraction layer (PHASE 28).
 *
 * Every OS-dependent decision in core code funnels through this module:
 * well-known config directories, config-location token expansion
 * ({appdata}/{docs}/{home}), path comparison semantics and native path
 * separators. Callers never read process.platform / process.env.APPDATA
 * directly — they ask this module, which keeps the Windows/macOS/Linux
 * branches testable (every helper takes an optional `platform` override).
 */

import os from "node:os";
import path from "node:path";

export type SupportedPlatform = "win32" | "darwin" | "linux";

/** Narrow process.platform to the three platforms we ship on. Anything
 *  exotic (freebsd, aix…) is treated as linux — POSIX semantics. */
export function getPlatform(
  platform: NodeJS.Platform = process.platform
): SupportedPlatform {
  if (platform === "win32" || platform === "darwin") return platform;
  return "linux";
}

export function isWindows(platform: NodeJS.Platform = process.platform): boolean {
  return getPlatform(platform) === "win32";
}

export function isMac(platform: NodeJS.Platform = process.platform): boolean {
  return getPlatform(platform) === "darwin";
}

export function isLinux(platform: NodeJS.Platform = process.platform): boolean {
  return getPlatform(platform) === "linux";
}

/** Roaming application-data directory:
 *  - win32:  %APPDATA%                      (C:\Users\x\AppData\Roaming)
 *  - darwin: ~/Library/Application Support
 *  - linux:  $XDG_CONFIG_HOME or ~/.config
 *  Matches Electron's app.getPath("appData") on all three, so core (non-
 *  Electron) code and main-process code resolve the same locations. */
export function appDataDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): string {
  switch (getPlatform(platform)) {
    case "win32":
      return env.APPDATA || path.join(home, "AppData", "Roaming");
    case "darwin":
      return path.join(home, "Library", "Application Support");
    case "linux":
      return env.XDG_CONFIG_HOME || path.join(home, ".config");
  }
}

/** Per-user data directory (only differs from appDataDir on Linux, where
 *  emulators like Dolphin split config (~/.config) from data (~/.local/share)). */
export function userDataDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): string {
  if (getPlatform(platform) === "linux") {
    return env.XDG_DATA_HOME || path.join(home, ".local", "share");
  }
  return appDataDir(platform, env, home);
}

/** The user's Documents folder. */
export function documentsDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): string {
  if (getPlatform(platform) === "win32" && env.USERPROFILE) {
    return path.join(env.USERPROFILE, "Documents");
  }
  return path.join(home, "Documents");
}

/** Expand the {emuDir}/{appdata}/{docs}/{home} tokens used by emulator
 *  config-location templates (emulator-schemas/*.json). */
export function resolveConfigTokens(
  template: string,
  opts: {
    emuDir?: string;
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    home?: string;
  } = {}
): string {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const home = opts.home ?? os.homedir();
  return template
    .replace(/\{emuDir\}/g, opts.emuDir ?? "")
    .replace(/\{appdata\}/g, appDataDir(platform, env, home))
    .replace(/\{userdata\}/g, userDataDir(platform, env, home))
    .replace(/\{docs\}/g, documentsDir(platform, env, home))
    .replace(/\{home\}/g, home);
}

/** Canonicalize a path for equality comparison. Only Windows gets
 *  case-folding + backslash normalization — macOS defaults to a
 *  case-insensitive FS too, but its POSIX paths compare fine verbatim and
 *  Linux is fully case-sensitive, so lowercasing there would create false
 *  positives. */
export function normalizePathForCompare(
  p: string,
  platform: NodeJS.Platform = process.platform
): string {
  const resolved = path.resolve(p);
  if (getPlatform(platform) === "win32") {
    return resolved.replace(/\//g, "\\").toLowerCase();
  }
  return resolved;
}

export function pathsEqual(
  a: string,
  b: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  return (
    normalizePathForCompare(a, platform) === normalizePathForCompare(b, platform)
  );
}

/** Render a path with the native separators of the target platform. Used
 *  when writing paths INTO emulator config files (Cemu settings.xml,
 *  PPSSPP memstickpath.txt) that are read by native apps. */
export function toNativePath(
  p: string,
  platform: NodeJS.Platform = process.platform
): string {
  const resolved = path.resolve(p);
  return getPlatform(platform) === "win32"
    ? resolved.replace(/\//g, "\\")
    : resolved;
}

/** Pick the platform-specific variant from a value that may be either a
 *  plain value (legacy, applies everywhere) or a per-platform record
 *  ({win32, darwin, linux}). Returns undefined when the record has no
 *  entry for this platform — i.e. the feature is unavailable here. */
export function forPlatform<T>(
  value: T | Partial<Record<SupportedPlatform, T>> | undefined,
  platform: NodeJS.Platform = process.platform
): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    ("win32" in (value as object) ||
      "darwin" in (value as object) ||
      "linux" in (value as object))
  ) {
    return (value as Partial<Record<SupportedPlatform, T>>)[
      getPlatform(platform)
    ];
  }
  return value as T;
}

/** Extension of native executables on this platform. */
export function executableExtension(
  platform: NodeJS.Platform = process.platform
): string {
  return getPlatform(platform) === "win32" ? ".exe" : "";
}

/** libretro dynamic-core extension per platform. */
export function libretroCoreExtension(
  platform: NodeJS.Platform = process.platform
): string {
  switch (getPlatform(platform)) {
    case "win32":
      return ".dll";
    case "darwin":
      return ".dylib";
    case "linux":
      return ".so";
  }
}

/** libretro buildbot base URL for nightly core downloads. */
export function libretroBuildbotBase(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string {
  switch (getPlatform(platform)) {
    case "win32":
      return "https://buildbot.libretro.com/nightly/windows/x86_64/latest";
    case "darwin":
      return arch === "arm64"
        ? "https://buildbot.libretro.com/nightly/apple/osx/arm64/latest"
        : "https://buildbot.libretro.com/nightly/apple/osx/x86_64/latest";
    case "linux":
      return "https://buildbot.libretro.com/nightly/linux/x86_64/latest";
  }
}
