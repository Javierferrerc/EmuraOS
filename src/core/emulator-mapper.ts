import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EmulatorDefinition, ResolvedEmulator } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Emulator ids that were renamed. Per-game overrides persisted with the old
 *  id keep resolving to the replacement. */
const LEGACY_EMULATOR_IDS: Record<string, string> = {
  citra: "azahar",
};

export function canonicalEmulatorId(id: string): string {
  return LEGACY_EMULATOR_IDS[id] ?? id;
}

/** Executable names that identify an emulator, primary first. */
export function executableNames(emu: EmulatorDefinition): string[] {
  return [emu.executable, ...(emu.altExecutables ?? [])];
}

export class EmulatorMapper {
  private emulators: EmulatorDefinition[] = [];

  constructor(customPath?: string) {
    const projectRoot = resolve(__dirname, "..", "..");
    const dataPath =
      customPath ?? resolve(projectRoot, "src", "data", "emulators.json");
    const raw = readFileSync(dataPath, "utf-8");
    this.emulators = JSON.parse(raw) as EmulatorDefinition[];
  }

  getAll(): EmulatorDefinition[] {
    return this.emulators;
  }

  getById(id: string): EmulatorDefinition | undefined {
    const canonical = canonicalEmulatorId(id);
    return this.emulators.find((e) => e.id === canonical);
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
    const canonical = canonicalEmulatorId(emulatorId);
    const emu = this.emulators.find(
      (e) => e.id === canonical && e.systems.includes(systemId)
    );
    if (!emu) return null;
    return this.findExecutable(emu, systemId, emulatorsPath);
  }

  private findExecutable(
    emu: EmulatorDefinition,
    systemId: string,
    emulatorsPath?: string
  ): ResolvedEmulator | null {
    for (const exe of executableNames(emu)) {
      if (emulatorsPath) {
        // Check emulatorsPath/<emulatorId>/<executable>
        const nested = resolve(emulatorsPath, emu.id, exe);
        if (existsSync(nested)) {
          return { definition: emu, executablePath: nested, systemId };
        }

        // Check emulatorsPath/<executable>
        const flat = resolve(emulatorsPath, exe);
        if (existsSync(flat)) {
          return { definition: emu, executablePath: flat, systemId };
        }
      }

      // Check each defaultPath
      for (const defaultPath of emu.defaultPaths) {
        const fullPath = resolve(defaultPath, exe);
        if (existsSync(fullPath)) {
          return { definition: emu, executablePath: fullPath, systemId };
        }
      }
    }

    return null;
  }
}
