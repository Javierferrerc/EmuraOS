import { useMemo, useEffect, useRef, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { GameCard } from "./GameCard";
import type { DiscoveredRom } from "../../../core/types";

const MIN_CARD_WIDTH = 200;

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
  } = useApp();

  const gridRef = useRef<HTMLDivElement>(null);

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
      case "system":
        roms = allRoms.filter((r) => r.systemId === activeFilter.systemId);
        break;
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
          for (const key of col.roms) {
            const rom = romByKey.get(key);
            if (rom) roms.push(rom);
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

    roms.sort((a, b) => a.fileName.localeCompare(b.fileName));
    return roms;
  }, [
    allRoms,
    romByKey,
    activeFilter,
    searchQuery,
    favorites,
    recentlyPlayed,
    collections,
  ]);

  // Report filtered roms and item count to parent
  useEffect(() => {
    onFilteredRomsChange?.(filteredRoms);
  }, [filteredRoms, onFilteredRomsChange]);

  useEffect(() => {
    onItemCountChange?.(filteredRoms.length);
  }, [filteredRoms.length, onItemCountChange]);

  // ResizeObserver to compute column count
  const computeColumns = useCallback(() => {
    if (!gridRef.current) return;
    const width = gridRef.current.clientWidth;
    const gap = 12; // gap-3 = 0.75rem = 12px
    const cols = Math.max(1, Math.floor((width + gap) / (MIN_CARD_WIDTH + gap)));
    onColumnCountChange?.(cols);
  }, [onColumnCountChange]);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const observer = new ResizeObserver(computeColumns);
    observer.observe(el);
    computeColumns();
    return () => observer.disconnect();
  }, [computeColumns]);

  // Scroll focused card into view
  useEffect(() => {
    if (focusedIndex < 0 || !focusActive) return;
    const el = gridRef.current?.querySelector(
      `[data-grid-index="${focusedIndex}"]`
    );
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedIndex, focusActive]);

  if (!scanResult) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <p>No scan data available. Check your configuration.</p>
      </div>
    );
  }

  if (filteredRoms.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
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

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3"
    >
      {filteredRoms.map((rom, idx) => (
        <GameCard
          key={rom.filePath}
          rom={rom}
          gridIndex={idx}
          isFocused={focusActive && focusedIndex === idx}
        />
      ))}
    </div>
  );
}
