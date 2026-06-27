import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  UserLibraryFile,
  Collection,
  PlayRecord,
  RomReference,
  SmartCollectionFilter,
  GameOverride,
  DolphinGameConfig,
  RetroArchGameConfig,
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

  /**
   * Per-profile activity store. The ROM library/scan is shared per machine, but
   * favorites, collections, recently-played and play history are PER PROFILE
   * (tiny JSON of keys + counters, no ROM duplication), so playtime / games
   * played / level differ per user.
   *
   * The default profile ("local", or no id) keeps the legacy
   * `config/user-library.json` so existing data isn't lost; every other profile
   * gets `config/user-library.<profileId>.json`.
   */
  constructor(projectRoot?: string, profileId?: string | null) {
    this.projectRoot = projectRoot ?? resolve(__dirname, "..", "..");
    const id = profileId && profileId !== "local" ? profileId : null;
    const file = id
      ? `user-library.${id.replace(/[^A-Za-z0-9_-]/g, "_")}.json`
      : "user-library.json";
    this.filePath = resolve(this.projectRoot, "config", file);
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

  // --- Per-Game Overrides (Phase 22) ---

  getGameOverrides(): Record<string, GameOverride> {
    return this.load().gameOverrides ?? {};
  }

  getGameOverride(systemId: string, fileName: string): GameOverride | null {
    const key = UserLibrary.makeKey(systemId, fileName);
    return this.load().gameOverrides?.[key] ?? null;
  }

  /** Replace or extend the override entry for a game. Passing an empty
   *  object after a clear (no emulator + no dolphin keys) prunes the entry
   *  so the on-disk map doesn't accumulate empty objects as users toggle
   *  features on and off. */
  private writeOverride(
    systemId: string,
    fileName: string,
    mutate: (current: GameOverride) => GameOverride
  ): void {
    const key = UserLibrary.makeKey(systemId, fileName);
    const data = this.load();
    if (!data.gameOverrides) data.gameOverrides = {};
    const current: GameOverride = data.gameOverrides[key] ?? {};
    const next = mutate({ ...current });
    const isEmpty =
      !next.emulatorId &&
      (!next.dolphin || Object.keys(next.dolphin).length === 0) &&
      (!next.retroarch || Object.keys(next.retroarch).length === 0);
    if (isEmpty) {
      delete data.gameOverrides[key];
    } else {
      data.gameOverrides[key] = next;
    }
    this.save(data);
  }

  setEmulatorOverride(
    systemId: string,
    fileName: string,
    emulatorId: string | null
  ): void {
    this.writeOverride(systemId, fileName, (override) => {
      if (emulatorId) {
        override.emulatorId = emulatorId;
      } else {
        delete override.emulatorId;
      }
      return override;
    });
  }

  /** Merge partial Dolphin keys into the per-game block. Passing `null`
   *  for a value removes that single key so the GameConfig writer falls
   *  back to Dolphin's global setting. Passing an empty object clears the
   *  entire Dolphin block. Per-field `null` is accepted (Zod-validated
   *  payloads use it as the "clear this key" sentinel). */
  setDolphinOverride(
    systemId: string,
    fileName: string,
    patch:
      | { [K in keyof DolphinGameConfig]?: DolphinGameConfig[K] | null }
      | null
  ): void {
    this.writeOverride(systemId, fileName, (override) => {
      if (patch === null) {
        delete override.dolphin;
        return override;
      }
      const merged: DolphinGameConfig = { ...(override.dolphin ?? {}) };
      for (const [k, v] of Object.entries(patch) as Array<
        [keyof DolphinGameConfig, DolphinGameConfig[keyof DolphinGameConfig]]
      >) {
        if (v === undefined || v === null) {
          delete merged[k];
        } else {
          (merged as Record<string, unknown>)[k] = v;
        }
      }
      if (Object.keys(merged).length === 0) {
        delete override.dolphin;
      } else {
        override.dolphin = merged;
      }
      return override;
    });
  }

  /** Merge partial RetroArch keys into the per-game block. Same semantics as
   *  {@link setDolphinOverride}: per-field `null` clears that key, a `null`
   *  patch clears the whole RetroArch block. */
  setRetroArchOverride(
    systemId: string,
    fileName: string,
    patch:
      | { [K in keyof RetroArchGameConfig]?: RetroArchGameConfig[K] | null }
      | null
  ): void {
    this.writeOverride(systemId, fileName, (override) => {
      if (patch === null) {
        delete override.retroarch;
        return override;
      }
      const merged: RetroArchGameConfig = { ...(override.retroarch ?? {}) };
      for (const [k, v] of Object.entries(patch) as Array<
        [
          keyof RetroArchGameConfig,
          RetroArchGameConfig[keyof RetroArchGameConfig]
        ]
      >) {
        if (v === undefined || v === null) {
          delete merged[k];
        } else {
          (merged as Record<string, unknown>)[k] = v;
        }
      }
      if (Object.keys(merged).length === 0) {
        delete override.retroarch;
      } else {
        override.retroarch = merged;
      }
      return override;
    });
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
