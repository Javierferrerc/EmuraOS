/**
 * NexusGameCard — a single game tile. Mirrors the design's GameCard: cover
 * (real or procedural), favourite toggle, "installed" dot, focus ring, and an
 * optional name/genre footer (used in grid + search where the cover hides its
 * own title). All interactions route through AppContext via the parent.
 */

import { forwardRef, useCallback, useEffect, useRef } from "react";
import type { NexusGame } from "./nexusModel";
import { NexusCover } from "./NexusCover";
import { HeartIcon } from "./NexusIcons";

interface NexusGameCardProps {
  game: NexusGame;
  focused?: boolean;
  showFooter?: boolean;
  isFavorite: boolean;
  onOpen: (game: NexusGame) => void;
  onLaunch: (game: NexusGame) => void;
  onToggleFavorite: (game: NexusGame) => void;
  onHover?: () => void;
  /** Someone else's game (their profile): same visuals, no heart / library
   *  chip, and clicks do nothing — it isn't in this user's library. */
  readOnly?: boolean;
}

export const NexusGameCard = forwardRef<HTMLDivElement, NexusGameCardProps>(
  function NexusGameCard(
    { game, focused, showFooter, isFavorite, onOpen, onLaunch, onToggleFavorite, onHover, readOnly },
    ref
  ) {
    const handleFav = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleFavorite(game);
      },
      [game, onToggleFavorite]
    );

    // Single click opens the detail; double click launches. A short timer
    // disambiguates them so the first click of a double-click doesn't open the
    // detail (which would cover the card and swallow the second click).
    const clickTimer = useRef<number | null>(null);
    useEffect(
      () => () => {
        if (clickTimer.current) window.clearTimeout(clickTimer.current);
      },
      []
    );
    const handleClick = useCallback(() => {
      if (clickTimer.current) {
        // Second click within the window — let onDoubleClick handle it.
        window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
        return;
      }
      clickTimer.current = window.setTimeout(() => {
        clickTimer.current = null;
        onOpen(game);
      }, 230);
    }, [game, onOpen]);
    const handleDouble = useCallback(() => {
      if (clickTimer.current) {
        window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      onLaunch(game);
    }, [game, onLaunch]);

    if (readOnly) {
      return (
        <div
          ref={ref}
          className={`nx-card read-only${focused ? " focused" : ""}`}
          onMouseEnter={onHover}
          title={`${game.title}\n${game.systemName}`}
        >
          <div className="nx-card-art">
            <NexusCover game={game} showMeta titleSize={16} />
            <div className="nx-card-ring" />
          </div>
          {showFooter && (
            <div className="nx-card-foot">
              <div className="nx-card-name">{game.title}</div>
              <div className="nx-card-genre">{game.systemName}</div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={`nx-card${focused ? " focused" : ""}${game.missing ? " missing" : ""}`}
        onMouseEnter={onHover}
        onClick={handleClick}
        onDoubleClick={handleDouble}
        title={`${game.title}\n${game.systemName}${game.missing ? "\nNo está en este equipo" : ""}`}
      >
        <div className="nx-card-art">
          <NexusCover game={game} showMeta titleSize={16} />
          <div className="nx-card-ring" />
          <span
            className="nx-card-chip"
            title={game.missing ? "No está en este equipo" : "En tu biblioteca"}
          >
            <span className={`nx-card-chip-dot ${game.missing ? "missing" : "installed"}`} />
          </span>
          <button
            className={`nx-card-fav${isFavorite ? " on" : ""}`}
            onClick={handleFav}
            onDoubleClick={(e) => e.stopPropagation()}
            title={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
            aria-label="Favorito"
          >
            <HeartIcon size={14} />
          </button>
        </div>
        {showFooter && (
          <div className="nx-card-foot">
            <div className="nx-card-name">{game.title}</div>
            <div className="nx-card-genre">{game.genre || game.systemName}</div>
          </div>
        )}
      </div>
    );
  }
);
