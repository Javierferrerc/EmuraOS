import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EmulatorDefinition, ResolvedEmulator } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    return this.emulators.find((e) => e.id === id);
  }

  getForSystem(systemId: string): EmulatorDefinition[] {
    return this.emulators.filter((e) => e.systems.includes(systemId));
  }

  resolve(systemId: string, emulatorsPath?: string): ResolvedEmulator | null {
    const candidates = this.getForSystem(systemId);

    for (const emu of candidates) {
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
    }

    return null;
  }
}
