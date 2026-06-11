// detail-panel.jsx — right-side sliding panel with game info, achievements & stats.
// Exposes window.DetailPanel.

const ACH_NAMES = [
  { n: "Primeros pasos", d: "Completa el prólogo" },
  { n: "En racha", d: "Juega 5 horas seguidas" },
  { n: "Coleccionista", d: "Reúne todos los objetos raros" },
  { n: "Sin un rasguño", d: "Supera un jefe sin recibir daño" },
  { n: "Explorador total", d: "Descubre cada rincón del mapa" },
  { n: "El final verdadero", d: "Alcanza el desenlace oculto" },
];

function Stat({ label, value, sub }) {
  return (
    <div className="dp-stat">
      <div className="dp-stat-val">{value}</div>
      <div className="dp-stat-lbl">{label}</div>
      {sub && <div className="dp-stat-sub">{sub}</div>}
    </div>
  );
}

function DetailPanel({ game, onClose, onLaunch, playSound }) {
  const open = !!game;
  const [shown, setShown] = React.useState(null);

  // keep last game during exit animation
  React.useEffect(() => { if (game) setShown(game); }, [game]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const g = game || shown;
  const plat = g ? platformById(g.platform) : null;
  const achPct = g ? Math.round((g.achU / g.achT) * 100) : 0;

  return (
    <>
      <div className={"dp-backdrop" + (open ? " show" : "")} onClick={onClose} />
      <aside className={"dp" + (open ? " open" : "")} style={plat ? { "--tint": plat.tint } : undefined}>
        {g && (
          <div className="dp-scroll" data-vscroll-panel>
            <div className="dp-hero">
              <div className="dp-hero-art"><CoverArt game={g} rounded={0} showTitle={false} /></div>
              <div className="dp-hero-scrim" />
              <button className="dp-close" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={20} /></button>
              <div className="dp-hero-foot">
                <span className="dp-plat" style={{ color: plat.tint }}>
                  <PlatformGlyph glyph={plat.glyph} size={15} /> {plat.name}
                </span>
                <h2 className="dp-title">{g.title}</h2>
                <div className="dp-meta">{g.dev} · {g.year} · {g.size}</div>
              </div>
            </div>

            <div className="dp-body">
              <div className="dp-actions">
                <button className="btn-play wide" onClick={() => onLaunch(g)}>
                  <Icon name="play" size={18} /> {g.progress > 0 ? "Continuar" : (g.installed ? "Jugar" : "Instalar")}
                </button>
                <button className="dp-icon-btn" aria-label="Favorito" onClick={() => playSound("toggle")}><Icon name="heart" size={18} /></button>
                <button className="dp-icon-btn" aria-label="Más" onClick={() => playSound("toggle")}><Icon name="dots" size={18} /></button>
              </div>

              {g.progress > 0 && (
                <div className="dp-resume">
                  <div className="dp-resume-bar"><div style={{ width: `${g.progress}%` }} /></div>
                  <span>{g.progress}% · {g.lastPlayed}</span>
                </div>
              )}

              <div className="dp-tags">
                {g.tags.map((t) => <span key={t} className="dp-tag">{t}</span>)}
              </div>

              <p className="dp-blurb">{g.blurb}</p>

              <div className="dp-stats">
                <Stat label="Jugado" value={`${g.hours} h`} />
                <Stat label="Valoración" value={g.rating.toFixed(1)} sub="★ comunidad" />
                <Stat label="Completado" value={`${g.progress}%`} />
              </div>

              {/* Achievements */}
              <div className="dp-section-head">
                <span className="dp-section-title"><Icon name="trophy" size={16} /> Logros</span>
                <span className="dp-ach-count">{g.achU}/{g.achT}</span>
              </div>
              <div className="dp-ach-bar">
                <div className="dp-ach-fill" style={{ width: `${achPct}%` }} />
                <span className="dp-ach-pct">{achPct}%</span>
              </div>
              <div className="dp-ach-list">
                {ACH_NAMES.slice(0, 5).map((a, i) => {
                  const unlocked = i < Math.round((g.achU / g.achT) * 5);
                  return (
                    <div key={a.n} className={"dp-ach" + (unlocked ? " on" : "")}>
                      <span className="dp-ach-ico">
                        {unlocked ? <Icon name="trophy" size={16} /> : <Icon name="trophy" size={16} />}
                      </span>
                      <span className="dp-ach-txt">
                        <span className="dp-ach-name">{a.n}</span>
                        <span className="dp-ach-desc">{a.d}</span>
                      </span>
                      {unlocked && <span className="dp-ach-check"><Icon name="check" size={15} /></span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

window.DetailPanel = DetailPanel;
