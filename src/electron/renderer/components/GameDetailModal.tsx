import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import { formatPlayTime } from "../utils/formatPlayTime";
import type { DiscoveredRom } from "../../../core/types";

interface Props {
  rom: DiscoveredRom;
  onClose: () => void;
  onLaunch: (rom: DiscoveredRom) => void;
}

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
  "3ds": "3DS",
  wiiu: "Wii U",
};

export function GameDetailModal({ rom, onClose, onLaunch }: Props) {
  const { getMetadataForRom, playHistory, isFavorite, toggleFavorite } =
    useApp();

  const metadata = getMetadataForRom(rom.systemId, rom.fileName);
  const key = `${rom.systemId}:${rom.fileName}`;
  const record = playHistory[key];
  const favorited = isFavorite(rom.systemId, rom.fileName);
  const displayName =
    metadata?.title || rom.fileName.replace(/\.[^.]+$/, "");

  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(
    null
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load cover
  useEffect(() => {
    if (metadata?.coverPath) {
      window.electronAPI
        .readCoverDataUrl(metadata.coverPath)
        .then((url) => {
          if (url) setCoverDataUrl(url);
        });
    }
  }, [metadata?.coverPath]);

  // Load screenshot
  useEffect(() => {
    if (metadata?.screenshotPath) {
      window.electronAPI
        .readCoverDataUrl(metadata.screenshotPath)
        .then((url) => {
          if (url) setScreenshotDataUrl(url);
        });
    }
  }, [metadata?.screenshotPath]);

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Gamepad support inside the modal
  useEffect(() => {
    let rafId: number;
    const prevButtons = new Map<number, boolean>();

    function poll() {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[0] ?? gamepads[1] ?? gamepads[2] ?? gamepads[3];
      if (gp) {
        for (const [idx, handler] of BUTTON_HANDLERS) {
          const pressed = gp.buttons[idx]?.pressed ?? false;
          const wasPressed = prevButtons.get(idx) ?? false;
          if (pressed && !wasPressed) handler();
          prevButtons.set(idx, pressed);
        }

        // D-pad scroll
        const upPressed = gp.buttons[12]?.pressed ?? false;
        const downPressed = gp.buttons[13]?.pressed ?? false;
        if (scrollRef.current) {
          if (upPressed) scrollRef.current.scrollTop -= 30;
          if (downPressed) scrollRef.current.scrollTop += 30;
        }
      }
      rafId = requestAnimationFrame(poll);
    }

    const BUTTON_HANDLERS = new Map<number, () => void>([
      [0, () => onLaunch(rom)], // A / Cross = Launch
      [1, () => onClose()], // B / Circle = Close
      [3, () => toggleFavorite(rom.systemId, rom.fileName)], // Y / Triangle = Toggle fav
    ]);

    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [rom, onClose, onLaunch, toggleFavorite]);

  const handleToggleFav = useCallback(() => {
    toggleFavorite(rom.systemId, rom.fileName);
  }, [toggleFavorite, rom.systemId, rom.fileName]);

  const formattedTime = formatPlayTime(record?.totalPlayTime ?? 0);
  const lastPlayedStr = record?.lastPlayed
    ? new Date(record.lastPlayed).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with cover + info */}
        <div className="flex gap-5 p-6 pb-4">
          {/* Cover */}
          <div className="h-48 w-36 shrink-0 overflow-hidden rounded-xl bg-white/5">
            {coverDataUrl ? (
              <img
                src={coverDataUrl}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-5xl">
                🎮
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 className="truncate text-xl font-bold text-primary">
              {displayName}
            </h2>
            <span className="inline-flex w-fit rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold text-secondary">
              {SYSTEM_NAMES[rom.systemId] ?? rom.systemId.toUpperCase()}
            </span>

            {/* Metadata details */}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
              {metadata?.genre && <span>{metadata.genre}</span>}
              {metadata?.year && <span>{metadata.year}</span>}
            </div>
            {(metadata?.publisher || metadata?.developer) && (
              <div className="text-xs text-muted">
                {metadata?.publisher && <span>{metadata.publisher}</span>}
                {metadata?.publisher && metadata?.developer && (
                  <span> / </span>
                )}
                {metadata?.developer && <span>{metadata.developer}</span>}
              </div>
            )}
            {(metadata?.players || metadata?.rating) && (
              <div className="flex gap-3 text-xs text-muted">
                {metadata?.players && (
                  <span>Players: {metadata.players}</span>
                )}
                {metadata?.rating && <span>Rating: {metadata.rating}</span>}
              </div>
            )}

            {/* Play stats */}
            {record && (
              <div className="mt-2 space-y-0.5 text-xs text-secondary">
                <p>
                  Played {record.playCount}{" "}
                  {record.playCount === 1 ? "time" : "times"}
                </p>
                {formattedTime && <p>Total: {formattedTime}</p>}
                {lastPlayedStr && <p>Last: {lastPlayedStr}</p>}
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-auto flex gap-2 pt-2">
              <button
                onClick={() => onLaunch(rom)}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
                Lanzar
              </button>
              <button
                onClick={handleToggleFav}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  favorited
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    : "bg-white/10 text-secondary hover:bg-white/20"
                }`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill={favorited ? "#ef4444" : "none"}
                  stroke={favorited ? "#ef4444" : "currentColor"}
                  strokeWidth="2"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                {favorited ? "Favorito" : "Fav"}
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto border-t border-white/5 px-6 py-4"
        >
          {/* Description */}
          {metadata?.description && (
            <div className="mb-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                Descripcion
              </h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-secondary">
                {metadata.description}
              </p>
            </div>
          )}

          {/* Screenshot */}
          {screenshotDataUrl && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                Screenshot
              </h3>
              <img
                src={screenshotDataUrl}
                alt="Screenshot"
                className="w-full rounded-lg"
              />
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-secondary transition-colors hover:bg-white/20"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>,
    document.body
  );
}
