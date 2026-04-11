import { useApp } from "../context/AppContext";
import "./GameLoadingOverlay.css";

// Mirrors the palette used in GameCard.tsx so the loader's fallback
// (no cover available) reads as the same system as the card that spawned
// it. Kept local to avoid coupling GameCard and GameLoadingOverlay via a
// shared module.
const SYSTEM_COLORS: Record<string, [string, string]> = {
  nes: ["#FF4444", "#8B2020"],
  snes: ["#D43D3D", "#6B1E1E"],
  n64: ["#4ADE80", "#1A6B3A"],
  gb: ["#86EFAC", "#3D8B5E"],
  gbc: ["#A78BFA", "#5B3A9E"],
  gba: ["#818CF8", "#3D4A9E"],
  nds: ["#94A3B8", "#475569"],
  "3ds": ["#F87171", "#7F1D1D"],
  gamecube: ["#A855F7", "#5B2D8E"],
  wii: ["#0BDDFF", "#107B8C"],
  wiiu: ["#22D3EE", "#155E75"],
  megadrive: ["#3B82F6", "#1E4A8E"],
  mastersystem: ["#60A5FA", "#2563EB"],
  dreamcast: ["#7DD3FC", "#2980B0"],
  psx: ["#94A3B8", "#4A5568"],
  ps2: ["#3B82F6", "#1E3A5F"],
  psp: ["#6B7280", "#374151"],
};

export function GameLoadingOverlay() {
  const { launchingGame, getMetadataForRom } = useApp();

  if (!launchingGame) return null;

  const { rom, coverDataUrl } = launchingGame;
  const metadata = getMetadataForRom(rom.systemId, rom.fileName);
  const displayName =
    metadata?.title || rom.fileName.replace(/\.[^.]+$/, "");

  // If we have a cover, every face gets the same background-image. Without
  // a cover we fall back to the system's gradient — keeps the overlay
  // feeling "in-universe" instead of defaulting to a flat slate square.
  const [lightColor, darkColor] = SYSTEM_COLORS[rom.systemId] ?? [
    "#60a5fa",
    "#7c3aed",
  ];

  const faceStyle: React.CSSProperties = coverDataUrl
    ? { backgroundImage: `url(${coverDataUrl})` }
    : {
        background: `linear-gradient(135deg, ${lightColor} 0%, ${darkColor} 100%)`,
      };

  return (
    <div
      className="game-loading-overlay"
      role="status"
      aria-live="polite"
      aria-label={`Cargando ${displayName}`}
    >
      <div className="game-loading-backdrop" />
      <div className="game-loading-content">
        <div className="loader-container">
          <div className="loader">
            <div className="face front" style={faceStyle} />
            <div className="face back" style={faceStyle} />
            <div className="face left" style={faceStyle} />
            <div className="face right" style={faceStyle} />
            <div className="face top" style={faceStyle} />
            <div className="face bottom" style={faceStyle} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="game-loading-title">{displayName}</p>
          <p className="game-loading-subtitle">Cargando juego</p>
        </div>
      </div>
    </div>
  );
}
