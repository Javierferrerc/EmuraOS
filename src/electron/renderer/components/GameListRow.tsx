import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import type { DiscoveredRom } from "../../../core/types";
import { formatPlayTime } from "../utils/formatPlayTime";
import { hasDetectedEmulatorForSystem } from "../utils/emulatorStatus";
import { isRomNew } from "../utils/newBadge";
import { GameContextMenu } from "./GameContextMenu";

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
    lastDetection,
    bulkSelectTarget,
    bulkSelectedRoms,
    toggleBulkSelectRom,
    romAddedDates,
  } = useApp();
  const isNew = isRomNew(romAddedDates, playHistory, rom.systemId, rom.fileName);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
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
  const key = `${rom.systemId}:${rom.fileName}`;
  const playCount = playHistory[key]?.playCount ?? 0;
  const totalPlayTime = playHistory[key]?.totalPlayTime ?? 0;
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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      data-grid-index={gridIndex}
      onClick={
        inBulkSelect
          ? () => toggleBulkSelectRom(rom.systemId, rom.fileName)
          : undefined
      }
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      className={`game-list-row group flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2 cursor-pointer transition-colors ${
        isFocused
          ? "bg-white/20 ring-2 ring-focus"
          : "hover:bg-white/15"
      } ${inBulkSelect && isBulkSelected ? "ring-2 ring-[var(--color-accent)]" : ""}`}
      title={
        inBulkSelect
          ? "Click para seleccionar"
          : `Double-click to launch\n${rom.filePath}`
      }
    >
      {inBulkSelect && (
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
            isBulkSelected
              ? "bg-[var(--color-accent)] text-white"
              : "bg-black/40 text-white/60"
          }`}
          aria-hidden
        >
          {isBulkSelected ? "\u2713" : ""}
        </span>
      )}
      {/* Mini cover — shimmer skeleton while loading. */}
      <div className="h-10 w-7 shrink-0 overflow-hidden rounded">
        {hasCover ? (
          <img
            src={coverDataUrl}
            alt={displayName}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : metadata?.coverPath && !imgError ? (
          <div className="cover-skeleton h-full w-full" aria-hidden />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/5 text-xs">
            🎮
          </div>
        )}
      </div>

      {/* Name + optional missing-emulator badge + "Nuevo" pill */}
      <span className="flex flex-1 items-center gap-2 truncate text-sm font-medium text-primary">
        <span className="truncate">{displayName}</span>
        {isNew && (
          <span
            className="shrink-0 rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
            aria-label="Añadido recientemente"
          >
            Nuevo
          </span>
        )}
        {emulatorMissing && (
          <span
            className="shrink-0 text-amber-400"
            title="Emulador no detectado para este sistema"
            aria-label="Emulador no detectado"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
        )}
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
      {contextMenu && (
        <GameContextMenu
          rom={rom}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
