import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  LibretroMetadataProvider,
  parseCategoryDat,
  buildSystemIndex,
} from "../../src/core/libretro-metadata.js";
import { MetadataCache } from "../../src/core/metadata-cache.js";
import type { DiscoveredRom } from "../../src/core/types.js";

// Unique per-file test dir — the thumbnails test uses its own so the two don't
// race on a shared directory when vitest runs them in parallel.
const TEST_PROJECT_ROOT = resolve(import.meta.dirname, "__test_libretro_metadata__");
const TEST_SYSTEM_MAP_PATH = resolve(TEST_PROJECT_ROOT, "systems-map.json");

const GENRE_DAT = `clrmamepro (
	name "Nintendo - Nintendo Entertainment System"
	description "Nintendo - Nintendo Entertainment System"
)

game (
	comment "10-Yard Fight (USA, Europe)"
	genre "Sports"
	rom ( crc C986CDA2 )
)

game (
	comment "Super Mario Bros. (World)"
	genre "Platform"
	rom ( crc 8E3630B7 )
)
`;

const DEVELOPER_DAT = `clrmamepro (
	name "Nintendo - Nintendo Entertainment System"
)

game (
	comment "Super Mario Bros. (World)"
	developer "Nintendo R&D4"
	rom ( crc 8E3630B7 )
)
`;

// `maxusers` stores the value as an UNQUOTED `users` field — the tricky case.
const MAXUSERS_DAT = `clrmamepro (
	name "Nintendo - Nintendo Entertainment System"
)

game (
	comment "Super Mario Bros. (World)"
	users 2
	rom ( crc 8E3630B7 )
)
`;

const RELEASEYEAR_DAT = `game (
	comment "Super Mario Bros. (World)"
	releaseyear "1985"
	rom ( crc 8E3630B7 )
)
`;

function makeRom(overrides: Partial<DiscoveredRom> = {}): DiscoveredRom {
  return {
    fileName: "Super Mario Bros. (USA).nes",
    filePath: "/roms/nes/Super Mario Bros. (USA).nes",
    systemId: "nes",
    systemName: "Nintendo Entertainment System",
    sizeBytes: 40976,
    ...overrides,
  };
}

describe("parseCategoryDat", () => {
  it("parses quoted fields with comment and crc", () => {
    const rows = parseCategoryDat(GENRE_DAT, "genre", true);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      comment: "10-Yard Fight (USA, Europe)",
      crc: "C986CDA2",
      value: "Sports",
    });
    expect(rows[1].value).toBe("Platform");
  });

  it("parses the unquoted `users` field from maxusers", () => {
    const rows = parseCategoryDat(MAXUSERS_DAT, "users", false);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("2");
    expect(rows[0].comment).toBe("Super Mario Bros. (World)");
  });

  it("ignores the clrmamepro header block", () => {
    const rows = parseCategoryDat(GENRE_DAT, "genre", true);
    expect(rows.some((r) => r.comment.includes("Nintendo -"))).toBe(false);
  });
});

describe("buildSystemIndex", () => {
  it("merges fields across categories by comment", () => {
    const index = buildSystemIndex({
      genre: parseCategoryDat(GENRE_DAT, "genre", true),
      developer: parseCategoryDat(DEVELOPER_DAT, "developer", true),
      users: parseCategoryDat(MAXUSERS_DAT, "users", false),
      releaseyear: parseCategoryDat(RELEASEYEAR_DAT, "releaseyear", true),
    });

    const smb = index.byNorm.get("super mario bros");
    expect(smb).toBeDefined();
    expect(smb!.genre).toBe("Platform");
    expect(smb!.developer).toBe("Nintendo R&D4");
    expect(smb!.users).toBe("2");
    expect(smb!.releaseyear).toBe("1985");
  });
});

describe("LibretroMetadataProvider", () => {
  let cache: MetadataCache;
  let provider: LibretroMetadataProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mkdirSync(TEST_PROJECT_ROOT, { recursive: true });
    writeFileSync(
      TEST_SYSTEM_MAP_PATH,
      JSON.stringify({ nes: "Nintendo_-_Nintendo_Entertainment_System" }),
      "utf-8"
    );

    cache = new MetadataCache(TEST_PROJECT_ROOT);
    mockFetch = vi.fn(async (url: string) => {
      const dat = url.includes("/genre/")
        ? GENRE_DAT
        : url.includes("/developer/")
          ? DEVELOPER_DAT
          : url.includes("/maxusers/")
            ? MAXUSERS_DAT
            : url.includes("/releaseyear/")
              ? RELEASEYEAR_DAT
              : ""; // publisher etc. → 404
      if (!dat) return { ok: false, status: 404 };
      return { ok: true, status: 200, text: async () => dat };
    });
    vi.stubGlobal("fetch", mockFetch);

    provider = new LibretroMetadataProvider(cache, {
      systemMapPath: TEST_SYSTEM_MAP_PATH,
    });
  });

  afterEach(() => {
    rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("scrapes and merges libretro metadata for a ROM (region-insensitive)", async () => {
    const result = await provider.scrapeAll([
      { systemId: "nes", roms: [makeRom()] },
    ]);

    expect(result.totalFound).toBe(1);
    expect(result.totalNotFound).toBe(0);

    // ROM is "(USA)" but the DAT entry is "(World)" — name match strips region.
    const meta = cache.getMetadata("nes", "Super Mario Bros. (USA).nes");
    expect(meta).not.toBeNull();
    expect(meta!.genre).toBe("Platform");
    expect(meta!.developer).toBe("Nintendo R&D4");
    expect(meta!.players).toBe("2");
    expect(meta!.year).toBe("1985");
  });

  it("preserves an existing cover when merging metadata", async () => {
    cache.setMetadata("nes", "Super Mario Bros. (USA).nes", {
      title: "",
      description: "",
      year: "",
      genre: "",
      publisher: "",
      developer: "",
      players: "",
      rating: "",
      coverPath: "/covers/nes/smb.png",
      coverSource: "libretro",
      screenshotPath: "",
      screenScraperId: "",
      lastScraped: "",
    });

    await provider.scrapeAll([{ systemId: "nes", roms: [makeRom()] }], undefined, true);

    const meta = cache.getMetadata("nes", "Super Mario Bros. (USA).nes");
    expect(meta!.coverPath).toBe("/covers/nes/smb.png");
    expect(meta!.coverSource).toBe("libretro");
    expect(meta!.genre).toBe("Platform");
  });

  it("reports not_found for a ROM absent from the database", async () => {
    const result = await provider.scrapeAll([
      { systemId: "nes", roms: [makeRom({ fileName: "Nonexistent Game.nes" })] },
    ]);
    expect(result.totalFound).toBe(0);
    expect(result.totalNotFound).toBe(1);
  });

  it("caches downloaded DATs on disk and reuses them without re-fetching", async () => {
    await provider.scrapeAll([{ systemId: "nes", roms: [makeRom()] }]);
    const callsAfterFirst = mockFetch.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // A fresh provider should read the on-disk DAT cache, not the network.
    const provider2 = new LibretroMetadataProvider(cache, {
      systemMapPath: TEST_SYSTEM_MAP_PATH,
    });
    await provider2.scrapeAll(
      [{ systemId: "nes", roms: [makeRom({ fileName: "Super Mario Bros. (Europe).nes" })] }],
      undefined,
      true
    );
    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);
  });
});
