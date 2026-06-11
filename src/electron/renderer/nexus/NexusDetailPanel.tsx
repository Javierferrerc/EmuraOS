/**
 * NexusDetailPanel — the right-side aside (440px) that slides in when a game is
 * opened. Ported from the design's detail-panel.jsx, fed with real metadata,
 * play history and the real launch/favourite actions. The achievements block
 * from the prototype is replaced by a real stats grid (partidas, valoración,
 * tiempo) since that's the data we actually track.
 */

import { useEffect } from "react";
import type { NexusGame } from "./nexusModel";
import { NexusCover } from "./NexusCover";
import { formatPlayTime } from "../utils/formatPlayTime";
import { PlayIcon, HeartIcon, CloseIcon, StarIcon } from "./NexusIcons";

interface NexusDetailPanelProps {
  game: NexusGame | null;
  isFavorite: boolean;
  onClose: () => void;
  onLaunch: (game: NexusGame) => void;
  onToggleFavorite: (game: NexusGame) => void;
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${Math.max(1, Math.round(mb))} MB`;
}

export function NexusDetailPanel({
  game,
  isFavorite,
  onClose,
  onLaunch,
  onToggleFavorite,
}: NexusDetailPanelProps) {
  // Esc closes the panel.
  useEffect(() => {
    if (!game) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game, onClose]);

  const open = !!game;

  const tags = game
    ? [game.genre, game.players ? `${game.players} jugador${game.players === "1" ? "" : "es"}` : "", game.systemName]
        .filter(Boolean)
        .slice(0, 4)
    : [];

  const metaLine = game
    ? [game.developer, game.year, formatSize(game.rom.sizeBytes)].filter(Boolean).join(" · ")
    : "";

  return (
    <>
      <div className={`nx-dp-backdrop${open ? " show" : ""}`} onClick={onClose} />
      <aside className={`nx-dp${open ? " open" : ""}`} aria-hidden={!open}>
        {game && (
          <div className="nx-dp-scroll">
            <div className="nx-dp-hero">
              <div className="nx-dp-hero-art">
                <NexusCover game={game} rounded={0} />
              </div>
              <div className="nx-dp-hero-scrim" />
              <button className="nx-dp-close" onClick={onClose} title="Cerrar (Esc)">
                <CloseIcon size={18} />
              </button>
              <div className="nx-dp-hero-foot">
                <div className="nx-dp-plat" style={{ color: game.tint }}>
                  {game.systemName}
                </div>
                <h2 className="nx-dp-title">{game.title}</h2>
                {metaLine && <div className="nx-dp-meta">{metaLine}</div>}
              </div>
            </div>

            <div className="nx-dp-body">
              <div className="nx-dp-actions">
                <button
                  className="nx-btn-play"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={() => onLaunch(game)}
                >
                  <PlayIcon size={18} />
                  Jugar
                </button>
                <button
                  className={`nx-dp-icon-btn${isFavorite ? " on" : ""}`}
                  onClick={() => onToggleFavorite(game)}
                  title={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
                >
                  <HeartIcon size={18} />
                </button>
              </div>

              {tags.length > 0 && (
                <div className="nx-dp-tags">
                  {tags.map((t, i) => (
                    <span key={i} className="nx-dp-tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {game.blurb && <p className="nx-dp-blurb">{game.blurb}</p>}

              <div className="nx-dp-stats">
                <div className="nx-dp-stat">
                  <div className="nx-dp-stat-val">{game.play?.playCount ?? 0}</div>
                  <div className="nx-dp-stat-lbl">Partidas</div>
                </div>
                <div className="nx-dp-stat">
                  <div className="nx-dp-stat-val" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {game.rating > 0 ? game.rating.toFixed(1) : "—"}
                    {game.rating > 0 && <StarIcon size={14} className="nx-star" />}
                  </div>
                  <div className="nx-dp-stat-lbl">Valoración</div>
                </div>
                <div className="nx-dp-stat">
                  <div className="nx-dp-stat-val" style={{ fontSize: 18 }}>
                    {game.play?.totalPlayTime ? formatPlayTime(game.play.totalPlayTime) : "—"}
                  </div>
                  <div className="nx-dp-stat-lbl">Tiempo</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
