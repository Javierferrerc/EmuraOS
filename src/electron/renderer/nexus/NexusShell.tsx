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
import { NexusDetailPanel } from "./NexusDetailPanel";
import { NexusSearchOverlay } from "./NexusSearchOverlay";
import { NexusHintBar } from "./NexusHintBar";
import "./nexus.css";

interface NexusShellProps {
  onOpenSettings: () => void;
}

const LS_PLATFORM = "nx.platform";
const LS_LAYOUT = "nx.layout";
const LS_NAV = "nx.nav";

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

  const [platform, setPlatform] = useState<string>(
    () => localStorage.getItem(LS_PLATFORM) || "all"
  );
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

  const handleLaunch = useCallback(
    (game: NexusGame) => {
      void launchGame(game.rom);
    },
    [launchGame]
  );

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
  const [zone, setZone] = useState<"systems" | "content">("content");
  const homeActive = !searchOpen && !detailGame;

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
      // Overlays take priority and have their own focus model.
      if (detailGame) {
        if (action.type === "ACTIVATE") handleLaunch(detailGame);
        else if (action.type === "BACK") setDetailGame(null);
        return;
      }
      if (searchOpen) {
        if (action.type === "BACK") setSearchOpen(false);
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
    [zone, nav, detailGame, searchOpen, switchPlatform, onOpenSettings, handleLaunch]
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
        />

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
            />
          </div>
        </div>

        <NexusHintBar />

        <NexusDetailPanel
          game={detailGame}
          isFavorite={detailGame ? checkFavorite(detailGame) : false}
          onClose={() => setDetailGame(null)}
          onLaunch={handleLaunch}
          onToggleFavorite={handleToggleFavorite}
        />

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
      </div>
    </div>
  );
}
