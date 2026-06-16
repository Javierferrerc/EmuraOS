/**
 * NexusGameShot — a 16:9 still for the ficha (hero art, carousel, save-state
 * thumbnails).
 *
 * When a real image is available (the game's SteamGridDB hero or its scraped
 * screenshot) it's rendered directly. Otherwise we fall back to the design's
 * procedural neon scene (ported from `detail-shots.jsx`), deterministic per
 * (game, idx) and tinted by the game's real hue — so a game with no media still
 * reads as a distinct, on-theme still rather than an empty box.
 */

import type { NexusGame } from "../nexusModel";

function shotSeed(str: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
}

interface NexusGameShotProps {
  game: NexusGame;
  idx?: number;
  label?: string;
  /** Real image URL (hero/screenshot). When set, the procedural scene is
   *  skipped entirely. */
  imageUrl?: string | null;
}

export function NexusGameShot({ game, idx = 0, label, imageUrl }: NexusGameShotProps) {
  if (imageUrl) {
    return (
      <div className="gd-real-shot">
        <img src={imageUrl} alt={label ?? game.title} draggable={false} />
        {label && <span className="sh-label">{label}</span>}
      </div>
    );
  }

  const baseHue = game.hue;
  const rng = shotSeed(game.key + ":" + idx);
  const hue = (baseHue + Math.round((rng() - 0.5) * 50) + 360) % 360;
  const h2 = (hue + 40) % 360;
  const arche = idx % 5; // horizon, arena, cockpit, map, depths
  const c = (l: number, ch: number, hh: number, a?: number) =>
    `oklch(${l} ${ch} ${hh}${a != null ? " / " + a : ""})`;

  let layers: string[] = [];
  let fg: React.ReactNode = null;

  if (arche === 0) {
    layers = [
      `radial-gradient(40% 50% at 72% 34%, ${c(0.82, 0.16, h2, 0.9)}, transparent 60%)`,
      `linear-gradient(180deg, ${c(0.32, 0.11, hue)} 0%, ${c(0.46, 0.14, h2)} 52%, ${c(0.2, 0.07, hue)} 54%, ${c(0.1, 0.04, hue)} 100%)`,
    ];
    fg = (
      <>
        <span className="sh-hill" style={{ background: c(0.16, 0.06, hue) }} />
        <span className="sh-hill b" style={{ background: c(0.12, 0.05, h2) }} />
        <span className="sh-floor" style={{ background: `linear-gradient(0deg, ${c(0.1, 0.04, hue)}, ${c(0.16, 0.06, hue)})` }} />
      </>
    );
  } else if (arche === 1) {
    layers = [
      `radial-gradient(60% 80% at 50% 100%, ${c(0.55, 0.17, hue, 0.8)}, transparent 60%)`,
      `radial-gradient(40% 40% at 50% 30%, ${c(0.7, 0.15, h2, 0.5)}, transparent 60%)`,
      `linear-gradient(160deg, ${c(0.2, 0.07, hue)}, ${c(0.1, 0.04, hue)})`,
    ];
    fg = (
      <>
        <span className="sh-ring" style={{ borderColor: c(0.7, 0.16, hue, 0.7) }} />
        <span className="sh-ring sm" style={{ borderColor: c(0.78, 0.15, h2, 0.6) }} />
      </>
    );
  } else if (arche === 2) {
    layers = [
      `radial-gradient(70% 90% at 50% 120%, ${c(0.5, 0.16, h2, 0.7)}, transparent 55%)`,
      `linear-gradient(180deg, ${c(0.16, 0.06, hue)}, ${c(0.26, 0.1, h2)} 70%, ${c(0.12, 0.05, hue)})`,
    ];
    fg = (
      <>
        <span className="sh-arc" style={{ borderColor: c(0.72, 0.16, hue, 0.8) }} />
        <span className="sh-dot" style={{ background: c(0.85, 0.15, h2) }} />
      </>
    );
  } else if (arche === 3) {
    layers = [
      `linear-gradient(160deg, ${c(0.24, 0.08, hue)}, ${c(0.12, 0.05, hue)})`,
      `repeating-linear-gradient(0deg, ${c(0.5, 0.08, hue, 0.18)} 0 1px, transparent 1px 26px)`,
      `repeating-linear-gradient(90deg, ${c(0.5, 0.08, hue, 0.18)} 0 1px, transparent 1px 26px)`,
    ];
    fg = (
      <>
        <span className="sh-node" style={{ left: "30%", top: "44%", background: c(0.8, 0.16, h2) }} />
        <span className="sh-node" style={{ left: "62%", top: "60%", background: c(0.8, 0.16, hue) }} />
        <span className="sh-link" style={{ background: c(0.7, 0.12, h2, 0.6) }} />
      </>
    );
  } else {
    layers = [
      `radial-gradient(50% 60% at 38% 40%, ${c(0.6, 0.18, h2, 0.7)}, transparent 60%)`,
      `radial-gradient(70% 80% at 80% 90%, ${c(0.4, 0.14, hue, 0.6)}, transparent 60%)`,
      `linear-gradient(150deg, ${c(0.16, 0.07, hue)}, ${c(0.07, 0.03, hue)})`,
    ];
    fg = <span className="sh-orb" style={{ background: `radial-gradient(circle, ${c(0.85, 0.16, h2)}, transparent 70%)` }} />;
  }

  return (
    <div className="sh" style={{ background: layers.join(", ") }}>
      <div className="sh-grain" />
      {fg}
      <div className="sh-vig" />
      <div className="sh-scan" />
      {label && <span className="sh-label">{label}</span>}
    </div>
  );
}
