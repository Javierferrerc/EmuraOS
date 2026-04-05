import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { SteamGridDb } from "../../src/core/steamgriddb.js";
import { MetadataCache } from "../../src/core/metadata-cache.js";
import type { DiscoveredRom } from "../../src/core/types.js";

const TEST_PROJECT_ROOT = resolve(import.meta.dirname, "__test_sgdb__");

const FAKE_IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
) {
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers: {
      get: (key: string) => init.headers?.[key] ?? null,
    },
    json: async () => body,
  };
}

function imageResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: async () => FAKE_IMAGE.buffer,
  };
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => ({ success: false }),
  };
}

function makeRom(overrides: Partial<DiscoveredRom> = {}): DiscoveredRom {
  return {
    fileName: "Super Mario Odyssey (World).nsp",
    filePath: "/roms/switch/Super Mario Odyssey (World).nsp",
    systemId: "switch",
    systemName: "Nintendo Switch",
    sizeBytes: 1024,
    ...overrides,
  };
}

describe("SteamGridDb", () => {
  let cache: MetadataCache;
  let sgdb: SteamGridDb;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mkdirSync(TEST_PROJECT_ROOT, { recursive: true });

    cache = new MetadataCache(TEST_PROJECT_ROOT);
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    sgdb = new SteamGridDb(cache, { apiKey: "test-key" });
  });

  afterEach(() => {
    rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("extracts game title from ROM filename", () => {
    expect(sgdb.extractTitle("Super Mario Odyssey (World).nsp")).toBe(
      "Super Mario Odyssey"
    );
    expect(sgdb.extractTitle("Metroid Prime 4 (USA) (Rev 1).xci")).toBe(
      "Metroid Prime 4"
    );
    expect(sgdb.extractTitle("BreathOfTheWild.nsp")).toBe("BreathOfTheWild");
  });

  it("picks exact case-insensitive match over partial", () => {
    const results = [
      { id: 1, name: "Zelda: Breath of the Wild" },
      { id: 2, name: "Zelda" },
      { id: 3, name: "ZELDA" },
    ];
    const best = sgdb.pickBestSearchResult("Zelda", results);
    expect(best).not.toBeNull();
    expect(best!.id === 2 || best!.id === 3).toBe(true);
  });

  it("prefers verified results when names tie", () => {
    const results = [
      { id: 1, name: "Mario Kart", verified: false },
      { id: 2, name: "Mario Kart", verified: true },
      { id: 3, name: "Mario Kart", verified: false },
    ];
    const best = sgdb.pickBestSearchResult("Mario Kart", results);
    expect(best).not.toBeNull();
    expect(best!.id).toBe(2);
  });

  it("picks shortest name within the matched tier", () => {
    const results = [
      { id: 1, name: "Zelda: Breath of the Wild" },
      { id: 2, name: "Zelda: Tears of the Kingdom" },
    ];
    // Normalized prefix match — shortest wins.
    const best = sgdb.pickBestSearchResult("Zelda", results);
    expect(best).not.toBeNull();
    expect(best!.id).toBe(1);
  });

  it("returns null when no tier matches", () => {
    const results = [
      { id: 1, name: "Completely Different Game" },
      { id: 2, name: "Another Unrelated Title" },
    ];
    const best = sgdb.pickBestSearchResult("Super Mario Odyssey", results);
    expect(best).toBeNull();
  });

  it("grid picker prefers 600x900 over 460x215", () => {
    const grids = [
      {
        id: 1,
        score: 100,
        style: "default",
        width: 460,
        height: 215,
        nsfw: false,
        humor: false,
        url: "a",
      },
      {
        id: 2,
        score: 50,
        style: "default",
        width: 600,
        height: 900,
        nsfw: false,
        humor: false,
        url: "b",
      },
    ];
    const best = sgdb.pickBestGrid(grids);
    expect(best).not.toBeNull();
    expect(best!.id).toBe(2);
  });

  it("grid picker falls back to 460x215 when no 600x900 exists", () => {
    const grids = [
      {
        id: 1,
        score: 100,
        style: "default",
        width: 460,
        height: 215,
        nsfw: false,
        humor: false,
        url: "a",
      },
      {
        id: 2,
        score: 200,
        style: "default",
        width: 920,
        height: 430,
        nsfw: false,
        humor: false,
        url: "b",
      },
    ];
    const best = sgdb.pickBestGrid(grids);
    expect(best).not.toBeNull();
    expect(best!.id).toBe(1);
  });

  it("grid picker demotes alternate/blurred/material styles", () => {
    const grids = [
      {
        id: 1,
        score: 999,
        style: "blurred",
        width: 600,
        height: 900,
        nsfw: false,
        humor: false,
        url: "a",
      },
      {
        id: 2,
        score: 10,
        style: "default",
        width: 600,
        height: 900,
        nsfw: false,
        humor: false,
        url: "b",
      },
    ];
    const best = sgdb.pickBestGrid(grids);
    expect(best).not.toBeNull();
    expect(best!.id).toBe(2);
  });

  it("never picks nsfw or humor grids even with high score", () => {
    const grids = [
      {
        id: 1,
        score: 9999,
        style: "default",
        width: 600,
        height: 900,
        nsfw: true,
        humor: false,
        url: "a",
      },
      {
        id: 2,
        score: 9999,
        style: "default",
        width: 600,
        height: 900,
        nsfw: false,
        humor: true,
        url: "b",
      },
      {
        id: 3,
        score: 1,
        style: "default",
        width: 600,
        height: 900,
        nsfw: false,
        humor: false,
        url: "c",
      },
    ];
    const best = sgdb.pickBestGrid(grids);
    expect(best).not.toBeNull();
    expect(best!.id).toBe(3);
  });

  it("happy path: downloads cover and sets coverSource steamgriddb", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [{ id: 42, name: "Super Mario Odyssey", verified: true }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [
            {
              id: 1,
              score: 100,
              style: "default",
              width: 600,
              height: 900,
              nsfw: false,
              humor: false,
              url: "https://cdn.example/cover.png",
            },
          ],
        })
      )
      .mockResolvedValueOnce(imageResponse());

    const result = await sgdb.fetchCover(
      "switch",
      "Super Mario Odyssey (World).nsp"
    );
    expect(result).not.toBeNull();
    expect(existsSync(result!)).toBe(true);

    const metadata = cache.getMetadata(
      "switch",
      "Super Mario Odyssey (World).nsp"
    );
    expect(metadata).not.toBeNull();
    expect(metadata!.coverSource).toBe("steamgriddb");
    expect(metadata!.coverPath).toBe(result);
  });

  it("does not re-fetch when cover already cached", async () => {
    cache.ensureDirectories("switch");
    const coverPath = cache.getCoverPath(
      "switch",
      "Super Mario Odyssey (World).nsp"
    );
    writeFileSync(coverPath, "fake");

    const result = await sgdb.fetchCover(
      "switch",
      "Super Mario Odyssey (World).nsp"
    );
    expect(result).toBe(coverPath);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null on 401 without throwing or writing metadata", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(401));

    const result = await sgdb.fetchCover(
      "switch",
      "Super Mario Odyssey (World).nsp"
    );
    expect(result).toBeNull();

    const metadata = cache.getMetadata(
      "switch",
      "Super Mario Odyssey (World).nsp"
    );
    expect(metadata).toBeNull();
  });

  it("returns null on 404 from grids endpoint", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [{ id: 42, name: "Super Mario Odyssey", verified: true }],
        })
      )
      .mockResolvedValueOnce(errorResponse(404));

    const result = await sgdb.fetchCover(
      "switch",
      "Super Mario Odyssey (World).nsp"
    );
    expect(result).toBeNull();
  });

  it("aggregates results in fetchCoversForSystem", async () => {
    // ROM 1: found
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [{ id: 1, name: "Super Mario Odyssey", verified: true }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [
            {
              id: 10,
              score: 100,
              style: "default",
              width: 600,
              height: 900,
              nsfw: false,
              humor: false,
              url: "https://cdn.example/1.png",
            },
          ],
        })
      )
      .mockResolvedValueOnce(imageResponse())
      // ROM 2: not found (search returns empty)
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: [] })
      );

    const roms = [
      makeRom({ fileName: "Super Mario Odyssey (World).nsp" }),
      makeRom({ fileName: "Unknown Game (USA).nsp" }),
    ];

    const result = await sgdb.fetchCoversForSystem("switch", roms);
    expect(result.totalProcessed).toBe(2);
    expect(result.totalFound).toBe(1);
    expect(result.totalNotFound).toBe(1);
    expect(result.totalErrors).toBe(0);
  });

  it("sends Authorization: Bearer <key> on every API call", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [{ id: 42, name: "Super Mario Odyssey", verified: true }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [
            {
              id: 1,
              score: 100,
              style: "default",
              width: 600,
              height: 900,
              nsfw: false,
              humor: false,
              url: "https://cdn.example/cover.png",
            },
          ],
        })
      )
      .mockResolvedValueOnce(imageResponse());

    await sgdb.fetchCover("switch", "Super Mario Odyssey (World).nsp");

    // The first two calls are API calls (search, grids) — check headers.
    const apiCalls = mockFetch.mock.calls.filter((call) =>
      String(call[0]).startsWith("https://www.steamgriddb.com/api/")
    );
    expect(apiCalls.length).toBe(2);
    for (const call of apiCalls) {
      const opts = call[1] as { headers: Record<string, string> };
      expect(opts.headers.Authorization).toBe("Bearer test-key");
    }
  });

  it("rate limiter enforces ≥240ms spacing between API calls", async () => {
    mockFetch.mockImplementation(async () =>
      jsonResponse({ success: true, data: [] })
    );

    const start = Date.now();
    // Two distinct titles → two search API calls with rate limiting in between.
    await sgdb.fetchCover("switch", "Game A.nsp");
    await sgdb.fetchCover("switch", "Game B.nsp");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(240);
  });

  it("searchCache reuses gameId across systems for the same stripped title", async () => {
    // Both ROMs strip down to "Super Mario Bros".
    mockFetch
      // Search (once): returns game id 99
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [{ id: 99, name: "Super Mario Bros", verified: true }],
        })
      )
      // Grids (once): returns a grid
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [
            {
              id: 1,
              score: 100,
              style: "default",
              width: 600,
              height: 900,
              nsfw: false,
              humor: false,
              url: "https://cdn.example/smb.png",
            },
          ],
        })
      )
      // Image 1
      .mockResolvedValueOnce(imageResponse())
      // Second ROM: no search/grid calls (cached), only image download
      .mockResolvedValueOnce(imageResponse());

    const r1 = await sgdb.fetchCover("nes", "Super Mario Bros (USA).nes");
    expect(r1).not.toBeNull();

    const r2 = await sgdb.fetchCover(
      "snes",
      "Super Mario Bros (World).sfc"
    );
    expect(r2).not.toBeNull();

    // Count only API calls (not image downloads).
    const apiCalls = mockFetch.mock.calls.filter((call) =>
      String(call[0]).startsWith("https://www.steamgriddb.com/api/")
    );
    // 1 search + 1 grids (both cached for second ROM).
    expect(apiCalls.length).toBe(2);
  });
});
