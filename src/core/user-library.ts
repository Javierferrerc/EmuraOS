import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  UserLibraryFile,
  Collection,
  PlayRecord,
  RomReference,
  SmartCollectionFilter,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAX_RECENT = 50;

function emptyLibrary(): UserLibraryFile {
  return {
    version: 1,
    favorites: [],
    collections: [],
    recentlyPlayed: [],
    playHistory: {},
  };
}

export class UserLibrary {
  private projectRoot: string;
  private filePath: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot ?? resolve(__dirname, "..", "..");
    this.filePath = resolve(this.projectRoot, "config", "user-library.json");
  }

  // --- Key helpers ---

  static makeKey(systemId: string, fileName: string): string {
    return `${systemId}:${fileName}`;
  }

  static parseKey(key: string): RomReference {
    const idx = key.indexOf(":");
    return { systemId: key.slice(0, idx), fileName: key.slice(idx + 1) };
  }

  // --- Persistence ---

  private load(): UserLibraryFile {
    if (existsSync(this.filePath)) {
      return JSON.parse(readFileSync(this.filePath, "utf-8"));
    }
    return emptyLibrary();
  }

  private save(data: UserLibraryFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  // --- Favorites ---

  getFavorites(): string[] {
    return this.load().favorites;
  }

  isFavorite(systemId: string, fileName: string): boolean {
    const key = UserLibrary.makeKey(systemId, fileName);
    return this.load().favorites.includes(key);
  }

  toggleFavorite(systemId: string, fileName: string): boolean {
    const key = UserLibrary.makeKey(systemId, fileName);
    const data = this.load();
    const idx = data.favorites.indexOf(key);
    if (idx >= 0) {
      data.favorites.splice(idx, 1);
      this.save(data);
      return false;
    }
    data.favorites.push(key);
    this.save(data);
    return true;
  }

  // --- Collections ---

  getCollections(): Collection[] {
    return this.load().collections;
  }

  getCollection(id: string): Collection | null {
    return this.load().collections.find((c) => c.id === id) ?? null;
  }

  createCollection(name: string): Collection {
    const data = this.load();
    const now = new Date().toISOString();
    const collection: Collection = {
      id: `col_${Date.now()}`,
      name,
      roms: [],
      kind: "manual",
      createdAt: now,
      updatedAt: now,
    };
    data.collections.push(collection);
    this.save(data);
    return collection;
  }

  createSmartCollection(
    name: string,
    filter: SmartCollectionFilter
  ): Collection {
    const data = this.load();
    const now = new Date().toISOString();
    const collection: Collection = {
      id: `col_${Date.now()}`,
      name,
      roms: [],
      kind: "smart",
      filter,
      createdAt: now,
      updatedAt: now,
    };
    data.collections.push(collection);
    this.save(data);
    return collection;
  }

  updateSmartCollectionFilter(
    id: string,
    filter: SmartCollectionFilter
  ): void {
    const data = this.load();
    const col = data.collections.find((c) => c.id === id);
    if (col) {
      col.kind = "smart";
      col.filter = filter;
      col.updatedAt = new Date().toISOString();
      this.save(data);
    }
  }

  renameCollection(id: string, name: string): void {
    const data = this.load();
    const col = data.collections.find((c) => c.id === id);
    if (col) {
      col.name = name;
      col.updatedAt = new Date().toISOString();
      this.save(data);
    }
  }

  deleteCollection(id: string): void {
    const data = this.load();
    data.collections = data.collections.filter((c) => c.id !== id);
    this.save(data);
  }

  addToCollection(
    collectionId: string,
    systemId: string,
    fileName: string
  ): void {
    const key = UserLibrary.makeKey(systemId, fileName);
    const data = this.load();
    const col = data.collections.find((c) => c.id === collectionId);
    if (col && !col.roms.includes(key)) {
      col.roms.push(key);
      col.updatedAt = new Date().toISOString();
      this.save(data);
    }
  }

  removeFromCollection(
    collectionId: string,
    systemId: string,
    fileName: string
  ): void {
    const key = UserLibrary.makeKey(systemId, fileName);
    const data = this.load();
    const col = data.collections.find((c) => c.id === collectionId);
    if (col) {
      col.roms = col.roms.filter((r) => r !== key);
      col.updatedAt = new Date().toISOString();
      this.save(data);
    }
  }

  // --- Recently Played / Play History ---

  recordPlay(systemId: string, fileName: string): void {
    const key = UserLibrary.makeKey(systemId, fileName);
    const data = this.load();

    // Move to front of recentlyPlayed (dedup)
    data.recentlyPlayed = data.recentlyPlayed.filter((k) => k !== key);
    data.recentlyPlayed.unshift(key);
    if (data.recentlyPlayed.length > MAX_RECENT) {
      data.recentlyPlayed = data.recentlyPlayed.slice(0, MAX_RECENT);
    }

    // Update play history
    const record = data.playHistory[key] ?? { lastPlayed: "", playCount: 0 };
    record.lastPlayed = new Date().toISOString();
    record.playCount += 1;
    data.playHistory[key] = record;

    this.save(data);
  }

  getRecentlyPlayed(limit?: number): string[] {
    const recent = this.load().recentlyPlayed;
    return limit ? recent.slice(0, limit) : recent;
  }

  addPlayTime(systemId: string, fileName: string, seconds: number): void {
    const key = UserLibrary.makeKey(systemId, fileName);
    const data = this.load();
    const record = data.playHistory[key];
    if (record) {
      record.totalPlayTime = (record.totalPlayTime ?? 0) + seconds;
      data.playHistory[key] = record;
      this.save(data);
    }
  }

  getPlayRecord(
    systemId: string,
    fileName: string
  ): PlayRecord | null {
    const key = UserLibrary.makeKey(systemId, fileName);
    return this.load().playHistory[key] ?? null;
  }

  // --- ROM Added Dates ---

  /**
   * Record the added-date for ROMs that don't have one yet.
   * Accepts an array of {systemId, fileName} and performs a single
   * load/save cycle to avoid blocking the main process with per-ROM I/O.
   */
  recordRomAddedBatch(
    roms: Array<{ systemId: string; fileName: string }>
  ): void {
    if (roms.length === 0) return;
    const data = this.load();
    if (!data.romAddedDates) {
      data.romAddedDates = {};
    }
    const now = new Date().toISOString();
    let changed = false;
    for (const { systemId, fileName } of roms) {
      const key = UserLibrary.makeKey(systemId, fileName);
      if (!data.romAddedDates[key]) {
        data.romAddedDates[key] = now;
        changed = true;
      }
    }
    if (changed) {
      this.save(data);
    }
  }

  getRomAddedDates(): Record<string, string> {
    return this.load().romAddedDates ?? {};
  }

  // --- Bulk ---

  getAll(): UserLibraryFile {
    return this.load();
  }

  /**
   * Clear recently-played list and play history counters without
   * touching favorites or collections. Used by Settings → Biblioteca.
   */
  resetPlayHistory(): void {
    const data = this.load();
    data.recentlyPlayed = [];
    data.playHistory = {};
    this.save(data);
  }
}
