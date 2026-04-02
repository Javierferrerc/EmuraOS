import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { LibretroThumbnails } from "../../src/core/libretro-thumbnails.js";
import { MetadataCache } from "../../src/core/metadata-cache.js";
import type {
  DiscoveredRom,
  CoverFetchProgress,
} from "../../src/core/types.js";

const TEST_PROJECT_ROOT = resolve(import.meta.dirname, "__test_libretro__");
const TEST_SYSTEM_MAP_PATH = resolve(TEST_PROJECT_ROOT, "libretro-map.json");

const SYSTEM_MAP = {
  nes: "Nintendo_-_Nintendo_Entertainment_System",
  snes: "Nintendo_-_Super_Nintendo_Entertainment_System",
};

// Mock GitHub Trees API responses
const MOCK_MASTER_TREE = {
  tree: [
    { path: "Named_Boxarts", type: "tree", sha: "abc123" },
    { path: "Named_Snaps", type: "tree", sha: "def456" },
  ],
};

const MOCK_BOXARTS_TREE = {
  tree: [
    {
      path: "Super Mario Bros. (1985-09-13)(Nintendo)(JP-US).png",
      type: "blob",
    },
    {
      path: "Super Mario Bros. (1985-09-13)(Nintendo)(JP-US)[h Vimm][iNES title].png",
      type: "blob",
    },
    {
      path: "The Legend of Zelda (1986-02-21)(Nintendo)(JP).png",
      type: "blob",
    },
    {
      path: "Metroid (1986-08-06)(Nintendo)(JP).png",
      type: "blob",
    },
    {
      path: "Kirby's Adventure (1993-03-26)(Nintendo)(US).png",
      type: "blob",
    },
  ],
  truncated: false,
};

function makeRom(overrides: Partial<DiscoveredRom> = {}): DiscoveredRom {
  return {
    fileName: "Super Mario Bros. (World).nes",
    filePath: "/roms/nes/Super Mario Bros. (World).nes",
    systemId: "nes",
    systemName: "Nintendo Entertainment System",
    sizeBytes: 262144,
    ...overrides,
  };
}

describe("LibretroThumbnails", () => {
  let cache: MetadataCache;
  let thumbs: LibretroThumbnails;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mkdirSync(TEST_PROJECT_ROOT, { recursive: true });
    writeFileSync(
      TEST_SYSTEM_MAP_PATH,
      JSON.stringify(SYSTEM_MAP),
      "utf-8"
    );

    cache = new MetadataCache(TEST_PROJECT_ROOT);
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    thumbs = new LibretroThumbnails(cache, {
      systemMapPath: TEST_SYSTEM_MAP_PATH,
    });
  });

  afterEach(() => {
    rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("extracts game title from ROM filename", () => {
    expect(thumbs.extractTitle("Super Mario Bros. (World).nes")).toBe(
      "Super Mario Bros."
    );
    expect(thumbs.extractTitle("Metroid (USA).nes")).toBe("Metroid");
    expect(thumbs.extractTitle("Kirby's Adventure (USA) (Rev 1).nes")).toBe(
      "Kirby's Adventure"
    );
    expect(thumbs.extractTitle("ChronoTrigger.sfc")).toBe("ChronoTrigger");
  });

  it("finds best match by title from available thumbnails", () => {
    const files = MOCK_BOXARTS_TREE.tree.map((e) => e.path);

    const match = thumbs.findBestMatch(
      "Super Mario Bros. (World).nes",
      files
    );
    // Should pick the shortest clean match
    expect(match).toBe(
      "Super Mario Bros. (1985-09-13)(Nintendo)(JP-US).png"
    );
  });

  it("returns null for unmatched ROM", () => {
    const files = MOCK_BOXARTS_TREE.tree.map((e) => e.path);
    const match = thumbs.findBestMatch("Unknown Game (USA).nes", files);
    expect(match).toBeNull();
  });

  it("downloads cover and saves to cache", async () => {
    const fakeImageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    // Mock: master tree → boxarts tree → image download
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_MASTER_TREE,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_BOXARTS_TREE,
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => fakeImageData.buffer,
      });

    const result = await thumbs.fetchCover(
      "nes",
      "Super Mario Bros. (World).nes"
    );
    expect(result).not.toBeNull();
    expect(result).toContain("Super Mario Bros. (World).png");
    expect(existsSync(result!)).toBe(true);

    // Should also create metadata entry
    const metadata = cache.getMetadata(
      "nes",
      "Super Mario Bros. (World).nes"
    );
    expect(metadata).not.toBeNull();
    expect(metadata!.coverSource).toBe("libretro");
    expect(metadata!.coverPath).toBe(result);
  });

  it("returns null for unmapped system", async () => {
    const result = await thumbs.fetchCover(
      "unknown_system",
      "game.rom"
    );
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips download if cover already exists in cache", async () => {
    cache.ensureDirectories("nes");
    const coverPath = cache.getCoverPath(
      "nes",
      "Super Mario Bros. (World).nes"
    );
    writeFileSync(coverPath, "fake-image-data");

    const result = await thumbs.fetchCover(
      "nes",
      "Super Mario Bros. (World).nes"
    );
    expect(result).toBe(coverPath);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("reports progress during fetchCoversForSystem", async () => {
    const fakeImageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    // First ROM: tree fetch + tree fetch + image download
    // Second ROM: tree cached + no match → not_found
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_MASTER_TREE,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_BOXARTS_TREE,
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => fakeImageData.buffer,
      });

    const progressUpdates: CoverFetchProgress[] = [];
    const roms = [
      makeRom({ fileName: "Super Mario Bros. (World).nes" }),
      makeRom({ fileName: "Unknown Game (USA).nes" }),
    ];

    await thumbs.fetchCoversForSystem("nes", roms, (p) =>
      progressUpdates.push({ ...p })
    );

    expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
    expect(
      progressUpdates.some(
        (p) =>
          p.romFileName === "Super Mario Bros. (World).nes" &&
          p.status === "found"
      )
    ).toBe(true);
    expect(
      progressUpdates.some(
        (p) =>
          p.romFileName === "Unknown Game (USA).nes" &&
          p.status === "not_found"
      )
    ).toBe(true);
  });

  it("returns aggregate results from fetchCoversForSystem", async () => {
    const fakeImageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_MASTER_TREE,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_BOXARTS_TREE,
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => fakeImageData.buffer,
      });

    const roms = [
      makeRom({ fileName: "Metroid (USA).nes" }),
      makeRom({ fileName: "Missing Game (USA).nes" }),
    ];

    const result = await thumbs.fetchCoversForSystem("nes", roms);
    expect(result.totalProcessed).toBe(2);
    expect(result.totalFound).toBe(1);
    expect(result.totalNotFound).toBe(1);
    expect(result.totalErrors).toBe(0);
  });

  it("maps system IDs to Libretro repo names", () => {
    expect(thumbs.getSystemLibretroName("nes")).toBe(
      "Nintendo_-_Nintendo_Entertainment_System"
    );
    expect(thumbs.getSystemLibretroName("snes")).toBe(
      "Nintendo_-_Super_Nintendo_Entertainment_System"
    );
    expect(thumbs.getSystemLibretroName("unknown")).toBeUndefined();
  });
});
