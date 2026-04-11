import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import type { DiscoveredRom } from "../../../core/types";
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
    config,
  } = useApp();
  const tiltEnabled = config?.cardTiltEnabled ?? true;
  const [imgError, setImgError] = useState(false);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);

  // Mouse-tracked tilt state. When non-null, the outer card renders an inline
  // `transform` that follows the cursor (Aceternity CometCard style) and a
  // radial highlight chases the mouse across the cover. When null, the card
  // falls back to the static `.is-focused` CSS tilt (gamepad path).
  const cardRef = useRef<HTMLDivElement>(null);
  const [mouseTilt, setMouseTilt] = useState<{
    rx: number;
    ry: number;
    px: number;
    py: number;
  } | null>(null);

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
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // Normalize cursor position on card to 0..1, then map to ±10° tilt.
      // rotateX is inverted so that moving the mouse up tilts the top of
      // the card toward the viewer (natural "looking at a surface" feel).
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const ry = (x - 0.5) * 20;
      const rx = -(y - 0.5) * 20;
      setMouseTilt({ rx, ry, px: x * 100, py: y * 100 });
    },
    [tiltEnabled, prefersReducedMotion]
  );

  const handleMouseLeave = useCallback(() => {
    setMouseTilt(null);
  }, []);

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

  // Outer card className — branch between 3D tilt (new) and legacy scale.
  // When tilt is off we restore the exact pre-effect look: overflow-hidden on
  // the outer, Tailwind `scale-*` transitions, no `.game-card` class so the
  // glass CSS rules in GameCard.css don't match anything.
  // The `is-mouse-tilting` modifier swaps the transition to a tighter linear
  // curve so the card follows the cursor snappily instead of chasing with the
  // 0.5s ease used for the gamepad static tilt.
  const outerCardClass = tiltEnabled
    ? `game-card group relative h-full cursor-pointer rounded-2xl${
        isFocused ? " is-focused ring-2 ring-blue-500" : ""
      }${mouseTilt ? " is-mouse-tilting" : ""}`
    : `group relative h-full cursor-pointer overflow-hidden rounded-2xl transition-all duration-200 ${
        isFocused ? "scale-105 ring-2 ring-blue-500" : "hover:scale-[1.03]"
      }`;

  // Inline transform when mouse is tilting. Overrides any CSS transform
  // thanks to inline-style specificity, so `.is-focused` static tilt yields
  // to the cursor while the mouse is over the card.
  const tiltInlineStyle: React.CSSProperties | undefined = mouseTilt
    ? {
        transform: `perspective(800px) translateZ(8px) rotateX(${mouseTilt.rx}deg) rotateY(${mouseTilt.ry}deg)`,
      }
    : undefined;

  // Bottom overlay — legacy uses `transition-opacity`; new owns its transitions
  // via `.game-card__overlay` in CSS so we don't layer two `transition` props.
  const overlayClass = tiltEnabled
    ? `game-card__overlay absolute inset-x-0 bottom-0 rounded-b-2xl bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8 ${
        isFocused ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`
    : `absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8 transition-opacity ${
        isFocused ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`;

  const coverContent = hasCover ? (
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
  );

  return (
    <div
      ref={cardRef}
      data-grid-index={gridIndex}
      onDoubleClick={handleDoubleClick}
      onMouseMove={tiltEnabled ? handleMouseMove : undefined}
      onMouseLeave={tiltEnabled ? handleMouseLeave : undefined}
      className={outerCardClass}
      style={tiltInlineStyle}
      title={`Double-click to launch\n${rom.filePath}`}
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
              underlying image instead of overlaying a flat white wash. */}
          {mouseTilt && (
            <div
              className="game-card__comet pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(circle at ${mouseTilt.px}% ${mouseTilt.py}%, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.08) 22%, transparent 48%)`,
                mixBlendMode: "plus-lighter",
              }}
            />
          )}
        </div>
      ) : (
        coverContent
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

      {/* Bottom overlay — visible on hover/focus. When tilt is enabled it pops
          forward in 3D via `.game-card__overlay` in GameCard.css. */}
      <div className={overlayClass}>
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
