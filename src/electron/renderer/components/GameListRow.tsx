import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import type { DiscoveredRom } from "../../../core/types";
import { formatPlayTime } from "../utils/formatPlayTime";

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

interface GameListRowProps {
  rom: DiscoveredRom;
  isFocused?: boolean;
  gridIndex?: number;
}

export function GameListRow({ rom, isFocused, gridIndex }: GameListRowProps) {
  const {
    launchGame,
    openGameDetail,
    getMetadataForRom,
    playHistory,
    config,
  } = useApp();
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const metadata = getMetadataForRom(rom.systemId, rom.fileName);
  const key = `${rom.systemId}:${rom.fileName}`;
  const playCount = playHistory[key]?.playCount ?? 0;
  const totalPlayTime = playHistory[key]?.totalPlayTime ?? 0;
  const displayName = metadata?.title || rom.fileName.replace(/\.[^.]+$/, "");

  useEffect(() => {
    if (metadata?.coverPath) {
      window.electronAPI.readCoverDataUrl(metadata.coverPath).then((url) => {
        if (url) setCoverDataUrl(url);
      });
    }
  }, [metadata?.coverPath]);

  const handleDoubleClick = useCallback(() => {
    if ((config?.cardClickAction ?? "launch") === "detail") {
      openGameDetail(rom);
    } else {
      launchGame(rom);
    }
  }, [launchGame, openGameDetail, rom, config?.cardClickAction]);

  const hasCover = coverDataUrl && !imgError;

  return (
    <div
      data-grid-index={gridIndex}
      onDoubleClick={handleDoubleClick}
      className={`game-list-row group flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2 cursor-pointer transition-colors ${
        isFocused
          ? "bg-white/20 ring-2 ring-focus"
          : "hover:bg-white/15"
      }`}
      title={`Double-click to launch\n${rom.filePath}`}
    >
      {/* Mini cover */}
      <div className="h-10 w-7 shrink-0 overflow-hidden rounded">
        {hasCover ? (
          <img
            src={coverDataUrl}
            alt={displayName}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/5 text-xs">
            🎮
          </div>
        )}
      </div>

      {/* Name */}
      <span className="flex-1 truncate text-sm font-medium text-primary">
        {displayName}
      </span>

      {/* System */}
      <span className="w-24 shrink-0 truncate text-xs text-muted">
        {SYSTEM_NAMES[rom.systemId] ?? rom.systemId.toUpperCase()}
      </span>

      {/* Genre */}
      <span className="w-24 shrink-0 truncate text-xs text-muted hidden md:block">
        {metadata?.genre || "—"}
      </span>

      {/* Play count */}
      <span className="w-16 shrink-0 text-right text-xs text-muted hidden lg:block">
        {playCount > 0 ? `${playCount}x` : "—"}
      </span>

      {/* Play time */}
      <span className="w-16 shrink-0 text-right text-xs text-muted hidden lg:block">
        {totalPlayTime > 0 ? formatPlayTime(totalPlayTime) : "—"}
      </span>
    </div>
  );
}
