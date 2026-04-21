import type {
  DiscoveredRom,
  GameMetadata,
  SmartCollectionFilter,
} from "./types.js";

/**
 * Evaluate a smart collection filter against the current library state.
 *
 * Returns the list of rom keys ("systemId:fileName") that match every active
 * criterion. Passing an empty filter object returns every rom. Unknown or
 * undefined fields are ignored — undefined means "don't filter on this".
 *
 * Lives in core/ so both the main process (for serializing lists in IPC
 * responses) and the renderer (for live evaluation during grid rendering)
 * can share the same semantics. Metadata lookup is injected so callers
 * can supply either a fresh MetadataCache (main) or the in-memory
 * metadataMap (renderer) without this function needing to care.
 */
export function evaluateSmartCollection(
  filter: SmartCollectionFilter,
  roms: DiscoveredRom[],
  getMetadata: (systemId: string, fileName: string) => GameMetadata | null,
  favorites: Set<string>,
  recentlyPlayed: ReadonlyArray<string>
): string[] {
  const recentSet = new Set(recentlyPlayed);
  const matched: string[] = [];

  for (const rom of roms) {
    const key = `${rom.systemId}:${rom.fileName}`;

    if (filter.systems && filter.systems.length > 0) {
      if (!filter.systems.includes(rom.systemId)) continue;
    }

    if (filter.onlyFavorites && !favorites.has(key)) continue;
    if (filter.onlyRecent && !recentSet.has(key)) continue;

    // Fields below all need metadata; fetch once.
    const meta = getMetadata(rom.systemId, rom.fileName);

    if (filter.genre) {
      const g = filter.genre.toLowerCase();
      if (!meta?.genre || !meta.genre.toLowerCase().includes(g)) continue;
    }

    if (filter.minRating !== undefined && filter.minRating > 0) {
      const rating = parseFloat(meta?.rating ?? "");
      if (!Number.isFinite(rating) || rating < filter.minRating) continue;
    }

    if (filter.decade && filter.decade !== "all") {
      const start = parseInt(filter.decade, 10);
      const year = parseInt(meta?.year ?? "", 10);
      if (!Number.isFinite(year) || year < start || year >= start + 10) continue;
    }

    if (filter.hasCover) {
      const has = !!meta?.coverPath;
      if (filter.hasCover === "yes" && !has) continue;
      if (filter.hasCover === "no" && has) continue;
    }

    matched.push(key);
  }

  return matched;
}
