import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { UserLibrary } from "../../src/core/user-library.js";

const TEST_PROJECT_ROOT = resolve(import.meta.dirname, "__test_user_library__");

describe("UserLibrary", () => {
  let lib: UserLibrary;

  beforeEach(() => {
    mkdirSync(TEST_PROJECT_ROOT, { recursive: true });
    lib = new UserLibrary(TEST_PROJECT_ROOT);
  });

  afterEach(() => {
    rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
  });

  // --- Static helpers ---

  describe("makeKey / parseKey", () => {
    it("creates a composite key from systemId and fileName", () => {
      expect(UserLibrary.makeKey("nes", "mario.nes")).toBe("nes:mario.nes");
    });

    it("parses a composite key back to systemId and fileName", () => {
      const ref = UserLibrary.parseKey("snes:zelda.smc");
      expect(ref.systemId).toBe("snes");
      expect(ref.fileName).toBe("zelda.smc");
    });

    it("handles fileName containing colons", () => {
      const key = UserLibrary.makeKey("psx", "game:special.bin");
      const ref = UserLibrary.parseKey(key);
      expect(ref.systemId).toBe("psx");
      expect(ref.fileName).toBe("game:special.bin");
    });
  });

  // --- Favorites ---

  describe("favorites", () => {
    it("starts with no favorites", () => {
      expect(lib.getFavorites()).toEqual([]);
    });

    it("adds a favorite via toggle and returns true", () => {
      const result = lib.toggleFavorite("nes", "mario.nes");
      expect(result).toBe(true);
      expect(lib.isFavorite("nes", "mario.nes")).toBe(true);
    });

    it("removes a favorite via toggle and returns false", () => {
      lib.toggleFavorite("nes", "mario.nes");
      const result = lib.toggleFavorite("nes", "mario.nes");
      expect(result).toBe(false);
      expect(lib.isFavorite("nes", "mario.nes")).toBe(false);
    });

    it("does not create duplicates", () => {
      lib.toggleFavorite("nes", "mario.nes");
      lib.toggleFavorite("nes", "mario.nes");
      lib.toggleFavorite("nes", "mario.nes");
      expect(
        lib.getFavorites().filter((k) => k === "nes:mario.nes")
      ).toHaveLength(1);
    });

    it("isFavorite returns false for non-favorited ROM", () => {
      expect(lib.isFavorite("nes", "unknown.nes")).toBe(false);
    });
  });

  // --- Collections ---

  describe("collections", () => {
    it("starts with no collections", () => {
      expect(lib.getCollections()).toEqual([]);
    });

    it("creates a collection", () => {
      const col = lib.createCollection("RPGs");
      expect(col.name).toBe("RPGs");
      expect(col.id).toMatch(/^col_\d+$/);
      expect(col.roms).toEqual([]);
    });

    it("retrieves a collection by id", () => {
      const col = lib.createCollection("Platformers");
      const retrieved = lib.getCollection(col.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe("Platformers");
    });

    it("renames a collection", () => {
      const col = lib.createCollection("Old Name");
      lib.renameCollection(col.id, "New Name");
      expect(lib.getCollection(col.id)!.name).toBe("New Name");
    });

    it("deletes a collection", () => {
      const col = lib.createCollection("Temp");
      lib.deleteCollection(col.id);
      expect(lib.getCollection(col.id)).toBeNull();
    });

    it("adds ROMs to a collection", () => {
      const col = lib.createCollection("Favorites");
      lib.addToCollection(col.id, "nes", "mario.nes");
      lib.addToCollection(col.id, "snes", "zelda.smc");
      const updated = lib.getCollection(col.id)!;
      expect(updated.roms).toHaveLength(2);
      expect(updated.roms).toContain("nes:mario.nes");
    });

    it("does not add duplicate ROMs to a collection", () => {
      const col = lib.createCollection("Test");
      lib.addToCollection(col.id, "nes", "mario.nes");
      lib.addToCollection(col.id, "nes", "mario.nes");
      expect(lib.getCollection(col.id)!.roms).toHaveLength(1);
    });

    it("removes a ROM from a collection", () => {
      const col = lib.createCollection("Test");
      lib.addToCollection(col.id, "nes", "mario.nes");
      lib.addToCollection(col.id, "snes", "zelda.smc");
      lib.removeFromCollection(col.id, "nes", "mario.nes");
      const updated = lib.getCollection(col.id)!;
      expect(updated.roms).toHaveLength(1);
      expect(updated.roms).toContain("snes:zelda.smc");
    });
  });

  // --- Recently Played ---

  describe("recently played", () => {
    it("starts with no recent games", () => {
      expect(lib.getRecentlyPlayed()).toEqual([]);
    });

    it("records a play and adds to recently played", () => {
      lib.recordPlay("nes", "mario.nes");
      expect(lib.getRecentlyPlayed()).toEqual(["nes:mario.nes"]);
    });

    it("moves replayed game to front (dedup)", () => {
      lib.recordPlay("nes", "mario.nes");
      lib.recordPlay("snes", "zelda.smc");
      lib.recordPlay("nes", "mario.nes");
      const recent = lib.getRecentlyPlayed();
      expect(recent[0]).toBe("nes:mario.nes");
      expect(recent).toHaveLength(2);
    });

    it("caps at 50 entries", () => {
      for (let i = 0; i < 60; i++) {
        lib.recordPlay("nes", `game${i}.nes`);
      }
      expect(lib.getRecentlyPlayed()).toHaveLength(50);
    });

    it("respects limit parameter", () => {
      lib.recordPlay("nes", "a.nes");
      lib.recordPlay("nes", "b.nes");
      lib.recordPlay("nes", "c.nes");
      expect(lib.getRecentlyPlayed(2)).toHaveLength(2);
    });

    it("increments play count", () => {
      lib.recordPlay("nes", "mario.nes");
      lib.recordPlay("nes", "mario.nes");
      lib.recordPlay("nes", "mario.nes");
      const record = lib.getPlayRecord("nes", "mario.nes");
      expect(record).not.toBeNull();
      expect(record!.playCount).toBe(3);
    });

    it("returns null play record for unplayed ROM", () => {
      expect(lib.getPlayRecord("nes", "unknown.nes")).toBeNull();
    });
  });

  // --- Persistence ---

  describe("persistence", () => {
    it("data survives a new instance", () => {
      lib.toggleFavorite("nes", "mario.nes");
      lib.createCollection("RPGs");
      lib.recordPlay("snes", "zelda.smc");

      const lib2 = new UserLibrary(TEST_PROJECT_ROOT);
      expect(lib2.isFavorite("nes", "mario.nes")).toBe(true);
      expect(lib2.getCollections()).toHaveLength(1);
      expect(lib2.getRecentlyPlayed()).toContain("snes:zelda.smc");
    });
  });

  // --- Bulk ---

  describe("getAll", () => {
    it("returns the full library structure", () => {
      lib.toggleFavorite("nes", "mario.nes");
      lib.recordPlay("nes", "mario.nes");

      const all = lib.getAll();
      expect(all.version).toBe(1);
      expect(all.favorites).toContain("nes:mario.nes");
      expect(all.recentlyPlayed).toContain("nes:mario.nes");
      expect(all.playHistory["nes:mario.nes"].playCount).toBe(1);
      expect(all.collections).toEqual([]);
    });
  });
});
