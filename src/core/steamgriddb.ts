import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { MetadataCache } from "./metadata-cache.js";
import { ensureThumbnail } from "./thumbnail-cache.js";
import { logSecurityEvent } from "./security-logger.js";
import { normalizeTitle } from "./title-utils.js";
import type {
  DiscoveredRom,
  CoverFetchProgress,
  CoverFetchResult,
} from "./types.js";

const API_BASE = "https://www.steamgriddb.com/api/v2";
const DEFAULT_FETCH_DELAY_MS = 250;

interface SgdbSearchResult {
  id: number;
  name: string;
  verified?: boolean;
}

interface SgdbGrid {
  id: number;
  score: number;
  style: string;
  width: number;
  height: number;
  nsfw: boolean;
  humor: boolean;
  url: string;
  mime?: string;
}

interface SgdbSearchResponse {
  success: boolean;
  data?: SgdbSearchResult[];
}

interface SgdbGridsResponse {
  success: boolean;
  data?: SgdbGrid[];
}

export class SteamGridDb {
  private cache: MetadataCache;
  private apiKey: string;
  private lastRequestTime = 0;
  private fetchDelayMs = DEFAULT_FETCH_DELAY_MS;
  private warnedUnauthorized = false;

  // Session caches — avoid redundant API calls across duplicate titles / systems.
  private searchCache = new Map<string, number | null>();
  private gridCache = new Map<number, SgdbGrid | null>();

  constructor(cache: MetadataCache, options: { apiKey: string }) {
    this.cache = cache;
    this.apiKey = options.apiKey;
  }

