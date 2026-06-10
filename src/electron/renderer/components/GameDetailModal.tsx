import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import { formatPlayTime } from "../utils/formatPlayTime";
import type {
  DiscoveredRom,
  DolphinGameConfig,
  RetroArchGameConfig,
} from "../../../core/types";

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
  const {
    getMetadataForRom,
    playHistory,
    isFavorite,
    toggleFavorite,
    emulatorDefs,
    getGameOverride,
    setEmulatorOverride,
    setDolphinGameConfig,
    setRetroArchGameConfig,
  } = useApp();

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

  // ── Phase 22 — Per-game emulator override + Dolphin config ──
  const override = getGameOverride(rom.systemId, rom.fileName);
  const candidateEmulators = useMemo(
    () => emulatorDefs.filter((e) => e.systems.includes(rom.systemId)),
    [emulatorDefs, rom.systemId]
  );
  const effectiveEmulatorId = override?.emulatorId ?? "";
  const resolvedEmulatorId = effectiveEmulatorId || candidateEmulators[0]?.id;
  const isDolphinActive = resolvedEmulatorId === "dolphin";
  const isRetroArchActive = resolvedEmulatorId === "retroarch";

  // Probe the ROM for a 6-char Dolphin GameID. Null when the format is
  // compressed (RVZ/CISO) so we can show a hint instead of broken controls.
  const [dolphinGameId, setDolphinGameId] = useState<string | null>(null);
  useEffect(() => {
    if (!isDolphinActive) {
      setDolphinGameId(null);
      return;
    }
    let cancelled = false;
    window.electronAPI
      .detectDolphinGameId(rom.filePath)
      .then((id) => {
        if (!cancelled) setDolphinGameId(id);
      })
      .catch(() => {
        if (!cancelled) setDolphinGameId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isDolphinActive, rom.filePath]);

  const dolphin = override?.dolphin ?? {};

  const updateDolphinKey = useCallback(
    <K extends keyof DolphinGameConfig>(
      key: K,
      value: DolphinGameConfig[K] | null
    ) => {
      void setDolphinGameConfig(rom.systemId, rom.fileName, {
        [key]: value,
      } as Partial<DolphinGameConfig>);
    },
    [setDolphinGameConfig, rom.systemId, rom.fileName]
  );

  // Resolve the RetroArch core's override-folder name. Null means the system
  // maps to a core we don't have a verified display name for, so writing the
  // override would land in the wrong folder — we show a hint instead.
  const [retroArchCore, setRetroArchCore] = useState<string | null>(null);
  useEffect(() => {
    if (!isRetroArchActive) {
      setRetroArchCore(null);
      return;
    }
    let cancelled = false;
    window.electronAPI
      .resolveRetroArchCore(rom.systemId)
      .then((core) => {
        if (!cancelled) setRetroArchCore(core);
      })
      .catch(() => {
        if (!cancelled) setRetroArchCore(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isRetroArchActive, rom.systemId]);

  const retroarch = override?.retroarch ?? {};

  const updateRetroArchKey = useCallback(
    <K extends keyof RetroArchGameConfig>(
      key: K,
      value: RetroArchGameConfig[K] | null
    ) => {
      void setRetroArchGameConfig(rom.systemId, rom.fileName, {
        [key]: value,
      } as Partial<RetroArchGameConfig>);
    },
    [setRetroArchGameConfig, rom.systemId, rom.fileName]
  );

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
            <div className="mb-4">
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

          {/* Phase 22 — Per-game launch overrides */}
          {candidateEmulators.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                Ajustes para este juego
              </h3>
              <label className="mb-3 flex flex-col gap-1">
                <span className="text-xs text-secondary">Lanzar con</span>
                <select
                  value={override?.emulatorId ?? ""}
                  onChange={(e) =>
                    setEmulatorOverride(
                      rom.systemId,
                      rom.fileName,
                      e.target.value || null
                    )
                  }
                  className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-primary"
                >
                  <option value="">Por defecto del sistema</option>
                  {candidateEmulators.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>

              {isDolphinActive && (
                <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Tweaks de Dolphin
                    </span>
                    {dolphinGameId && (
                      <span className="text-[10px] text-muted">
                        GameID: {dolphinGameId}
                      </span>
                    )}
                  </div>
                  {!dolphinGameId && (
                    <p className="text-xs text-muted">
                      No se pudo detectar el GameID (formato comprimido como
                      RVZ/CISO). Los ajustes no se escribirán hasta que se
                      lance un formato sin comprimir.
                    </p>
                  )}
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="checkbox"
                      checked={dolphin.wideScreenHack ?? false}
                      onChange={(e) =>
                        updateDolphinKey(
                          "wideScreenHack",
                          e.target.checked ? true : null
                        )
                      }
                    />
                    Widescreen Hack (16:9 real)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="checkbox"
                      checked={dolphin.skipEFBAccess ?? false}
                      onChange={(e) =>
                        updateDolphinKey(
                          "skipEFBAccess",
                          e.target.checked ? true : null
                        )
                      }
                    />
                    Skip EFB Access (más FPS, posibles glitches)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="checkbox"
                      checked={dolphin.disablePort2 ?? false}
                      onChange={(e) =>
                        updateDolphinKey(
                          "disablePort2",
                          e.target.checked ? true : null
                        )
                      }
                    />
                    Desactivar puerto 2 (evita pausa accidental)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="checkbox"
                      checked={dolphin.overclockEnable ?? false}
                      onChange={(e) =>
                        updateDolphinKey(
                          "overclockEnable",
                          e.target.checked ? true : null
                        )
                      }
                    />
                    Overclock CPU
                  </label>
                  {dolphin.overclockEnable && (
                    <label className="flex items-center gap-2 text-sm text-secondary">
                      <span className="w-28 text-xs">Factor CPU</span>
                      <input
                        type="range"
                        min={0.5}
                        max={3}
                        step={0.25}
                        value={dolphin.overclockFactor ?? 1}
                        onChange={(e) =>
                          updateDolphinKey(
                            "overclockFactor",
                            Number(e.target.value)
                          )
                        }
                        className="flex-1"
                      />
                      <span className="w-12 text-right tabular-nums text-xs">
                        {(dolphin.overclockFactor ?? 1).toFixed(2)}×
                      </span>
                    </label>
                  )}
                  {override?.dolphin && (
                    <button
                      onClick={() =>
                        setDolphinGameConfig(rom.systemId, rom.fileName, null)
                      }
                      className="text-xs text-muted underline hover:text-secondary"
                    >
                      Limpiar tweaks de Dolphin
                    </button>
                  )}
                </div>
              )}

              {isRetroArchActive && (
                <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Tweaks de RetroArch
                    </span>
                    {retroArchCore && (
                      <span className="text-[10px] text-muted">
                        Core: {retroArchCore}
                      </span>
                    )}
                  </div>
                  {!retroArchCore && (
                    <p className="text-xs text-muted">
                      El core de este sistema no está mapeado para overrides
                      per-game; los ajustes no se escribirán.
                    </p>
                  )}
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="checkbox"
                      checked={retroarch.bilinearFilter ?? false}
                      onChange={(e) =>
                        updateRetroArchKey(
                          "bilinearFilter",
                          e.target.checked ? true : null
                        )
                      }
                    />
                    Filtro bilineal (suavizado)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="checkbox"
                      checked={retroarch.integerScale ?? false}
                      onChange={(e) =>
                        updateRetroArchKey(
                          "integerScale",
                          e.target.checked ? true : null
                        )
                      }
                    />
                    Escala entera (sin distorsión)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <span className="w-28 text-xs">Relación de aspecto</span>
                    <select
                      value={
                        retroarch.aspectRatio === undefined
                          ? ""
                          : String(retroarch.aspectRatio)
                      }
                      onChange={(e) =>
                        updateRetroArchKey(
                          "aspectRatio",
                          e.target.value === ""
                            ? null
                            : (Number(e.target.value) as 0 | 1)
                        )
                      }
                      className="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-primary"
                    >
                      <option value="">Por defecto</option>
                      <option value="0">4:3</option>
                      <option value="1">16:9</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="checkbox"
                      checked={retroarch.runAhead ?? false}
                      onChange={(e) =>
                        updateRetroArchKey(
                          "runAhead",
                          e.target.checked ? true : null
                        )
                      }
                    />
                    Run-ahead (menos lag de input)
                  </label>
                  {retroarch.runAhead && (
                    <label className="flex items-center gap-2 text-sm text-secondary">
                      <span className="w-28 text-xs">Frames run-ahead</span>
                      <input
                        type="range"
                        min={1}
                        max={6}
                        step={1}
                        value={retroarch.runAheadFrames ?? 1}
                        onChange={(e) =>
                          updateRetroArchKey(
                            "runAheadFrames",
                            Number(e.target.value)
                          )
                        }
                        className="flex-1"
                      />
                      <span className="w-12 text-right tabular-nums text-xs">
                        {retroarch.runAheadFrames ?? 1}
                      </span>
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="checkbox"
                      checked={retroarch.rewind ?? false}
                      onChange={(e) =>
                        updateRetroArchKey(
                          "rewind",
                          e.target.checked ? true : null
                        )
                      }
                    />
                    Rewind (rebobinar)
                  </label>
                  {override?.retroarch && (
                    <button
                      onClick={() =>
                        setRetroArchGameConfig(rom.systemId, rom.fileName, null)
                      }
                      className="text-xs text-muted underline hover:text-secondary"
                    >
                      Limpiar tweaks de RetroArch
                    </button>
                  )}
                </div>
              )}
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
