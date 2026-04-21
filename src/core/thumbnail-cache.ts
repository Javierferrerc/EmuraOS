import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { MetadataCache } from "./metadata-cache.js";

/**
 * Thumbnail generator + batch backfiller.
 *
 * Covers downloaded by the scrapers live in `config/metadata/covers/<system>/`
 * as PNGs sized according to whatever the upstream source returned (often
 * 500–1024px). For the grid we want something much smaller — rendering 200+
 * full-resolution PNGs as dataURLs is what was making large libraries feel
 * laggy. This module maintains a parallel `thumbnails/` tree with 200px-wide
 * JPEGs, generated lazily on cover write and backfilled on-demand by a
 * one-shot "ensure-all-thumbnails" pass the renderer can trigger.
 *
 * Design choices:
 *  - 200px width matches the grid card size at typical zoom levels. Height is
 *    auto-scaled to preserve aspect ratio (covers aren't always 3:4).
 *  - JPEG quality 82 is the sharp default — visually indistinguishable from
 *    the source at grid resolution, ~8–12x smaller than the PNG.
 *  - The function is idempotent: if the thumbnail is newer than the source
 *    we skip regeneration. Scraper re-runs that rewrite the cover will
 *    invalidate it via mtime.
 */

export const THUMBNAIL_WIDTH = 200;
export const THUMBNAIL_QUALITY = 82;

/**
 * Generate a thumbnail for a given cover, if one is missing or stale. Safe to
 * call synchronously after writing the cover file — sharp resolves the promise
 * once the thumbnail is on disk. Errors are swallowed and logged; a missing
 * thumbnail just means the UI falls back to the full cover (slower but
 * correct), which is strictly better than crashing the scraper.
 */
export async function ensureThumbnail(
  coverPath: string,
  thumbnailPath: string
): Promise<void> {
  try {
    if (!existsSync(coverPath)) return;

    if (existsSync(thumbnailPath)) {
      const coverMtime = statSync(coverPath).mtimeMs;
      const thumbMtime = statSync(thumbnailPath).mtimeMs;
      if (thumbMtime >= coverMtime) return; // up to date
    }

    mkdirSync(path.dirname(thumbnailPath), { recursive: true });
    await sharp(coverPath)
      .resize(THUMBNAIL_WIDTH, null, { withoutEnlargement: true })
      .jpeg({ quality: THUMBNAIL_QUALITY, mozjpeg: true })
      .toFile(thumbnailPath);
  } catch (err) {
    console.warn(`[thumbnail] Failed to generate ${thumbnailPath}:`, err);
  }
}

/**
 * Walk every cover in the cache and regenerate missing/stale thumbnails.
 * Used by the renderer's "rebuild thumbnails" Settings action and by a
 * first-run pass so users upgrading from pre-thumbnail builds get fast
 * grids without having to re-scrape.
 *
 * Returns the counts so the UI can show progress: { generated, skipped,
 * failed }. Iteration is sequential because sharp uses libvips internally
 * and is already multi-threaded per call — parallelising in JS just
 * increases memory pressure without throughput gains.
 */
export async function backfillThumbnails(
  cache: MetadataCache
): Promise<{ generated: number; skipped: number; failed: number }> {
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  const coversRoot = path.resolve(cache.getThumbnailsDir(), "..", "covers");
  if (!existsSync(coversRoot)) return { generated, skipped, failed };

  const systems = readdirSync(coversRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const systemId of systems) {
    const systemDir = path.resolve(coversRoot, systemId);
    const files = readdirSync(systemDir).filter((f) =>
      /\.(png|jpe?g|webp)$/i.test(f)
    );
    for (const file of files) {
      const coverPath = path.resolve(systemDir, file);
      const baseName = file.replace(/\.[^.]+$/, "");
      const thumbPath = cache.getThumbnailPath(systemId, baseName);

      try {
        if (existsSync(thumbPath)) {
          const coverMtime = statSync(coverPath).mtimeMs;
          const thumbMtime = statSync(thumbPath).mtimeMs;
          if (thumbMtime >= coverMtime) {
            skipped++;
            continue;
          }
        }
        await ensureThumbnail(coverPath, thumbPath);
        generated++;
      } catch {
        failed++;
      }
    }
  }

  return { generated, skipped, failed };
}
