import { readdirSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import type { DiscoveredRom, ScanResult } from "./types.js";
import { SystemsRegistry } from "./systems-registry.js";

export class RomScanner {
  private registry: SystemsRegistry;

  constructor(registry: SystemsRegistry) {
    this.registry = registry;
  }

  scan(romsPath: string): ScanResult {
    const systems = this.registry.getAll();
    const result: ScanResult = { totalRoms: 0, systems: [] };

    for (const system of systems) {
      const systemDir = resolve(romsPath, system.romFolder);
      const roms = this.scanDirectory(systemDir, system.id, system.name, system.extensions);

      if (roms.length > 0) {
        result.systems.push({
          systemId: system.id,
          systemName: system.name,
          roms,
        });
        result.totalRoms += roms.length;
      }
    }

    return result;
  }

  private scanDirectory(
    dirPath: string,
    systemId: string,
    systemName: string,
    extensions: string[]
  ): DiscoveredRom[] {
    const roms: DiscoveredRom[] = [];

    let entries: string[];
    try {
      entries = readdirSync(dirPath);
    } catch {
      return roms;
    }

    for (const entry of entries) {
      const fullPath = resolve(dirPath, entry);
      const ext = extname(entry).toLowerCase();

      if (!extensions.includes(ext)) continue;

      try {
        const stats = statSync(fullPath);
        if (!stats.isFile()) continue;

        roms.push({
          fileName: entry,
          filePath: fullPath,
          systemId,
          systemName,
          sizeBytes: stats.size,
        });
      } catch {
        continue;
      }
    }

    return roms;
  }
}
