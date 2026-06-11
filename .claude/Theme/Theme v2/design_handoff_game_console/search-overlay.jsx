// search-overlay.jsx — full-screen search across the whole library. Exposes window.SearchOverlay.

function SearchOverlay({ open, onClose, onOpen, playSound }) {
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current && inputRef.current.focus(), 60);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const results = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return GAMES;
    return GAMES.filter((g) =>
      g.title.toLowerCase().includes(s) ||
      g.genre.toLowerCase().includes(s) ||
      g.tags.some((t) => t.toLowerCase().includes(s)) ||
      platformById(g.platform).name.toLowerCase().includes(s)
    );
  }, [q]);

  const suggestions = ["RPG", "Carreras", "Cooperativo", "Relajante", "Estrategia"];

  if (!open) return null;
  return (
    <div className="so" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="so-panel">
        <div className="so-bar">
          <Icon name="search" size={22} />
          <input ref={inputRef} className="so-input" value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título, género o plataforma…" />
          <button className="so-close" onClick={onClose}><Icon name="close" size={20} /> <span>Esc</span></button>
        </div>

        {!q && (
          <div className="so-sugg">
            {suggestions.map((s) => (
              <button key={s} className="so-chip" onClick={() => setQ(s)}>{s}</button>
            ))}
          </div>
        )}

        <div className="so-results-head">
          <span>{q ? `${results.length} resultado${results.length === 1 ? "" : "s"}` : "Toda la biblioteca"}</span>
        </div>

        <div className="so-grid">
          {results.map((g) => (
            <GameCard key={g.id} game={g} w={150} showName
              focused={false}
              onHover={() => {}}
              onClick={() => onOpen(g, "open")} />
          ))}
          {results.length === 0 && (
            <div className="so-empty">Sin resultados para “{q}”.</div>
          )}
        </div>
      </div>
    </div>
  );
}

window.SearchOverlay = SearchOverlay;
