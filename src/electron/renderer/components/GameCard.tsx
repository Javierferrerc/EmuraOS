import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import type { DiscoveredRom } from "../../../core/types";
import { deriveSystemColors } from "../utils/colorUtils";
import { formatPlayTime } from "../utils/formatPlayTime";
import { hasDetectedEmulatorForSystem } from "../utils/emulatorStatus";
import "./GameCard.css";

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

// Darker, more saturated colors that pop on a light background.
const SYSTEM_COLORS_LIGHT: Record<string, [string, string]> = {
  nes: ["#dc2626", "#7f1d1d"],
  snes: ["#b91c1c", "#641414"],
  n64: ["#16a34a", "#0d5c2a"],
  gb: ["#15803d", "#0a4d24"],
  gbc: ["#7c3aed", "#4c1d95"],
  gba: ["#4f46e5", "#312e81"],
  nds: ["#64748b", "#334155"],
  gamecube: ["#7e22ce", "#4a1576"],
  wii: ["#0891b2", "#0e4f63"],
  megadrive: ["#2563eb", "#1e3a8a"],
  mastersystem: ["#1d4ed8", "#1e3a7a"],
  dreamcast: ["#0284c7", "#0c4a6e"],
  psx: ["#64748b", "#334155"],
  ps2: ["#1d4ed8", "#1e3a5f"],
  psp: ["#4b5563", "#1f2937"],
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
    openGameDetail,
    getMetadataForRom,
    toggleFavorite,
    isFavorite,
    playHistory,
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
  const tiltEnabled = config?.cardTiltEnabled ?? true;
  const [imgError, setImgError] = useState(false);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);

  // Mouse-tracked tilt. Instead of storing rx/ry/px/py in React state (which
  // would trigger a full re-render on every mousemove — jittery even on fast
  // machines), we:
  //   1. Drive the tilt transform + comet gradient directly via refs.
  //   2. Throttle writes to one per animation frame via requestAnimationFrame,
  //      so DOM updates stay perfectly in sync with the browser's vsync.
  //   3. Only use React state for a boolean `isMouseTilting` flag, which toggles
  //      the `.is-mouse-tilting` class for the CSS transition swap and the
  //      comet's opacity.
  const cardRef = useRef<HTMLDivElement>(null);
  const cometRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null);
  const [isMouseTilting, setIsMouseTilting] = useState(false);

  // Honor reduced-motion: bail out of mouse tracking entirely so users who
  // opted out of animations never see the dynamic tilt either.
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!tiltEnabled || prefersReducedMotion) return;
      // Capture raw client coords synchronously; the React event is pooled
      // and won't survive the rAF callback otherwise.
      lastMouseRef.current = { x: e.clientX, y: e.clientY };

      if (!isMouseTilting) setIsMouseTilting(true);

      // Coalesce bursts of mousemove events into one update per frame.
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const card = cardRef.current;
        const comet = cometRef.current;
        const last = lastMouseRef.current;
        if (!card || !last) return;
        const rect = card.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        // Normalize cursor position on card to 0..1, then map to ±10° tilt.
        // rotateX is inverted so that moving the mouse up tilts the top of
        // the card toward the viewer (natural "looking at a surface" feel).
        const x = (last.x - rect.left) / rect.width;
        const y = (last.y - rect.top) / rect.height;
        const ry = (x - 0.5) * 20;
        const rx = -(y - 0.5) * 20;
        // Direct DOM write — bypasses React reconciliation entirely so the
        // transform lands on the compositor the very next frame.
        card.style.transform = `perspective(800px) translateZ(8px) rotateX(${rx.toFixed(
          2
        )}deg) rotateY(${ry.toFixed(2)}deg)`;
        if (comet) {
          comet.style.background = `radial-gradient(circle at ${(x * 100).toFixed(
            1
          )}% ${(y * 100).toFixed(
            1
          )}%, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.08) 22%, transparent 48%)`;
        }
      });
    },
    [tiltEnabled, prefersReducedMotion, isMouseTilting]
  );

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastMouseRef.current = null;
    // Clear the inline transform so the card animates back to rest using the
    // default `.game-card` transition (0.5s ease). Also clear the comet's
    // background; its opacity fade is driven by the `.is-mouse-tilting` class
    // being removed below.
    if (cardRef.current) {
      cardRef.current.style.transform = "";
    }
    if (cometRef.current) {
      cometRef.current.style.background = "";
    }
    setIsMouseTilting(false);
  }, []);

  // Cancel any in-flight rAF on unmount so we don't write to a detached node.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const metadata = getMetadataForRom(rom.systemId, rom.fileName);
  const favorited = isFavorite(rom.systemId, rom.fileName);
  const key = `${rom.systemId}:${rom.fileName}`;
  const playCount = playHistory[key]?.playCount ?? 0;
  const totalPlayTime = playHistory[key]?.totalPlayTime ?? 0;

  useEffect(() => {
    if (metadata?.coverPath) {
      // Grid cards use the 200px thumbnail — falls back to the full cover
      // inside the handler if the thumbnail hasn't been generated yet.
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

  const handleSingleClick = useCallback(() => {
    if (inBulkSelect) {
      toggleBulkSelectRom(rom.systemId, rom.fileName);
    }
  }, [inBulkSelect, toggleBulkSelectRom, rom.systemId, rom.fileName]);

  const handleInfoClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      openGameDetail(rom);
    },
    [openGameDetail, rom]
  );

  const [favPopKey, setFavPopKey] = useState(0);
  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleFavorite(rom.systemId, rom.fileName);
      // Bump the key so the <svg> remounts and plays the CSS animation —
      // simpler than removing/re-adding a class with a timeout.
      setFavPopKey((k) => k + 1);
    },
    [toggleFavorite, rom.systemId, rom.fileName]
  );

  // ── Context menu (right-click "Open with…") ──────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    emulators: Array<{ emulatorId: string; emulatorName: string }>;
  } | null>(null);

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const emulators =
          await window.electronAPI.getEmulatorsForSystem(rom.systemId);
        if (emulators.length <= 1) {
          // 0-1 emulators — just launch directly
          launchGame(rom);
          return;
        }
        setContextMenu({ x: e.clientX, y: e.clientY, emulators });
      } catch (err) {
        console.error("Failed to get emulators for system:", err);
      }
    },
    [rom, launchGame]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Close context menu on Escape or outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    const handleClick = () => setContextMenu(null);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [contextMenu]);

  const displayName = metadata?.title || rom.fileName.replace(/\.[^.]+$/, "");
  const theme = config?.theme ?? "dark";
  const customHex = config?.customSystemColors?.[rom.systemId];
  const colorMap = theme === "light" ? SYSTEM_COLORS_LIGHT : SYSTEM_COLORS;
  let systemLight: string, systemDark: string;
  if (customHex) {
    const derived = deriveSystemColors(customHex);
    systemLight = derived.color;
    systemDark = derived.darkColor;
  } else {
    [systemLight, systemDark] = colorMap[rom.systemId] ?? ["#718096", "#4A5568"];
  }
  // Light theme needs higher alpha on badges for contrast against white bg
  const badgeAlpha = theme === "light" ? "cc" : "8c";
  const hasCover = coverDataUrl && !imgError;

  // Outer card className — branch between 3D tilt (new) and legacy scale.
  // When tilt is off we restore the exact pre-effect look: overflow-hidden on
  // the outer, Tailwind `scale-*` transitions, no `.game-card` class so the
  // glass CSS rules in GameCard.css don't match anything.
  // The `is-mouse-tilting` modifier swaps the transition to a tighter linear
  // curve so the card follows the cursor snappily instead of chasing with the
  // 0.5s ease used for the gamepad static tilt.
  // The blue Tailwind ring is intentionally absent from the tilt-on branch:
  // focus indication is now an animated gradient border + glow defined in
  // GameCard.css (`.game-card::after` + `.game-card.is-focused`). The legacy
  // path keeps the static ring so it still looks pixel-identical to the
  // pre-3D-tilt era when the preference is off.
  const outerCardClass = tiltEnabled
    ? `game-card group relative h-full cursor-pointer rounded-2xl${
        isFocused ? " is-focused" : ""
      }${isMouseTilting ? " is-mouse-tilting" : ""}`
    : `game-card-legacy group relative h-full cursor-pointer overflow-hidden rounded-2xl transition-all duration-200 ${
        isFocused ? "scale-105 ring-2 ring-focus" : "hover:scale-[1.03]"
      }`;

  // Bottom overlay — legacy uses `transition-opacity`; new owns its transitions
  // via `.game-card__overlay` in CSS so we don't layer two `transition` props.
  // The tilt-enabled variant uses an inline gradient with a longer, softer
  // fade (`from-black/70 via-black/40 to-transparent`) so the dark area
  // doesn't end with a hard edge against the rotated card — that hard edge
  // was reading as a "clipped black shadow" on focused cards.
  const overlayClass = tiltEnabled
    ? `game-card__overlay absolute inset-x-0 bottom-0 rounded-b-2xl bg-gradient-to-t from-black/70 via-black/40 to-transparent px-3 pb-3 pt-10 ${
        isFocused ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`
    : `absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8 transition-opacity ${
        isFocused ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`;

  // While metadata reports a coverPath but the IPC read hasn't resolved yet,
  // render a shimmer skeleton instead of the placeholder glyph. Once resolved
  // we flip to <img>; if the read fails we fall through to the glyph.
  const coverPending = !!metadata?.coverPath && !coverDataUrl && !imgError;
  const coverContent = hasCover ? (
    <img
      src={coverDataUrl}
      alt={displayName}
      className="h-full w-full object-cover"
      onError={() => setImgError(true)}
    />
  ) : coverPending ? (
    <div className="cover-skeleton h-full w-full" aria-hidden />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-white/5 text-4xl">
      🎮
    </div>
  );

  return (
    <div
      ref={cardRef}
      data-grid-index={gridIndex}
      onClick={inBulkSelect ? handleSingleClick : undefined}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseMove={tiltEnabled ? handleMouseMove : undefined}
      onMouseLeave={tiltEnabled ? handleMouseLeave : undefined}
      className={`${outerCardClass}${
        inBulkSelect && isBulkSelected ? " ring-2 ring-[var(--color-accent)]" : ""
      }`}
      title={
        inBulkSelect
          ? "Click para seleccionar"
          : `Double-click to launch\n${rom.filePath}`
      }
    >
      {/* When tilt is enabled, the cover image needs its own clipping wrapper
          because the outer card stays overflow-visible for the 3D transform.
          When tilt is disabled, the outer clips directly and we render the
          cover as a direct child to match the legacy structure. */}
      {tiltEnabled ? (
        <div className="game-card__cover absolute inset-0 overflow-hidden rounded-2xl">
          {coverContent}
          {/* Comet highlight — a soft radial glow anchored to the cursor.
              Rendered above the cover via DOM order and brightened with
              `mix-blend-mode: plus-lighter` so it additively lightens the
              underlying image instead of overlaying a flat white wash.
              Always mounted (not conditionally rendered) so its ref stays
              stable and the rAF handler in handleMouseMove can write the
              radial-gradient `background` directly. Visibility is driven by
              the `.is-mouse-tilting` class via CSS opacity transition. */}
          <div
            ref={cometRef}
            className="game-card__comet pointer-events-none absolute inset-0"
            style={{ mixBlendMode: "plus-lighter" }}
          />
        </div>
      ) : (
        coverContent
      )}

      {/* Info button — top-left */}
      <button
        onClick={handleInfoClick}
        className={`absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-opacity opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${isFocused ? "opacity-100" : ""}`}
        title="Ver ficha del juego"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>

      {/* Bulk-select checkmark — top-right, replaces favorite when active. */}
      {inBulkSelect && (
        <div
          className={`absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full shadow-md ${
            isBulkSelected
              ? "bg-[var(--color-accent)] text-white"
              : "bg-black/60 text-white/70"
          }`}
          aria-hidden
        >
          {isBulkSelected ? "\u2713" : ""}
        </div>
      )}

      {/* Emulator-missing warning badge — bottom-left, always visible when
          the rom's system has no detected emulator. Non-interactive; exists
          purely to flag that double-click won't launch. */}
      {emulatorMissing && (
        <div
          className="absolute bottom-2 left-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/90 shadow-md"
          title={`Ningún emulador detectado para ${SYSTEM_NAMES[rom.systemId] ?? rom.systemId}`}
          aria-label="Emulador no detectado"
        >
          <svg
            width="12"
            height="12"
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
          key={favPopKey}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={favorited ? "#ef4444" : "none"}
          stroke={favorited ? "#ef4444" : "#e5e7eb"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={favPopKey > 0 ? "fav-pop" : ""}
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>

      {/* Bottom overlay — visible on hover/focus. When tilt is enabled it pops
          forward in 3D via `.game-card__overlay` in GameCard.css. */}
      <div className={overlayClass}>
        <div className="flex items-center gap-2">
          <span
            className="shrink-0 rounded-md px-2 py-1 text-xs font-bold leading-none text-primary flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${systemLight}${badgeAlpha} 0%, ${systemDark}${badgeAlpha} 100%)` }}
          >
            {SYSTEM_NAMES[rom.systemId] ?? rom.systemId.toUpperCase()}
          </span>
          <span className="truncate text-sm font-medium text-primary">
            {displayName}
          </span>
        </div>
        {playCount > 0 && (
          <p className="mt-0.5 text-xs text-secondary">
            Played {playCount} {playCount === 1 ? "time" : "times"}
            {totalPlayTime > 0 && <span> &middot; {formatPlayTime(totalPlayTime)}</span>}
          </p>
        )}
      </div>

      {/* Context menu portal */}
      {contextMenu &&
        createPortal(
          <div
            className="ctx-menu-panel fixed z-50 min-w-[180px] rounded-lg border py-1 shadow-xl backdrop-blur-sm"
            style={{ left: contextMenu.x, top: contextMenu.y, background: "var(--color-ctx-bg)", borderColor: "var(--color-ctx-border)" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs font-medium text-muted truncate max-w-[240px]">
              {displayName}
            </div>
            <div className="mx-2 my-1 border-t" style={{ borderColor: "var(--color-ctx-border)" }} />
            {contextMenu.emulators.map((emu) => (
              <button
                key={emu.emulatorId}
                className="ctx-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-sm text-secondary transition-colors"
                onClick={() => {
                  closeContextMenu();
                  launchGame(rom, emu.emulatorId);
                }}
              >
                Abrir con {emu.emulatorName}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
