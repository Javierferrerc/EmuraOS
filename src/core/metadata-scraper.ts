import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MetadataCache } from "./metadata-cache.js";
import { ensureThumbnail } from "./thumbnail-cache.js";
import { logSecurityEvent } from "./security-logger.js";
import type {
  DiscoveredRom,
  GameMetadata,
  ScrapeResult,
  ScrapeProgress,
  ScreenScraperCredentials,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_BASE = "https://api.screenscraper.fr/api2/jeuInfos.php";
const RATE_LIMIT_MS = 1200;

type SystemMap = Record<string, number>;

export class MetadataScraper {
  private credentials: ScreenScraperCredentials;
  private cache: MetadataCache;
  private systemMap: SystemMap;
  private lastRequestTime = 0;
  private downloadCovers: boolean;

  constructor(
    credentials: ScreenScraperCredentials,
    cache: MetadataCache,
    options?: { systemMapPath?: string; downloadCovers?: boolean }
  ) {
    this.credentials = credentials;
    this.cache = cache;
    this.downloadCovers = options?.downloadCovers ?? true;

    const mapPath =
      options?.systemMapPath ??
      resolve(__dirname, "..", "data", "screenscraper-systems.json");
    this.systemMap = JSON.parse(readFileSync(mapPath, "utf-8"));
  }

  getSystemScreenScraperId(systemId: string): number | undefined {
    return this.systemMap[systemId];
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private buildUrl(rom: DiscoveredRom): string | null {
    const ssSystemId = this.systemMap[rom.systemId];
    if (ssSystemId === undefined) return null;

    const params = new URLSearchParams({
      devid: this.credentials.devId,
      devpassword: this.credentials.devPassword,
      softname: this.credentials.softName,
      output: "json",
      romnom: rom.fileName,
      romtaille: String(rom.sizeBytes),
      systemeid: String(ssSystemId),
    });

    if (this.credentials.ssId) params.set("ssid", this.credentials.ssId);
    if (this.credentials.ssPassword)
      params.set("sspassword", this.credentials.ssPassword);

    return `${API_BASE}?${params.toString()}`;
  }

  private parseResponse(data: Record<string, unknown>): GameMetadata | null {
    const jeu = data.response as Record<string, unknown> | undefined;
    if (!jeu) return null;
    const game = jeu.jeu as Record<string, unknown> | undefined;
    if (!game) return null;

    const getName = (noms: unknown): string => {
      if (!Array.isArray(noms)) return "";
      for (const region of ["us", "eu", "wor", "jp", "ss"]) {
        const found = noms.find(
          (n: Record<string, string>) => n.region === region
        );
        if (found) return (found as Record<string, string>).text ?? "";
      }
      return (noms[0] as Record<string, string>)?.text ?? "";
    };

    const getText = (field: unknown, lang = "en"): string => {
      if (!Array.isArray(field)) return "";
      const found = field.find(
        (f: Record<string, string>) => f.langue === lang
      );
      if (found) return (found as Record<string, string>).text ?? "";
      return (field[0] as Record<string, string>)?.text ?? "";
    };

    const getGenre = (genres: unknown): string => {
      if (!Array.isArray(genres)) return "";
      const first = genres[0] as Record<string, unknown> | undefined;
      if (!first) return "";
      const noms = first.noms_genre as Array<Record<string, string>> | undefined;
      if (!noms) return "";
      const en = noms.find((n) => n.langue === "en");
      return en?.text ?? noms[0]?.text ?? "";
    };

    const getCoverUrl = (medias: unknown): string => {
      if (!Array.isArray(medias)) return "";
      for (const region of ["us", "eu", "wor", "jp", "ss"]) {
        const found = medias.find(
          (m: Record<string, string>) =>
            m.type === "box-2D" && m.region === region
        );
        if (found) return (found as Record<string, string>).url ?? "";
      }
      return "";
    };

    return {
      title: getName(game.noms),
      description: getText(game.synopsis),
      year: ((game.dates as Array<Record<string, string>> | undefined) ?? []).find(
        (d) => d.region === "us" || d.region === "wor"
      )?.text?.substring(0, 4) ??
        ((game.dates as Array<Record<string, string>> | undefined) ?? [])[0]?.text?.substring(0, 4) ??
        "",
      genre: getGenre(game.genres),
      publisher: getText(game.editeur as unknown[]),
      developer: getText(game.developpeur as unknown[]),
      players: String((game.joueurs as Record<string, string>)?.text ?? ""),
      rating: String((game.note as Record<string, string>)?.text ?? ""),
      coverPath: "",
      screenshotPath: "",
      screenScraperId: String(game.id ?? ""),
      lastScraped: new Date().toISOString(),
    } satisfies GameMetadata & { _coverUrl?: string };
  }

  private async downloadCover(
    url: string,
    systemId: string,
    romFileName: string
  ): Promise<string> {
    if (!url) return "";
    this.cache.ensureDirectories(systemId);
    const coverPath = this.cache.getCoverPath(systemId, romFileName);
    const response = await fetch(url);
    if (!response.ok) return "";
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(coverPath, buffer);
    // Fire-and-forget: generate a 200px thumbnail for the grid. Failure
    // here is non-fatal — the UI falls back to the full cover.
    void ensureThumbnail(coverPath, this.cache.getThumbnailPath(systemId, romFileName));
    return coverPath;
  }

  async scrapeRom(
    rom: DiscoveredRom,
    force = false
  ): Promise<{ found: boolean; metadata: GameMetadata | null }> {
    if (!force) {
      const cached = this.cache.getMetadata(rom.systemId, rom.fileName);
      if (cached) return { found: true, metadata: cached };
    }

    const url = this.buildUrl(rom);
    if (!url) return { found: false, metadata: null };

    await this.rateLimit();

    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) return { found: false, metadata: null };
      if (response.status === 401 || response.status === 403) {
        logSecurityEvent({
          type: "AUTH_FAILURE",
          detail: `ScreenScraper API returned ${response.status}`,
          severity: "error",
        });
      }
      if (response.status === 429) {
        logSecurityEvent({
          type: "RATE_LIMIT_HIT",
          detail: `ScreenScraper API returned 429`,
          severity: "warn",
        });
      }
      throw new Error(`ScreenScraper API error: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const metadata = this.parseResponse(data);
    if (!metadata) return { found: false, metadata: null };

    // Extract cover URL and download (skip if Libretro cover already exists)
    if (this.downloadCovers && !this.cache.coverExists(rom.systemId, rom.fileName)) {
      const jeu = (data.response as Record<string, unknown>)?.jeu as Record<string, unknown> | undefined;
      if (jeu) {
        const medias = jeu.medias as Array<Record<string, string>> | undefined;
        if (medias) {
          for (const region of ["us", "eu", "wor", "jp", "ss"]) {
            const found = medias.find(
              (m) => m.type === "box-2D" && m.region === region
            );
            if (found?.url) {
              metadata.coverPath = await this.downloadCover(
                found.url,
                rom.systemId,
                rom.fileName
              );
              metadata.coverSource = "screenscraper";
              break;
            }
          }
        }
      }
    } else if (this.cache.coverExists(rom.systemId, rom.fileName)) {
      // Keep existing cover path from Libretro or previous download
      metadata.coverPath = this.cache.getCoverPath(rom.systemId, rom.fileName);
    }

    this.cache.setMetadata(rom.systemId, rom.fileName, metadata);
    return { found: true, metadata };
  }

  async scrapeSystem(
    roms: DiscoveredRom[],
    onProgress?: (progress: ScrapeProgress) => void
  ): Promise<ScrapeResult> {
    const result: ScrapeResult = {
      totalProcessed: 0,
      totalFound: 0,
      totalNotFound: 0,
      totalErrors: 0,
      errors: [],
    };

    for (let i = 0; i < roms.length; i++) {
      const rom = roms[i];
      result.totalProcessed++;

      try {
        // Check cache first for progress reporting
        const cached = this.cache.getMetadata(rom.systemId, rom.fileName);
        if (cached) {
          result.totalFound++;
          onProgress?.({
            current: i + 1,
            total: roms.length,
            romFileName: rom.fileName,
            systemId: rom.systemId,
            status: "cached",
          });
          continue;
        }

        onProgress?.({
          current: i + 1,
          total: roms.length,
          romFileName: rom.fileName,
          systemId: rom.systemId,
          status: "scraping",
        });

        const { found } = await this.scrapeRom(rom, true);
        if (found) {
          result.totalFound++;
          onProgress?.({
            current: i + 1,
            total: roms.length,
            romFileName: rom.fileName,
            systemId: rom.systemId,
            status: "found",
          });
        } else {
          result.totalNotFound++;
          onProgress?.({
            current: i + 1,
            total: roms.length,
            romFileName: rom.fileName,
            systemId: rom.systemId,
            status: "not_found",
          });
        }
      } catch (err) {
        result.totalErrors++;
        result.errors.push({
          romFileName: rom.fileName,
          systemId: rom.systemId,
          error: err instanceof Error ? err.message : String(err),
        });
        onProgress?.({
          current: i + 1,
          total: roms.length,
          romFileName: rom.fileName,
          systemId: rom.systemId,
          status: "error",
        });
      }
    }

    return result;
  }

  async scrapeAll(
    systems: { systemId: string; roms: DiscoveredRom[] }[],
    onProgress?: (progress: ScrapeProgress) => void
  ): Promise<ScrapeResult> {
    const allRoms: DiscoveredRom[] = [];
    for (const system of systems) {
      allRoms.push(...system.roms);
    }

    return this.scrapeSystem(allRoms, onProgress);
  }
}
