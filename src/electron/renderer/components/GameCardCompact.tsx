import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import type { DiscoveredRom } from "../../../core/types";
import { hasDetectedEmulatorForSystem } from "../utils/emulatorStatus";

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
    lastDetection,
    bulkSelectTarget,
    bulkSelectedRoms,
    toggleBulkSelectRom,
  } = useApp();
  const inBulkSelect = bulkSelectTarget !== null;
  const isBulkSelected = bulkSelectedRoms.has(
    `${rom.systemId}:${rom.fileName}`
  );
  const emulatorMissing = !hasDetectedEmulatorForSystem(
    lastDetection,
    rom.systemId
  );
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const metadata = getMetadataForRom(rom.systemId, rom.fileName);
  const displayName = metadata?.title || rom.fileName.replace(/\.[^.]+$/, "");

  useEffect(() => {
    if (metadata?.coverPath) {
      window.electronAPI
        .readThumbnailDataUrl(rom.systemId, rom.fileName)
        .then((url) => {
          if (url) setCoverDataUrl(url);
        });
    }
  }, [metadata?.coverPath, rom.systemId, rom.fileName]);

  const handleDoubleClick = useCallback(() => {
    if (inBulkSelect) {
      toggleBulkSelectRom(rom.systemId, rom.fileName);
      return;
    }
    if ((config?.cardClickAction ?? "launch") === "detail") {
      openGameDetail(rom);
    } else {
      launchGame(rom);
    }
  }, [
    launchGame,
    openGameDetail,
    rom,
    config?.cardClickAction,
    inBulkSelect,
    toggleBulkSelectRom,
  ]);

  const hasCover = coverDataUrl && !imgError;

  return (
    <div
      data-grid-index={gridIndex}
      onClick={
        inBulkSelect
          ? () => toggleBulkSelectRom(rom.systemId, rom.fileName)
          : undefined
      }
      onDoubleClick={handleDoubleClick}
      className={`game-grid-card-compact group relative cursor-pointer overflow-hidden rounded-xl transition-all duration-200 ${
        isFocused
          ? "scale-105 ring-2 ring-focus"
          : "hover:scale-[1.03]"
      } ${inBulkSelect && isBulkSelected ? "ring-2 ring-[var(--color-accent)]" : ""}`}
      title={
        inBulkSelect
          ? "Click para seleccionar"
          : `Double-click to launch\n${rom.filePath}`
      }
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

      {/* Bulk-select checkmark */}
      {inBulkSelect && (
        <div
          className={`absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full ${
            isBulkSelected
              ? "bg-[var(--color-accent)] text-white"
              : "bg-black/60 text-white/70"
          }`}
          aria-hidden
        >
          {isBulkSelected ? "\u2713" : ""}
        </div>
      )}

      {/* Emulator-missing warning badge */}
      {emulatorMissing && (
        <div
          className="absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/90 shadow"
          title="Emulador no detectado para este sistema"
          aria-label="Emulador no detectado"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#111827"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
      )}

      {/* Name label at bottom */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6">
        <span className="block truncate text-xs font-medium text-primary">
          {displayName}
        </span>
      </div>
    </div>
  );
}
