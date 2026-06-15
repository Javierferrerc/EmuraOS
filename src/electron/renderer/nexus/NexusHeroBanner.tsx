/**
 * NexusHeroBanner — the cinematic featured banner used by both the "Destacado"
 * layout and the "Continuar" hero at the top of the grid. Ported from the
 * design's HeroBlock.
 *
 * The prototype showed a fictional "% completado"; this launcher doesn't track
 * completion, so in continue mode we surface real play data instead (tiempo
 * jugado / nº de partidas) next to the "Continuar" CTA.
 */

import { forwardRef, useEffect, useState } from "react";
import type { NexusGame } from "./nexusModel";
import { NexusCover } from "./NexusCover";
import { formatPlayTime } from "../utils/formatPlayTime";
import { PlayIcon, InfoIcon, StarIcon } from "./NexusIcons";

/**
 * Wide hero art for the featured banner. Lazily resolves a SteamGridDB hero
 * image for the game (cached on disk after the first fetch) and renders it
 * filling the banner; falls back to the tall cover while loading or when the
 * game has no hero on SteamGridDB.
 */
function NexusHeroArt({ game }: { game: NexusGame }) {
  const [heroUrl, setHeroUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHeroUrl(null);
    void (async () => {
      try {
        const res = await window.electronAPI.ensureGameHero(
          game.rom.systemId,
          game.rom.fileName
        );
        if (cancelled || !res?.heroPath) return;
        const url = await window.electronAPI.readBackgroundDataUrl(res.heroPath);
        if (!cancelled) setHeroUrl(url ?? null);
      } catch {
        /* keep the cover fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game.rom.systemId, game.rom.fileName]);

  if (heroUrl) {
    return (
      <img className="nx-hero-img" src={heroUrl} alt={game.title} draggable={false} />
    );
  }
  return <NexusCover game={game} rounded={24} />;
}

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
          <NexusHeroArt game={game} />
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
