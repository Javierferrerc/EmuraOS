import { useState, useEffect, useRef } from "react";
import { useApp, type ActiveFilter } from "../context/AppContext";
import { buildSidebarItems } from "../utils/sidebarItems";

const MANUFACTURER_COLORS: Record<string, string> = {
  Nintendo: "bg-red-600",
  Sega: "bg-blue-600",
  Sony: "bg-blue-800",
};

interface SidebarProps {
  focusedIndex?: number;
  focusActive?: boolean;
}

export function Sidebar({ focusedIndex = -1, focusActive = false }: SidebarProps) {
  const {
    scanResult,
    systems,
    activeFilter,
    setActiveFilter,
    favorites,
    collections,
    recentlyPlayed,
    createCollection,
    renameCollection,
    deleteCollection,
  } = useApp();

  const [hoverCollectionId, setHoverCollectionId] = useState<string | null>(
    null
  );
  const navRef = useRef<HTMLDivElement>(null);

  const systemCounts = new Map<string, number>();
  if (scanResult) {
    for (const sys of scanResult.systems) {
      systemCounts.set(sys.systemId, sys.roms.length);
    }
  }

  const systemsWithRoms = systems.filter((s) => systemCounts.has(s.id));
  const sidebarItems = buildSidebarItems(collections, systemsWithRoms);

  // Scroll focused sidebar item into view
  useEffect(() => {
    if (focusedIndex < 0 || !focusActive) return;
    const el = navRef.current?.querySelector(
      `[data-sidebar-index="${focusedIndex}"]`
    );
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedIndex, focusActive]);

  function isActive(filter: ActiveFilter): boolean {
    if (filter.type !== activeFilter.type) return false;
    if (filter.type === "system" && activeFilter.type === "system")
      return filter.systemId === activeFilter.systemId;
    if (filter.type === "collection" && activeFilter.type === "collection")
      return filter.collectionId === activeFilter.collectionId;
    return true;
  }

  function handleNewCollection() {
    const name = window.prompt("Collection name:");
    if (name?.trim()) {
      createCollection(name.trim());
    }
  }

  function handleRenameCollection(id: string, currentName: string) {
    const name = window.prompt("Rename collection:", currentName);
    if (name?.trim() && name.trim() !== currentName) {
      renameCollection(id, name.trim());
    }
  }

  function handleDeleteCollection(id: string, name: string) {
    if (window.confirm(`Delete collection "${name}"?`)) {
      deleteCollection(id);
    }
  }

  function btnClass(filter: ActiveFilter, itemIndex: number): string {
    const activeClass = isActive(filter) ? "bg-gray-700 text-white" : "text-gray-300";
    const focusRing =
      focusActive && focusedIndex === itemIndex
        ? "ring-2 ring-blue-500 ring-inset"
        : "";
    return `flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-gray-700 ${activeClass} ${focusRing}`;
  }

  // Map each sidebar item to its rendering
  let itemIdx = 0;

  function nextIndex() {
    return itemIdx++;
  }

  // Reset for render
  itemIdx = 0;

  return (
    <aside ref={navRef} className="flex w-56 flex-col border-r border-gray-700 bg-gray-800">
      {/* Library section */}
      <div className="p-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Library
      </div>
      <nav>
        {/* Favorites */}
        {(() => {
          const idx = nextIndex();
          return (
            <button
              data-sidebar-index={idx}
              onClick={() => setActiveFilter({ type: "favorites" })}
              className={btnClass({ type: "favorites" }, idx)}
            >
              <span className="flex items-center gap-2">
                <span className="text-yellow-400">&#9733;</span> Favorites
              </span>
              <span className="rounded-full bg-gray-600 px-2 py-0.5 text-xs">
                {favorites.size}
              </span>
            </button>
          );
        })()}

        {/* Recently Played */}
        {(() => {
          const idx = nextIndex();
          return (
            <button
              data-sidebar-index={idx}
              onClick={() => setActiveFilter({ type: "recent" })}
              className={btnClass({ type: "recent" }, idx)}
            >
              <span className="flex items-center gap-2">
                <span className="text-blue-400">&#9719;</span> Recently Played
              </span>
              <span className="rounded-full bg-gray-600 px-2 py-0.5 text-xs">
                {recentlyPlayed.length}
              </span>
            </button>
          );
        })()}

        {/* Collections */}
        {collections.map((col) => {
          const idx = nextIndex();
          return (
            <button
              key={col.id}
              data-sidebar-index={idx}
              onClick={() =>
                setActiveFilter({ type: "collection", collectionId: col.id })
              }
              onMouseEnter={() => setHoverCollectionId(col.id)}
              onMouseLeave={() => setHoverCollectionId(null)}
              className={btnClass(
                { type: "collection", collectionId: col.id },
                idx
              )}
            >
              <span className="flex items-center gap-2 truncate">
                <span className="text-gray-400">&#9656;</span>
                <span className="truncate">{col.name}</span>
              </span>
              <span className="flex items-center gap-1">
                {hoverCollectionId === col.id && (
                  <>
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameCollection(col.id, col.name);
                      }}
                      className="rounded px-1 text-xs text-gray-400 hover:bg-gray-600 hover:text-white"
                      title="Rename"
                    >
                      &#9998;
                    </span>
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCollection(col.id, col.name);
                      }}
                      className="rounded px-1 text-xs text-gray-400 hover:bg-red-600 hover:text-white"
                      title="Delete"
                    >
                      &#10005;
                    </span>
                  </>
                )}
                <span className="rounded-full bg-gray-600 px-2 py-0.5 text-xs">
                  {col.roms.length}
                </span>
              </span>
            </button>
          );
        })}

        <button
          onClick={handleNewCollection}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-300"
        >
          <span>+</span> New Collection...
        </button>
      </nav>

      {/* Systems section */}
      <div className="mt-2 p-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Systems
      </div>
      <nav className="flex-1 overflow-y-auto">
        {/* All Systems */}
        {(() => {
          const idx = nextIndex();
          return (
            <button
              data-sidebar-index={idx}
              onClick={() => setActiveFilter({ type: "all" })}
              className={btnClass({ type: "all" }, idx)}
            >
              <span>All Systems</span>
              <span className="rounded-full bg-gray-600 px-2 py-0.5 text-xs">
                {scanResult?.totalRoms ?? 0}
              </span>
            </button>
          );
        })()}

        {/* Individual systems */}
        {systemsWithRoms.map((system) => {
          const idx = nextIndex();
          const count = systemCounts.get(system.id) ?? 0;
          const colorClass =
            MANUFACTURER_COLORS[system.manufacturer] ?? "bg-gray-600";

          return (
            <button
              key={system.id}
              data-sidebar-index={idx}
              onClick={() =>
                setActiveFilter({ type: "system", systemId: system.id })
              }
              className={btnClass(
                { type: "system", systemId: system.id },
                idx
              )}
            >
              <span className="truncate">{system.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs text-white ${colorClass}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
