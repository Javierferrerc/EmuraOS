// settings-app.jsx — NEXUS Settings shell: sidebar, tabs, content, SaveBar, staging, keyboard nav.
// Exposes window.SettingsApp.

function SetClock() {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const hh = String(now.getHours()).padStart(2, "0"), mm = String(now.getMinutes()).padStart(2, "0");
  return (
    <div className="set-clock">
      <b>{hh}<span className="set-colon">:</span>{mm}</b>
      <span>{now.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</span>
    </div>
  );
}

function stableEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function SettingsApp() {
  const playSound = useSound(true);
  const [committed, setCommitted] = React.useState(() => ({ ...DEFAULT_VALUES }));
  const [draft, setDraft] = React.useState(() => ({ ...DEFAULT_VALUES }));
  const [secId, setSecId] = React.useState("general");
  const [tabBySec, setTabBySec] = React.useState({});
  const [hasBg, setHasBg] = React.useState(false);
  const [raConnected, setRaConnected] = React.useState(false);

  // focus model
  const [zone, setZone] = React.useState("sidebar"); // sidebar | tabs | content
  const [secIdx, setSecIdx] = React.useState(0);
  const [tabIdx, setTabIdx] = React.useState(0);
  const [contentIdx, setContentIdx] = React.useState(0);
  const [emuFocus, setEmuFocus] = React.useState(null);
  const rowRefs = React.useRef({});

  const section = SETTINGS_SCHEMA.find((s) => s.id === secId);
  const tabId = tabBySec[secId] || (section.tabs && section.tabs[0].id);
  const curTab = section.tabs && (section.tabs.find((t) => t.id === tabId) || section.tabs[0]);
  const isLiveTab = !!(curTab && curTab.live);
  const groups = section.tabs ? curTab.groups : (section.groups || []);

  // disabled flags
  const flags = {
    noBg: !hasBg,
    raDisconnected: !raConnected,
    noSScreds: !(draft["cov.ssdevid"] && draft["cov.ssdevpass"]),
    always: true,
  };
  const isDisabled = (row) => (row.disabledKey ? !!flags[row.disabledKey] : false);

  // dirty
  const dirtyKeys = Object.keys(draft).filter((k) => !stableEq(draft[k], committed[k]));
  const dirty = dirtyKeys.length > 0;

  const get = (id) => {
    if (id === "ra.status") return raConnected ? "✓ Conectado como alex" : "○ No conectado";
    return draft[id];
  };
  const setValue = (id, v) => setDraft((p) => ({ ...p, [id]: v }));
  const setValueLive = (id, v) => { setDraft((p) => ({ ...p, [id]: v })); setCommitted((p) => ({ ...p, [id]: v })); };

  const save = () => { setCommitted({ ...draft }); playSound("select"); };
  const discard = () => { setDraft({ ...committed }); playSound("back"); };

  const handleAction = (row) => {
    if (row.id === "ap.bgpick") { setHasBg(true); }
    else if (row.id === "ap.bgremove") { setHasBg(false); }
    else if (row.id === "ra.connect") { setRaConnected(true); }
    else if (row.id === "ra.disconnect") { setRaConnected(false); }
    else if (row.id === "adv.reset") { setDraft({ ...DEFAULT_VALUES }); setHasBg(false); setRaConnected(false); }
  };

  // focusable rows for current view (normal + portadas)
  const focusableIds = React.useMemo(() => {
    const ids = [];
    if (section.custom === "emuladores") return ids;
    groups.forEach((g) => g.rows.forEach((r) => { if (!r.nonFocusable && r.kind !== "info") ids.push(r.id); }));
    return ids;
  }, [section, groups]);

  const selectSection = (id, idx) => {
    setSecId(id); setSecIdx(idx); setZone("sidebar"); setContentIdx(0); setEmuFocus(null); playSound("switch");
  };
  const selectTab = (id, idx) => { setTabBySec((p) => ({ ...p, [secId]: id })); setTabIdx(idx); setContentIdx(0); playSound("switch"); };

  // scroll focused row into view (no scrollIntoView)
  React.useEffect(() => {
    if (zone !== "content") return;
    const el = rowRefs.current[focusableIds[contentIdx]];
    const vp = document.querySelector("[data-setscroll]");
    if (!el || !vp) return;
    const er = el.getBoundingClientRect(), vr = vp.getBoundingClientRect();
    if (er.top < vr.top + 80) vp.scrollTo({ top: vp.scrollTop - (vr.top + 80 - er.top), behavior: "smooth" });
    else if (er.bottom > vr.bottom - 40) vp.scrollTo({ top: vp.scrollTop + (er.bottom - (vr.bottom - 40)), behavior: "smooth" });
  }, [zone, contentIdx, focusableIds]);

  // keyboard nav
  React.useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const k = e.key;
      const secs = SETTINGS_SCHEMA;
      if (k === "ArrowDown" || k === "ArrowUp") {
        e.preventDefault();
        const d = k === "ArrowDown" ? 1 : -1;
        if (zone === "sidebar") {
          const ni = Math.min(secs.length - 1, Math.max(0, secIdx + d));
          if (ni !== secIdx) { selectSection(secs[ni].id, ni); playSound("move"); }
        } else if (zone === "content") {
          const ni = contentIdx + d;
          if (ni < 0) { setZone(section.tabs ? "tabs" : "sidebar"); playSound("move"); }
          else if (ni < focusableIds.length) { setContentIdx(ni); playSound("move"); }
        } else if (zone === "tabs") {
          if (d === 1) { setZone("content"); setContentIdx(0); playSound("move"); }
          else setZone("sidebar");
        }
      } else if (k === "ArrowRight" || k === "ArrowLeft") {
        const d = k === "ArrowRight" ? 1 : -1;
        if (zone === "sidebar") {
          if (d === 1) { e.preventDefault(); setZone(section.tabs ? "tabs" : "content"); setContentIdx(0); playSound("move"); }
        } else if (zone === "tabs" && section.tabs) {
          e.preventDefault();
          const ni = Math.min(section.tabs.length - 1, Math.max(0, tabIdx + d));
          if (ni !== tabIdx) selectTab(section.tabs[ni].id, ni);
        } else if (zone === "content") {
          // slider / selector adjust, else left → sidebar
          const id = focusableIds[contentIdx];
          const row = groups.flatMap((g) => g.rows).find((r) => r.id === id);
          if (row && row.kind === "slider") {
            e.preventDefault();
            const nv = Math.min(row.max, Math.max(row.min, (get(id) || 0) + d * row.step));
            (isLiveTab ? setValueLive : setValue)(id, nv); playSound("move");
          } else if (row && row.kind === "dropdown" && row.variant === "selector") {
            e.preventDefault();
            const i = row.options.indexOf(get(id));
            (isLiveTab ? setValueLive : setValue)(id, row.options[(i + d + row.options.length) % row.options.length]); playSound("move");
          } else if (d === -1) { e.preventDefault(); setZone("sidebar"); playSound("move"); }
        }
      } else if (k === "Enter" || k === " ") {
        if (zone === "content") {
          e.preventDefault();
          const el = rowRefs.current[focusableIds[contentIdx]];
          if (el) {
            const ctl = el.querySelector(".ct-toggle, .ct-btn, .ct-dd-btn, .ct-swatch input, .ct-sel-arrow");
            if (ctl) ctl.click();
          }
        }
      } else if (k === "Escape" || k === "Backspace") {
        if (zone === "content" || zone === "tabs") { e.preventDefault(); setZone("sidebar"); playSound("back"); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zone, secIdx, tabIdx, contentIdx, section, groups, focusableIds, isLiveTab, raConnected]);

  // sync secIdx when section changes by click
  React.useEffect(() => { setSecIdx(SETTINGS_SCHEMA.findIndex((s) => s.id === secId)); }, [secId]);

  const makeRenderRow = (live) => (row) => {
    const fIdx = focusableIds.indexOf(row.id);
    const focused = zone === "content" && fIdx >= 0 && fIdx === contentIdx;
    return (
      <RowView key={row.id} row={row} value={get(row.id)}
        setValue={live ? setValueLive : setValue}
        focused={focused}
        onFocus={() => { if (fIdx >= 0) { setZone("content"); setContentIdx(fIdx); } }}
        disabled={isDisabled(row)} playSound={playSound} onAction={handleAction}
        innerRef={(el) => { if (el) rowRefs.current[row.id] = el; }} />
    );
  };

  return (
    <div className="set-app">
      <div className="set-top">
        <a className="set-back" href="Game Console.html"><Icon name="back" size={17} /> Volver</a>
        <div className="set-top-title"><b>Configuración</b><span>{section.label}{curTab ? " · " + curTab.label : ""}</span></div>
        <div className="set-top-spacer" />
        <SetClock />
      </div>

      <div className="set-main">
        <aside className="set-sidebar">
          <div className="set-brand">
            <div className="set-brand-mark"><i /></div>
            <div className="set-brand-txt"><b>EmuraOS</b><span>Launcher · NEXUS</span></div>
          </div>
          <div className="set-seclist" role="tablist">
            {SETTINGS_SCHEMA.map((s, i) => {
              const active = s.id === secId;
              const kf = zone === "sidebar" && i === secIdx;
              return (
                <button key={s.id} className={"set-sec" + (active ? " active" : "")}
                  style={kf ? { boxShadow: "0 0 0 2px color-mix(in oklab, var(--accent) 60%, transparent)" } : undefined}
                  onClick={() => selectSection(s.id, i)} onMouseEnter={() => { setZone("sidebar"); setSecIdx(i); }}>
                  {active && <span className="set-sec-bar" />}
                  <span className="set-sec-ico"><Icon name={s.icon} size={19} /></span>
                  <span className="set-sec-name">{s.label}</span>
                </button>
              );
            })}
          </div>
          <div className="set-sidebar-foot">EmuraOS 1.4.2 · tema NEXUS</div>
        </aside>

        <div className="set-content-area">
          {section.tabs && (
            <div className="set-tabbar" role="tablist">
              {section.tabs.map((t, i) => {
                const kf = zone === "tabs" && i === tabIdx;
                return (
                  <button key={t.id} className={"set-tab" + (t.id === tabId ? " active" : "")}
                    style={kf ? { boxShadow: "0 0 0 2px color-mix(in oklab, var(--accent) 60%, transparent)" } : undefined}
                    onClick={() => selectTab(t.id, i)}>{t.label}</button>
                );
              })}
            </div>
          )}
          <div className="set-scroll" data-setscroll>
            {section.custom === "portadas" ? (
              <PortadasView section={section} renderRow={makeRenderRow(false)} />
            ) : section.custom === "emuladores" ? (
              <EmuladoresView playSound={playSound} focusId={emuFocus} onFocusEmu={setEmuFocus} />
            ) : (
              <div className="set-page">
                <div className="set-section-head"><h1>{section.label}</h1></div>
                {groups.map((g, gi) => <GroupView key={(g.title || "g") + gi} group={g} renderRow={makeRenderRow(isLiveTab)} />)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={"set-savebar" + (dirty ? " show" : "")}>
        <div className="set-savebar-txt"><span className="set-savebar-dot" /> Tienes cambios sin guardar</div>
        <span className="set-savebar-count">{dirtyKeys.length} {dirtyKeys.length === 1 ? "cambio" : "cambios"}</span>
        <div className="set-savebar-actions">
          <button className="ct-btn ghost" onClick={discard}>Descartar</button>
          <button className="ct-btn primary" onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

window.SettingsApp = SettingsApp;
