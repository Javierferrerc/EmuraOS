/**
 * NexusHeroBanner — the cinematic featured banner used by both the "Destacado"
 * layout and the "Continuar" hero at the top of the grid. Ported from the
 * design's HeroBlock.
 *
 * The prototype showed a fictional "% completado"; this launcher doesn't track
 * completion, so in continue mode we surface real play data instead (tiempo
 * jugado / nº de partidas) next to the "Continuar" CTA.
 */

import { forwardRef } from "react";
import type { NexusGame } from "./nexusModel";
import { NexusCover } from "./NexusCover";
import { formatPlayTime } from "../utils/formatPlayTime";
import { PlayIcon, InfoIcon, StarIcon } from "./NexusIcons";

interface NexusHeroBannerProps {
  game: NexusGame;
  focused: boolean;
  continueMode: boolean;
  onOpen: (game: NexusGame) => void;
  onLaunch: (game: NexusGame) => void;
  onHover: () => void;
}

function continueLabel(game: NexusGame): string {
  const play = game.play;
  if (play?.totalPlayTime && play.totalPlayTime > 0) {
    return `${formatPlayTime(play.totalPlayTime)} jugadas`;
  }
  if (play?.playCount && play.playCount > 0) {
    return `Jugado ${play.playCount} ${play.playCount === 1 ? "vez" : "veces"}`;
  }
  return "Continuar jugando";
}

export const NexusHeroBanner = forwardRef<HTMLDivElement, NexusHeroBannerProps>(
  function NexusHeroBanner({ game, focused, continueMode, onOpen, onLaunch, onHover }, ref) {
    return (
      <div
        ref={ref}
        className={`nx-hero${focused ? " focused" : ""}`}
        style={{ ["--tint" as string]: game.tint }}
        onMouseEnter={onHover}
        onClick={() => onOpen(game)}
      >
        <div className="nx-hero-art">
          <NexusCover game={game} rounded={24} />
        </div>
        <div className="nx-hero-scrim" />
        <div className="nx-hero-body">
          <div className="nx-hero-eyebrow">
            <span className="nx-hero-plat" style={{ color: game.tint }}>
              {game.systemName}
            </span>
            {game.genre && (
              <>
                <span className="nx-hero-dot">•</span>
                <span>{game.genre}</span>
              </>
            )}
            {game.rating > 0 && (
              <>
                <span className="nx-hero-dot">•</span>
                <span className="nx-hero-rating">
                  <StarIcon size={14} />
                  {game.rating.toFixed(1)}
                </span>
              </>
            )}
          </div>
          <h1 className="nx-hero-title">{game.title}</h1>
          {game.blurb && <p className="nx-hero-blurb">{game.blurb}</p>}
          <div className="nx-hero-actions">
            <button
              className="nx-btn-play"
              onClick={(e) => {
                e.stopPropagation();
                onLaunch(game);
              }}
            >
              <PlayIcon size={18} />
              {continueMode ? "Continuar" : "Jugar"}
            </button>
            <button
              className="nx-btn-ghost"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(game);
              }}
            >
              <InfoIcon size={18} />
              Ver detalles
            </button>
            {continueMode && <span className="nx-hero-prog-label">{continueLabel(game)}</span>}
          </div>
        </div>
      </div>
    );
  }
);
