// game-card.jsx — a single game tile. Presentational; focus/hover handled by parent.
// Exposes window.GameCard.

function GameCard({ game, focused, onHover, onClick, innerRef, w = 200, showProgress = true, showName = false }) {
  const plat = platformById(game.platform);
  return (
    <button
      ref={innerRef}
      className={"gcard" + (focused ? " focused" : "")}
      style={{ width: w, "--tint": plat ? plat.tint : "var(--accent)" }}
      data-game={game.id}
      onMouseEnter={onHover}
      onClick={onClick}
      tabIndex={-1}
    >
      <div className="gcard-art" style={{ height: w * 1.32 }}>
        <CoverArt game={game} rounded={14} compact={w < 170} showTitle={!showName} />
        {/* status chip */}
        <div className="gcard-chip">
          {game.installed
            ? <span className="gcard-chip-dot installed" />
            : <Icon name="download" size={13} />}
        </div>
        {showProgress && game.progress > 0 && (
          <div className="gcard-prog"><div className="gcard-prog-fill" style={{ width: `${game.progress}%` }} /></div>
        )}
        <div className="gcard-ring" />
      </div>
      {showName && (
        <div className="gcard-foot">
          <span className="gcard-name">{game.title}</span>
          <span className="gcard-genre">{game.genre}</span>
        </div>
      )}
    </button>
  );
}

window.GameCard = GameCard;
