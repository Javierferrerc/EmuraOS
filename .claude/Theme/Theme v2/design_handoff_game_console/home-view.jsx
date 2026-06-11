// home-view.jsx — main library view with 3 layouts + 2D keyboard (gamepad-style) focus.
// Exposes window.HomeView.

const CARD_W = 188;
const GRID_W = 172;

// ── scroll helpers (no scrollIntoView) ──────────────────────
function ensureVisibleX(el) {
  const track = el && el.closest("[data-track]");
  if (!track) return;
  const er = el.getBoundingClientRect(), tr = track.getBoundingClientRect();
  const pad = 90;
  if (er.left < tr.left + pad) track.scrollTo({ left: track.scrollLeft - (tr.left + pad - er.left), behavior: "smooth" });
  else if (er.right > tr.right - pad) track.scrollTo({ left: track.scrollLeft + (er.right - (tr.right - pad)), behavior: "smooth" });
}
function ensureVisibleY(el) {
  const vp = document.querySelector("[data-vscroll]");
  if (!vp || !el) return;
  const er = el.getBoundingClientRect(), vr = vp.getBoundingClientRect();
  const padTop = 96, padBot = 70;
  if (er.top < vr.top + padTop) vp.scrollTo({ top: vp.scrollTop - (vr.top + padTop - er.top), behavior: "smooth" });
  else if (er.bottom > vr.bottom - padBot) vp.scrollTo({ top: vp.scrollTop + (er.bottom - (vr.bottom - padBot)), behavior: "smooth" });
}

// ── row builders ────────────────────────────────────────────
function buildRows(platform, games, layout, cols) {
  const rows = [];
  const recents = [...games].filter((g) => g.progress > 0).sort((a, b) => {
    const r = (s) => s.includes("hora") ? (parseInt(s) || 1) : s.includes("Ayer") ? 24
      : s.includes("día") ? 24 * (parseInt(s) || 1) : s.includes("semana") ? 168 : 999;
    return r(a.lastPlayed) - r(b.lastPlayed);
  });

  if (layout === "grid") {
    for (let i = 0; i < games.length; i += cols)
      rows.push({ key: "g" + i, kind: "gridrow", items: games.slice(i, i + cols) });
    return { rows, hero: null, recents: recents.slice(0, 8) };
  }

  let hero = null;
  if (layout === "hero") hero = games.find((g) => g.featured) || games[0];
  const heroId = hero ? hero.id : null;

  if (recents.length) rows.push({ key: "cont", title: "Continuar jugando", items: recents.slice(0, 8), kind: "row", accentTitle: true });

  if (platform.id === "all") {
    PLATFORMS.filter((p) => p.id !== "all").forEach((p) => {
      const list = games.filter((g) => g.platform === p.id);
      if (list.length) rows.push({ key: p.id, title: p.name, items: list, kind: "row", tint: p.tint, glyph: p.glyph });
    });
  } else {
    const rest = games.filter((g) => g.id !== heroId);
    rows.push({ key: "all", title: "Toda la biblioteca", items: games, kind: "row" });
    const recent = [...games].sort((a, b) => b.year - a.year);
    rows.push({ key: "new", title: "Recién llegados", items: recent, kind: "row" });
    const top = [...games].sort((a, b) => b.rating - a.rating);
    rows.push({ key: "top", title: "Mejor valorados", items: top, kind: "row" });
  }
  return { rows, hero, recents };
}

