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
    notes: {},
  };
}

/** Hard cap on a single note's length. Matches the IPC validator and
 *  guards against accidentally pasting a huge document into the
 *  textarea. ~2 KB of text covers any reasonable "save in dungeon 3"
 *  style memo with room to spare. */
export const NOTE_MAX_LENGTH = 2000;

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

  /**
   * Replace the roms list of a manual collection with the same set of keys
   * in a different order. The caller (the drag&drop reorder UI) computes
   * the new permutation client-side and sends the whole list; this method
   * verifies it's a true permutation of the current contents before
   * persisting so a buggy renderer can't drop or inject roms via this path.
   *
   * No-op on smart collections (their order is computed) and on collections
   * whose contents have drifted from the supplied key set.
   */
  reorderCollection(collectionId: string, keys: string[]): void {
    const data = this.load();
    const col = data.collections.find((c) => c.id === collectionId);
    if (!col || col.kind === "smart") return;

    if (keys.length !== col.roms.length) return;
    const current = new Set(col.roms);
    const incoming = new Set(keys);
    if (incoming.size !== keys.length) return; // duplicate guard
    for (const k of keys) {
      if (!current.has(k)) return; // unknown key — refuse
    }

    col.roms = [...keys];
    col.updatedAt = new Date().toISOString();
    this.save(data);
  }

  // --- Notes (Phase 21) ---

  getNotes(): Record<string, string> {
    return this.load().notes ?? {};
  }

  getNote(systemId: string, fileName: string): string {
    const key = UserLibrary.makeKey(systemId, fileName);
    return this.load().notes?.[key] ?? "";
  }

  /** Persist a note. Empty / whitespace-only string deletes the entry
   *  to keep the on-disk map clean instead of accumulating empty
   *  strings as users clear their notes. Truncates to NOTE_MAX_LENGTH
   *  as a defence in depth — the IPC layer already rejects oversized
   *  payloads, but a future caller might bypass it. */
  setNote(systemId: string, fileName: string, text: string): void {
    const key = UserLibrary.makeKey(systemId, fileName);
    const data = this.load();
    if (!data.notes) data.notes = {};
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      delete data.notes[key];
    } else {
      data.notes[key] = trimmed.slice(0, NOTE_MAX_LENGTH);
    }
    this.save(data);
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
    if (seconds <= 0) return;
    const key = UserLibrary.makeKey(systemId, fileName);
    const data = this.load();
    const record = data.playHistory[key];
    if (record) {
      record.totalPlayTime = (record.totalPlayTime ?? 0) + seconds;
      data.playHistory[key] = record;
    }
    // Accumulate into the day bucket regardless of whether the
    // per-game record exists. Cross-midnight sessions are attributed
    // to the day the session ends (when addPlayTime fires); good
    // enough for a visual heatmap.
    if (!data.playSessions) data.playSessions = {};
    const today = new Date().toISOString().slice(0, 10);
    data.playSessions[today] = (data.playSessions[today] ?? 0) + seconds;
    this.save(data);
  }

  /** Daily play-time buckets for the heatmap. Side-effect on first
   *  call: when the playSessions field is absent, we seed it by
   *  attributing each game's totalPlayTime to its lastPlayed day.
   *  That's a rough estimate (multi-session games show as one big
   *  bucket on their final play day), but it's the only signal we
   *  have for history pre-dating the feature, and it beats showing
   *  an empty grid. */
  getPlaySessions(): Record<string, number> {
    const data = this.load();
    if (data.playSessions) return data.playSessions;
    const seeded: Record<string, number> = {};
    for (const record of Object.values(data.playHistory)) {
      if (!record.lastPlayed || !record.totalPlayTime) continue;
      const day = record.lastPlayed.slice(0, 10);
      seeded[day] = (seeded[day] ?? 0) + record.totalPlayTime;
    }
    data.playSessions = seeded;
    this.save(data);
    return seeded;
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
