import { readdirSync, statSync } from "node:fs";
import { resolve, extname, dirname } from "node:path";
import type { DiscoveredRom, ScanResult } from "./types.js";
import { SystemsRegistry } from "./systems-registry.js";

// Maximum recursion depth for nested ROM folders (e.g. psx/<game>/<files>).
// Prevents runaway recursion on symlink loops or deeply nested junk.
const MAX_SCAN_DEPTH = 5;

/**
 * "Container" extensions that reference sibling track files in the same
 * directory. When a container is present, its referenced tracks should be
 * hidden from the grid so the user only sees one entry per game.
 */
const CONTAINER_RULES: { container: string; hides: string[] }[] = [
  // Multi-disc playlist hides everything it could reference
  { container: ".m3u", hides: [".cue", ".chd", ".pbp", ".bin", ".img"] },
  // CD cue sheet hides its raw track data
  { container: ".cue", hides: [".bin", ".img"] },
  // Dreamcast GDI hides its raw tracks
  { container: ".gdi", hides: [".bin", ".raw"] },
];

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
      const raw = this.scanDirectory(
        systemDir,
        system.id,
        system.name,
        system.extensions,
        0
      );
      const roms = this.deduplicateContainerFiles(raw);

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
    extensions: string[],
    depth: number
  ): DiscoveredRom[] {
    if (depth > MAX_SCAN_DEPTH) return [];
    const roms: DiscoveredRom[] = [];

    let entries: string[];
    try {
      entries = readdirSync(dirPath);
    } catch {
      return roms;
    }

    for (const entry of entries) {
      const fullPath = resolve(dirPath, entry);

      let stats;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        roms.push(
          ...this.scanDirectory(
            fullPath,
            systemId,
            systemName,
            extensions,
            depth + 1
          )
        );
        continue;
      }

      if (!stats.isFile()) continue;

      const ext = extname(entry).toLowerCase();
      if (!extensions.includes(ext)) continue;

      roms.push({
        fileName: entry,
        filePath: fullPath,
        systemId,
        systemName,
        sizeBytes: stats.size,
      });
    }

    return roms;
  }

  /**
   * For each directory, if a "container" file (.cue, .gdi, .m3u) is present,
   * hide the raw track files it would reference. This prevents duplicate
   * grid entries for multi-file CD images (Silent Hill.cue + Silent Hill.bin).
   */
  private deduplicateContainerFiles(roms: DiscoveredRom[]): DiscoveredRom[] {
    const byDir = new Map<string, DiscoveredRom[]>();
    for (const rom of roms) {
      const dir = dirname(rom.filePath);
      let list = byDir.get(dir);
      if (!list) {
        list = [];
        byDir.set(dir, list);
      }
      list.push(rom);
    }

    const result: DiscoveredRom[] = [];
    for (const dirRoms of byDir.values()) {
      const extsInDir = new Set(
        dirRoms.map((r) => extname(r.fileName).toLowerCase())
      );
      const hidden = new Set<string>();
      for (const rule of CONTAINER_RULES) {
        if (extsInDir.has(rule.container)) {
          for (const h of rule.hides) hidden.add(h);
        }
      }

      for (const rom of dirRoms) {
        const ext = extname(rom.fileName).toLowerCase();
        if (!hidden.has(ext)) result.push(rom);
      }
    }

    return result;
  }
}
