// app.jsx — top-level shell, state, tweaks. Exposes window.GameConsoleApp.

const FONT_STACK = {
  "Sora": "'Sora', system-ui, sans-serif",
  "Space Grotesk": "'Space Grotesk', system-ui, sans-serif",
  "Manrope": "'Manrope', system-ui, sans-serif",
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#3b82f6",
  "font": "Sora",
  "nav": "sidebar",
  "layout": "hero",
  "sound": true
}/*EDITMODE-END*/;

const PROFILE = { name: "Alex", initials: "AX", level: 42, coins: "1.2k", color: "linear-gradient(135deg,#3b82f6,#a855f7)" };

// ── Launch splash ────────────────────────────────────────────
function LaunchSplash({ game, onDone }) {
  React.useEffect(() => {
    const t = setTimeout(onDone, 2300);
    return () => clearTimeout(t);
  }, [game, onDone]);
  const plat = platformById(game.platform);
  return (
    <div className="launch" style={{ "--tint": plat.tint }}>
      <div className="launch-bg"><CoverArt game={game} rounded={0} showTitle={false} /></div>
      <div className="launch-scrim" />
      <div className="launch-center">
        <div className="launch-cover"><CoverArt game={game} rounded={18} showTitle={false} /></div>
        <div className="launch-plat" style={{ color: plat.tint }}>
          <PlatformGlyph glyph={plat.glyph} size={16} /> {plat.name}
        </div>
        <div className="launch-title">{game.title}</div>
        <div className="launch-status">Iniciando<span className="launch-ellipsis" /></div>
        <div className="launch-bar"><div className="launch-bar-fill" /></div>
      </div>
    </div>
  );
}

function HintBar({ nav }) {
  return (
    <div className="hintbar">
      <span className="hint"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> Navegar</span>
      <span className="hint"><kbd className="kbd-a">A</kbd> Abrir</span>
      <span className="hint"><kbd className="kbd-b">B</kbd> / <kbd>Esc</kbd> Volver</span>
      <span className="hint"><kbd>/</kbd> Buscar</span>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const playSound = useSound(t.sound);

  const [platform, setPlatform] = React.useState(() => {
    try { return localStorage.getItem("gc.platform") || "all"; } catch (e) { return "all"; }
  });
  const [detail, setDetail] = React.useState(null);
  const [search, setSearch] = React.useState(false);
  const [launch, setLaunch] = React.useState(null);

  const platObj = platformById(platform) || PLATFORMS[0];
  const games = gamesByPlatform(platform);
  const totalAch = React.useMemo(() => GAMES.reduce((s, g) => s + g.achU, 0), []);
  const navEnabled = !detail && !search && !launch;

  const selectPlatform = React.useCallback((id) => {
    setPlatform((prev) => {
      if (prev !== id) playSound("switch");
      try { localStorage.setItem("gc.platform", id); } catch (e) {}
      return id;
    });
  }, [playSound]);

  const openGame = React.useCallback((g, mode) => {
    if (mode === "launch") { playSound("launch"); setLaunch(g); return; }
    playSound("open");
    setDetail(g);
  }, [playSound]);

  const closeDetail = React.useCallback(() => { playSound("back"); setDetail(null); }, [playSound]);
  const doLaunch = React.useCallback((g) => { playSound("launch"); setDetail(null); setLaunch(g); }, [playSound]);
  const openSearch = React.useCallback(() => { playSound("open"); setSearch(true); }, [playSound]);
  const closeSearch = React.useCallback(() => { playSound("back"); setSearch(false); }, [playSound]);

  // global "/" opens search, Esc closes overlays
  React.useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (e.key === "/" && navEnabled && tag !== "input") { e.preventDefault(); openSearch(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navEnabled, openSearch]);

  const rootStyle = {
    "--accent": t.accent,
    "--font": FONT_STACK[t.font] || FONT_STACK.Sora,
  };

  const isSidebar = t.nav === "sidebar";

  return (
    <div className={"app nav-" + t.nav} style={rootStyle}>
      <div className="app-ambient" />
      <StatusBar profile={PROFILE} totalAch={totalAch} onProfile={() => playSound("toggle")} />

      <div className={"app-main" + (isSidebar ? " with-sidebar" : "")}>
        {isSidebar && (
          <PlatformNav platforms={PLATFORMS} current={platform} onSelect={selectPlatform}
            onSearch={openSearch} variant="sidebar" brand="NEXUS" />
        )}

        <div className="app-content">
          {!isSidebar && (
            <PlatformNav platforms={PLATFORMS} current={platform} onSelect={selectPlatform}
              onSearch={openSearch} variant={t.nav} brand="NEXUS" />
          )}
          <div className="content-scroll" data-vscroll>
            <HomeView platform={platObj} games={games} layout={t.layout}
              navEnabled={navEnabled} onOpen={openGame} playSound={playSound} />
          </div>
        </div>
      </div>

      <HintBar nav={t.nav} />

      <DetailPanel game={detail} onClose={closeDetail} onLaunch={doLaunch} playSound={playSound} />
      <SearchOverlay open={search} onClose={closeSearch} onOpen={(g) => { setSearch(false); openGame(g, "open"); }} playSound={playSound} />
      {launch && <LaunchSplash game={launch} onDone={() => setLaunch(null)} />}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Aspecto" />
        <TweakColor label="Acento" value={t.accent}
          options={["#3b82f6", "#22d3ee", "#a855f7", "#22c55e", "#f97316", "#f43f5e"]}
          onChange={(v) => setTweak("accent", v)} />
        <TweakSelect label="Tipografía" value={t.font}
          options={["Sora", "Space Grotesk", "Manrope"]}
          onChange={(v) => setTweak("font", v)} />
        <TweakSection label="Navegación" />
        <TweakRadio label="Selector de plataforma" value={t.nav}
          options={[{ value: "sidebar", label: "Barra" }, { value: "tabs", label: "Pestañas" }, { value: "switch", label: "Consola" }]}
          onChange={(v) => { playSound("toggle"); setTweak("nav", v); }} />
        <TweakRadio label="Vista de la biblioteca" value={t.layout}
          options={[{ value: "hero", label: "Héroe" }, { value: "carousels", label: "Carrusel" }, { value: "grid", label: "Cuadrícula" }]}
          onChange={(v) => { playSound("toggle"); setTweak("layout", v); }} />
        <TweakSection label="Sistema" />
        <TweakToggle label="Sonidos de navegación" value={t.sound}
          onChange={(v) => setTweak("sound", v)} />
      </TweaksPanel>
    </div>
  );
}

window.GameConsoleApp = App;
