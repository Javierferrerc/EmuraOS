import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { MetadataCache } from "../../src/core/metadata-cache.js";
import type { GameMetadata } from "../../src/core/types.js";

const TEST_PROJECT_ROOT = resolve(import.meta.dirname, "__test_metadata__");

function makeMetadata(overrides: Partial<GameMetadata> = {}): GameMetadata {
  return {
    title: "Test Game",
    description: "A test game",
    year: "1990",
    genre: "Action",
    publisher: "TestCo",
    developer: "DevTeam",
    players: "1",
    rating: "80",
    coverPath: "",
    screenshotPath: "",
    screenScraperId: "12345",
    lastScraped: new Date().toISOString(),
    ...overrides,
  };
}

describe("MetadataCache", () => {
  let cache: MetadataCache;

  beforeEach(() => {
    mkdirSync(TEST_PROJECT_ROOT, { recursive: true });
    cache = new MetadataCache(TEST_PROJECT_ROOT);
  });

  afterEach(() => {
    rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
  });

  it("returns null for a ROM with no cached metadata", () => {
    expect(cache.getMetadata("nes", "game.nes")).toBeNull();
  });

  it("saves and retrieves metadata for a ROM", () => {
    const metadata = makeMetadata({ title: "Super Mario Bros" });
    cache.setMetadata("nes", "mario.nes", metadata);

    const retrieved = cache.getMetadata("nes", "mario.nes");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe("Super Mario Bros");
    expect(retrieved!.year).toBe("1990");
  });

  it("creates metadata and cover directories", () => {
    cache.ensureDirectories("snes");

    const coversDir = resolve(TEST_PROJECT_ROOT, "config", "metadata", "covers", "snes");
    expect(existsSync(coversDir)).toBe(true);
  });

  it("preserves existing entries when adding new ones", () => {
    cache.setMetadata("nes", "game1.nes", makeMetadata({ title: "Game 1" }));
    cache.setMetadata("nes", "game2.nes", makeMetadata({ title: "Game 2" }));

    expect(cache.getMetadata("nes", "game1.nes")!.title).toBe("Game 1");
    expect(cache.getMetadata("nes", "game2.nes")!.title).toBe("Game 2");
  });

  it("loads metadata across multiple systems (keyed by basename)", () => {
    cache.setMetadata("nes", "mario.nes", makeMetadata({ title: "Mario" }));
    cache.setMetadata("snes", "zelda.smc", makeMetadata({ title: "Zelda" }));

    const all = cache.getAllMetadataAllSystems(["nes", "snes", "gba"]);
    expect(all.size).toBe(2);
    expect(all.get("nes")!["mario"].title).toBe("Mario");
    expect(all.get("snes")!["zelda"].title).toBe("Zelda");
    expect(all.has("gba")).toBe(false);
  });

  it("returns same metadata regardless of ROM extension", () => {
    // Simulates a user migrating from .bin to .cue for a PS1 game
    cache.setMetadata("psx", "Silent Hill.bin", makeMetadata({ title: "Silent Hill" }));

    expect(cache.getMetadata("psx", "Silent Hill.bin")!.title).toBe("Silent Hill");
    expect(cache.getMetadata("psx", "Silent Hill.cue")!.title).toBe("Silent Hill");
    expect(cache.getMetadata("psx", "Silent Hill.chd")!.title).toBe("Silent Hill");
  });

  it("migrates legacy extension-keyed cache files on load", () => {
    // Write a legacy cache file (keys with extensions) directly to disk
    const metadataDir = resolve(TEST_PROJECT_ROOT, "config", "metadata");
    mkdirSync(metadataDir, { recursive: true });
    const legacy = {
      systemId: "psx",
      lastUpdated: "2026-01-01T00:00:00.000Z",
      games: {
        "Silent Hill (USA).bin": makeMetadata({ title: "Silent Hill" }),
        "Crash Bandicoot.chd": makeMetadata({ title: "Crash" }),
      },
    };
    writeFileSync(
      resolve(metadataDir, "psx.json"),
      JSON.stringify(legacy),
      "utf-8"
    );

    // Reading through the cache should migrate the keys transparently
    expect(cache.getMetadata("psx", "Silent Hill (USA).cue")!.title).toBe(
      "Silent Hill"
    );
    expect(cache.getMetadata("psx", "Crash Bandicoot.pbp")!.title).toBe("Crash");
  });

  it("returns correct cover path", () => {
    const coverPath = cache.getCoverPath("nes", "mario.nes");
    expect(coverPath).toContain("covers");
    expect(coverPath).toContain("nes");
    expect(coverPath).toContain("mario.png");
  });

  it("reports cover as not existing when no file present", () => {
    expect(cache.coverExists("nes", "mario.nes")).toBe(false);
  });

  it("loads empty cache for system with no data", () => {
    const systemCache = cache.loadSystemCache("n64");
    expect(systemCache.systemId).toBe("n64");
    expect(Object.keys(systemCache.games)).toHaveLength(0);
  });

  it("updates lastUpdated timestamp on save", () => {
    cache.setMetadata("nes", "game.nes", makeMetadata());

    const systemCache = cache.loadSystemCache("nes");
    expect(systemCache.lastUpdated).toBeTruthy();
    expect(new Date(systemCache.lastUpdated).getTime()).toBeGreaterThan(0);
  });
});