  /**
   * Extract the game title from a ROM filename by stripping the extension
   * and any region/version tags in parentheses.
   */
  extractTitle(romFileName: string): string {
    const name = basename(
      romFileName,
      romFileName.substring(romFileName.lastIndexOf("."))
    );
    return name.replace(/\s*\([^)]*\)\s*/g, "").trim();
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.fetchDelayMs) {
      await new Promise((r) => setTimeout(r, this.fetchDelayMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  /**
   * Tiered title matcher.
   * 1. Exact case-insensitive match.
   * 2. Normalized exact match.
   * 3. Normalized prefix match.
   * Within the chosen tier: prefer verified, then tiebreak by shortest name.
   */
  pickBestSearchResult(
    title: string,
    results: SgdbSearchResult[]
  ): SgdbSearchResult | null {
    if (results.length === 0) return null;

    const titleLower = title.toLowerCase();
    const titleNorm = normalizeTitle(title);

    const tier1 = results.filter((r) => r.name.toLowerCase() === titleLower);
    const tier2 = results.filter(
      (r) => normalizeTitle(r.name) === titleNorm
    );
    const tier3 = results.filter((r) =>
      normalizeTitle(r.name).startsWith(titleNorm)
    );

    const chosen = tier1.length > 0 ? tier1 : tier2.length > 0 ? tier2 : tier3;
    if (chosen.length === 0) return null;

    const verified = chosen.filter((r) => r.verified === true);
    const pool = verified.length > 0 ? verified : chosen;

    pool.sort((a, b) => a.name.length - b.name.length);
    return pool[0];
  }

  /**
   * Rank grids by [dimensionScore, styleScore, sgdbScore]. Filters nsfw/humor.
   */
  pickBestGrid(grids: SgdbGrid[]): SgdbGrid | null {
    const safe = grids.filter((g) => !g.nsfw && !g.humor);
    if (safe.length === 0) return null;

    const dimensionScore = (g: SgdbGrid): number => {
      if (g.width === 600 && g.height === 900) return 2;
      if (g.width === 460 && g.height === 215) return 1;
      return 0;
    };

    const styleScore = (g: SgdbGrid): number => {
      const s = (g.style ?? "").toLowerCase();
      if (!s || s === "default") return 3;
      if (s === "no_logo") return 2;
      if (s === "alternate" || s === "white_logo") return 1;
      if (s === "blurred" || s === "material") return 0;
      return 3; // unknown styles default to highest
    };

    const sorted = [...safe].sort((a, b) => {
      const ds = dimensionScore(b) - dimensionScore(a);
      if (ds !== 0) return ds;
      const ss = styleScore(b) - styleScore(a);
      if (ss !== 0) return ss;
      return (b.score ?? 0) - (a.score ?? 0);
    });

    return sorted[0] ?? null;
  }

  private async apiGet(url: string): Promise<Response | null> {
    await this.rateLimit();
    let response: Response;
    try {
      response = await fetch(url, { headers: this.authHeaders() });
    } catch (err) {
      console.warn("[steamgriddb] network error:", err);
      return null;
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "5");
      const waitMs = Math.max(1000, retryAfter * 1000);
      logSecurityEvent({
        type: "RATE_LIMIT_HIT",
        detail: `SteamGridDB returned 429, backing off ${waitMs}ms`,
        severity: "warn",
      });
      console.warn(
        `[steamgriddb] rate limited, waiting ${waitMs}ms then retrying once`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      this.fetchDelayMs = this.fetchDelayMs * 2;
      try {
        response = await fetch(url, { headers: this.authHeaders() });
      } catch (err) {
        console.warn("[steamgriddb] retry network error:", err);
        return null;
      }
    }

    if (response.status === 401) {
      if (!this.warnedUnauthorized) {
        logSecurityEvent({
          type: "AUTH_FAILURE",
          detail: "SteamGridDB returned 401 Unauthorized",
          severity: "error",
        });
        console.warn(
          "[steamgriddb] 401 Unauthorized — check your API key in Settings"
        );
        this.warnedUnauthorized = true;
      }
      return null;
    }

    return response;
  }

  private async searchGameId(title: string): Promise<number | null> {
    const cached = this.searchCache.get(title);
    if (cached !== undefined) return cached;

    const url = `${API_BASE}/search/autocomplete/${encodeURIComponent(title)}`;
    const response = await this.apiGet(url);
    if (!response) {
      this.searchCache.set(title, null);
      return null;
    }
    if (response.status === 404) {
      this.searchCache.set(title, null);
      return null;
    }
    if (!response.ok) {
      this.searchCache.set(title, null);
      return null;
    }

    let data: SgdbSearchResponse;
    try {
      data = (await response.json()) as SgdbSearchResponse;
    } catch {
      this.searchCache.set(title, null);
      return null;
    }

    const results = data?.data ?? [];
    const best = this.pickBestSearchResult(title, results);
    const id = best?.id ?? null;
    this.searchCache.set(title, id);
    return id;
  }

  private async getBestGrid(gameId: number): Promise<SgdbGrid | null> {
    const cached = this.gridCache.get(gameId);
    if (cached !== undefined) return cached;

    const url =
      `${API_BASE}/grids/game/${gameId}` +
      `?dimensions=600x900,460x215&types=static&nsfw=false&humor=false`;
    const response = await this.apiGet(url);
    if (!response) {
      this.gridCache.set(gameId, null);
      return null;
    }
    if (response.status === 404) {
      this.gridCache.set(gameId, null);
      return null;
    }
    if (!response.ok) {
      this.gridCache.set(gameId, null);
      return null;
    }

    let data: SgdbGridsResponse;
    try {
      data = (await response.json()) as SgdbGridsResponse;
    } catch {
      this.gridCache.set(gameId, null);
      return null;
    }

    const grids = data?.data ?? [];
    const best = this.pickBestGrid(grids);
    this.gridCache.set(gameId, best);
    return best;
  }

  private saveCoverMetadata(
    systemId: string,
    romFileName: string,
    coverPath: string
  ): void {
    const existing = this.cache.getMetadata(systemId, romFileName);
    if (existing) {
      existing.coverPath = coverPath;
      existing.coverSource = "steamgriddb";
      this.cache.setMetadata(systemId, romFileName, existing);
    } else {
      this.cache.setMetadata(systemId, romFileName, {
        title: "",
        description: "",
        year: "",
        genre: "",
        publisher: "",
        developer: "",
        players: "",
        rating: "",
        coverPath,
        coverSource: "steamgriddb",
        screenshotPath: "",
        screenScraperId: "",
        lastScraped: "",
      });
    }
  }

  async fetchCover(
    systemId: string,
    romFileName: string
  ): Promise<string | null> {
    if (this.cache.coverExists(systemId, romFileName)) {
      return this.cache.getCoverPath(systemId, romFileName);
    }

    const title = this.extractTitle(romFileName);
    if (!title) return null;

    const gameId = await this.searchGameId(title);
    if (gameId === null) return null;

    const grid = await this.getBestGrid(gameId);
    if (!grid) return null;

    let imageResponse: Response;
    try {
      imageResponse = await fetch(grid.url);
    } catch (err) {
      console.warn("[steamgriddb] image download failed:", err);
      return null;
    }
    if (!imageResponse.ok) return null;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await imageResponse.arrayBuffer());
    } catch {
      return null;
    }

    this.cache.ensureDirectories(systemId);
    const coverPath = this.cache.getCoverPath(systemId, romFileName);
    try {
      writeFileSync(coverPath, buffer);
    } catch (err) {
      console.warn("[steamgriddb] failed to write cover:", err);
      return null;
    }
    void ensureThumbnail(
      coverPath,
      this.cache.getThumbnailPath(systemId, romFileName)
    );

    this.saveCoverMetadata(systemId, romFileName, coverPath);
    return coverPath;
  }

  async fetchCoversForSystem(
    systemId: string,
    roms: DiscoveredRom[],
    onProgress?: (progress: CoverFetchProgress) => void
  ): Promise<CoverFetchResult> {
    const result: CoverFetchResult = {
      totalProcessed: 0,
      totalFound: 0,
      totalNotFound: 0,
      totalErrors: 0,
    };

    for (let i = 0; i < roms.length; i++) {
      const rom = roms[i];
      result.totalProcessed++;

      if (this.cache.coverExists(rom.systemId, rom.fileName)) {
        result.totalFound++;
        onProgress?.({
          current: i + 1,
          total: roms.length,
          romFileName: rom.fileName,
          systemId: rom.systemId,
          status: "already_cached",
          phase: "steamgriddb",
        });
        continue;
      }

      onProgress?.({
        current: i + 1,
        total: roms.length,
        romFileName: rom.fileName,
        systemId: rom.systemId,
        status: "downloading",
        phase: "steamgriddb",
      });

      try {
        const coverPath = await this.fetchCover(rom.systemId, rom.fileName);
        if (coverPath) {
          result.totalFound++;
          onProgress?.({
            current: i + 1,
            total: roms.length,
            romFileName: rom.fileName,
            systemId: rom.systemId,
            status: "found",
            phase: "steamgriddb",
          });
        } else {
          result.totalNotFound++;
          onProgress?.({
            current: i + 1,
            total: roms.length,
            romFileName: rom.fileName,
            systemId: rom.systemId,
            status: "not_found",
            phase: "steamgriddb",
          });
        }
      } catch {
        result.totalErrors++;
        onProgress?.({
          current: i + 1,
          total: roms.length,
          romFileName: rom.fileName,
          systemId: rom.systemId,
          status: "error",
          phase: "steamgriddb",
        });
      }
    }

    return result;
  }

  async fetchAllCovers(
    systems: { systemId: string; roms: DiscoveredRom[] }[],
    onProgress?: (progress: CoverFetchProgress) => void
  ): Promise<CoverFetchResult> {
    const aggregate: CoverFetchResult = {
      totalProcessed: 0,
      totalFound: 0,
      totalNotFound: 0,
      totalErrors: 0,
    };

    const allRoms: DiscoveredRom[] = [];
    for (const system of systems) {
      allRoms.push(...system.roms);
    }

    let current = 0;
    const total = allRoms.length;

    for (const rom of allRoms) {
      current++;
      aggregate.totalProcessed++;

      if (this.cache.coverExists(rom.systemId, rom.fileName)) {
        aggregate.totalFound++;
        onProgress?.({
          current,
          total,
          romFileName: rom.fileName,
          systemId: rom.systemId,
          status: "already_cached",
          phase: "steamgriddb",
        });
        continue;
      }

      onProgress?.({
        current,
        total,
        romFileName: rom.fileName,
        systemId: rom.systemId,
        status: "downloading",
        phase: "steamgriddb",
      });

      try {
        const coverPath = await this.fetchCover(rom.systemId, rom.fileName);
        if (coverPath) {
          aggregate.totalFound++;
          onProgress?.({
            current,
            total,
            romFileName: rom.fileName,
            systemId: rom.systemId,
            status: "found",
            phase: "steamgriddb",
          });
        } else {
          aggregate.totalNotFound++;
          onProgress?.({
            current,
            total,
            romFileName: rom.fileName,
            systemId: rom.systemId,
            status: "not_found",
            phase: "steamgriddb",
          });
        }
      } catch {
        aggregate.totalErrors++;
        onProgress?.({
          current,
          total,
          romFileName: rom.fileName,
          systemId: rom.systemId,
          status: "error",
          phase: "steamgriddb",
        });
      }
    }

    return aggregate;
  }
}
