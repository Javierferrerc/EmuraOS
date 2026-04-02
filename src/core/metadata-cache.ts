import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { GameMetadata, MetadataCacheFile } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class MetadataCache {
  private projectRoot: string;
  private metadataDir: string;
  private coversDir: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot ?? resolve(__dirname, "..", "..");
    this.metadataDir = resolve(this.projectRoot, "config", "metadata");
    this.coversDir = resolve(this.metadataDir, "covers");
  }

  ensureDirectories(systemId: string): void {
    mkdirSync(resolve(this.coversDir, systemId), { recursive: true });
  }

  private getCacheFilePath(systemId: string): string {
    return resolve(this.metadataDir, `${systemId}.json`);
  }

  loadSystemCache(systemId: string): MetadataCacheFile {
    const filePath = this.getCacheFilePath(systemId);
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, "utf-8"));
    }
    return { systemId, lastUpdated: "", games: {} };
  }

  saveSystemCache(cache: MetadataCacheFile): void {
    mkdirSync(this.metadataDir, { recursive: true });
    cache.lastUpdated = new Date().toISOString();
    writeFileSync(
      this.getCacheFilePath(cache.systemId),
      JSON.stringify(cache, null, 2),
      "utf-8"
    );
  }

  getMetadata(systemId: string, romFileName: string): GameMetadata | null {
    const cache = this.loadSystemCache(systemId);
    return cache.games[romFileName] ?? null;
  }

  setMetadata(
    systemId: string,
    romFileName: string,
    metadata: GameMetadata
  ): void {
    const cache = this.loadSystemCache(systemId);
    cache.games[romFileName] = metadata;
    this.saveSystemCache(cache);
  }

  getAllMetadataAllSystems(
    systemIds: string[]
  ): Map<string, Record<string, GameMetadata>> {
    const result = new Map<string, Record<string, GameMetadata>>();
    for (const systemId of systemIds) {
      const cache = this.loadSystemCache(systemId);
      if (Object.keys(cache.games).length > 0) {
        result.set(systemId, cache.games);
      }
    }
    return result;
  }

  getCoverPath(systemId: string, romFileName: string): string {
    const name = basename(romFileName, romFileName.substring(romFileName.lastIndexOf(".")));
    return resolve(this.coversDir, systemId, `${name}.png`);
  }

  coverExists(systemId: string, romFileName: string): boolean {
    return existsSync(this.getCoverPath(systemId, romFileName));
  }
}
