import { useState, useEffect, useRef, useCallback } from "react";
import { useApp, type ActiveFilter } from "../context/AppContext";
import "./TopBar.css";

export function TopBar() {
  const { searchQuery, setSearchQuery, setCurrentView, activeFilter, setActiveFilter } = useApp();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <header className="flex items-center gap-4 px-5 py-3">
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
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 font-bold text-white text-sm">
        RL
      </div>

      {/* Search */}
      <div className="topbar-search relative flex-1 max-w-md mx-auto">
        <input
          type="text"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search ROMs..."
          className="w-full bg-transparent px-4 py-2 pl-9 text-sm text-gray-100 placeholder-gray-500 outline-none"
        />
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
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
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            ✕
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {/* Favorites toggle */}
        <button
          onClick={handleToggleFavorites}
          className="topbar-icon-btn p-2.5"
          title={isFavoritesActive ? "Show all" : "Show favorites"}
        >
          <svg className="h-5 w-5" viewBox="0 0 256 256" fill="url(#icon-gradient)">
            <path d="M240,102c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,228.66,16,172,16,102A62.07,62.07,0,0,1,78,40c20.65,0,38.73,8.88,50,23.89C139.27,48.88,157.35,40,178,40A62.07,62.07,0,0,1,240,102Z" />
          </svg>
        </button>

        {/* User profile */}
        <button
          className="topbar-icon-btn p-2.5"
          title="Profile"
        >
          <svg className="h-5 w-5" viewBox="0 0 256 256" fill="url(#icon-gradient)">
            <path d="M230.93,220a8,8,0,0,1-6.93,4H32a8,8,0,0,1-6.92-12c15.23-26.33,38.7-45.21,66.09-54.16a72,72,0,1,1,73.66,0c27.39,8.95,50.86,27.83,66.09,54.16A8,8,0,0,1,230.93,220Z" />
          </svg>
        </button>

        {/* Settings */}
        <button
          onClick={() => setCurrentView("settings")}
          className="topbar-icon-btn p-2.5"
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
