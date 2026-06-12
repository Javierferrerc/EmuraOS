// settings-custom.jsx — custom settings views: Portadas & Emuladores. Exposes window.PortadasView, window.EmuladoresView.

// ── Portadas ─────────────────────────────────────────────────
function PortadasView({ section, renderRow }) {
  // small procedural preview gallery (real app shows downloaded covers)
  const cells = React.useMemo(() => {
    const arr = [];
    for (let i = 0; i < 14; i++) {
      const filled = i % 5 !== 3; // a couple missing
      arr.push({ filled, hue: (i * 47) % 360 });
    }
    return arr;
  }, []);
  return (
    <div className="set-page">
      <div className="set-section-head">
        <h1>Portadas</h1>
        <p>Fuentes de carátulas y metadatos. Descarga automática y por credenciales.</p>
      </div>

      <div className="set-group">
        <div className="set-group-head"><div className="set-group-htxt">
          <h2>Vista previa</h2><p>118 de 120 juegos con carátula.</p>
        </div></div>
        <div className="cov-gallery">
          {cells.map((c, i) => c.filled ? (
            <div key={i} className="cov-thumb" style={{ background:
              `radial-gradient(120% 90% at 70% 15%, oklch(0.62 0.18 ${c.hue} / .85), transparent 60%), linear-gradient(150deg, oklch(0.26 0.07 ${c.hue}), oklch(0.13 0.05 ${c.hue}))` }} />
          ) : (
            <div key={i} className="cov-thumb empty"><span>sin portada</span></div>
          ))}
        </div>
        <div className="cov-progress"><i style={{ width: "98%" }} /></div>
      </div>

      {section.groups.map((g) => <GroupView key={g.title} group={g} renderRow={renderRow} />)}
    </div>
  );
}

// ── Emuladores ───────────────────────────────────────────────
const EMULATORS = [
  { id: "retroarch", name: "RetroArch", ini: "RA", sys: "Multi-sistema", status: "installed", path: "/home/alex/Games/Emulators/RetroArch", cores: "42 cores listos" },
  { id: "dolphin", name: "Dolphin", ini: "DO", sys: "GameCube · Wii", status: "installed", path: "/home/alex/Games/Emulators/Dolphin", cores: "Listo" },
  { id: "duckstation", name: "DuckStation", ini: "DS", sys: "PlayStation", status: "installed", path: "/home/alex/Games/Emulators/DuckStation", cores: "Listo" },
  { id: "pcsx2", name: "PCSX2", ini: "P2", sys: "PlayStation 2", status: "available", path: null, cores: "—" },
  { id: "ppsspp", name: "PPSSPP", ini: "PP", sys: "PSP", status: "installed", path: "/home/alex/Games/Emulators/PPSSPP", cores: "Listo" },
  { id: "cemu", name: "Cemu", ini: "CE", sys: "Wii U", status: "available", path: null, cores: "Faltan claves", needKeys: true },
  { id: "citra", name: "Citra", ini: "CI", sys: "Nintendo 3DS", status: "unavailable", path: null, cores: "No disponible" },
  { id: "ryujinx", name: "Ryujinx", ini: "RY", sys: "Nintendo Switch", status: "available", path: null, cores: "—" },
  { id: "melonds", name: "melonDS", ini: "mD", sys: "Nintendo DS", status: "installed", path: "/home/alex/Games/Emulators/melonDS", cores: "Listo" },
];
const STATUS_LABEL = { installed: "Instalado", available: "Descargable", unavailable: "No disponible" };

const EMU_TABS = ["Estado", "Configuración", "Mandos", "Descarga", "Avanzado"];

