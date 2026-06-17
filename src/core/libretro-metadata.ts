import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { MetadataCache } from "./metadata-cache.js";
import { normalizeTitle, tokenize } from "./title-utils.js";
import type {
  DiscoveredRom,
  GameMetadata,
  ScrapeResult,
  ScrapeProgress,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RAW_BASE =
  "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat";

/**
 * Metadata categories pulled from the libretro-database. Each lives in its own
 * folder as a clrmamepro-style DAT, one entry per game keyed by `comment`
 * (the No-Intro/Redump name) plus a `rom ( crc ... )` checksum.
 *
 * Note the field name inside a block does NOT always equal the folder name —
 * `maxusers/` stores the value as `users` (and unquoted). The `quoted` flag
 * tells the parser whether to expect `field "value"` or `field value`.
 */
const CATEGORIES = [
  { folder: "genre", field: "genre", quoted: true },
  { folder: "developer", field: "developer", quoted: true },
  { folder: "publisher", field: "publisher", quoted: true },
  { folder: "releaseyear", field: "releaseyear", quoted: true },
  { folder: "maxusers", field: "users", quoted: false },
] as const;

type SystemMap = Record<string, string>;

/** Accumulated fields for a single game, merged across category DATs. */
export interface LibretroGameFields {
  comment: string;
  crc?: string;
  genre?: string;
  developer?: string;
  publisher?: string;
  releaseyear?: string;
  users?: string;
}

export interface SystemIndex {
  /** normalized stripped comment -> fields (for exact/normalized lookup) */
  byNorm: Map<string, LibretroGameFields>;
  /** entries enriched for the fuzzy match cascade */
  entries: {
    fields: LibretroGameFields;
    /** comment with region/version tags stripped */
    stripped: string;
    lower: string;
    norm: string;
    tokens: string[];
  }[];
}

/**
 * Strip region/version tags from a libretro `comment` to get the bare title.
 * "10-Yard Fight (USA, Europe)" -> "10-Yard Fight"
 */
function stripComment(comment: string): string {
  return comment
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a single category DAT into per-game records. Each `game ( ... )` block
 * yields its `comment`, optional `rom ( crc ... )`, and the category value
 * (quoted strings like `genre "Sports"` or bare numbers like `users 1`).
 *
 * Exported for unit testing — the parser is the trickiest part of this module.
 */
export function parseCategoryDat(
  text: string,
  field: string,
  quoted: boolean
): { comment: string; crc?: string; value: string }[] {
  const out: { comment: string; crc?: string; value: string }[] = [];
  // Split on `game (`; the slice(1) drops the clrmamepro header that precedes
  // the first block. Each chunk runs until the next `game (`, which is fine
  // because every value we extract is anchored on its own field keyword.
  const blocks = text.split(/\bgame\s*\(/).slice(1);

  const valueRe = quoted
    ? new RegExp(`\\b${field}\\s+"([^"]*)"`)
    : new RegExp(`\\b${field}\\s+([^\\s)]+)`);

  for (const block of blocks) {
    const commentM = block.match(/\bcomment\s+"([^"]*)"/);
    if (!commentM) continue;
    const valueM = block.match(valueRe);
    if (!valueM) continue;
    const value = valueM[1];
    if (value === undefined || value === "") continue;

    const crcM = block.match(/\brom\s*\(\s*crc\s+([0-9A-Fa-f]+)/);
    out.push({
      comment: commentM[1],
      crc: crcM ? crcM[1].toUpperCase() : undefined,
      value,
    });
  }

  return out;
}

/**
 * Build a lookup index from a set of parsed category DATs keyed by category
 * field name. Records are joined across categories by exact `comment` string.
 */
export function buildSystemIndex(
  byField: Record<string, { comment: string; crc?: string; value: string }[]>
): SystemIndex {
  const merged = new Map<string, LibretroGameFields>();

  for (const { field } of CATEGORIES) {
    const records = byField[field];
    if (!records) continue;
    for (const rec of records) {
      let entry = merged.get(rec.comment);
      if (!entry) {
        entry = { comment: rec.comment, crc: rec.crc };
        merged.set(rec.comment, entry);
      }
      if (rec.crc && !entry.crc) entry.crc = rec.crc;
      (entry as unknown as Record<string, string>)[field] = rec.value;
    }
  }

  const byNorm = new Map<string, LibretroGameFields>();
  const entries: SystemIndex["entries"] = [];
  for (const fields of merged.values()) {
    const stripped = stripComment(fields.comment);
    const norm = normalizeTitle(stripped);
    // Prefer keeping the first (usually USA/World) entry on collisions.
    if (!byNorm.has(norm)) byNorm.set(norm, fields);
    entries.push({
      fields,
      stripped,
      lower: stripped.toLowerCase(),
      norm,
      tokens: tokenize(stripped),
    });
  }

  return { byNorm, entries };
}

export class LibretroMetadataProvider {
  private cache: MetadataCache;
  private systemMap: SystemMap;
  private datCacheDir: string;
  private indexCache = new Map<string, SystemIndex | null>();

  constructor(
    cache: MetadataCache,
    options?: { systemMapPath?: string }
  ) {
    this.cache = cache;
    this.datCacheDir = resolve(cache.getMetadataDir(), "libretro-dats");

    const mapPath =
      options?.systemMapPath ??
      resolve(__dirname, "..", "data", "libretro-systems.json");
    this.systemMap = JSON.parse(readFileSync(mapPath, "utf-8"));
  }

  /** The libretro-database system name uses spaces where the thumbnails repo
   * name (our systemMap value) uses underscores — they are otherwise identical
   * (e.g. `Nintendo_-_..._System` -> `Nintendo - ... System`). */
  private getSystemDbName(systemId: string): string | undefined {
    const repoName = this.systemMap[systemId];
    if (!repoName) return undefined;
    return repoName.replace(/_/g, " ");
  }

  /**
   * Fetch (or read from disk cache) one category DAT for a system. DAT files
   * change rarely, so once cached on disk we reuse them offline forever unless
   * the file is missing. Returns "" when the category doesn't exist (404).
   */
  private async loadCategoryDat(
    systemId: string,
    repoName: string,
    folder: string,
    field: string,
    quoted: boolean
  ): Promise<{ comment: string; crc?: string; value: string }[]> {
    const dbName = this.getSystemDbName(systemId);
    if (!dbName) return [];

    const diskPath = resolve(this.datCacheDir, repoName, `${folder}.dat`);
    let text: string | null = null;

    if (existsSync(diskPath)) {
      try {
        text = readFileSync(diskPath, "utf-8");
      } catch {
        text = null;
      }
    }

    if (text === null) {
      const url = `${RAW_BASE}/${folder}/${encodeURIComponent(dbName)}.dat`;
      const resp = await fetch(url);
      if (resp.ok) {
        text = await resp.text();
      } else if (resp.status === 404) {
        // This system simply has no DAT for this category. Cache an empty
        // marker so future runs stay fully offline instead of re-probing.
        text = "";
      } else {
        // Transient (e.g. 429/500): don't cache, let it retry next time.
        return [];
      }
      try {
        mkdirSync(resolve(this.datCacheDir, repoName), { recursive: true });
        writeFileSync(diskPath, text, "utf-8");
      } catch {
        // Non-fatal: we can still parse the in-memory text this session.
      }
    }

    return parseCategoryDat(text, field, quoted);
  }

  /** Public accessor for the merged per-system index — used by the metadata
   * cascade so it can reuse libretro's matcher without re-downloading DATs. */
  async loadIndex(systemId: string): Promise<SystemIndex | null> {
    return this.loadSystemIndex(systemId);
  }

  /** Load and cache the merged metadata index for a system. */
  private async loadSystemIndex(systemId: string): Promise<SystemIndex | null> {
    const cached = this.indexCache.get(systemId);
    if (cached !== undefined) return cached;

    const repoName = this.systemMap[systemId];
    if (!repoName) {
      this.indexCache.set(systemId, null);
      return null;
    }

    const byField: Record<
      string,
      { comment: string; crc?: string; value: string }[]
    > = {};
    for (const { folder, field, quoted } of CATEGORIES) {
      byField[field] = await this.loadCategoryDat(
        systemId,
        repoName,
        folder,
        field,
        quoted
      );
    }

    const totalRecords = Object.values(byField).reduce(
      (n, recs) => n + recs.length,
      0
    );
    if (totalRecords === 0) {
      this.indexCache.set(systemId, null);
      return null;
    }

    const index = buildSystemIndex(byField);
    this.indexCache.set(systemId, index);
    return index;
  }

  /**
   * Strip the extension and region/version tags from a ROM filename.
   * "Super Mario Bros. (World).nes" -> "Super Mario Bros."
   */
  private extractTitle(romFileName: string): string {
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

  /**
   * Find the libretro record that best matches a ROM filename. Mirrors the
   * 5-tier cascade used for thumbnail matching so behaviour stays consistent
   * with the cover art the user already sees.
   */
  findMatch(
    romFileName: string,
    index: SystemIndex
  ): LibretroGameFields | null {
    const title = this.extractTitle(romFileName);
    if (!title) return null;

    const titleNorm = normalizeTitle(title);

    // Tier 1/2 — normalized exact (covers case + punctuation differences)
    const exact = index.byNorm.get(titleNorm);
    if (exact) return exact;

    const titleLower = title.toLowerCase();
    const titleTokens = tokenize(title);

    // Tier 3 — normalized prefix
    let matches = index.entries.filter((e) => e.norm.startsWith(titleNorm));

    // Tier 1 (raw lower) as a refinement when several prefixes match
    const lowerExact = matches.filter((e) => e.lower === titleLower);
    if (lowerExact.length > 0) matches = lowerExact;

    // Tier 4 — token containment (>= 2 ROM tokens)
    if (matches.length === 0 && titleTokens.length >= 2) {
      matches = index.entries.filter((e) =>
        titleTokens.every((t) => e.tokens.includes(t))
      );
    }

    // Tier 5 — substring (normalized ROM title >= 6 chars)
    if (matches.length === 0 && titleNorm.length >= 6) {
      matches = index.entries.filter((e) => e.norm.includes(titleNorm));
    }

    if (matches.length === 0) return null;

    // Prefer USA/World/Europe regions, then the shortest comment.
    const regionRank = (comment: string): number => {
      if (/\(USA/i.test(comment) || /\(World/i.test(comment)) return 0;
      if (/\(Europe/i.test(comment)) return 1;
      if (/\(Japan/i.test(comment)) return 3;
      return 2;
    };
    matches.sort((a, b) => {
      const r = regionRank(a.fields.comment) - regionRank(b.fields.comment);
      if (r !== 0) return r;
      return a.fields.comment.length - b.fields.comment.length;
    });

    return matches[0].fields;
  }

  /**
   * Merge libretro fields into the cache for one ROM, preserving any existing
   * cover/hero/description data from other sources. Returns true if a match
   * was found and written.
   */
  private applyMatch(rom: DiscoveredRom, fields: LibretroGameFields): boolean {
    const existing = this.cache.getMetadata(rom.systemId, rom.fileName);
    const base: GameMetadata = existing ?? {
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

    const merged: GameMetadata = {
      ...base,
      title: base.title || stripComment(fields.comment),
      genre: fields.genre ?? base.genre,
      developer: fields.developer ?? base.developer,
      publisher: fields.publisher ?? base.publisher,
      year: fields.releaseyear
        ? fields.releaseyear.substring(0, 4)
        : base.year,
      players: fields.users ?? base.players,
      lastScraped: new Date().toISOString(),
    };

    this.cache.setMetadata(rom.systemId, rom.fileName, merged);
    return true;
  }

  /** True if this ROM already carries libretro-sourced fields. */
  private alreadyScraped(rom: DiscoveredRom): boolean {
    const existing = this.cache.getMetadata(rom.systemId, rom.fileName);
    if (!existing) return false;
    return Boolean(existing.genre || existing.developer || existing.players);
  }

  async scrapeSystem(
    systemId: string,
    roms: DiscoveredRom[],
    onProgress?: (progress: ScrapeProgress) => void,
    force = false
  ): Promise<ScrapeResult> {
    const result: ScrapeResult = {
      totalProcessed: 0,
      totalFound: 0,
      totalNotFound: 0,
      totalErrors: 0,
      errors: [],
    };

    let index: SystemIndex | null = null;
    let indexLoaded = false;

    for (let i = 0; i < roms.length; i++) {
      const rom = roms[i];
      result.totalProcessed++;

      try {
        if (!force && this.alreadyScraped(rom)) {
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

        if (!indexLoaded) {
          index = await this.loadSystemIndex(systemId);
          indexLoaded = true;
        }

        onProgress?.({
          current: i + 1,
          total: roms.length,
          romFileName: rom.fileName,
          systemId: rom.systemId,
          status: "scraping",
        });

        const match = index ? this.findMatch(rom.fileName, index) : null;
        if (match) {
          this.applyMatch(rom, match);
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
    onProgress?: (progress: ScrapeProgress) => void,
    force = false
  ): Promise<ScrapeResult> {
    const total: ScrapeResult = {
      totalProcessed: 0,
      totalFound: 0,
      totalNotFound: 0,
      totalErrors: 0,
      errors: [],
    };

    // Remap each system's local progress onto a single continuous counter so
    // the UI bar advances smoothly across the whole library instead of
    // restarting for every system.
    const grandTotal = systems.reduce((n, s) => n + s.roms.length, 0);
    let done = 0;

    for (const system of systems) {
      const offset = done;
      const r = await this.scrapeSystem(
        system.systemId,
        system.roms,
        onProgress
          ? (p) =>
              onProgress({
                ...p,
                current: offset + p.current,
                total: grandTotal,
              })
          : undefined,
        force
      );
      done += system.roms.length;
      total.totalProcessed += r.totalProcessed;
      total.totalFound += r.totalFound;
      total.totalNotFound += r.totalNotFound;
      total.totalErrors += r.totalErrors;
      total.errors.push(...r.errors);
    }

    return total;
  }
}