// ── Hero ─────────────────────────────────────────────────────
function HeroBlock({ game, focused, onHover, onOpen, innerRef }) {
  const plat = platformById(game.platform);
  return (
    <div ref={innerRef} className={"hero" + (focused ? " focused" : "")}
      style={{ "--tint": plat.tint }}
      onMouseEnter={onHover}>
      <div className="hero-art"><CoverArt game={game} rounded={0} showTitle={false} /></div>
      <div className="hero-scrim" />
      <div className="hero-body">
        <div className="hero-eyebrow">
          <span className="hero-plat" style={{ color: plat.tint }}>
            <PlatformGlyph glyph={plat.glyph} size={16} /> {plat.name}
          </span>
          <span className="hero-dot">•</span>
          <span>{game.genre}</span>
          <span className="hero-dot">•</span>
          <span className="hero-rating"><Icon name="star" size={13} /> {game.rating.toFixed(1)}</span>
        </div>
        <h1 className="hero-title">{game.title}</h1>
        <p className="hero-blurb">{game.blurb}</p>
        <div className="hero-actions">
          <button className="btn-play" onClick={() => onOpen(game, "launch")}>
            <Icon name="play" size={18} /> {game.progress > 0 ? "Continuar" : "Jugar"}
          </button>
          <button className="btn-ghost" onClick={() => onOpen(game, "open")}>
            Ver detalles
          </button>
          {game.progress > 0 && <span className="hero-prog-label">{game.progress}% completado</span>}
        </div>
      </div>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────
function Row({ row, rIndex, focus, onHover, onOpen, regRef }) {
  return (
    <section className="row">
      {row.title && (
        <div className="row-head">
          {row.glyph && <span className="row-glyph" style={{ color: row.tint }}><PlatformGlyph glyph={row.glyph} size={18} /></span>}
          <h2 className={"row-title" + (row.accentTitle ? " accent" : "")}>{row.title}</h2>
          <span className="row-count">{row.items.length}</span>
        </div>
      )}
      <div className="row-track" data-track>
        {row.items.map((g, c) => (
          <GameCard key={g.id + "-" + c} game={g} w={CARD_W}
            focused={focus.r === rIndex && focus.c === c}
            innerRef={(el) => regRef(rIndex, c, el)}
            onHover={() => onHover(rIndex, c)}
            onClick={() => onOpen(g, "open")} />
        ))}
      </div>
    </section>
  );
}

// ── HomeView ─────────────────────────────────────────────────
function HomeView({ platform, games, layout, navEnabled, onOpen, playSound }) {
  const [cols, setCols] = React.useState(6);
  const [focus, setFocus] = React.useState({ r: 0, c: 0 });
  const refs = React.useRef({});
  const gridRef = React.useRef(null);

  // measure grid columns
  React.useLayoutEffect(() => {
    if (layout !== "grid") return;
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setCols(Math.max(2, Math.floor((w + 18) / (GRID_W + 18))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout, platform.id]);

  const { rows, hero } = React.useMemo(
    () => buildRows(platform, games, layout, cols),
    [platform.id, games, layout, cols]
  );

  // hero occupies logical row 0 in hero layout
  const heroRowOffset = hero ? 1 : 0;
  const navRows = React.useMemo(() => {
    const r = [];
    if (hero) r.push([hero]);
    rows.forEach((row) => r.push(row.items));
    return r;
  }, [rows, hero]);

  // reset focus + scroll on context change
  React.useEffect(() => {
    setFocus({ r: 0, c: 0 });
    const vp = document.querySelector("[data-vscroll]");
    if (vp) vp.scrollTo({ top: 0, behavior: "auto" });
  }, [platform.id, layout]);

  const regRef = React.useCallback((r, c, el) => {
    refs.current[r + "-" + c] = el;
  }, []);

  // scroll focused into view
  React.useEffect(() => {
    const el = refs.current[focus.r + "-" + focus.c];
    if (el) { ensureVisibleX(el); ensureVisibleY(el); }
  }, [focus]);

  // keyboard 2D nav
  React.useEffect(() => {
    if (!navEnabled) return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      let { r, c } = focus;
      const rowLen = (ri) => (navRows[ri] ? navRows[ri].length : 0);
      if (e.key === "ArrowRight") { c = Math.min(rowLen(r) - 1, c + 1); }
      else if (e.key === "ArrowLeft") { c = Math.max(0, c - 1); }
      else if (e.key === "ArrowDown") { r = Math.min(navRows.length - 1, r + 1); c = Math.min(c, rowLen(r) - 1); }
      else if (e.key === "ArrowUp") { r = Math.max(0, r - 1); c = Math.min(c, rowLen(r) - 1); }
      else if (e.key === "Enter") {
        const g = navRows[r] && navRows[r][c];
        if (g) onOpen(g, "open");
        return;
      } else return;
      e.preventDefault();
      if (r !== focus.r || c !== focus.c) { playSound("move"); setFocus({ r, c }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, navRows, navEnabled, onOpen, playSound]);

  const onHover = React.useCallback((r, c) => setFocus({ r, c }), []);

  // ── render ──
  return (
    <div className="home">
      {hero && (
        <HeroBlock game={hero} focused={focus.r === 0 && focus.c === 0}
          innerRef={(el) => regRef(0, 0, el)}
          onHover={() => onHover(0, 0)} onOpen={onOpen} />
      )}

      {layout === "grid" ? (
        <div className="grid-wrap">
          <div className="row-head">
            <h2 className="row-title">{platform.id === "all" ? "Todos los juegos" : platform.name}</h2>
            <span className="row-count">{games.length}</span>
          </div>
          <div className="game-grid" ref={gridRef}
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
            {games.map((g, i) => {
              const r = Math.floor(i / cols), c = i % cols;
              return (
                <GameCard key={g.id} game={g} w={GRID_W} showName
                  focused={focus.r === r && focus.c === c}
                  innerRef={(el) => regRef(r, c, el)}
                  onHover={() => onHover(r, c)}
                  onClick={() => onOpen(g, "open")} />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rows">
          {rows.map((row, i) => (
            <Row key={row.key} row={row} rIndex={i + heroRowOffset}
              focus={focus} onHover={onHover} onOpen={onOpen} regRef={regRef} />
          ))}
        </div>
      )}
    </div>
  );
}

window.HomeView = HomeView;
