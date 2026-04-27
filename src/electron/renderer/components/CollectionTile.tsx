import { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { evaluateSmartCollection } from "../../../core/smart-collection";
import type { Collection } from "../../../core/types";
import "./CollectionTile.css";

interface Props {
  collection: Collection;
  gridIndex: number;
  isFocused: boolean;
}

/**
 * Card-shaped tile that represents a collection in the main library grid.
 * Shows up to 4 cover thumbnails in a 2×2 mosaic plus the collection name
 * and game count. Clicking opens the fullscreen CollectionViewerModal.
 */
export function CollectionTile({ collection, gridIndex, isFocused }: Props) {
  const {
    scanResult,
    favorites,
    recentlyPlayed,
    getMetadataForRom,
    openCollectionViewer,
  } = useApp();

  // Resolve the first 4 rom keys for the mosaic. For smart collections we
  // re-evaluate the filter on every render (cheap O(n) over the library) so
  // the preview always reflects the current state.
  const previewKeys = useMemo<string[]>(() => {
    if (collection.kind === "smart" && collection.filter && scanResult) {
      const allRoms = scanResult.systems.flatMap((s) => s.roms);
      const matched = evaluateSmartCollection(
        collection.filter,
        allRoms,
        getMetadataForRom,
        favorites,
        recentlyPlayed
      );
      return matched.slice(0, 4);
    }
    return collection.roms.slice(0, 4);
  }, [collection, scanResult, getMetadataForRom, favorites, recentlyPlayed]);

  const totalCount = useMemo<number>(() => {
    if (collection.kind === "smart" && collection.filter && scanResult) {
      const allRoms = scanResult.systems.flatMap((s) => s.roms);
      return evaluateSmartCollection(
        collection.filter,
        allRoms,
        getMetadataForRom,
        favorites,
        recentlyPlayed
      ).length;
    }
    return collection.roms.length;
  }, [collection, scanResult, getMetadataForRom, favorites, recentlyPlayed]);

  // Load thumbnails for the preview keys. Stored as data URLs sized to the
  // mosaic cell so we don't pull full-resolution covers.
  const [thumbs, setThumbs] = useState<Array<string | null>>([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result: Array<string | null> = [];
      for (const key of previewKeys) {
        const idx = key.indexOf(":");
        if (idx <= 0) {
          result.push(null);
          continue;
        }
        const systemId = key.slice(0, idx);
        const fileName = key.slice(idx + 1);
        try {
          const url = await window.electronAPI.readThumbnailDataUrl(
            systemId,
            fileName
          );
          result.push(url ?? null);
        } catch {
          result.push(null);
        }
      }
      if (!cancelled) setThumbs(result);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [previewKeys]);

  const handleActivate = () => {
    openCollectionViewer(collection.id);
  };

  // Always render a 2×2 grid; missing cells get a dark placeholder so the
  // tile silhouette stays consistent regardless of the games inside.
  const cells: Array<string | null> = [
    thumbs[0] ?? null,
    thumbs[1] ?? null,
    thumbs[2] ?? null,
    thumbs[3] ?? null,
  ];

  const isSmart = collection.kind === "smart";

  return (
    <button
      data-grid-index={gridIndex}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
      className={`collection-tile info-row-glass group ${
        isFocused ? "collection-tile--focused" : ""
      }`}
      title={collection.name}
    >
      <div className="collection-tile__mosaic">
        {cells.map((src, i) => (
          <div key={i} className="collection-tile__cell">
            {src ? (
              <img src={src} alt="" draggable={false} loading="lazy" />
            ) : (
              <span className="collection-tile__cell-empty" aria-hidden>
                {"\uD83C\uDFAE"}
              </span>
            )}
          </div>
        ))}

        {/* Hover/focus overlay with name + count — sits over the mosaic
            so the tile is mostly covers at rest, like a GameCard. */}
        <div
          className={`collection-tile__overlay ${
            isFocused ? "is-focused" : ""
          }`}
        >
          <div className="collection-tile__title">
            <span className="collection-tile__icon" aria-hidden>
              {isSmart ? "\u2728" : "\uD83D\uDDC2\uFE0F"}
            </span>
            <span className="collection-tile__name">{collection.name}</span>
          </div>
          <span className="collection-tile__count">
            {totalCount === 1 ? "1 juego" : `${totalCount} juegos`}
          </span>
        </div>
      </div>
    </button>
  );
}
