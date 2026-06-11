// platform-nav.jsx — platform switcher with three tweakable layouts.
// Exposes window.PlatformNav. variant: "sidebar" | "tabs" | "switch".

function PlatformNav({ platforms, current, onSelect, onSearch, variant, brand }) {
  const cur = platforms.find((p) => p.id === current) || platforms[0];

  // ── SIDEBAR ───────────────────────────────────────────────
  if (variant === "sidebar") {
    return (
      <nav className="pn-sidebar" data-nav="sidebar">
        <div className="pn-brand">
          <div className="pn-brand-mark"><div className="pn-brand-dot" /></div>
          <span className="pn-brand-name">{brand}</span>
        </div>
        <button className="pn-search-btn" onClick={onSearch} data-focusable="chrome">
          <Icon name="search" size={18} />
          <span>Buscar juegos</span>
        </button>
        <div className="pn-sb-label">Plataformas</div>
        <div className="pn-sb-list">
          {platforms.map((p) => {
            const active = p.id === current;
            return (
              <button key={p.id} className={"pn-sb-item" + (active ? " active" : "")}
                onClick={() => onSelect(p.id)}
                style={active ? { "--tint": p.tint } : undefined}>
                <span className="pn-sb-glyph" style={{ color: active ? p.tint : undefined }}>
                  <PlatformGlyph glyph={p.glyph} size={20} />
                </span>
                <span className="pn-sb-name">{p.name}</span>
                {active && <span className="pn-sb-bar" style={{ background: p.tint }} />}
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  // ── SWITCH (console-style carousel) ───────────────────────
  if (variant === "switch") {
    return (
      <div className="pn-switch" data-nav="switch">
        <div className="pn-switch-track">
          {platforms.map((p) => {
            const active = p.id === current;
            return (
              <button key={p.id}
                className={"pn-switch-card" + (active ? " active" : "")}
                onClick={() => onSelect(p.id)}
                style={{ "--tint": p.tint }}>
                <span className="pn-switch-glow" />
                <span className="pn-switch-glyph"><PlatformGlyph glyph={p.glyph} size={active ? 30 : 24} /></span>
                <span className="pn-switch-name">{p.name}</span>
                {active && p.tagline && <span className="pn-switch-tag">{p.tagline}</span>}
              </button>
            );
          })}
        </div>
        <button className="pn-switch-search" onClick={onSearch} aria-label="Buscar">
          <Icon name="search" size={20} />
        </button>
      </div>
    );
  }

  // ── TABS (segmented) ──────────────────────────────────────
  return (
    <div className="pn-tabs" data-nav="tabs">
      <div className="pn-tabs-row">
        {platforms.map((p) => {
          const active = p.id === current;
          return (
            <button key={p.id}
              className={"pn-tab" + (active ? " active" : "")}
              onClick={() => onSelect(p.id)}
              style={{ "--tint": p.tint }}>
              <span className="pn-tab-glyph" style={{ color: active ? p.tint : undefined }}>
                <PlatformGlyph glyph={p.glyph} size={17} />
              </span>
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>
      <button className="pn-tabs-search" onClick={onSearch} aria-label="Buscar">
        <Icon name="search" size={18} />
      </button>
    </div>
  );
}

window.PlatformNav = PlatformNav;
