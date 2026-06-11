/**
 * NexusGameCard — a single game tile. Mirrors the design's GameCard: cover
 * (real or procedural), favourite toggle, "installed" dot, focus ring, and an
 * optional name/genre footer (used in grid + search where the cover hides its
 * own title). All interactions route through AppContext via the parent.
 */

import { forwardRef, useCallback } from "react";
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
}

export const NexusGameCard = forwardRef<HTMLDivElement, NexusGameCardProps>(
  function NexusGameCard(
    { game, focused, showFooter, isFavorite, onOpen, onLaunch, onToggleFavorite, onHover },
    ref
  ) {
    const handleFav = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleFavorite(game);
      },
      [game, onToggleFavorite]
    );

    return (
      <div
        ref={ref}
        className={`nx-card${focused ? " focused" : ""}`}
        onMouseEnter={onHover}
        onClick={() => onOpen(game)}
        onDoubleClick={() => onLaunch(game)}
        title={`${game.title}\n${game.systemName}`}
      >
        <div className="nx-card-art">
          <NexusCover game={game} showMeta titleSize={16} />
          <div className="nx-card-ring" />
          <span className="nx-card-chip" title="En tu biblioteca">
            <span className="nx-card-chip-dot installed" />
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
