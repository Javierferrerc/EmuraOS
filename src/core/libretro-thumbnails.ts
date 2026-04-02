import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { MetadataCache } from "./metadata-cache.js";
import type {
  DiscoveredRom,
  CoverFetchProgress,
  CoverFetchResult,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RAW_BASE = "https://raw.githubusercontent.com/libretro-thumbnails";
const API_BASE = "https://api.github.com/repos/libretro-thumbnails";
const FETCH_DELAY_MS = 100;

type SystemMap = Record<string, string>;

interface GitTreeEntry {
  path: string;
  type: string;
}

export class LibretroThumbnails {
  private cache: MetadataCache;
  private systemMap: SystemMap;
  private thumbnailListCache = new Map<string, string[]>();

  constructor(
    cache: MetadataCache,
    options?: { systemMapPath?: string }
  ) {
    this.cache = cache;

    const mapPath =
      options?.systemMapPath ??
      resolve(__dirname, "..", "data", "libretro-systems.json");
    this.systemMap = JSON.parse(readFileSync(mapPath, "utf-8"));
  }

  getSystemLibretroName(systemId: string): string | undefined {
    return this.systemMap[systemId];
  }

  /**
   * Extract the game title from a ROM filename by stripping the extension
   * and any region/version tags in parentheses.
   * "Super Mario Bros. (World).nes" → "Super Mario Bros."
   */
  extractTitle(romFileName: string): string {
    // Strip extension
    const name = basename(
      romFileName,
      romFileName.substring(romFileName.lastIndexOf("."))
    );
    // Strip parenthesized tags like (USA), (World), (Rev 1), etc.
    return name.replace(/\s*\([^)]*\)\s*/g, "").trim();
  }

  /**
   * Build a direct download URL for a known thumbnail filename.
   */
  buildDownloadUrl(systemId: string, thumbnailFileName: string): string | null {
    const repoName = this.systemMap[systemId];
    if (!repoName) return null;
    // GitHub raw URLs handle spaces as %20 but don't need full encoding for repo names with underscores
    const encodedFile = encodeURIComponent(thumbnailFileName).replace(
      /%2F/g,
      "/"
    );
    return `${RAW_BASE}/${repoName}/master/Named_Boxarts/${encodedFile}`;
  }

  /**
   * Fetch the list of available thumbnails for a system from GitHub's Trees API.
   * Results are cached in memory for the session.
   */
  async fetchThumbnailList(systemId: string): Promise<string[]> {
    const cached = this.thumbnailListCache.get(systemId);
    if (cached) return cached;

    const repoName = this.systemMap[systemId];
    if (!repoName) return [];

    // First get the master tree to find Named_Boxarts SHA
    const treeUrl = `${API_BASE}/${repoName}/git/trees/master`;
    const treeResp = await fetch(treeUrl);
    if (!treeResp.ok) return [];

    const treeData = (await treeResp.json()) as {
      tree: GitTreeEntry[];
    };
    const boxartsEntry = treeData.tree.find(
      (e) => e.path === "Named_Boxarts" && e.type === "tree"
    ) as (GitTreeEntry & { sha: string }) | undefined;
    if (!boxartsEntry) return [];

    // Fetch the Named_Boxarts subtree
    const boxartsUrl = `${API_BASE}/${repoName}/git/trees/${boxartsEntry.sha}`;
    const boxartsResp = await fetch(boxartsUrl);
    if (!boxartsResp.ok) return [];

    const boxartsData = (await boxartsResp.json()) as {
      tree: GitTreeEntry[];
      truncated?: boolean;
    };

    const files = boxartsData.tree
      .filter((e) => e.type === "blob")
      .map((e) => e.path);

    this.thumbnailListCache.set(systemId, files);
    return files;
  }

  /**
   * Find the best matching thumbnail filename for a ROM.
   * Matches by title prefix (ignoring region/date/publisher tags).
   * Prefers the base version (shortest name that starts with the title).
   */
  findBestMatch(romFileName: string, availableFiles: string[]): string | null {
    const title = this.extractTitle(romFileName);
    if (!title) return null;

    const titleLower = title.toLowerCase();

    // Find all files whose title matches (before the first parenthesis)
    const matches = availableFiles.filter((f) => {
      const fTitle = f
        .replace(/\.png$/i, "")
        .replace(/\s*\([^)]*\)\s*/g, "")
        .replace(/\s*\[[^\]]*\]\s*/g, "")
        .trim()
        .toLowerCase();
      return fTitle === titleLower;
    });

    if (matches.length === 0) return null;

    // Prefer files without [h] (hack) or [b] (bad dump) or [t] (trainer) tags
    const clean = matches.filter(
      (f) => !f.includes("[h]") && !f.includes("[b]") && !f.includes("[t]")
    );

    // Pick the shortest match from clean files, or from all matches
    const candidates = clean.length > 0 ? clean : matches;
    candidates.sort((a, b) => a.length - b.length);
    return candidates[0];
  }

  async fetchCover(
    systemId: string,
    romFileName: string
  ): Promise<string | null> {
    // Skip if cover already cached
    if (this.cache.coverExists(systemId, romFileName)) {
      return this.cache.getCoverPath(systemId, romFileName);
    }

    const repoName = this.systemMap[systemId];
    if (!repoName) return null;

    // Get available thumbnails and find best match
    const thumbnails = await this.fetchThumbnailList(systemId);
    const match = this.findBestMatch(romFileName, thumbnails);
    if (!match) return null;

    const url = this.buildDownloadUrl(systemId, match);
    if (!url) return null;

    const response = await fetch(url);
    if (!response.ok) return null;

    this.cache.ensureDirectories(systemId);
    const coverPath = this.cache.getCoverPath(systemId, romFileName);
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(coverPath, buffer);

    // Update metadata cache with cover info
    const existing = this.cache.getMetadata(systemId, romFileName);
    if (existing) {
      existing.coverPath = coverPath;
      existing.coverSource = "libretro";
      this.cache.setMetadata(systemId, romFileName, existing);
    } else {
      // Create minimal metadata entry with cover
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
        coverSource: "libretro",
        screenshotPath: "",
        screenScraperId: "",
        lastScraped: "",
      });
    }

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

      // Check if already cached
      if (this.cache.coverExists(rom.systemId, rom.fileName)) {
        result.totalFound++;
        onProgress?.({
          current: i + 1,
          total: roms.length,
          romFileName: rom.fileName,
          systemId: rom.systemId,
          status: "already_cached",
        });
        continue;
      }

      onProgress?.({
        current: i + 1,
        total: roms.length,
        romFileName: rom.fileName,
        systemId: rom.systemId,
        status: "downloading",
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

        // Small delay to avoid overwhelming GitHub
        if (i < roms.length - 1) {
          await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
        }
      } catch {
        result.totalErrors++;
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

  async fetchAllCovers(
    systems: { systemId: string; roms: DiscoveredRom[] }[],
    onProgress?: (progress: CoverFetchProgress) => void
  ): Promise<CoverFetchResult> {
    const allRoms: DiscoveredRom[] = [];
    for (const system of systems) {
      if (this.systemMap[system.systemId]) {
        allRoms.push(...system.roms);
      }
    }

    return this.fetchCoversForSystem(
      allRoms[0]?.systemId ?? "",
      allRoms,
      onProgress
    );
  }
}
