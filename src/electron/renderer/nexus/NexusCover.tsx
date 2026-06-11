/**
 * NexusCover — renders a game's real cover (loaded as a data URL via the same
 * IPC the main grid uses) and, when no cover exists yet, a deterministic
 * procedural "box art" gradient derived from the game's hue (ported from the
 * design's cover-art.jsx). The procedural variant paints the title/genre so a
 * coverless game still reads as a labelled tile.
 */

import { useEffect, useState } from "react";
import type { NexusGame } from "./nexusModel";

interface NexusCoverProps {
  game: NexusGame;
  /** Overlay the genre+title on the procedural fallback. Ignored for real
   *  covers (real box art already carries its own title). */
  showMeta?: boolean;
  titleSize?: number;
  rounded?: number;
}

function proceduralLayers(hue: number): { background: string } {
  const h = hue;
  const h2 = (h + 45) % 360;
  const base = `oklch(0.30 0.085 ${h})`;
  const mid = `oklch(0.22 0.08 ${h})`;
  const deep = `oklch(0.14 0.055 ${h})`;
  const g = (a: number) => `oklch(0.68 0.20 ${h} / ${a})`;
  const g2 = (a: number) => `oklch(0.74 0.18 ${h2} / ${a})`;
  // Single tuned "orb" style — enough variety via hue while staying calm.
  const layers = [
    `radial-gradient(46% 46% at 50% 40%, ${g(1)}, transparent 68%)`,
    `radial-gradient(130% 100% at 50% 122%, ${g2(0.55)}, transparent 60%)`,
    `linear-gradient(160deg, ${mid}, ${deep})`,
    `linear-gradient(150deg, ${base}, ${deep})`,
  ];
  return { background: layers.join(", ") };
}

export function NexusCover({ game, showMeta = false, titleSize = 22, rounded = 14 }: NexusCoverProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (!game.coverPath) {
      setDataUrl(null);
      return;
    }
    window.electronAPI
      .readThumbnailDataUrl(game.rom.systemId, game.rom.fileName)
      .then((url) => {
        if (cancelled) return;
        setDataUrl(url ?? null);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [game.coverPath, game.rom.systemId, game.rom.fileName]);

  const hasReal = dataUrl && !failed;

  return (
    <div
      className="nx-cover"
      style={hasReal ? { borderRadius: rounded } : { borderRadius: rounded, ...proceduralLayers(game.hue) }}
    >
      {hasReal && (
        <img
          className="nx-cover-img"
          src={dataUrl}
          alt={game.title}
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
      <div className="nx-cover-sheen" />
      <div className="nx-cover-vig" />
      {!hasReal && showMeta && (
        <div className="nx-cover-meta">
          {game.genre && (
            <div className="nx-cover-genre" style={{ color: `oklch(0.85 0.06 ${game.hue})` }}>
              {game.genre}
            </div>
          )}
          <div className="nx-cover-title" style={{ fontSize: titleSize }}>
            {game.title}
          </div>
        </div>
      )}
    </div>
  );
}
