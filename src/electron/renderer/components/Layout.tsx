import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "./TopBar";
import { SystemSlider } from "./SystemSlider";
import { GameGrid } from "./GameGrid";
import { BottomBar } from "./BottomBar";
import { SettingsPage } from "./SettingsPage";
import { useApp } from "../context/AppContext";
import { useFocusManager, type FocusAction } from "../hooks/useFocusManager";
import { useGamepad } from "../hooks/useGamepad";
import { useKeyboardNav } from "../hooks/useKeyboardNav";
import { useNavigationSounds } from "../hooks/useNavigationSounds";
import { buildSliderItems } from "../utils/sliderItems";
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

  const sliderItems = useMemo(
    () => buildSliderItems(systemsWithRoms),
    [systemsWithRoms]
  );

  // Track which slider index is active (matches current filter)
  const activeSliderIndex = useMemo(() => {
    if (activeFilter.type === "all") return 0;
    if (activeFilter.type === "system") {
      const idx = sliderItems.findIndex(
        (item) => item.systemId === activeFilter.systemId
      );
      return idx >= 0 ? idx : 0;
    }
    return 0;
  }, [activeFilter, sliderItems]);

  const { focusState, focusDispatch } = useFocusManager({
    sliderItemCount: sliderItems.length,
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
            const item = sliderItems[focusState.sliderIndex];
            if (item) {
              if (item.systemId === null) {
                setActiveFilter({ type: "all" });
              } else {
                setActiveFilter({ type: "system", systemId: item.systemId });
              }
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
          if (sliderItems.length === 0) break;
          const currentIdx = focusState.sliderIndex;
          const prevIdx =
            currentIdx <= 0 ? sliderItems.length - 1 : currentIdx - 1;
          const item = sliderItems[prevIdx];
          if (item) {
            if (item.systemId === null) {
              setActiveFilter({ type: "all" });
            } else {
              setActiveFilter({ type: "system", systemId: item.systemId });
            }
            focusDispatch({ type: "SET_SLIDER_INDEX", index: prevIdx });
            focusDispatch({ type: "RESET_GRID" });
          }
          playNavigate();
          break;
        }

        case "NEXT_FILTER": {
          focusDispatch(action);
          if (sliderItems.length === 0) break;
          const currentIdx = focusState.sliderIndex;
          const nextIdx =
            currentIdx >= sliderItems.length - 1 ? 0 : currentIdx + 1;
          const item = sliderItems[nextIdx];
          if (item) {
            if (item.systemId === null) {
              setActiveFilter({ type: "all" });
            } else {
              setActiveFilter({ type: "system", systemId: item.systemId });
            }
            focusDispatch({ type: "SET_SLIDER_INDEX", index: nextIdx });
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
      focusState.sliderIndex,
      sliderItems,
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

  // Handle slider item click
  const handleSliderSelect = useCallback(
    (index: number) => {
      const item = sliderItems[index];
      if (!item) return;
      if (item.systemId === null) {
        setActiveFilter({ type: "all" });
      } else {
        setActiveFilter({ type: "system", systemId: item.systemId });
      }
      focusDispatch({ type: "SET_SLIDER_INDEX", index });
      focusDispatch({ type: "RESET_GRID" });
    },
    [sliderItems, setActiveFilter, focusDispatch]
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

  // Auto-filter when navigating slider with gamepad/keyboard
  useEffect(() => {
    if (focusState.region !== "slider" || !focusState.active) return;
    const item = sliderItems[focusState.sliderIndex];
    if (!item) return;
    if (item.systemId === null) {
      setActiveFilter({ type: "all" });
    } else {
      setActiveFilter({ type: "system", systemId: item.systemId });
    }
  }, [focusState.region, focusState.active, focusState.sliderIndex, sliderItems, setActiveFilter]);

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
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-4xl">🎮</div>
          <p className="text-lg text-gray-500">Loading Retro Launcher...</p>
        </div>
      </div>
    );
  }

  if (currentView === "settings") {
    return <SettingsPage />;
  }

  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      <SystemSlider
        items={sliderItems}
        activeIndex={activeSliderIndex}
        focusedIndex={
          focusState.region === "slider" ? focusState.sliderIndex : -1
        }
        focusActive={focusState.active}
        onSelect={handleSliderSelect}
      />
      <main className="game-grid-scroll flex-1 overflow-y-auto px-6 pb-4">
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
      {gamepadConnected && <BottomBar />}
    </div>
  );
}
