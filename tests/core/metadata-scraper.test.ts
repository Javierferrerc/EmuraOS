import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { MetadataScraper } from "../../src/core/metadata-scraper.js";
import { MetadataCache } from "../../src/core/metadata-cache.js";
import type {
  DiscoveredRom,
  ScreenScraperCredentials,
  ScrapeProgress,
} from "../../src/core/types.js";

const TEST_PROJECT_ROOT = resolve(import.meta.dirname, "__test_scraper__");
const TEST_SYSTEM_MAP_PATH = resolve(TEST_PROJECT_ROOT, "systems-map.json");

const CREDENTIALS: ScreenScraperCredentials = {
  devId: "testdev",
  devPassword: "testpass",
  softName: "retro-launcher-test",
};

function makeRom(overrides: Partial<DiscoveredRom> = {}): DiscoveredRom {
  return {
    fileName: "mario.nes",
    filePath: "/roms/nes/mario.nes",
    systemId: "nes",
    systemName: "Nintendo Entertainment System",
    sizeBytes: 262144,
    ...overrides,
  };
}

function makeApiResponse(title = "Super Mario Bros") {
  return {
    response: {
      jeu: {
        id: 12345,
        noms: [{ region: "us", text: title }],
        synopsis: [{ langue: "en", text: "A classic platformer" }],
        dates: [{ region: "us", text: "1985-10-18" }],
        genres: [
          {
            noms_genre: [{ langue: "en", text: "Platform" }],
          },
        ],
        editeur: [{ langue: "en", text: "Nintendo" }],
        developpeur: [{ langue: "en", text: "Nintendo R&D4" }],
        joueurs: { text: "1" },
        note: { text: "18" },
        medias: [
          {
            type: "box-2D",
            region: "us",
            url: "https://screenscraper.fr/covers/mario.png",
          },
        ],
      },
    },
  };
}

describe("MetadataScraper", () => {
  let cache: MetadataCache;
  let scraper: MetadataScraper;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mkdirSync(TEST_PROJECT_ROOT, { recursive: true });
    writeFileSync(
      TEST_SYSTEM_MAP_PATH,
      JSON.stringify({ nes: 3, snes: 4 }),
      "utf-8"
    );

    cache = new MetadataCache(TEST_PROJECT_ROOT);
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    scraper = new MetadataScraper(CREDENTIALS, cache, {
      systemMapPath: TEST_SYSTEM_MAP_PATH,
      downloadCovers: false,
    });
  });

  afterEach(() => {
    rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns cached metadata without making API call", async () => {
    const metadata = {
      title: "Cached Game",
      description: "",
      year: "1990",
      genre: "Action",
      publisher: "",
      developer: "",
      players: "1",
      rating: "",
      coverPath: "",
      screenshotPath: "",
      screenScraperId: "999",
      lastScraped: new Date().toISOString(),
    };
    cache.setMetadata("nes", "mario.nes", metadata);

    const result = await scraper.scrapeRom(makeRom());
    expect(result.found).toBe(true);
    expect(result.metadata!.title).toBe("Cached Game");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("builds correct API URL with parameters", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeApiResponse(),
    });

    await scraper.scrapeRom(makeRom(), true);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("api.screenscraper.fr/api2/jeuInfos.php");
    expect(calledUrl).toContain("devid=testdev");
    expect(calledUrl).toContain("romnom=mario.nes");
    expect(calledUrl).toContain("systemeid=3");
  });

  it("parses API response correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeApiResponse("Zelda"),
    });

    const result = await scraper.scrapeRom(makeRom(), true);
    expect(result.found).toBe(true);
    expect(result.metadata!.title).toBe("Zelda");
    expect(result.metadata!.description).toBe("A classic platformer");
    expect(result.metadata!.year).toBe("1985");
    expect(result.metadata!.genre).toBe("Platform");
    expect(result.metadata!.screenScraperId).toBe("12345");
  });

  it("handles 404 as not found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await scraper.scrapeRom(makeRom(), true);
    expect(result.found).toBe(false);
    expect(result.metadata).toBeNull();
  });

  it("throws on non-404 API errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(scraper.scrapeRom(makeRom(), true)).rejects.toThrow(
      "ScreenScraper API error: 500"
    );
  });

  it("returns not found for unmapped system", async () => {
    const rom = makeRom({ systemId: "unknown_system" });
    const result = await scraper.scrapeRom(rom, true);
    expect(result.found).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("maps system IDs correctly", () => {
    expect(scraper.getSystemScreenScraperId("nes")).toBe(3);
    expect(scraper.getSystemScreenScraperId("snes")).toBe(4);
    expect(scraper.getSystemScreenScraperId("unknown")).toBeUndefined();
  });

  it("reports progress during scrapeSystem", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(),
    });

    const progressUpdates: ScrapeProgress[] = [];
    const roms = [
      makeRom({ fileName: "game1.nes" }),
      makeRom({ fileName: "game2.nes" }),
    ];

    await scraper.scrapeSystem(roms, (p) => progressUpdates.push({ ...p }));

    expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
    expect(progressUpdates.some((p) => p.romFileName === "game1.nes")).toBe(true);
    expect(progressUpdates.some((p) => p.romFileName === "game2.nes")).toBe(true);
  });

  it("scrapeSystem returns aggregate results", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeApiResponse(),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    const roms = [
      makeRom({ fileName: "found.nes" }),
      makeRom({ fileName: "missing.nes" }),
    ];

    const result = await scraper.scrapeSystem(roms);
    expect(result.totalProcessed).toBe(2);
    expect(result.totalFound).toBe(1);
    expect(result.totalNotFound).toBe(1);
    expect(result.totalErrors).toBe(0);
  });

  it("scrapeSystem handles errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const result = await scraper.scrapeSystem([makeRom()]);
    expect(result.totalErrors).toBe(1);
    expect(result.errors[0].error).toBe("Network failure");
  });

  it("reports cached ROMs in scrapeSystem progress", async () => {
    cache.setMetadata("nes", "cached.nes", {
      title: "Cached",
      description: "",
      year: "1990",
      genre: "",
      publisher: "",
      developer: "",
      players: "",
      rating: "",
      coverPath: "",
      screenshotPath: "",
      screenScraperId: "1",
      lastScraped: new Date().toISOString(),
    });

    const progressUpdates: ScrapeProgress[] = [];
    await scraper.scrapeSystem(
      [makeRom({ fileName: "cached.nes" })],
      (p) => progressUpdates.push({ ...p })
    );

    expect(progressUpdates.some((p) => p.status === "cached")).toBe(true);
  });
});
