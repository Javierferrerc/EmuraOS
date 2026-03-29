import { useMemo } from "react";
import { useApp } from "../context/AppContext";
import { GameCard } from "./GameCard";
import type { DiscoveredRom } from "../../../core/types";

export function GameGrid() {
  const { scanResult, selectedSystemId, searchQuery } = useApp();

  const filteredRoms = useMemo(() => {
    if (!scanResult) return [];

    let roms: DiscoveredRom[] = [];

    for (const sys of scanResult.systems) {
      if (selectedSystemId && sys.systemId !== selectedSystemId) continue;
      roms = roms.concat(sys.roms);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      roms = roms.filter((rom) =>
        rom.fileName.toLowerCase().includes(query)
      );
    }

    roms.sort((a, b) => a.fileName.localeCompare(b.fileName));
    return roms;
  }, [scanResult, selectedSystemId, searchQuery]);

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
        <div className="mb-3 text-5xl">🔍</div>
        {searchQuery ? (
          <p>No ROMs match "{searchQuery}"</p>
        ) : selectedSystemId ? (
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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
      {filteredRoms.map((rom) => (
        <GameCard key={rom.filePath} rom={rom} />
      ))}
    </div>
  );
}
