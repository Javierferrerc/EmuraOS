import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import type { DiscoveredRom } from "../../../core/types";

interface GameCardCompactProps {
  rom: DiscoveredRom;
  isFocused?: boolean;
  gridIndex?: number;
}

export function GameCardCompact({ rom, isFocused, gridIndex }: GameCardCompactProps) {
  const {
    launchGame,
    openGameDetail,
    getMetadataForRom,
    config,
  } = useApp();
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const metadata = getMetadataForRom(rom.systemId, rom.fileName);
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
      className={`game-grid-card-compact group relative cursor-pointer overflow-hidden rounded-xl transition-all duration-200 ${
        isFocused
          ? "scale-105 ring-2 ring-focus"
          : "hover:scale-[1.03]"
      }`}
      title={`Double-click to launch\n${rom.filePath}`}
    >
      {/* Cover */}
      <div className="h-full w-full">
        {hasCover ? (
          <img
            src={coverDataUrl}
            alt={displayName}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/5 text-3xl">
            🎮
          </div>
        )}
      </div>

      {/* Name label at bottom */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6">
        <span className="block truncate text-xs font-medium text-primary">
          {displayName}
        </span>
      </div>
    </div>
  );
}
