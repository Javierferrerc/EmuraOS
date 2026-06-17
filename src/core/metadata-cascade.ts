/**
 * Metadata cascade — fills game metadata from multiple credential-free sources,
 * best-coverage-first, writing each field only where it's still missing:
 *
 *   1. libretro-database  — cartridge systems; the only source with a reliable
 *                           player count.
 *   2. OpenVGDB           — PSX, NDS, PSP, GameCube, Saturn… (genre, developer,
 *                           publisher, year, description). No player count.
 *   3. Wikidata           — best-effort for PS2 / Wii / Wii U / PS3 / 3DS that
 *                           neither source above covers (developer, publisher,
 *                           genre, year).
 *
 * Non-destructive: a field already present (from an earlier source or a previous
 * scrape) is never overwritten, so libretro's player count and any manual data
 * survive. ROMs already carrying genre+developer+year are skipped unless forced.
 */

import { MetadataCache } from "./metadata-cache.js";
import { LibretroMetadataProvider } from "./libretro-metadata.js";
import { OpenVgdbMetadataProvider } from "./openvgdb-metadata.js";
import { WikidataMetadataProvider } from "./wikidata-metadata.js";
import type { DiscoveredRom, GameMetadata, ScrapeProgress, ScrapeResult } from "./types.js";

function emptyMetadata(): GameMetadata {
  return {
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
}

/** Strip extension + region/version tags to get a bare title for searching. */
function cleanTitle(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CascadeOptions {
  systemMapPath: string;
  /** Re-scrape even ROMs that already look complete. */
  force?: boolean;
  /** Skip the Wikidata pass (network-heavy, fuzzy). Default: enabled. */
  wikidata?: boolean;
}

export async function runMetadataCascade(
  systems: { systemId: string; roms: DiscoveredRom[] }[],
  cache: MetadataCache,
  options: CascadeOptions,
  onProgress?: (progress: ScrapeProgress) => void
): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    totalProcessed: 0,
    totalFound: 0,
    totalNotFound: 0,
    totalErrors: 0,
    errors: [],
  };

  const libretro = new LibretroMetadataProvider(cache, { systemMapPath: options.systemMapPath });
  const openvgdb = new OpenVgdbMetadataProvider(cache.getMetadataDir());
  const wikidata = new WikidataMetadataProvider();
  const useWikidata = options.wikidata !== false;

  const grandTotal = systems.reduce((n, s) => n + s.roms.length, 0);
  let current = 0;

  for (const system of systems) {
    const { systemId } = system;

    // Per-system indexes, lazily loaded the first time a ROM actually needs
    // scraping — so a fully-cached system never triggers a DAT/DB download.
    let libIndex: Awaited<ReturnType<typeof libretro.loadIndex>> | null = null;
    let libLoaded = false;
    let ovgIndex: Awaited<ReturnType<typeof openvgdb.loadIndex>> | null = null;
    let ovgLoaded = false;

    for (const rom of system.roms) {
      current++;
      result.totalProcessed++;
      const report = (status: ScrapeProgress["status"]) =>
        onProgress?.({
          current,
          total: grandTotal,
          romFileName: rom.fileName,
          systemId,
          status,
        });

      try {
        const existing = cache.getMetadata(systemId, rom.fileName);
        const meta: GameMetadata = existing ? { ...existing } : emptyMetadata();

        const complete = Boolean(meta.genre && meta.developer && meta.year);
        if (!options.force && complete) {
          result.totalFound++;
          report("cached");
          continue;
        }

        report("scraping");
        let changed = false;
        const fill = (key: keyof GameMetadata, value: string | undefined) => {
          if (value && !meta[key]) {
            (meta as unknown as Record<string, string>)[key] = value;
            changed = true;
          }
        };

        // ── 1. libretro ──────────────────────────────────────────────
        if (!libLoaded) {
          libIndex = await libretro.loadIndex(systemId).catch(() => null);
          libLoaded = true;
        }
        if (libIndex) {
          const m = libretro.findMatch(rom.fileName, libIndex);
          if (m) {
            fill("genre", m.genre);
            fill("developer", m.developer);
            fill("publisher", m.publisher);
            fill("year", m.releaseyear ? m.releaseyear.substring(0, 4) : undefined);
            fill("players", m.users);
          }
        }

        // ── 2. OpenVGDB ──────────────────────────────────────────────
        if (
          openvgdb.supports(systemId) &&
          (!meta.genre || !meta.developer || !meta.year || !meta.description)
        ) {
          if (!ovgLoaded) {
            ovgIndex = await openvgdb.loadIndex(systemId).catch(() => null);
            ovgLoaded = true;
          }
          if (ovgIndex) {
            const o = openvgdb.findMatch(rom.fileName, ovgIndex);
            if (o) {
              fill("genre", o.genre);
              fill("developer", o.developer);
              fill("publisher", o.publisher);
              fill("year", o.year);
              fill("description", o.description);
              fill("title", o.title);
            }
          }
        }

        // ── 3. Wikidata (best-effort, universal fallback) ────────────
        if (useWikidata && wikidata.supports() && (!meta.developer || !meta.genre)) {
          const w = await wikidata.lookup(cleanTitle(rom.fileName), systemId);
          if (w) {
            fill("developer", w.developer);
            fill("publisher", w.publisher);
            fill("genre", w.genre);
            fill("year", w.year);
          }
        }

        if (changed) {
          meta.lastScraped = new Date().toISOString();
          cache.setMetadata(systemId, rom.fileName, meta);
        }

        if (meta.genre || meta.developer || meta.year) {
          result.totalFound++;
          report("found");
        } else {
          result.totalNotFound++;
          report("not_found");
        }
      } catch (err) {
        result.totalErrors++;
        result.errors.push({
          romFileName: rom.fileName,
          systemId,
          error: err instanceof Error ? err.message : String(err),
        });
        report("error");
      }
    }
  }

  openvgdb.close();
  return result;
}