const EMU_CONFIG_ROWS = [
  { id: "e.backend", kind: "dropdown", label: "Backend gráfico", value: "Vulkan", options: ["Vulkan", "OpenGL", "Direct3D 11", "Software"] },
  { id: "e.res", kind: "dropdown", variant: "selector", label: "Resolución interna", value: "1080p (×3)", options: ["Nativa (×1)", "720p (×2)", "1080p (×3)", "1440p (×4)", "4K (×6)"] },
  { id: "e.vsync", kind: "toggle", label: "V-Sync", description: "Sincroniza con la frecuencia de la pantalla.", value: true },
  { id: "e.audio", kind: "dropdown", label: "Backend de audio", value: "PulseAudio", options: ["PulseAudio", "ALSA", "PipeWire"] },
  { id: "e.rewind", kind: "toggle", label: "Rebobinado", description: "Permite retroceder en el tiempo durante el juego.", value: false },
];
const EMU_ADV_ROWS = [
  { id: "e.threaded", kind: "toggle", label: "Renderizado multihilo", value: true },
  { id: "e.overclock", kind: "slider", label: "Overclock de CPU", min: 50, max: 200, step: 10, unit: "%", value: 100 },
  { id: "e.shader", kind: "dropdown", label: "Shader", value: "Ninguno", options: ["Ninguno", "CRT-Royale", "LCD-Grid", "Scanlines"] },
];
const PAD_MAP = [
  ["A", "Espacio"], ["B", "X"], ["X", "C"], ["Y", "V"],
  ["▲ Arriba", "↑"], ["▼ Abajo", "↓"], ["◀ Izq.", "←"], ["▶ Der.", "→"],
  ["Start", "Enter"], ["Select", "Shift"],
];

