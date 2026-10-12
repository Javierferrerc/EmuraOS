import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { DetectedEmulator, DetectionResult } from "./types.js";
import { executableNames, type EmulatorMapper } from "./emulator-mapper.js";

export class EmulatorDetector {
  private mapper: EmulatorMapper;

  constructor(mapper: EmulatorMapper) {
    this.mapper = mapper;
  }

  detect(emulatorsPath?: string): DetectionResult {
    const emulators = this.mapper.getAll();
    const detected: DetectedEmulator[] = [];
    const notFound: string[] = [];

    for (const emu of emulators) {
      let found = false;

      // Primary executable first, then legacy names (e.g. citra-qt.exe for
      // Azahar).
      for (const exe of executableNames(emu)) {
        if (emulatorsPath) {
          // Check emulatorsPath/<id>/<executable>
          const nested = resolve(emulatorsPath, emu.id, exe);
          if (existsSync(nested)) {
            detected.push({
              id: emu.id,
              name: emu.name,
              executablePath: nested,
              systems: emu.systems,
              source: "emulatorsPath",
            });
            found = true;
            break;
          }

          // Check emulatorsPath/<executable>
          const flat = resolve(emulatorsPath, exe);
          if (existsSync(flat)) {
            detected.push({
              id: emu.id,
              name: emu.name,
              executablePath: flat,
              systems: emu.systems,
              source: "emulatorsPath",
            });
            found = true;
            break;
          }
        }

        // Check each defaultPath
        for (const defaultPath of emu.defaultPaths) {
          const fullPath = resolve(defaultPath, exe);
          if (existsSync(fullPath)) {
            detected.push({
              id: emu.id,
              name: emu.name,
              executablePath: fullPath,
              systems: emu.systems,
              source: "defaultPath",
            });
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (!found) {
        notFound.push(emu.id);
      }
    }

    return {
      detected,
      notFound,
      totalChecked: emulators.length,
    };
  }
}
