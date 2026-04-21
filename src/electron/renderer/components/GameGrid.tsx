import { useMemo, useEffect, useRef, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { GameCard } from "./GameCard";
import { GameListRow } from "./GameListRow";
import { GameCardCompact } from "./GameCardCompact";
import { resolveSystemMembers } from "../utils/systemGroups";
import type { DiscoveredRom } from "../../../core/types";
import { evaluateSmartCollection } from "../../../core/smart-collection";
import "./GameGrid.css";

const MIN_CARD_WIDTH = 292;
const MIN_CARD_WIDTH_COMPACT = 160;
const GRID_GAP = 32;
const LIST_GAP = 4;

interface GameGridProps {
  focusedIndex?: number;
  focusActive?: boolean;
  onColumnCountChange?: (count: number) => void;
  onItemCountChange?: (count: number) => void;
  onFilteredRomsChange?: (roms: DiscoveredRom[]) => void;
}

export function GameGrid({
  focusedIndex = -1,
  focusActive = false,
  onColumnCountChange,
  onItemCountChange,
  onFilteredRomsChange,
}: GameGridProps) {
  const {
    scanResult,
    activeFilter,
    searchQuery,
    favorites,
    recentlyPlayed,
    collections,
    config,
    romAddedDates,
    getMetadataForRom,
  } = useApp();

  // Mutable ref to the current grid element (used for scroll-into-view).
  const gridElRef = useRef<HTMLDivElement | null>(null);
  // Holds the active ResizeObserver so we can disconnect it when the element
  // changes or unmounts.
  const observerRef = useRef<ResizeObserver | null>(null);

  const allRoms = useMemo(() => {
    if (!scanResult) return [];
    const roms: DiscoveredRom[] = [];
    for (const sys of scanResult.systems) {
      roms.push(...sys.roms);
    }
    return roms;
  }, [scanResult]);

  // Build a lookup map from "systemId:fileName" → DiscoveredRom
  const romByKey = useMemo(() => {
    const map = new Map<string, DiscoveredRom>();
    for (const rom of allRoms) {
      map.set(`${rom.systemId}:${rom.fileName}`, rom);
    }
    return map;
  }, [allRoms]);

  const filteredRoms = useMemo(() => {
    let roms: DiscoveredRom[];

    switch (activeFilter.type) {
      case "all":
        roms = [...allRoms];
        break;
      case "system": {
        // activeFilter.systemId may be a real systemId (e.g. "nes") or a
        // virtual group id (e.g. "gameboy"). resolveSystemMembers returns
        // the list of real systems to include in either case.
        const members = resolveSystemMembers(activeFilter.systemId);
        roms =
          members.length === 1
            ? allRoms.filter((r) => r.systemId === members[0])
            : allRoms.filter((r) => members.includes(r.systemId));
        break;
      }
      case "favorites": {
        roms = [];
        for (const key of favorites) {
          const rom = romByKey.get(key);
          if (rom) roms.push(rom);
        }
        break;
      }
      case "recent": {
        // Preserve recency order — no alpha sort
        roms = [];
        for (const key of recentlyPlayed) {
          const rom = romByKey.get(key);
          if (rom) roms.push(rom);
        }
        // Apply search filter then return without sorting
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          roms = roms.filter((rom) =>
            rom.fileName.toLowerCase().includes(query)
          );
        }
        return roms;
      }
      case "collection": {
        const col = collections.find(
          (c) => c.id === activeFilter.collectionId
        );
        roms = [];
        if (col) {
          if (col.kind === "smart" && col.filter) {
            // Evaluate the smart filter against the full library on every
            // render. Cheap (O(n) over allRoms) and avoids any cache
            // invalidation logic — favorites/recent/metadata changes show up
            // immediately.
            const matched = evaluateSmartCollection(
              col.filter,
              allRoms,
              getMetadataForRom,
              favorites,
              recentlyPlayed
            );
            const matchedSet = new Set(matched);
            roms = allRoms.filter((r) =>
              matchedSet.has(`${r.systemId}:${r.fileName}`)
            );
          } else {
            for (const key of col.roms) {
              const rom = romByKey.get(key);
              if (rom) roms.push(rom);
            }
          }
        }
        break;
      }
      default:
        roms = [...allRoms];
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      roms = roms.filter((rom) =>
        rom.fileName.toLowerCase().includes(query)
      );
    }

    const sortOrder = config?.gameSortOrder ?? "alpha-asc";
    switch (sortOrder) {
      case "alpha-desc":
        roms.sort((a, b) => b.fileName.localeCompare(a.fileName));
        break;
      case "recent": {
        const recentIndex = new Map<string, number>();
        for (let i = 0; i < recentlyPlayed.length; i++) {
          recentIndex.set(recentlyPlayed[i], i);
        }
        roms.sort((a, b) => {
          const ka = `${a.systemId}:${a.fileName}`;
          const kb = `${b.systemId}:${b.fileName}`;
          const ia = recentIndex.get(ka) ?? Infinity;
          const ib = recentIndex.get(kb) ?? Infinity;
          if (ia !== ib) return ia - ib;
          return a.fileName.localeCompare(b.fileName);
        });
        break;
      }
      case "added": {
        roms.sort((a, b) => {
          const ka = `${a.systemId}:${a.fileName}`;
          const kb = `${b.systemId}:${b.fileName}`;
          const da = romAddedDates[ka] ?? "";
          const db = romAddedDates[kb] ?? "";
          if (da !== db) return db.localeCompare(da); // newest first
          return a.fileName.localeCompare(b.fileName);
        });
        break;
      }
      case "alpha-asc":
      default:
        roms.sort((a, b) => a.fileName.localeCompare(b.fileName));
        break;
    }

    // Apply persistent library filters from Settings > Biblioteca > Filtros
    const filters = config?.libraryFilters;
    if (filters) {
      if (filters.genre) {
        const g = filters.genre.toLowerCase();
        roms = roms.filter((r) => {
          const meta = getMetadataForRom(r.systemId, r.fileName);
          return meta?.genre && meta.genre.toLowerCase().includes(g);
        });
      }
      if (filters.decade && filters.decade !== "all") {
        const decadeStart = parseInt(filters.decade, 10); // "1990s" → 1990
        roms = roms.filter((r) => {
          const meta = getMetadataForRom(r.systemId, r.fileName);
          if (!meta?.year) return false;
          const year = parseInt(meta.year, 10);
          return year >= decadeStart && year < decadeStart + 10;
        });
      }
      if (filters.minRating && filters.minRating !== "0") {
        const min = parseInt(filters.minRating, 10);
        roms = roms.filter((r) => {
          const meta = getMetadataForRom(r.systemId, r.fileName);
          if (!meta?.rating) return false;
          const rating = parseFloat(meta.rating);
          return rating >= min;
        });
      }
      if (filters.players && filters.players !== "all") {
        roms = roms.filter((r) => {
          const meta = getMetadataForRom(r.systemId, r.fileName);
          if (!meta?.players) return false;
          const p = meta.players;
          if (filters.players === "1") return p === "1" || p.startsWith("1");
          if (filters.players === "2") return p.includes("2");
          if (filters.players === "multi") {
            // Any player count > 2
            const nums = p.match(/\d+/g);
            return nums ? nums.some((n) => parseInt(n, 10) > 2) : false;
          }
          return true;
        });
      }
      if (filters.hasCover && filters.hasCover !== "all") {
        roms = roms.filter((r) => {
          const meta = getMetadataForRom(r.systemId, r.fileName);
          const has = !!meta?.coverPath;
          return filters.hasCover === "yes" ? has : !has;
        });
      }
    }

    return roms;
  }, [
    allRoms,
    romByKey,
    activeFilter,
    searchQuery,
    favorites,
    recentlyPlayed,
    collections,
    config?.gameSortOrder,
    config?.libraryFilters,
    romAddedDates,
    getMetadataForRom,
  ]);

  // Report filtered roms and item count to parent
  useEffect(() => {
    onFilteredRomsChange?.(filteredRoms);
  }, [filteredRoms, onFilteredRomsChange]);

  useEffect(() => {
    onItemCountChange?.(filteredRoms.length);
  }, [filteredRoms.length, onItemCountChange]);

  const viewMode = config?.libraryViewMode ?? "grid";

  // Callback ref: attaches a ResizeObserver whenever the grid div is
  // mounted (or re-mounted — the `key={filterKey}` below forces a remount
  // on every filter change). A plain useRef + useEffect would only attach
  // once, causing gridColumnCount to stay stuck at its initial value after
  // the first filter change. That breaks vertical gamepad navigation
  // (MOVE_UP/MOVE_DOWN step by the wrong amount → diagonal jumps).
  const setGridRef = useCallback(
    (el: HTMLDivElement | null) => {
      // Tear down any previous observer before re-binding.
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      gridElRef.current = el;
      if (!el) return;

      const compute = () => {
        if (viewMode === "list") {
          onColumnCountChange?.(1);
          return;
        }
        const minW = viewMode === "compact" ? MIN_CARD_WIDTH_COMPACT : MIN_CARD_WIDTH;
        const gap = viewMode === "compact" ? 16 : GRID_GAP;
        const width = el.clientWidth;
        const cols = Math.max(
          1,
          Math.floor((width + gap) / (minW + gap))
        );
        onColumnCountChange?.(cols);
      };

      const observer = new ResizeObserver(compute);
      observer.observe(el);
      observerRef.current = observer;
      // Prime the count synchronously so the focus manager has the right
      // column count on first paint.
      compute();
    },
    [onColumnCountChange, viewMode]
  );

  // Disconnect observer on unmount.
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  // Scroll focused card into view
  useEffect(() => {
    if (focusedIndex < 0 || !focusActive) return;
    const el = gridElRef.current?.querySelector(
      `[data-grid-index="${focusedIndex}"]`
    );
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusedIndex, focusActive]);

  if (!scanResult) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <p>No scan data available. Check your configuration.</p>
      </div>
    );
  }

  if (filteredRoms.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted">
        <div className="mb-3 text-5xl">
          {activeFilter.type === "favorites"
            ? "\u2605"
            : activeFilter.type === "recent"
              ? "\u25F7"
              : "\uD83D\uDD0D"}
        </div>
        {searchQuery ? (
          <p>No ROMs match "{searchQuery}"</p>
        ) : activeFilter.type === "favorites" ? (
          <p>No favorites yet. Click the heart on a game to add it.</p>
        ) : activeFilter.type === "recent" ? (
          <p>No recently played games yet. Double-click a game to launch it.</p>
        ) : activeFilter.type === "collection" ? (
          <p>This collection is empty.</p>
        ) : activeFilter.type === "system" ? (
          <p>No ROMs found for this system.</p>
        ) : (
          <div className="text-center">
            <p className="mb-1">No ROMs found.</p>
            <p className="text-sm">
              Add ROMs to your ROMs folder and re-scan.
            </p>
          </div>
        )}
      </div>
    );
  }

  const filterKey =
    activeFilter.type === "system"
      ? `system-${activeFilter.systemId}`
      : activeFilter.type === "collection"
        ? `col-${activeFilter.collectionId}`
        : activeFilter.type;

  if (viewMode === "list") {
    return (
      <div
        key={`${filterKey}-list`}
        ref={setGridRef}
        className="flex flex-col pt-10"
        style={{ gap: `${LIST_GAP}px` }}
      >
        {filteredRoms.map((rom, idx) => (
          <div
            key={rom.filePath}
            style={{ animationDelay: `${Math.min(idx * 20, 200)}ms` }}
          >
            <GameListRow
              rom={rom}
              gridIndex={idx}
              isFocused={focusActive && focusedIndex === idx}
            />
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === "compact") {
    return (
      <div
        key={`${filterKey}-compact`}
        ref={setGridRef}
        className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] pt-10"
        style={{ gap: "16px" }}
      >
        {filteredRoms.map((rom, idx) => (
          <div
            key={rom.filePath}
            className="game-grid-card-compact"
            style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
          >
            <GameCardCompact
              rom={rom}
              gridIndex={idx}
              isFocused={focusActive && focusedIndex === idx}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      key={filterKey}
      ref={setGridRef}
      className="grid grid-cols-[repeat(auto-fill,minmax(292px,1fr))] pt-10"
      style={{ gap: `${GRID_GAP}px` }}
    >
      {filteredRoms.map((rom, idx) => (
        <div
          key={rom.filePath}
          className="game-grid-card"
          style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
        >
          <GameCard
            rom={rom}
            gridIndex={idx}
            isFocused={focusActive && focusedIndex === idx}
          />
        </div>
      ))}
    </div>
  );
}