function EmuDetail({ emu, onBack, playSound }) {
  const [tab, setTab] = React.useState("Estado");
  const [vals, setVals] = React.useState(() => {
    const o = {}; [...EMU_CONFIG_ROWS, ...EMU_ADV_ROWS].forEach((r) => o[r.id] = r.value); return o;
  });
  const setVal = (id, v) => setVals((p) => ({ ...p, [id]: v }));
  const [capturing, setCapturing] = React.useState(null);
  const [dlProgress, setDlProgress] = React.useState(emu.status === "installed" ? 100 : 0);
  const [dling, setDling] = React.useState(false);

  const renderRow = (row) => (
    <RowView key={row.id} row={row} value={vals[row.id]} setValue={setVal}
      focused={false} onFocus={() => {}} disabled={false} playSound={playSound} />
  );

  const startDl = () => {
    if (dling || dlProgress === 100) return;
    setDling(true); playSound && playSound("select");
    let p = 0;
    const t = setInterval(() => {
      p += Math.random() * 18 + 6;
      if (p >= 100) { p = 100; clearInterval(t); setDling(false); }
      setDlProgress(Math.round(p));
    }, 260);
  };

  return (
    <div className="set-page emu-detail">
      <button className="emu-back" onClick={onBack}><Icon name="back" size={16} /> Emuladores</button>
      <div className="emu-detail-head">
        <div className="emu-logo">{emu.ini}</div>
        <div>
          <h2>{emu.name}</h2>
          <div className="emu-sys">{emu.sys}</div>
        </div>
        <div style={{ flex: 1 }} />
        <span className={"emu-status " + emu.status}><span className="dot" /> {STATUS_LABEL[emu.status]}</span>
      </div>

      <div className="emu-detail-tabs">
        {EMU_TABS.map((t) => (
          <button key={t} className={"set-tab" + (t === tab ? " active" : "")} onClick={() => { setTab(t); playSound && playSound("switch"); }}>{t}</button>
        ))}
      </div>

      {tab === "Estado" && (
        <div className="set-rows">
          <div className="set-row info-glass"><div className="set-row-main"><div className="set-row-label">Estado</div></div>
            <div className="set-row-ctrl"><span className={"ct-info " + (emu.status === "installed" ? "good" : "")}>{STATUS_LABEL[emu.status]}</span></div></div>
          {emu.path && <div className="set-row info-glass col info-col"><div className="set-row-main"><div className="set-row-label">Ruta de instalación</div></div>
            <div className="set-row-ctrl"><span className="ct-hint">{emu.path}</span></div></div>}
          <div className="set-row info-glass"><div className="set-row-main"><div className="set-row-label">Cores / readiness</div></div>
            <div className="set-row-ctrl"><span className={"ct-info " + (emu.needKeys ? "warn" : emu.status === "installed" ? "good" : "")}>{emu.cores}</span></div></div>
          {emu.needKeys && (
            <div className="set-row info-glass col info-col">
              <div className="set-row-main"><div className="set-row-label">Claves de Cemu (Wii U)</div>
                <div className="set-row-desc">Coloca <code>keys.txt</code> en la carpeta de Cemu para descifrar los juegos.</div></div>
              <div className="set-row-ctrl"><span className="ct-status warn">keys.txt no encontrado</span></div>
            </div>
          )}
        </div>
      )}

      {tab === "Configuración" && (
        <div className="set-rows">{EMU_CONFIG_ROWS.map(renderRow)}</div>
      )}

      {tab === "Mandos" && (
        <div className="set-rows">
          {PAD_MAP.map(([btn, key]) => (
            <div key={btn} className="emu-keycap-row">
              <span className="set-row-label">{btn}</span>
              <div className="set-row-ctrl">
                {capturing === btn
                  ? <span className="ct-status warn">Pulsa un botón…</span>
                  : <span className="emu-keycap">{key}</span>}
                <button className="ct-btn ghost emu-capture" onClick={() => { setCapturing(btn); playSound && playSound("toggle"); setTimeout(() => setCapturing(null), 1800); }}>
                  Capturar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "Descarga" && (
        <div className="set-rows">
          <div className="set-row col">
            <div className="set-row-main">
              <div className="set-row-label">{emu.status === "installed" ? "Reinstalar / actualizar" : "Descargar e instalar"}</div>
              <div className="set-row-desc">{emu.status === "unavailable" ? "Este emulador no está disponible para tu plataforma." : "Descarga la última versión estable del emulador."}</div>
            </div>
            <div className="set-row-ctrl" style={{ width: "100%", flexDirection: "column", alignItems: "stretch", gap: 10 }}>
              <div className="emu-dl-bar"><i style={{ width: dlProgress + "%" }} /></div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button className="ct-btn primary" disabled={emu.status === "unavailable" || dling || dlProgress === 100} onClick={startDl}>
                  <Icon name="download" size={16} /> {dlProgress === 100 ? "Instalado" : dling ? "Descargando…" : "Descargar"}
                </button>
                <span className="ct-status">{dlProgress}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "Avanzado" && (
        <div className="set-rows">{EMU_ADV_ROWS.map(renderRow)}</div>
      )}
    </div>
  );
}

function EmuladoresView({ playSound, focusId, onFocusEmu }) {
  const [selected, setSelected] = React.useState(null);
  const [detecting, setDetecting] = React.useState(false);

  if (selected) {
    const emu = EMULATORS.find((e) => e.id === selected);
    return <EmuDetail emu={emu} onBack={() => { setSelected(null); playSound && playSound("back"); }} playSound={playSound} />;
  }

  return (
    <div className="set-page">
      <div className="set-section-head">
        <h1>Emuladores</h1>
        <p>Detecta, instala y configura tus emuladores desde el launcher.</p>
      </div>
      <div className="set-group">
        <div className="set-group-head">
          <div className="set-group-htxt"><h2>Instalados y disponibles</h2><p>{EMULATORS.filter(e => e.status === "installed").length} instalados · {EMULATORS.length} en total.</p></div>
          <button className="ct-btn ghost" onClick={() => { setDetecting(true); playSound && playSound("select"); setTimeout(() => setDetecting(false), 1600); }}>
            <Icon name="refresh" size={16} /> {detecting ? "Detectando…" : "Detectar emuladores"}
          </button>
        </div>
        <div className="emu-grid">
          {EMULATORS.map((e) => (
            <button key={e.id} className={"emu-card" + (focusId === e.id ? " is-focused" : "")}
              onClick={() => { setSelected(e.id); playSound && playSound("open"); }}
              onMouseEnter={() => onFocusEmu && onFocusEmu(e.id)}>
              <div className="emu-card-top">
                <div className="emu-logo">{e.ini}</div>
                <div><div className="emu-name">{e.name}</div><div className="emu-sys">{e.sys}</div></div>
              </div>
              <span className={"emu-status " + e.status}><span className="dot" /> {STATUS_LABEL[e.status]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PortadasView, EmuladoresView, EMULATORS });
