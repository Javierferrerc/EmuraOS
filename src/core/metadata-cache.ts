import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { GameMetadata, MetadataCacheFile } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Strip the extension from a ROM filename to get a stable cache key.
 * This decouples the metadata entry from the ROM container format,
 * so `Silent Hill (USA).bin`, `Silent Hill (USA).cue`, and
 * `Silent Hill (USA).chd` all resolve to the same metadata + cover.
 *
 * Only strips the trailing segment if it looks like a real file extension
 * (short, alphanumeric). This preserves names like
 * `"Super Mario Bros. (World)"` which have a dot in the title itself, and
 * makes the normalization idempotent when a key has already been normalized.
 */
function normalizeKey(romFileName: string): string {
  const lastDot = romFileName.lastIndexOf(".");
  if (lastDot <= 0) return romFileName;
  const ext = romFileName.substring(lastDot);
  if (ext.length > 5 || !/^\.[a-zA-Z0-9]+$/.test(ext)) return romFileName;
  return romFileName.substring(0, lastDot);
}

export class MetadataCache {
  private projectRoot: string;
  private metadataDir: string;
  private coversDir: string;
  private thumbnailsDir: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot ?? resolve(__dirname, "..", "..");
    this.metadataDir = resolve(this.projectRoot, "config", "metadata");
    this.coversDir = resolve(this.metadataDir, "covers");
    this.thumbnailsDir = resolve(this.metadataDir, "thumbnails");
  }

  ensureDirectories(systemId: string): void {
    mkdirSync(resolve(this.coversDir, systemId), { recursive: true });
    mkdirSync(resolve(this.thumbnailsDir, systemId), { recursive: true });
  }

  private getCacheFilePath(systemId: string): string {
    return resolve(this.metadataDir, `${systemId}.json`);
  }

  /**
   * Load the cache file and migrate any legacy keys (filenames with
   * extensions) to the normalized basename form. Migration is transparent —
   * callers always see normalized keys.
   */
  loadSystemCache(systemId: string): MetadataCacheFile {
    const filePath = this.getCacheFilePath(systemId);
    if (!existsSync(filePath)) {
      return { systemId, lastUpdated: "", games: {} };
    }

    const raw: MetadataCacheFile = JSON.parse(readFileSync(filePath, "utf-8"));
    const migrated: Record<string, GameMetadata> = {};
    let didMigrate = false;

    for (const [key, value] of Object.entries(raw.games)) {
      const normalized = normalizeKey(key);
      if (normalized !== key) didMigrate = true;
      // If both legacy-keyed and normalized entries exist, prefer the one
      // with more recent lastScraped (or just the later-iterated one).
      migrated[normalized] = value;
    }

    if (didMigrate) {
      raw.games = migrated;
      this.saveSystemCache(raw);
    } else {
      raw.games = migrated;
    }

    return raw;
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
    return cache.games[normalizeKey(romFileName)] ?? null;
  }

  setMetadata(
    systemId: string,
    romFileName: string,
    metadata: GameMetadata
  ): void {
    const cache = this.loadSystemCache(systemId);
    cache.games[normalizeKey(romFileName)] = metadata;
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
    return resolve(this.coversDir, systemId, `${normalizeKey(romFileName)}.png`);
  }

  coverExists(systemId: string, romFileName: string): boolean {
    return existsSync(this.getCoverPath(systemId, romFileName));
  }

  /**
   * Path for the 200px-wide JPEG thumbnail used by the grid. Note: extension
   * is .jpg even though the source cover is .png — sharp re-encodes to JPEG
   * for ~10x smaller files, which meaningfully speeds up grid scrolling on
   * large libraries. The full cover stays as-is for the detail modal.
   */
  getThumbnailPath(systemId: string, romFileName: string): string {
    return resolve(this.thumbnailsDir, systemId, `${normalizeKey(romFileName)}.jpg`);
  }

  thumbnailExists(systemId: string, romFileName: string): boolean {
    return existsSync(this.getThumbnailPath(systemId, romFileName));
  }

  /** Public getter so callers (thumbnail-cache helpers, UI diagnostics) can
   *  reason about where thumbnails live without re-deriving the path. */
  getThumbnailsDir(): string {
    return this.thumbnailsDir;
  }
}
