import { useState, useEffect, useRef, useCallback } from "react";
import { useApp, type ActiveFilter } from "../context/AppContext";
import logoEmura from "../assets/logo-emura.svg";
import "./TopBar.css";

export const TOPBAR_ITEM_COUNT = 6;
export const TOPBAR_INDEX_SEARCH = 0;
export const TOPBAR_INDEX_ADD_ROM = 1;
export const TOPBAR_INDEX_RESCAN = 2;
export const TOPBAR_INDEX_FAVORITES = 3;
export const TOPBAR_INDEX_VIEW_MODE = 4;
export const TOPBAR_INDEX_COLLECTIONS = 5;
export const TOPBAR_INDEX_SETTINGS = 6;

interface TopBarProps {
  focusedIndex: number;
  focusActive: boolean;
  textInputMode: boolean;
  onExitTextInput: () => void;
}

export function TopBar({
  focusedIndex,
  focusActive,
  textInputMode,
  onExitTextInput,
}: TopBarProps) {
  const {
    searchQuery,
    setSearchQuery,
    setCurrentView,
    activeFilter,
    setActiveFilter,
    addRomsFlow,
    refreshScan,
    isScanning,
    isAddingRoms,
    config,
    updateConfig,
    setCollectionsModalOpen,
  } = useApp();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // When entering text input mode, focus the search input; when leaving, blur it.
  useEffect(() => {
    if (textInputMode) {
      inputRef.current?.focus();
    } else if (document.activeElement === inputRef.current) {
      inputRef.current?.blur();
    }
  }, [textInputMode]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(localQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localQuery, setSearchQuery]);

  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.currentTarget.blur();
      }
    },
    []
  );

  const isFavoritesActive = activeFilter.type === "favorites";

  const handleToggleFavorites = useCallback(() => {
    if (isFavoritesActive) {
      setActiveFilter({ type: "all" } as ActiveFilter);
    } else {
      setActiveFilter({ type: "favorites" } as ActiveFilter);
    }
  }, [isFavoritesActive, setActiveFilter]);

  const viewMode = config?.libraryViewMode ?? "grid";

  const handleCycleViewMode = useCallback(() => {
    const modes = ["grid", "list", "compact"] as const;
    const idx = modes.indexOf(viewMode as typeof modes[number]);
    const next = modes[(idx + 1) % modes.length];
    updateConfig({ libraryViewMode: next });
  }, [viewMode, updateConfig]);

  const isFocused = (idx: number) => focusActive && focusedIndex === idx;
  const focusRingClass = (idx: number) =>
    isFocused(idx) ? "ring-2 ring-focus" : "";

  return (
    <header className="flex items-center gap-4 px-5 py-5">
      {/* Shared SVG gradient definition */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="icon-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#999999" />
          </linearGradient>
        </defs>
      </svg>

      {/* Logo */}
      <img src={logoEmura} alt="Emura OS" className="h-9 shrink-0" />

      {/* Search */}
      <div
        data-topbar-index={TOPBAR_INDEX_SEARCH}
        className={`topbar-search relative flex-1 max-w-md mx-auto rounded-full transition-all ${focusRingClass(
          TOPBAR_INDEX_SEARCH
        )}`}
      >
        <input
          ref={inputRef}
          type="text"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onBlur={() => {
            if (textInputMode) onExitTextInput();
          }}
          placeholder="Search ROMs..."
          className="w-full bg-transparent px-4 py-2 pl-9 text-sm text-primary placeholder-[var(--color-text-muted)] outline-none"
        />
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {localQuery && (
          <button
            onClick={() => {
              setLocalQuery("");
              setSearchQuery("");
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
          >
            ✕
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {/* Add ROM */}
        <button
          data-topbar-index={TOPBAR_INDEX_ADD_ROM}
          onClick={() => addRomsFlow()}
          disabled={isAddingRoms}
          className={`topbar-icon-btn flex items-center gap-1.5 px-3 py-2.5 ${focusRingClass(
            TOPBAR_INDEX_ADD_ROM
          )}`}
          style={{ borderRadius: 999 }}
          title="Add ROMs"
        >
          <svg className="h-5 w-5" viewBox="0 0 256 256" fill="url(#icon-gradient)">
            <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" />
          </svg>
          <span className="text-sm font-medium text-secondary">Añadir ROM</span>
        </button>

        {/* Re-scan */}
        <button
          data-topbar-index={TOPBAR_INDEX_RESCAN}
          onClick={() => refreshScan()}
          disabled={isScanning}
          className={`topbar-icon-btn p-2.5 ${focusRingClass(
            TOPBAR_INDEX_RESCAN
          )}`}
          title="Re-scan ROMs"
        >
          <svg
            className={`h-5 w-5 ${isScanning ? "animate-spin" : ""}`}
            viewBox="0 0 256 256"
            fill="url(#icon-gradient)"
          >
            <path d="M240,56v48a8,8,0,0,1-8,8H184a8,8,0,0,1,0-16h28.69L190.93,74.24a80,80,0,0,0-130,8.6,8,8,0,1,1-13.86-8A96,96,0,0,1,202.54,61.54L224,83.32V56a8,8,0,0,1,16,0ZM208.94,181.16a80,80,0,0,1-130-8.6L57.31,150.8H86a8,8,0,0,0,0-16H38a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V164.68l21.46,21.78A96,96,0,0,0,222.54,200.84a8,8,0,1,0-13.86-8Z" />
          </svg>
        </button>

        {/* Favorites toggle */}
        <button
          data-topbar-index={TOPBAR_INDEX_FAVORITES}
          onClick={handleToggleFavorites}
          className={`topbar-icon-btn p-2.5 ${focusRingClass(
            TOPBAR_INDEX_FAVORITES
          )}`}
          title={isFavoritesActive ? "Show all" : "Show favorites"}
        >
          <svg className="h-5 w-5" viewBox="0 0 256 256" fill="url(#icon-gradient)">
            <path d="M240,102c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,228.66,16,172,16,102A62.07,62.07,0,0,1,78,40c20.65,0,38.73,8.88,50,23.89C139.27,48.88,157.35,40,178,40A62.07,62.07,0,0,1,240,102Z" />
          </svg>
        </button>

        {/* View mode toggle */}
        <button
          data-topbar-index={TOPBAR_INDEX_VIEW_MODE}
          onClick={handleCycleViewMode}
          className={`topbar-icon-btn p-2.5 ${focusRingClass(
            TOPBAR_INDEX_VIEW_MODE
          )}`}
          title={`View: ${viewMode === "grid" ? "Grid" : viewMode === "list" ? "List" : "Compact"}`}
        >
          {viewMode === "list" ? (
            /* List icon */
            <svg className="h-5 w-5" viewBox="0 0 256 256" fill="url(#icon-gradient)">
              <path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM40,72H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16ZM216,184H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z" />
            </svg>
          ) : viewMode === "compact" ? (
            /* Compact grid icon */
            <svg className="h-5 w-5" viewBox="0 0 256 256" fill="url(#icon-gradient)">
              <path d="M64,28H40A12,12,0,0,0,28,40V64A12,12,0,0,0,40,76H64A12,12,0,0,0,76,64V40A12,12,0,0,0,64,28Zm0,92H40a12,12,0,0,0-12,12v24a12,12,0,0,0,12,12H64a12,12,0,0,0,12-12V132A12,12,0,0,0,64,120Zm0,92H40a12,12,0,0,0-12,12v24a12,12,0,0,0,12,12H64a12,12,0,0,0,12-12V224A12,12,0,0,0,64,212ZM152,28H128a12,12,0,0,0-12,12V64a12,12,0,0,0,12,12h24a12,12,0,0,0,12-12V40A12,12,0,0,0,152,28Zm0,92H128a12,12,0,0,0-12,12v24a12,12,0,0,0,12,12h24a12,12,0,0,0,12-12V132A12,12,0,0,0,152,120Zm0,92H128a12,12,0,0,0-12,12v24a12,12,0,0,0,12,12h24a12,12,0,0,0,12-12V224A12,12,0,0,0,152,212ZM240,28H216a12,12,0,0,0-12,12V64a12,12,0,0,0,12,12h24a12,12,0,0,0,12-12V40A12,12,0,0,0,240,28Zm0,92H216a12,12,0,0,0-12,12v24a12,12,0,0,0,12,12h24a12,12,0,0,0,12-12V132A12,12,0,0,0,240,120Zm0,92H216a12,12,0,0,0-12,12v24a12,12,0,0,0,12,12h24a12,12,0,0,0,12-12V224A12,12,0,0,0,240,212Z" />
            </svg>
          ) : (
            /* Grid icon (default) */
            <svg className="h-5 w-5" viewBox="0 0 256 256" fill="url(#icon-gradient)">
              <path d="M104,40H56A16,16,0,0,0,40,56v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,104,40Zm0,64H56V56h48ZM200,40H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,64H152V56h48ZM104,136H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm0,64H56V152h48ZM200,136H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Zm0,64H152V152h48Z" />
            </svg>
          )}
        </button>

        {/* Collections — opens the manager modal (manual + smart) */}
        <button
          data-topbar-index={TOPBAR_INDEX_COLLECTIONS}
          onClick={() => setCollectionsModalOpen(true)}
          className={`topbar-icon-btn p-2.5 ${focusRingClass(
            TOPBAR_INDEX_COLLECTIONS
          )}`}
          title="Colecciones"
        >
          <svg className="h-5 w-5" viewBox="0 0 256 256" fill="url(#icon-gradient)">
            <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A13.39,13.39,0,0,0,37.38,214H216.89A15.13,15.13,0,0,0,232,198.89V88A16,16,0,0,0,216,72ZM40,56H92.69l16,16H40ZM216,198H40V88H216Z" />
          </svg>
        </button>

        {/* User profile — temporarily disabled */}
        {/* <button
          data-topbar-index={TOPBAR_INDEX_PROFILE}
          className={`topbar-icon-btn p-2.5 ${focusRingClass(
            TOPBAR_INDEX_PROFILE
          )}`}
          title="Profile"
        >
          <svg className="h-5 w-5" viewBox="0 0 256 256" fill="url(#icon-gradient)">
            <path d="M230.93,220a8,8,0,0,1-6.93,4H32a8,8,0,0,1-6.92-12c15.23-26.33,38.7-45.21,66.09-54.16a72,72,0,1,1,73.66,0c27.39,8.95,50.86,27.83,66.09,54.16A8,8,0,0,1,230.93,220Z" />
          </svg>
        </button> */}

        {/* Settings */}
        <button
          data-topbar-index={TOPBAR_INDEX_SETTINGS}
          onClick={() => setCurrentView("settings")}
          className={`topbar-icon-btn p-2.5 ${focusRingClass(
            TOPBAR_INDEX_SETTINGS
          )}`}
          title="Settings"
        >
          <svg className="h-5 w-5" viewBox="0 0 256 256" fill="url(#icon-gradient)">
            <path d="M237.94,107.21a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A111.92,111.92,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.63a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
