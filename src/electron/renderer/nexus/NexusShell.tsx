/**
 * NexusShell — the root of the NEXUS theme. A complete alternate library shell
 * (status bar / sidebar / home / hint bar) that renders instead of <Layout>
 * when config.theme === "nexus". Everything underneath is the real app: games
 * come from AppContext, launching reuses app.launchGame (so the existing
 * loading overlay / countdown still play), favourites + settings are the same.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { useGamepad } from "../hooks/useGamepad";
import type { FocusAction } from "../hooks/useFocusManager";
import type { SystemDefinition } from "../../../core/types";
import {
  buildNexusGames,
  buildRows,
  pickHero,
  pickContinue,
  type NexusGame,
} from "./nexusModel";
import {
  buildFamilies,
  selectableOrder,
  platformSystemIds,
  platformLabel as resolvePlatformLabel,
  ALL_PLATFORM,
} from "./nexusPlatforms";
import type { NexusLayout, NexusHomeHandle, NavDir } from "./nexusTypes";
import { NexusStatusBar } from "./NexusStatusBar";
import { NexusSidebar } from "./NexusSidebar";
import { NexusRailNav } from "./NexusRailNav";
import { NexusHome } from "./NexusHome";
import { NexusProfile } from "./profile/NexusProfile";
import { SocialProvider } from "../social/SocialContext";
import { NexusErrorBoundary } from "./NexusErrorBoundary";
import { NexusGameDetail } from "./detail/NexusGameDetail";
import type { GameDetailFocusHandle } from "./detail/useGameDetailFocus";
import { NexusSearchOverlay } from "./NexusSearchOverlay";
import { NexusHintBar } from "./NexusHintBar";
import { NexusLaunchSequence } from "./launch/NexusLaunchSequence";
import { NexusSessionSummary } from "./session/NexusSessionSummary";
import { NexusImportGames, type ImportItem } from "./import/NexusImportGames";
import { NexusRomGuide } from "./import/NexusRomGuide";
import type { DiscoveredRom } from "../../../core/types";
import "./nexus.css";

interface NexusShellProps {
  onOpenSettings: () => void;
}

const LS_PLATFORM = "nx.platform";
const LS_LAYOUT = "nx.layout";
const LS_NAV = "nx.nav";
const LS_ROM_GUIDE = "nx.romGuideSeen";

type NexusNav = "rail" | "sidebar";

export function NexusShell({ onOpenSettings }: NexusShellProps) {
  const app = useApp();
  const {
    scanResult,
    systems,
    config,
    getMetadataForRom,
    romAddedDates,
    playHistory,
    recentlyPlayed,
    isRomHidden,
    isFavorite,
    toggleFavorite,
    launchGame,
  } = app;

  // Always open on the home / "Biblioteca" tab (all systems), never on the
  // console the user last visited. The layout/nav display preferences below are
  // still remembered, but the starting view resets to the library every launch.
  const [platform, setPlatform] = useState<string>(ALL_PLATFORM);
  // Default configuration per the requested build: console-style platform
  // switcher + grid library topped by a "Continuar" hero.
  const [layout, setLayout] = useState<NexusLayout>(
    () => (localStorage.getItem(LS_LAYOUT) as NexusLayout) || "grid"
  );
  const [nav, setNav] = useState<NexusNav>(
    () => (localStorage.getItem(LS_NAV) === "sidebar" ? "sidebar" : "rail")
  );
  const [detailGame, setDetailGame] = useState<NexusGame | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // "Importar juegos" modal + the global drag-to-import overlay.
  const [importOpen, setImportOpen] = useState(false);
  const [importPaths, setImportPaths] = useState<string[] | undefined>(undefined);
  const [dragImport, setDragImport] = useState(false);
  const openImport = useCallback((paths?: string[]) => {
    setImportPaths(paths);
    setImportOpen(true);
  }, []);
  // "Pon bien el nombre" onboarding guide — shown once between onboarding and
  // the first import (persisted via localStorage).
  const [showRomGuide, setShowRomGuide] = useState(false);
  const dismissRomGuide = useCallback(() => {
    try {
      localStorage.setItem(LS_ROM_GUIDE, "1");
    } catch {
      /* non-fatal */
    }
    setShowRomGuide(false);
  }, []);
  // Launch animation overlay (fresh id per launch so it always remounts).
  const [launchAnim, setLaunchAnim] = useState<{ game: NexusGame; id: number } | null>(null);
  const launchAnimIdRef = useRef(0);
  // Post-session "resumen" overlay, shown when the emulator closes.
  const [sessionSummary, setSessionSummary] = useState<{ rom: DiscoveredRom; durationSec: number } | null>(null);
  const prevSessionRef = useRef(app.currentGame);
  useEffect(() => {
    const prev = prevSessionRef.current;
    if (prev && !app.currentGame) {
      const dur = prev.sessionStartedAt
        ? Math.floor((Date.now() - prev.sessionStartedAt) / 1000)
        : 0;
      if (dur >= 2) setSessionSummary({ rom: prev.rom, durationSec: dur });
    }
    prevSessionRef.current = app.currentGame;
  }, [app.currentGame]);

  const customColors = config?.customSystemColors;
  // When a custom background image is set (App renders it as a fixed layer
  // behind everything), make the shell's dark backdrop translucent so the
  // image shows through — matching the main theme.
  const hasBg = !!config?.backgroundImage;

  // All games, enriched. Rebuilt when the underlying library data changes.
  const allGames = useMemo(
    () =>
      buildNexusGames({
        scanResult,
        getMetadataForRom,
        romAddedDates,
        playHistory,
        isRomHidden,
        customColors,
      }),
    [scanResult, getMetadataForRom, romAddedDates, playHistory, isRomHidden, customColors]
  );

  // Keep an open ficha in sync with the (re)built game list — e.g. after a
  // metadata scrape refreshes género/desarrolladora/año/jugadores, the detail
  // would otherwise keep showing the stale game object captured when it opened.
  useEffect(() => {
    setDetailGame((cur) => (cur ? allGames.find((g) => g.key === cur.key) ?? cur : cur));
  }, [allGames]);

  // ── Import: dedup keys + watched folders + real add ──────────────
  const existingKeys = useMemo(() => {
    const set = new Set<string>();
    for (const sys of scanResult?.systems ?? []) {
      for (const rom of sys.roms) set.add(`${rom.systemId}::${rom.fileName.toLowerCase()}`);
    }
    return set;
  }, [scanResult]);

  const watchedFolders = useMemo(() => {
    const romsPath = app.resolvedPaths?.romsPath;
    return romsPath ? [{ path: romsPath, count: scanResult?.totalRoms ?? 0 }] : [];
  }, [app.resolvedPaths, scanResult]);

  // Show the ROM-naming guide once: onboarding done (firstRunCompleted), the
  // library is still empty (we're before the first import) and it hasn't been
  // dismissed before. Opening the importer afterwards is driven by onContinue.
  useEffect(() => {
    if (importOpen) return;
    if (!config?.firstRunCompleted) return;
    if ((scanResult?.totalRoms ?? 0) > 0) return;
    let seen = false;
    try {
      seen = localStorage.getItem(LS_ROM_GUIDE) === "1";
    } catch {
      /* ignore */
    }
    if (!seen) setShowRomGuide(true);
  }, [config?.firstRunCompleted, scanResult?.totalRoms, importOpen]);

  const handleImportConfirm = useCallback(
    async (selected: ImportItem[]) => {
      const chosen = selected.filter((it) => it.system);
      if (chosen.length === 0) return;
      // 1. Copy the ROMs into the library.
      await window.electronAPI.addRoms(
        chosen.map((it) => ({ filePath: it.filePath, systemId: it.system as string }))
      );

      // 2. Persist the metadata previewed during review (only fills empties).
      const metaEntries = chosen
        .filter((it) => it.meta && (it.meta.genre || it.meta.developer || it.meta.year))
        .map((it) => ({ systemId: it.system as string, fileName: it.file, fields: it.meta! }));
      if (metaEntries.length > 0) {
        try {
          await window.electronAPI.applyImportMetadata(metaEntries);
        } catch (err) {
          console.warn("[import] applyMetadata failed:", err);
        }
      }

      // 3. Download the covers chosen during review (+ a hero for the ficha).
      for (const it of chosen) {
        if (it.coverFull) {
          try {
            await window.electronAPI.applySteamGridDbCandidate(it.system as string, it.file, it.coverFull);
          } catch (err) {
            console.warn("[import] applyCover failed:", err);
          }
        }
      }

      // 4. Reload library + metadata so the new games show their art/data.
      await app.refreshScan();
      await app.loadAllMetadata();
    },
    [app]
  );

  // Global drag-to-import: dropping files/folders anywhere over the shell shows
  // the "Suelta para importar" overlay and opens the importer with those paths.
  // (App.tsx's generic drop-to-add handler is suppressed for the NEXUS theme.)
  useEffect(() => {
    const hasFiles = (dt: DataTransfer | null) =>
      !!dt && Array.from(dt.types || []).includes("Files");
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth++;
      if (!importOpen) setDragImport(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e.dataTransfer)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragImport(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth = 0;
      setDragImport(false);
      if (importOpen) return;
      const paths: string[] = [];
      for (const f of Array.from(e.dataTransfer?.files ?? [])) {
        const p = window.electronAPI.getPathForFile(f);
        if (p) paths.push(p);
      }
      openImport(paths.length ? paths : undefined);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [importOpen, openImport]);

  // Systems present in the library, grouped by manufacturer into families.
  const families = useMemo(() => {
    if (!scanResult) return buildFamilies([], customColors);
    const present: SystemDefinition[] = [];
    for (const sys of scanResult.systems) {
      if (sys.roms.length === 0) continue;
      const def = systems.find((s) => s.id === sys.systemId);
      if (def) present.push(def);
    }
    return buildFamilies(present, customColors);
  }, [scanResult, systems, customColors]);

  // Flat ordered selectable ids (all → fam → its systems → …) for kbd/pad nav.
  const selectable = useMemo(() => selectableOrder(families), [families]);

  // If the persisted platform no longer exists (library changed), fall back.
  useEffect(() => {
    if (!selectable.includes(platform)) setPlatform(ALL_PLATFORM);
  }, [platform, selectable]);

  const filtered = useMemo(() => {
    const ids = platformSystemIds(platform, families);
    return ids === null ? allGames : allGames.filter((g) => ids.has(g.systemId));
  }, [allGames, platform, families]);
  const rows = useMemo(() => buildRows(filtered, recentlyPlayed), [filtered, recentlyPlayed]);
  const hero = useMemo(() => pickHero(filtered, recentlyPlayed), [filtered, recentlyPlayed]);
  // "Continuar" hero for the grid layout — only a genuinely in-progress game.
  const continueHero = useMemo(
    () => pickContinue(filtered, recentlyPlayed),
    [filtered, recentlyPlayed]
  );
  // The hero-layout banner shows "Continuar" when its game is recently played.
  const heroContinue = useMemo(
    () => (hero ? recentlyPlayed.includes(hero.key) : false),
    [hero, recentlyPlayed]
  );

  const platformLabel = useMemo(
    () => resolvePlatformLabel(platform, families),
    [platform, families]
  );

  // ── Actions ──────────────────────────────────────────────────────
  const selectPlatform = useCallback((id: string) => {
    setPlatform(id);
    localStorage.setItem(LS_PLATFORM, id);
  }, []);

  const changeLayout = useCallback((l: NexusLayout) => {
    setLayout(l);
    localStorage.setItem(LS_LAYOUT, l);
  }, []);

  const changeNav = useCallback((value: NexusNav) => {
    setNav(value);
    localStorage.setItem(LS_NAV, value);
  }, []);

  const handleLaunch = useCallback((game: NexusGame) => {
    // Show the "Ignición" animation FIRST; the emulator is only launched when
    // the animation finishes (or is skipped). This guarantees the sequence
    // always plays in full — the game window can't pop up over it mid-way, even
    // if the game would load faster than the ~4.5s animation.
    launchAnimIdRef.current += 1;
    setLaunchAnim({ game, id: launchAnimIdRef.current });
  }, []);

  const handleToggleFavorite = useCallback(
    (game: NexusGame) => {
      void toggleFavorite(game.rom.systemId, game.rom.fileName);
    },
    [toggleFavorite]
  );

  const checkFavorite = useCallback(
    (game: NexusGame) => isFavorite(game.rom.systemId, game.rom.fileName),
    [isFavorite]
  );

  // ── Unified keyboard + gamepad navigation ────────────────────────
  // Two focus zones — the platform rail ("systems") and the game grid
  // ("content"). The same dispatcher drives keyboard and gamepad so couch
  // play and desktop behave identically. NEXUS replaces <Layout>, so without
  // this there'd be no gamepad navigation at all.
  const homeRef = useRef<NexusHomeHandle>(null);
  // Imperative handle into the open ficha's spatial focus, so the gamepad layer
  // can drive it (the ficha itself handles keyboard + mouse).
  const detailFocusRef = useRef<GameDetailFocusHandle | null>(null);
  const [zone, setZone] = useState<"systems" | "content">("content");
  const homeActive = !searchOpen && !detailGame && !profileOpen;

  const switchPlatform = useCallback(
    (delta: number) => {
      const idx = selectable.indexOf(platform);
      if (idx < 0) return;
      const ni = Math.min(selectable.length - 1, Math.max(0, idx + delta));
      if (ni !== idx) selectPlatform(selectable[ni]);
    },
    [selectable, platform, selectPlatform]
  );

  const dispatch = useCallback(
    (action: FocusAction) => {
      // The ficha takes priority and owns its own spatial focus; forward
      // gamepad moves/activate into it, Back closes it.
      if (detailGame) {
        if (action.type === "BACK") setDetailGame(null);
        else if (action.type === "ACTIVATE") detailFocusRef.current?.activate();
        else if (action.type === "MOVE_UP") detailFocusRef.current?.move("up");
        else if (action.type === "MOVE_DOWN") detailFocusRef.current?.move("down");
        else if (action.type === "MOVE_LEFT") detailFocusRef.current?.move("left");
        else if (action.type === "MOVE_RIGHT") detailFocusRef.current?.move("right");
        return;
      }
      if (searchOpen) {
        if (action.type === "BACK") setSearchOpen(false);
        return;
      }
      if (profileOpen) {
        if (action.type === "BACK") setProfileOpen(false);
        return;
      }
      if (action.type === "OPEN_SETTINGS") return onOpenSettings();
      if (action.type === "PREV_FILTER") return switchPlatform(-1);
      if (action.type === "NEXT_FILTER") return switchPlatform(1);

      if (zone === "systems") {
        const prev = nav === "rail" ? "MOVE_LEFT" : "MOVE_UP";
        const next = nav === "rail" ? "MOVE_RIGHT" : "MOVE_DOWN";
        const enter = nav === "rail" ? "MOVE_DOWN" : "MOVE_RIGHT";
        if (action.type === prev) switchPlatform(-1);
        else if (action.type === next) switchPlatform(1);
        else if (action.type === enter || action.type === "ACTIVATE") setZone("content");
        return;
      }

      // zone === "content" → drive the home grid's 2D focus.
      if (action.type === "BACK") {
        setZone("systems");
        return;
      }
      const dir: NavDir | null =
        action.type === "MOVE_UP"
          ? "up"
          : action.type === "MOVE_DOWN"
            ? "down"
            : action.type === "MOVE_LEFT"
              ? "left"
              : action.type === "MOVE_RIGHT"
                ? "right"
                : action.type === "ACTIVATE"
                  ? "activate"
                  : action.type === "TOGGLE_FAVORITE"
                    ? "favorite"
                    : null;
      if (!dir) return;
      const res = homeRef.current?.handleAction(dir);
      if (res === "escape-up" && nav === "rail") setZone("systems");
      else if (res === "escape-left" && nav === "sidebar") setZone("systems");
    },
    [zone, nav, detailGame, searchOpen, profileOpen, switchPlatform, onOpenSettings, handleLaunch]
  );

  useGamepad({ onAction: dispatch });

  // Keyboard mirrors the dispatcher; "/" opens search.
  useEffect(() => {
    const KEY_TO_ACTION: Record<string, FocusAction["type"]> = {
      ArrowUp: "MOVE_UP",
      ArrowDown: "MOVE_DOWN",
      ArrowLeft: "MOVE_LEFT",
      ArrowRight: "MOVE_RIGHT",
      Enter: "ACTIVATE",
      Backspace: "BACK",
      Escape: "BACK",
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "/" && !searchOpen && !detailGame) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      // Let overlays handle their own Escape; only drive grid/system nav here.
      if (!homeActive) return;
      const type = KEY_TO_ACTION[e.key];
      if (!type) return;
      e.preventDefault();
      dispatch({ type } as FocusAction);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, homeActive, searchOpen, detailGame]);

  const totalGames = allGames.length;
  const systemsCount = useMemo(
    () => families.reduce((n, f) => n + f.systems.length, 0),
    [families]
  );

  return (
    <NexusErrorBoundary>
    <SocialProvider>
    <div className={`nexus-root${hasBg ? " has-bg" : ""}`}>
      <div className="nx-app">
        <div className="nx-ambient" />
        <NexusStatusBar
          totalGames={totalGames}
          systemsCount={systemsCount}
          layout={layout}
          nav={nav}
          onLayoutChange={changeLayout}
          onNavChange={changeNav}
          onOpenSettings={onOpenSettings}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenProfile={() => setProfileOpen(true)}
          onImport={() => openImport()}
        />

        {profileOpen ? (
          <NexusProfile
            onBack={() => setProfileOpen(false)}
            allGames={allGames}
            isFavorite={checkFavorite}
            onOpen={setDetailGame}
            onLaunch={handleLaunch}
            onToggleFavorite={handleToggleFavorite}
          />
        ) : (
          <div className="nx-main">
            {nav === "sidebar" && (
              <NexusSidebar
                families={families}
                activePlatform={platform}
                navFocused={zone === "systems"}
                onSelect={selectPlatform}
                onOpenSearch={() => setSearchOpen(true)}
              />
            )}
            <div className="nx-content">
              {nav === "rail" && (
                <NexusRailNav
                  families={families}
                  activePlatform={platform}
                  navFocused={zone === "systems"}
                  onSelect={selectPlatform}
                />
              )}
              <NexusHome
                key={`${platform}:${layout}`}
                ref={homeRef}
                rows={rows}
                gridGames={filtered}
                hero={hero}
                heroContinue={heroContinue}
                continueHero={continueHero}
                layout={layout}
                platformLabel={platformLabel}
                isFavorite={checkFavorite}
                onOpen={setDetailGame}
                onLaunch={handleLaunch}
                onToggleFavorite={handleToggleFavorite}
                onImport={() => openImport()}
              />
            </div>
          </div>
        )}

        {!profileOpen && <NexusHintBar />}

        {detailGame && (
          <NexusGameDetail
            key={detailGame.key}
            game={detailGame}
            isFavorite={checkFavorite(detailGame)}
            onBack={() => setDetailGame(null)}
            onPlay={() => handleLaunch(detailGame)}
            onToggleFavorite={() => handleToggleFavorite(detailGame)}
            onChangeEmulator={onOpenSettings}
            focusHandleRef={detailFocusRef}
          />
        )}

        {searchOpen && (
          <NexusSearchOverlay
            games={allGames}
            isFavorite={checkFavorite}
            onClose={() => setSearchOpen(false)}
            onOpen={setDetailGame}
            onLaunch={handleLaunch}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {launchAnim && (
          <NexusLaunchSequence
            key={launchAnim.id}
            game={launchAnim.game}
            soundProfile={config?.launchSoundProfile ?? "minimal"}
            soundEnabled={config?.launchSoundEnabled ?? true}
            onDone={() => {
              // Animation finished (or skipped) → now actually launch the game.
              void launchGame(launchAnim.game.rom);
              setLaunchAnim(null);
            }}
          />
        )}

        {sessionSummary && (
          <NexusSessionSummary
            rom={sessionSummary.rom}
            durationSec={sessionSummary.durationSec}
            onReplay={() => {
              const rom = sessionSummary.rom;
              setSessionSummary(null);
              void launchGame(rom);
            }}
            onClose={() => setSessionSummary(null)}
          />
        )}

        {dragImport && !importOpen && (
          <div className="ig-drop-global">
            <div className="ig-drop-card">
              <span className="ico">
                <svg viewBox="0 0 24 24" width={40} height={40} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V5m0 0l-4 4m4-4l4 4" />
                  <path d="M5 19h14" />
                </svg>
              </span>
              <h2>Suelta para importar</h2>
              <p>Detectaremos el sistema de cada juego automáticamente.</p>
            </div>
          </div>
        )}

        {showRomGuide && !importOpen && (
          <NexusRomGuide
            onClose={dismissRomGuide}
            onContinue={() => {
              dismissRomGuide();
              openImport();
            }}
          />
        )}

        {importOpen && (
          <NexusImportGames
            systems={systems}
            existing={existingKeys}
            watched={watchedFolders}
            initialPaths={importPaths}
            soundEnabled={config?.navSoundEnabled ?? true}
            onConfirm={handleImportConfirm}
            onClose={() => {
              setImportOpen(false);
              setImportPaths(undefined);
            }}
          />
        )}
      </div>
    </div>
    </SocialProvider>
    </NexusErrorBoundary>
  );
}
