import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TopBar,
  TOPBAR_ITEM_COUNT,
  TOPBAR_INDEX_SEARCH,
  TOPBAR_INDEX_FAVORITES,
  TOPBAR_INDEX_PROFILE,
  TOPBAR_INDEX_SETTINGS,
} from "./TopBar";
import { SystemSlider } from "./SystemSlider";
import { GameGrid } from "./GameGrid";
import { BottomBar } from "./BottomBar";
import { SettingsPage } from "./SettingsPage";
import {
  VirtualKeyboard,
  getKeyboardRows,
  type KeyboardCursor,
} from "./VirtualKeyboard";
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
    searchQuery,
    setSearchQuery,
  } = useApp();

  // Track the latest search query in a ref so the virtual keyboard handlers
  // can read the current value without being re-created on every keystroke.
  const searchQueryRef = useRef(searchQuery);
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  // Virtual keyboard state (only visible when focusState.textInputMode === true)
  const [keyboardCursor, setKeyboardCursor] = useState<KeyboardCursor>({
    row: 1,
    col: 0,
  });
  const [keyboardShift, setKeyboardShift] = useState(false);
  // Mirror keyboard state in refs so the stable handleAction callback can read
  // the latest values without being re-created on every cursor move.
  const keyboardCursorRef = useRef<KeyboardCursor>({ row: 1, col: 0 });
  const keyboardShiftRef = useRef(false);
  useEffect(() => {
    keyboardCursorRef.current = keyboardCursor;
  }, [keyboardCursor]);
  useEffect(() => {
    keyboardShiftRef.current = keyboardShift;
  }, [keyboardShift]);

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
    topbarItemCount: TOPBAR_ITEM_COUNT,
    sliderItemCount: sliderItems.length,
    gridItemCount,
    gridColumnCount,
  });

  const handleToggleFavoritesFilter = useCallback(() => {
    if (activeFilter.type === "favorites") {
      setActiveFilter({ type: "all" });
    } else {
      setActiveFilter({ type: "favorites" });
    }
  }, [activeFilter, setActiveFilter]);

  const { playNavigate, playSelect, playKeyboardSound } = useNavigationSounds();

  // --- Virtual keyboard helpers ------------------------------------------------
  // Move the cursor within the on-screen keyboard. Between rows of different
  // lengths (char row ↔ action row) we map the column proportionally so the
  // visual position stays roughly aligned.
  const moveKeyboardCursor = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      const rows = getKeyboardRows(keyboardShiftRef.current);
      setKeyboardCursor((prev) => {
        const row = rows[prev.row];
        if (!row) return prev;

        if (direction === "left") {
          return { row: prev.row, col: Math.max(0, prev.col - 1) };
        }
        if (direction === "right") {
          return { row: prev.row, col: Math.min(row.length - 1, prev.col + 1) };
        }
        const delta = direction === "up" ? -1 : 1;
        const newRowIdx = prev.row + delta;
        if (newRowIdx < 0 || newRowIdx >= rows.length) return prev;
        const oldLen = row.length;
        const newLen = rows[newRowIdx].length;
        const newCol =
          oldLen <= 1
            ? 0
            : Math.round((prev.col / (oldLen - 1)) * (newLen - 1));
        return {
          row: newRowIdx,
          col: Math.max(0, Math.min(newLen - 1, newCol)),
        };
      });
    },
    []
  );

  // Apply the key at the given (row, col) position. Used by both gamepad
  // ACTIVATE and mouse clicks on the keyboard.
  const applyVirtualKey = useCallback(
    (row: number, col: number) => {
      const rows = getKeyboardRows(keyboardShiftRef.current);
      const key = rows[row]?.[col];
      if (!key) return;

      switch (key.action.type) {
        case "char": {
          const next = searchQueryRef.current + key.action.value;
          searchQueryRef.current = next;
          setSearchQuery(next);
          // Auto-unshift after typing a single uppercase/symbol character,
          // matching mobile keyboard conventions.
          if (keyboardShiftRef.current) setKeyboardShift(false);
          playKeyboardSound("press");
          break;
        }
        case "space": {
          const next = searchQueryRef.current + " ";
          searchQueryRef.current = next;
          setSearchQuery(next);
          playKeyboardSound("press");
          break;
        }
        case "backspace": {
          const next = searchQueryRef.current.slice(0, -1);
          searchQueryRef.current = next;
          setSearchQuery(next);
          playKeyboardSound("press");
          break;
        }
        case "shift":
          setKeyboardShift((s) => !s);
          playKeyboardSound("shift");
          break;
        case "done":
          focusDispatch({ type: "EXIT_TEXT_INPUT" });
          playKeyboardSound("confirm");
          break;
      }
    },
    [setSearchQuery, focusDispatch, playKeyboardSound]
  );

  // Reset keyboard state each time we enter text-input mode so the cursor
  // always starts at a predictable position.
  useEffect(() => {
    if (focusState.textInputMode) {
      setKeyboardCursor({ row: 1, col: 0 });
      setKeyboardShift(false);
    }
  }, [focusState.textInputMode]);

  const handleAction = useCallback(
    (action: FocusAction) => {
      // While the on-screen keyboard is open, all directional navigation and
      // the ACTIVATE button drive the virtual keyboard instead of the normal
      // layout regions. Keyboard interactions use their own click sounds so
      // the rest of the app's audio feedback stays untouched. BACK closes the
      // keyboard.
      if (focusState.textInputMode) {
        switch (action.type) {
          case "BACK":
            focusDispatch({ type: "EXIT_TEXT_INPUT" });
            playKeyboardSound("confirm");
            break;
          case "MOVE_UP":
            moveKeyboardCursor("up");
            playKeyboardSound("nav");
            break;
          case "MOVE_DOWN":
            moveKeyboardCursor("down");
            playKeyboardSound("nav");
            break;
          case "MOVE_LEFT":
            moveKeyboardCursor("left");
            playKeyboardSound("nav");
            break;
          case "MOVE_RIGHT":
            moveKeyboardCursor("right");
            playKeyboardSound("nav");
            break;
          case "ACTIVATE": {
            const { row, col } = keyboardCursorRef.current;
            applyVirtualKey(row, col);
            break;
          }
        }
        return;
      }

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
          } else if (focusState.region === "topbar") {
            switch (focusState.topbarIndex) {
              case TOPBAR_INDEX_SEARCH:
                focusDispatch({ type: "ENTER_TEXT_INPUT" });
                break;
              case TOPBAR_INDEX_FAVORITES:
                handleToggleFavoritesFilter();
                break;
              case TOPBAR_INDEX_PROFILE:
                // Placeholder — profile action not yet implemented
                break;
              case TOPBAR_INDEX_SETTINGS:
                setCurrentView("settings");
                break;
            }
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
      focusState.topbarIndex,
      focusState.textInputMode,
      sliderItems,
      currentView,
      isFullscreen,
      launchGame,
      setActiveFilter,
      setCurrentView,
      toggleFavorite,
      toggleFullscreen,
      handleToggleFavoritesFilter,
      playNavigate,
      playSelect,
      playKeyboardSound,
      moveKeyboardCursor,
      applyVirtualKey,
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
      <TopBar
        focusedIndex={
          focusState.region === "topbar" ? focusState.topbarIndex : -1
        }
        focusActive={focusState.active}
        textInputMode={focusState.textInputMode}
        onExitTextInput={() => focusDispatch({ type: "EXIT_TEXT_INPUT" })}
      />
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
      {focusState.textInputMode && (
        <VirtualKeyboard
          cursor={keyboardCursor}
          shift={keyboardShift}
          onKeyClick={applyVirtualKey}
        />
      )}
    </div>
  );
}
