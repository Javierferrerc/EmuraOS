// status-bar.jsx — top status bar: profile, clock, achievements summary, connectivity, battery.
// Exposes window.StatusBar and window.PlatformGlyph (shared platform mark).

function PlatformGlyph({ glyph, size = 18, color = "currentColor" }) {
  const s = { width: size, height: size, display: "block" };
  if (glyph === "circle")
    return <svg style={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke={color} strokeWidth="2.4"/><circle cx="12" cy="12" r="2.6" fill={color}/></svg>;
  if (glyph === "hex")
    return <svg style={s} viewBox="0 0 24 24"><path d="M12 3l7.5 4.5v9L12 21l-7.5-4.5v-9L12 3z" fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round"/></svg>;
  if (glyph === "square")
    return <svg style={s} viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="15" height="15" rx="5" fill="none" stroke={color} strokeWidth="2.4"/><circle cx="12" cy="12" r="2.4" fill={color}/></svg>;
  // all — four dots
  return <svg style={s} viewBox="0 0 24 24"><circle cx="8" cy="8" r="2.3" fill={color}/><circle cx="16" cy="8" r="2.3" fill={color}/><circle cx="8" cy="16" r="2.3" fill={color}/><circle cx="16" cy="16" r="2.3" fill={color}/></svg>;
}

function Battery({ level = 78, charging = false }) {
  return (
    <div className="sb-batt" title={`${level}%`}>
      <div className="sb-batt-body">
        <div className="sb-batt-fill" style={{
          width: `${level}%`,
          background: level < 20 ? "#f43f5e" : "var(--accent)",
        }} />
      </div>
      <div className="sb-batt-cap" />
      <span className="sb-batt-pct">{level}%</span>
    </div>
  );
}

function StatusBar({ profile, totalAch, onProfile }) {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const dateStr = now.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="statusbar">
      <button className="sb-profile" onClick={onProfile}>
        <span className="sb-avatar" style={{ background: profile.color }}>{profile.initials}</span>
        <span className="sb-profile-txt">
          <span className="sb-name">{profile.name}</span>
          <span className="sb-sub">Nivel {profile.level} · {profile.coins} créditos</span>
        </span>
      </button>

      <div className="sb-center">
        <span className="sb-time">{hh}<span className="sb-colon">:</span>{mm}</span>
        <span className="sb-date">{dateStr}</span>
      </div>

      <div className="sb-right">
        <div className="sb-pill" title="Logros desbloqueados">
          <Icon name="trophy" size={15} />
          <span>{totalAch}</span>
        </div>
        <Icon name="bt" size={16} className="sb-ico" />
        <Icon name="wifi" size={16} className="sb-ico" />
        <Battery level={78} />
      </div>
    </div>
  );
}

Object.assign(window, { StatusBar, PlatformGlyph, Battery });
