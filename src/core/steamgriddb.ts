import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { MetadataCache } from "./metadata-cache.js";
import { ensureThumbnail } from "./thumbnail-cache.js";
import { logSecurityEvent } from "./security-logger.js";
import { normalizeTitle, tokenize } from "./title-utils.js";
import type {
  DiscoveredRom,
  CoverFetchProgress,
  CoverFetchResult,
  SgdbCandidate,
} from "./types.js";

export type { SgdbCandidate };

const API_BASE = "https://www.steamgriddb.com/api/v2";
const DEFAULT_FETCH_DELAY_MS = 250;
// Bump when the hero-lookup strategy improves so previously "none"-cached games
// are re-checked. v2 added the wide-grid fallback for retro titles w/o heroes;
// v3 fixed diacritic-insensitive title matching (Pokemon ↔ Pokémon).
const HERO_STRATEGY_VERSION = 3;

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
  thumb?: string;
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
   * and any region/version tags. Strips both `(USA)` style parens AND
   * `[!]` / `[U]` / `[Hack]` style brackets used by GoodTools and similar
   * dump organizations — those would otherwise leak into the SGDB query
   * and prevent any title from matching.
   */
  extractTitle(romFileName: string): string {
    const name = basename(
      romFileName,
      romFileName.substring(romFileName.lastIndexOf("."))
    );
    return name
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s*\[[^\]]*\]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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
   * 4. Token-overlap fallback: every token of the input title appears as a
   *    token in the candidate name. Catches subtitle/article shifts like
   *    "Sonic 2" → "Sonic the Hedgehog 2" or "Zelda Link to the Past" →
   *    "The Legend of Zelda: A Link to the Past" that the previous prefix
   *    tier missed.
   * Within the chosen tier: prefer verified, then tiebreak by shortest name.
   */
  pickBestSearchResult(
    title: string,
    results: SgdbSearchResult[]
  ): SgdbSearchResult | null {
    if (results.length === 0) return null;

    const titleLower = title.toLowerCase();
    const titleNorm = normalizeTitle(title);
    const titleTokens = tokenize(title);

    const tier1 = results.filter((r) => r.name.toLowerCase() === titleLower);
    const tier2 = results.filter(
      (r) => normalizeTitle(r.name) === titleNorm
    );
    const tier3 = results.filter((r) =>
      normalizeTitle(r.name).startsWith(titleNorm)
    );
    // Token-overlap is only meaningful when we have at least one non-stopword
    // token; otherwise a one-character title would match almost anything.
    const tier4 =
      titleTokens.length === 0
        ? []
        : results.filter((r) => {
            const candidateTokens = new Set(tokenize(r.name));
            return titleTokens.every((t) => candidateTokens.has(t));
          });

    const chosen =
      tier1.length > 0
        ? tier1
        : tier2.length > 0
          ? tier2
          : tier3.length > 0
            ? tier3
            : tier4;
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

  /**
   * Public title→id resolver. Bypasses no caches — same lookup the bulk
   * fetcher uses, so subsequent calls hit the in-memory map.
   */
  async resolveGameId(title: string): Promise<number | null> {
    return this.searchGameId(title);
  }

  /**
   * Return up to `limit` games matching a free-text term, in SteamGridDB's
   * autocomplete (relevance) order. The profile-banner picker uses this to
   * aggregate images across EVERY matching game — mirroring SteamGridDB's own
   * multi-game search, which surfaces far more images than a single resolved
   * game would (e.g. "zelda" matches dozens of titles).
   */
  async searchGames(
    title: string,
    limit = 8
  ): Promise<{ id: number; name: string }[]> {
    const url = `${API_BASE}/search/autocomplete/${encodeURIComponent(title)}`;
    const response = await this.apiGet(url);
    if (!response || !response.ok) return [];

    let data: SgdbSearchResponse;
    try {
      data = (await response.json()) as SgdbSearchResponse;
    } catch {
      return [];
    }

    const results = data?.data ?? [];
    return results.slice(0, limit).map((r) => ({ id: r.id, name: r.name }));
  }

  /**
   * List up to `limit` grid candidates for a SteamGridDB game id, ranked
   * by the same heuristic the bulk fetcher uses (dimension → style →
   * SGDB score). Used by the per-game picker so the user can preview
   * several covers and choose the one they like.
   */
  async listGridCandidates(
    gameId: number,
    limit = 20,
    dimensions: string | null = "600x900,460x215,512x512,1024x1024"
  ): Promise<SgdbCandidate[]> {
    // `dimensions = null` fetches every grid size (used by the profile-banner
    // picker, which wants maximum variety rather than just cover-shaped grids).
    const dimQuery = dimensions ? `dimensions=${dimensions}&` : "";
    const url =
      `${API_BASE}/grids/game/${gameId}` +
      `?${dimQuery}types=static&nsfw=false&humor=false`;
    const response = await this.apiGet(url);
    if (!response || !response.ok) return [];

    let data: SgdbGridsResponse;
    try {
      data = (await response.json()) as SgdbGridsResponse;
    } catch {
      return [];
    }

    const grids = (data?.data ?? []).filter((g) => !g.nsfw && !g.humor);
    if (grids.length === 0) return [];

    // Reuse the same ranking as pickBestGrid but keep the top N.
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
      return 3;
    };

    const sorted = [...grids].sort((a, b) => {
      const ds = dimensionScore(b) - dimensionScore(a);
      if (ds !== 0) return ds;
      const ss = styleScore(b) - styleScore(a);
      if (ss !== 0) return ss;
      return (b.score ?? 0) - (a.score ?? 0);
    });

    return sorted.slice(0, limit).map((g) => ({
      gridId: g.id,
      fullUrl: g.url,
      thumbnailUrl: g.thumb ?? g.url,
      width: g.width,
      height: g.height,
      style: g.style,
      score: g.score,
    }));
  }

  /**
   * List up to `limit` hero (wide banner) candidates for a SteamGridDB game
   * id, ranked by width (largest first) then SGDB score. Heroes are ~1920×620
   * wide images, ideal for a profile banner. Mirrors `listGridCandidates`
   * but hits the `/heroes` endpoint; returns the same `SgdbCandidate` shape.
   */
  async listHeroCandidates(
    gameId: number,
    limit = 24
  ): Promise<SgdbCandidate[]> {
    // No dimensions filter: heroes are inherently wide, and restricting to a
    // few exact sizes drops most candidates (often leaving just one). We take
    // everything static/safe and rank by width so the largest show first.
    const url =
      `${API_BASE}/heroes/game/${gameId}` +
      `?types=static&nsfw=false&humor=false`;
    const response = await this.apiGet(url);
    if (!response || !response.ok) return [];

    let data: SgdbGridsResponse;
    try {
      data = (await response.json()) as SgdbGridsResponse;
    } catch {
      return [];
    }

    const heroes = (data?.data ?? []).filter((g) => !g.nsfw && !g.humor);
    const sorted = [...heroes].sort((a, b) => {
      const dw = (b.width ?? 0) - (a.width ?? 0);
      if (dw !== 0) return dw;
      return (b.score ?? 0) - (a.score ?? 0);
    });

    return sorted.slice(0, limit).map((g) => ({
      gridId: g.id,
      fullUrl: g.url,
      thumbnailUrl: g.thumb ?? g.url,
      width: g.width,
      height: g.height,
      style: g.style,
      score: g.score,
    }));
  }

  /**
   * Download a specific SteamGridDB image URL and persist it as the cover
   * for `(systemId, romFileName)`. Used by the per-game picker once the
   * user has chosen one of the candidates from `listGridCandidates`.
   */
  async applyCoverFromUrl(
    systemId: string,
    romFileName: string,
    fullUrl: string
  ): Promise<string | null> {
    let imageResponse: Response;
    try {
      imageResponse = await fetch(fullUrl);
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

  /**
   * Resolve, download and cache a wide hero/banner image for `(systemId,
   * romFileName)`. Returns the local path, or null when the game has no hero
   * on SteamGridDB. Negative results are persisted (heroSource = "none") so the
   * same coverless game isn't re-queried on every home render.
   */
  async fetchHero(
    systemId: string,
    romFileName: string
  ): Promise<string | null> {
    if (this.cache.heroExists(systemId, romFileName)) {
      return this.cache.getHeroPath(systemId, romFileName);
    }
    // Negative cache: a previous lookup (with the CURRENT strategy) found
    // nothing — don't hit the API again. Older versions are re-checked.
    const cachedMeta = this.cache.getMetadata(systemId, romFileName);
    if (
      cachedMeta?.heroSource === "none" &&
      cachedMeta.heroCheck === HERO_STRATEGY_VERSION
    ) {
      return null;
    }

    const title = this.extractTitle(romFileName);
    if (!title) return null;

    const gameId = await this.searchGameId(title);
    if (gameId === null) {
      this.saveHeroMetadata(systemId, romFileName, null);
      return null;
    }

    // Prefer a true wide hero; fall back to a "Steam Horizontal" grid
    // (460x215 / 920x430) — abundant for retro titles that have no heroes and
    // still banner-shaped, unlike the tall 2:3 cover.
    let candidates = await this.listHeroCandidates(gameId, 1);
    if (candidates.length === 0) {
      candidates = await this.listGridCandidates(gameId, 1, "920x430,460x215");
    }
    if (candidates.length === 0) {
      this.saveHeroMetadata(systemId, romFileName, null);
      return null;
    }

    let imageResponse: Response;
    try {
      imageResponse = await fetch(candidates[0].fullUrl);
    } catch (err) {
      console.warn("[steamgriddb] hero download failed:", err);
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
    const heroPath = this.cache.getHeroPath(systemId, romFileName);
    try {
      writeFileSync(heroPath, buffer);
    } catch (err) {
      console.warn("[steamgriddb] failed to write hero:", err);
      return null;
    }

    this.saveHeroMetadata(systemId, romFileName, heroPath);
    return heroPath;
  }

  private saveHeroMetadata(
    systemId: string,
    romFileName: string,
    heroPath: string | null
  ): void {
    const existing = this.cache.getMetadata(systemId, romFileName);
    const base = existing ?? {
      title: "",
      description: "",
      year: "",
      genre: "",
      publisher: "",
      developer: "",
      players: "",
      rating: "",
      coverPath: "",
      screenshotPath: "",
      screenScraperId: "",
      lastScraped: "",
    };
    base.heroPath = heroPath ?? undefined;
    base.heroSource = heroPath ? "steamgriddb" : "none";
    base.heroCheck = HERO_STRATEGY_VERSION;
    this.cache.setMetadata(systemId, romFileName, base);
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
