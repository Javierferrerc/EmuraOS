/**
 * NexusShell — the root of the NEXUS theme. A complete alternate library shell
 * (status bar / sidebar / home / hint bar) that renders instead of <Layout>
 * when config.theme === "nexus". Everything underneath is the real app: games
 * come from AppContext, launching reuses app.launchGame (so the existing
 * loading overlay / countdown still play), favourites + settings are the same.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { buildSliderItems } from "../utils/sliderItems";
import type { SystemDefinition } from "../../../core/types";
import {
  buildNexusGames,
  buildRows,
  filterByPlatform,
  pickHero,
  type NexusGame,
} from "./nexusModel";
import type { NexusLayout } from "./nexusTypes";
import { NexusStatusBar } from "./NexusStatusBar";
import { NexusSidebar } from "./NexusSidebar";
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
  const [layout, setLayout] = useState<NexusLayout>(
    () => (localStorage.getItem(LS_LAYOUT) as NexusLayout) || "hero"
  );
  const [detailGame, setDetailGame] = useState<NexusGame | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const theme = config?.theme ?? "nexus";
  const customColors = config?.customSystemColors;

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

  // Systems present in the library → platform rail (reuses the slider builder
  // so colours/icons/groups match the rest of the app).
  const platformItems = useMemo(() => {
    if (!scanResult) return buildSliderItems([], theme, customColors);
    const present: SystemDefinition[] = [];
    for (const sys of scanResult.systems) {
      if (sys.roms.length === 0) continue;
      const def = systems.find((s) => s.id === sys.systemId);
      if (def) present.push(def);
    }
    return buildSliderItems(present, theme, customColors);
  }, [scanResult, systems, theme, customColors]);

  // Per-platform game counts for the sidebar badges.
  const counts = useMemo(() => {
    const out: Record<string, number> = { all: allGames.length };
    for (const item of platformItems) {
      if (item.systemId === null) continue;
      out[item.systemId] = filterByPlatform(allGames, item.systemId).length;
    }
    return out;
  }, [allGames, platformItems]);

  // If the persisted platform no longer exists (library changed), fall back.
  useEffect(() => {
    const exists = platform === "all" || platformItems.some((i) => i.systemId === platform);
    if (!exists) setPlatform("all");
  }, [platform, platformItems]);

  const filtered = useMemo(() => filterByPlatform(allGames, platform), [allGames, platform]);
  const rows = useMemo(() => buildRows(filtered, recentlyPlayed), [filtered, recentlyPlayed]);
  const hero = useMemo(() => pickHero(filtered, recentlyPlayed), [filtered, recentlyPlayed]);

  const platformLabel = useMemo(() => {
    if (platform === "all") return "Toda la biblioteca";
    return platformItems.find((i) => i.systemId === platform)?.label ?? "Biblioteca";
  }, [platform, platformItems]);

  // ── Actions ──────────────────────────────────────────────────────
  const selectPlatform = useCallback((id: string) => {
    setPlatform(id);
    localStorage.setItem(LS_PLATFORM, id);
  }, []);

  const changeLayout = useCallback((l: NexusLayout) => {
    setLayout(l);
    localStorage.setItem(LS_LAYOUT, l);
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

  // ── Global keys: "/" opens search (when nothing else is open) ─────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "/" && !searchOpen && !detailGame) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, detailGame]);

  const homeActive = !searchOpen && !detailGame;
  const totalGames = allGames.length;
  const systemsCount = platformItems.filter((i) => i.systemId !== null).length;

  return (
    <div className="nexus-root">
      <div className="nx-app">
        <div className="nx-ambient" />
        <NexusStatusBar
          totalGames={totalGames}
          systemsCount={systemsCount}
          onOpenSettings={onOpenSettings}
          onOpenSearch={() => setSearchOpen(true)}
        />

        <div className="nx-main">
          <NexusSidebar
            items={platformItems}
            counts={counts}
            activePlatform={platform}
            onSelect={selectPlatform}
            onOpenSearch={() => setSearchOpen(true)}
            layout={layout}
            onLayoutChange={changeLayout}
          />
          <div className="nx-content">
            <NexusHome
              key={`${platform}:${layout}`}
              rows={rows}
              gridGames={filtered}
              hero={hero}
              layout={layout}
              platformLabel={platformLabel}
              active={homeActive}
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
