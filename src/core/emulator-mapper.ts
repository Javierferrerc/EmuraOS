import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import type {
  EmulatorDefinition,
  EmulatorDefinitionSource,
  ResolvedEmulator,
} from "./types.js";
import { forPlatform, isLinux } from "./platform.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Sentinel prefix for emulators that resolve to a Flatpak install instead
 *  of an on-disk executable. GameLauncher rewrites `flatpak:<appId>` into
 *  `flatpak run <appId> …` at spawn time. */
export const FLATPAK_PREFIX = "flatpak:";

export function isFlatpakRef(executablePath: string): boolean {
  return executablePath.startsWith(FLATPAK_PREFIX);
}

export function flatpakAppId(executablePath: string): string {
  return executablePath.slice(FLATPAK_PREFIX.length);
}

/** True when the given Flathub app id is installed (user or system scope).
 *  Checked via the deploy directories so detection stays synchronous — no
 *  `flatpak list` subprocess on every scan. */
export function isFlatpakInstalled(
  appId: string,
  home: string = os.homedir()
): boolean {
  return (
    existsSync(resolve(home, ".local", "share", "flatpak", "app", appId)) ||
    existsSync(resolve("/var/lib/flatpak/app", appId))
  );
}

function expandHome(p: string, home: string): string {
  return p === "~" || p.startsWith("~/") || p.startsWith("~\\")
    ? home + p.slice(1)
    : p;
}

/**
 * Flatten a raw emulators.json (v2) entry into plain values for the running
 * platform. Returns null when the emulator has no executable defined for
 * this OS (e.g. Project64 outside Windows) — the mapper simply omits it.
 */
export function normalizeEmulatorDefinition(
  src: EmulatorDefinitionSource,
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir()
): EmulatorDefinition | null {
  const executable = forPlatform(src.executable, platform);
  if (!executable) return null;

  const defaultPaths = (forPlatform(src.defaultPaths, platform) ?? []).map(
    (p) => expandHome(p, home)
  );

  return {
    id: src.id,
    name: src.name,
    executable,
    defaultPaths,
    systems: src.systems,
    launchTemplate: src.launchTemplate,
    args: forPlatform(src.args, platform) ?? {},
    defaultArgs: src.defaultArgs,
    coreUrls: forPlatform(src.coreUrls, platform),
    acquisition: forPlatform(src.acquisition, platform),
  };
}

export class EmulatorMapper {
  private emulators: EmulatorDefinition[] = [];

  constructor(customPath?: string) {
    const projectRoot = resolve(__dirname, "..", "..");
    const dataPath =
      customPath ?? resolve(projectRoot, "src", "data", "emulators.json");
    const raw = readFileSync(dataPath, "utf-8");
    const sources = JSON.parse(raw) as EmulatorDefinitionSource[];
    this.emulators = sources
      .map((src) => normalizeEmulatorDefinition(src))
      .filter((def): def is EmulatorDefinition => def !== null);
  }

  getAll(): EmulatorDefinition[] {
    return this.emulators;
  }

  getById(id: string): EmulatorDefinition | undefined {
    return this.emulators.find((e) => e.id === id);
  }

  getForSystem(systemId: string): EmulatorDefinition[] {
    return this.emulators.filter((e) => e.systems.includes(systemId));
  }

  resolve(systemId: string, emulatorsPath?: string): ResolvedEmulator | null {
    const candidates = this.getForSystem(systemId);

    for (const emu of candidates) {
      const found = this.findExecutable(emu, systemId, emulatorsPath);
      if (found) return found;
    }

    return null;
  }

  resolveAll(systemId: string, emulatorsPath?: string): ResolvedEmulator[] {
    const candidates = this.getForSystem(systemId);
    const results: ResolvedEmulator[] = [];

    for (const emu of candidates) {
      const found = this.findExecutable(emu, systemId, emulatorsPath);
      if (found) results.push(found);
    }

    return results;
  }

  /**
   * Resolve every emulator whose executable actually exists on disk (under
   * emulatorsPath or a known defaultPath). Used to build an allowlist of
   * legitimate executables the renderer is permitted to launch, so a
   * compromised renderer cannot spawn an arbitrary program.
   */
  resolveAllInstalled(emulatorsPath?: string): ResolvedEmulator[] {
    const results: ResolvedEmulator[] = [];
    for (const emu of this.emulators) {
      const systemId = emu.systems[0] ?? "";
      const found = this.findExecutable(emu, systemId, emulatorsPath);
      if (found) results.push(found);
    }
    return results;
  }

  resolveById(emulatorId: string, systemId: string, emulatorsPath?: string): ResolvedEmulator | null {
    const emu = this.emulators.find(
      (e) => e.id === emulatorId && e.systems.includes(systemId)
    );
    if (!emu) return null;
    return this.findExecutable(emu, systemId, emulatorsPath);
  }

  private findExecutable(
    emu: EmulatorDefinition,
    systemId: string,
    emulatorsPath?: string
  ): ResolvedEmulator | null {
    if (emulatorsPath) {
      // Check emulatorsPath/<emulatorId>/<executable>
      const nested = resolve(emulatorsPath, emu.id, emu.executable);
      if (existsSync(nested)) {
        return { definition: emu, executablePath: nested, systemId };
      }

      // Check emulatorsPath/<executable>
      const flat = resolve(emulatorsPath, emu.executable);
      if (existsSync(flat)) {
        return { definition: emu, executablePath: flat, systemId };
      }
    }

    // Check each defaultPath
    for (const defaultPath of emu.defaultPaths) {
      const fullPath = resolve(defaultPath, emu.executable);
      if (existsSync(fullPath)) {
        return { definition: emu, executablePath: fullPath, systemId };
      }
    }

    // Linux: a Flatpak install has no executable under our roots — detect it
    // via the flatpak deploy dirs and hand back a sentinel ref the launcher
    // knows how to spawn (`flatpak run <appId>`).
    if (
      isLinux() &&
      emu.acquisition?.provider === "flatpak" &&
      emu.acquisition.appId &&
      isFlatpakInstalled(emu.acquisition.appId)
    ) {
      return {
        definition: emu,
        executablePath: FLATPAK_PREFIX + emu.acquisition.appId,
        systemId,
      };
    }

    return null;
  }
}
