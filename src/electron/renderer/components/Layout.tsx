import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { GameGrid } from "./GameGrid";
import { SearchBar } from "./SearchBar";
import { StatusBar } from "./StatusBar";
import { SettingsPage } from "./SettingsPage";
import { useApp } from "../context/AppContext";
import { useFocusManager, type FocusAction } from "../hooks/useFocusManager";
import { useGamepad } from "../hooks/useGamepad";
import { useKeyboardNav } from "../hooks/useKeyboardNav";
import { useNavigationSounds } from "../hooks/useNavigationSounds";
import { buildSidebarItems } from "../utils/sidebarItems";
import type { DiscoveredRom } from "../../../core/types";

export function Layout() {
  const {
    isLoading,
    currentView,
    setCurrentView,
    activeFilter,
    setActiveFilter,
    scanResult,
    systems,
    collections,
    launchGame,
    toggleFavorite,
    toggleFullscreen,
    isFullscreen,
    setGamepadConnected,
  } = useApp();

  const [gridColumnCount, setGridColumnCount] = useState(4);
  const [gridItemCount, setGridItemCount] = useState(0);
  const filteredRomsRef = useRef<DiscoveredRom[]>([]);

  // Compute systems with ROMs
  const systemsWithRoms = useMemo(() => {
    if (!scanResult) return [];
    const systemCounts = new Map<string, number>();
    for (const sys of scanResult.systems) {
      systemCounts.set(sys.systemId, sys.roms.length);
    }
    return systems.filter((s) => systemCounts.has(s.id));
  }, [scanResult, systems]);

  const sidebarItems = useMemo(
    () => buildSidebarItems(collections, systemsWithRoms),
    [collections, systemsWithRoms]
  );

  const { focusState, focusDispatch } = useFocusManager({
    sidebarItemCount: sidebarItems.length,
    gridItemCount,
    gridColumnCount,
  });

  const { playNavigate, playSelect } = useNavigationSounds();

  const handleAction = useCallback(
    (action: FocusAction) => {
      switch (action.type) {
        case "MOVE_UP":
        case "MOVE_DOWN":
        case "MOVE_LEFT":
        case "MOVE_RIGHT":
          playNavigate();
          focusDispatch(action);
          break;

        case "ACTIVATE":
          playSelect();
          focusDispatch(action);
          if (currentView === "settings") break;
          if (focusState.region === "grid") {
            const rom = filteredRomsRef.current[focusState.gridIndex];
            if (rom) launchGame(rom);
          } else {
            const item = sidebarItems[focusState.sidebarIndex];
            if (item) {
              setActiveFilter(item.filter);
              focusDispatch({ type: "RESET_GRID" });
            }
          }
          break;

        case "BACK":
          focusDispatch(action);
          if (isFullscreen) {
            toggleFullscreen();
          } else if (currentView === "settings") {
            setCurrentView("library");
          }
          break;

        case "TOGGLE_FAVORITE": {
          focusDispatch(action);
          if (focusState.region === "grid") {
            const rom = filteredRomsRef.current[focusState.gridIndex];
            if (rom) toggleFavorite(rom.systemId, rom.fileName);
          }
          break;
        }

        case "OPEN_SETTINGS":
          focusDispatch(action);
          setCurrentView(currentView === "settings" ? "library" : "settings");
          break;

        case "PREV_FILTER": {
          focusDispatch(action);
          if (sidebarItems.length === 0) break;
          const currentIdx = focusState.sidebarIndex;
          const prevIdx =
            currentIdx <= 0 ? sidebarItems.length - 1 : currentIdx - 1;
          const item = sidebarItems[prevIdx];
          if (item) {
            setActiveFilter(item.filter);
            focusDispatch({ type: "SET_SIDEBAR_INDEX", index: prevIdx });
            focusDispatch({ type: "RESET_GRID" });
          }
          playNavigate();
          break;
        }

        case "NEXT_FILTER": {
          focusDispatch(action);
          if (sidebarItems.length === 0) break;
          const currentIdx = focusState.sidebarIndex;
          const nextIdx =
            currentIdx >= sidebarItems.length - 1 ? 0 : currentIdx + 1;
          const item = sidebarItems[nextIdx];
          if (item) {
            setActiveFilter(item.filter);
            focusDispatch({ type: "SET_SIDEBAR_INDEX", index: nextIdx });
            focusDispatch({ type: "RESET_GRID" });
          }
          playNavigate();
          break;
        }

        default:
          focusDispatch(action);
      }
    },
    [
      focusDispatch,
      focusState.region,
      focusState.gridIndex,
      focusState.sidebarIndex,
      sidebarItems,
      currentView,
      isFullscreen,
      launchGame,
      setActiveFilter,
      setCurrentView,
      toggleFavorite,
      toggleFullscreen,
      playNavigate,
      playSelect,
    ]
  );

  // Gamepad
  const { gamepadConnected } = useGamepad({ onAction: handleAction });

  // Sync gamepad state to context
  useEffect(() => {
    setGamepadConnected(gamepadConnected);
  }, [gamepadConnected, setGamepadConnected]);

  // Keyboard
  useKeyboardNav({
    onAction: handleAction,
    onToggleFullscreen: toggleFullscreen,
  });

  // Mouse escape hatch: deactivate focus on mouse click
  useEffect(() => {
    function handleMouseDown() {
      focusDispatch({ type: "DEACTIVATE" });
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [focusDispatch]);

  // Reset grid index on filter change
  useEffect(() => {
    focusDispatch({ type: "RESET_GRID" });
  }, [activeFilter, focusDispatch]);

  const handleFilteredRomsChange = useCallback((roms: DiscoveredRom[]) => {
    filteredRomsRef.current = roms;
  }, []);

  const handleColumnCountChange = useCallback((count: number) => {
    setGridColumnCount(count);
  }, []);

  const handleItemCountChange = useCallback((count: number) => {
    setGridItemCount(count);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="mb-4 text-4xl">🎮</div>
          <p className="text-lg text-gray-400">Loading Retro Launcher...</p>
        </div>
      </div>
    );
  }

  if (currentView === "settings") {
    return <SettingsPage />;
  }

  return (
    <div className="flex h-screen flex-col bg-gray-900">
      <SearchBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          focusedIndex={
            focusState.region === "sidebar" ? focusState.sidebarIndex : -1
          }
          focusActive={focusState.active}
        />
        <main className="flex-1 overflow-y-auto p-4">
          <GameGrid
            focusedIndex={
              focusState.region === "grid" ? focusState.gridIndex : -1
            }
            focusActive={focusState.active}
            onColumnCountChange={handleColumnCountChange}
            onItemCountChange={handleItemCountChange}
            onFilteredRomsChange={handleFilteredRomsChange}
          />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
