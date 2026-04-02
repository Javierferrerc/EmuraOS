import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import type { DiscoveredRom } from "../../../core/types";

const SYSTEM_COLORS: Record<string, string> = {
  nes: "bg-red-700",
  snes: "bg-red-600",
  n64: "bg-red-500",
  gb: "bg-green-700",
  gbc: "bg-purple-600",
  gba: "bg-indigo-600",
  nds: "bg-gray-600",
  gamecube: "bg-indigo-700",
  wii: "bg-sky-600",
  megadrive: "bg-blue-700",
  mastersystem: "bg-blue-600",
  dreamcast: "bg-blue-500",
  psx: "bg-slate-600",
  ps2: "bg-blue-900",
  psp: "bg-slate-700",
};

interface GameCardProps {
  rom: DiscoveredRom;
  isFocused?: boolean;
  gridIndex?: number;
}

export function GameCard({ rom, isFocused, gridIndex }: GameCardProps) {
  const {
    launchGame,
    lastLaunchResult,
    getMetadataForRom,
    toggleFavorite,
    isFavorite,
    playHistory,
  } = useApp();
  const [imgError, setImgError] = useState(false);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);

  const metadata = getMetadataForRom(rom.systemId, rom.fileName);
  const favorited = isFavorite(rom.systemId, rom.fileName);
  const key = `${rom.systemId}:${rom.fileName}`;
  const playCount = playHistory[key]?.playCount ?? 0;

  useEffect(() => {
    if (metadata?.coverPath) {
      window.electronAPI.readCoverDataUrl(metadata.coverPath).then((url) => {
        if (url) setCoverDataUrl(url);
      });
    }
  }, [metadata?.coverPath]);

  const handleDoubleClick = useCallback(() => {
    launchGame(rom);
  }, [launchGame, rom]);

  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleFavorite(rom.systemId, rom.fileName);
    },
    [toggleFavorite, rom.systemId, rom.fileName]
  );

  const displayName = metadata?.title || rom.fileName.replace(/\.[^.]+$/, "");
  const colorClass = SYSTEM_COLORS[rom.systemId] ?? "bg-gray-600";
  const sizeMB = (rom.sizeBytes / (1024 * 1024)).toFixed(1);
  const hasCover = coverDataUrl && !imgError;

  const isLastLaunched =
    lastLaunchResult?.romPath === rom.filePath && lastLaunchResult?.success;

  const ringClass = isFocused
    ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900"
    : isLastLaunched
      ? "ring-2 ring-green-500"
      : "";

  return (
    <div
      data-grid-index={gridIndex}
      onDoubleClick={handleDoubleClick}
      className={`group relative cursor-pointer rounded-lg border border-gray-700 bg-gray-800 p-4 transition-all duration-200 hover:border-gray-500 hover:bg-gray-750 hover:shadow-lg hover:shadow-black/20 ${ringClass}`}
      title={`Double-click to launch\n${rom.filePath}`}
    >
      {/* Favorite heart button */}
      <button
        onClick={handleToggleFavorite}
        className={`absolute right-2 top-2 z-10 rounded-full p-1 transition-opacity ${
          favorited
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        }`}
        title={favorited ? "Remove from favorites" : "Add to favorites"}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill={favorited ? "#ef4444" : "none"}
          stroke={favorited ? "#ef4444" : "#9ca3af"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>

      <div className="mb-3 flex h-32 items-center justify-center overflow-hidden rounded bg-gray-700/50 transition-transform duration-200 group-hover:scale-105">
        {hasCover ? (
          <img
            src={coverDataUrl}
            alt={displayName}
            className="h-full w-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-3xl">{"\uD83C\uDFAE"}</span>
        )}
      </div>
      <h3 className="mb-2 truncate text-sm font-medium text-gray-100">
        {displayName}
      </h3>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded px-1.5 py-0.5 text-xs text-white ${colorClass}`}
          >
            {rom.systemId.toUpperCase()}
          </span>
          {playCount > 0 && (
            <span className="rounded bg-gray-600 px-1.5 py-0.5 text-xs text-gray-300">
              {playCount}x
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {metadata?.year || `${sizeMB} MB`}
        </span>
      </div>
    </div>
  );
}
