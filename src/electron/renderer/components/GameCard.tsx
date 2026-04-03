import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import type { DiscoveredRom } from "../../../core/types";

const SYSTEM_COLORS: Record<string, [string, string]> = {
  nes: ["#FF4444", "#8B2020"],
  snes: ["#D43D3D", "#6B1E1E"],
  n64: ["#4ADE80", "#1A6B3A"],
  gb: ["#86EFAC", "#3D8B5E"],
  gbc: ["#A78BFA", "#5B3A9E"],
  gba: ["#818CF8", "#3D4A9E"],
  nds: ["#94A3B8", "#475569"],
  gamecube: ["#A855F7", "#5B2D8E"],
  wii: ["#0BDDFF", "#107B8C"],
  megadrive: ["#3B82F6", "#1E4A8E"],
  mastersystem: ["#60A5FA", "#2563EB"],
  dreamcast: ["#7DD3FC", "#2980B0"],
  psx: ["#94A3B8", "#4A5568"],
  ps2: ["#3B82F6", "#1E3A5F"],
  psp: ["#6B7280", "#374151"],
};

const SYSTEM_NAMES: Record<string, string> = {
  nes: "NES",
  snes: "SNES",
  n64: "N64",
  gb: "Game Boy",
  gbc: "GBC",
  gba: "GBA",
  nds: "NDS",
  gamecube: "GameCube",
  wii: "Wii",
  megadrive: "Mega Drive",
  mastersystem: "Master System",
  dreamcast: "Dreamcast",
  psx: "PSX",
  ps2: "PS2",
  psp: "PSP",
};

interface GameCardProps {
  rom: DiscoveredRom;
  isFocused?: boolean;
  gridIndex?: number;
}

export function GameCard({ rom, isFocused, gridIndex }: GameCardProps) {
  const {
    launchGame,
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
  const [systemLight, systemDark] = SYSTEM_COLORS[rom.systemId] ?? ["#718096", "#4A5568"];
  const hasCover = coverDataUrl && !imgError;

  return (
    <div
      data-grid-index={gridIndex}
      onDoubleClick={handleDoubleClick}
      className={`group relative h-full cursor-pointer overflow-hidden rounded-2xl transition-all duration-200 ${
        isFocused
          ? "scale-105 ring-2 ring-blue-500"
          : "hover:scale-[1.03]"
      }`}
      title={`Double-click to launch\n${rom.filePath}`}
    >
      {/* Cover image or fallback */}
      {hasCover ? (
        <img
          src={coverDataUrl}
          alt={displayName}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-white/5 text-4xl">
          🎮
        </div>
      )}

      {/* Favorite heart — top-right */}
      <button
        onClick={handleToggleFavorite}
        className={`absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-opacity ${
          favorited
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        } ${isFocused ? "opacity-100" : ""}`}
        title={favorited ? "Remove from favorites" : "Add to favorites"}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={favorited ? "#ef4444" : "none"}
          stroke={favorited ? "#ef4444" : "#e5e7eb"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>

      {/* Bottom overlay — visible on hover/focus */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8 transition-opacity ${
          isFocused
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className="shrink-0 rounded-md px-2 py-1 text-xs font-bold leading-none text-white flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${systemLight}8c 0%, ${systemDark}8c 100%)` }}
          >
            {SYSTEM_NAMES[rom.systemId] ?? rom.systemId.toUpperCase()}
          </span>
          <span className="truncate text-sm font-medium text-white">
            {displayName}
          </span>
        </div>
        {playCount > 0 && (
          <p className="mt-0.5 text-xs text-gray-400">
            Played {playCount} {playCount === 1 ? "time" : "times"}
          </p>
        )}
      </div>
    </div>
  );
}
