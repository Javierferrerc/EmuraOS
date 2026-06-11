/**
 * NexusSidebar — the 230px platform rail (default PlatformNav variant from the
 * design). "Biblioteca" aggregates everything; each following entry is a real
 * system/group present in the library, tinted with its slider colour. Also
 * hosts the search button and a layout toggle (carruseles ↔ cuadrícula).
 */

import type { SliderItem } from "../utils/sliderItems";
import { LibraryIcon, SearchIcon, LayersIcon, GridIcon, ConsoleIcon } from "./NexusIcons";
import type { NexusLayout } from "./nexusTypes";

interface NexusSidebarProps {
  items: SliderItem[];
  counts: Record<string, number>;
  activePlatform: string;
  onSelect: (platformId: string) => void;
  onOpenSearch: () => void;
  layout: NexusLayout;
  onLayoutChange: (layout: NexusLayout) => void;
  onToggleNav: () => void;
}

function platformIdOf(item: SliderItem): string {
  return item.systemId ?? "all";
}

export function NexusSidebar({
  items,
  counts,
  activePlatform,
  onSelect,
  onOpenSearch,
  layout,
  onLayoutChange,
  onToggleNav,
}: NexusSidebarProps) {
  return (
    <nav className="nx-sidebar">
      <div className="nx-brand">
        <span className="nx-brand-mark">
          <span className="nx-brand-dot" />
        </span>
        <span className="nx-brand-name">NEXUS</span>
      </div>

      <button className="nx-search-btn" onClick={onOpenSearch}>
        <SearchIcon size={16} />
        <span>Buscar juegos</span>
        <kbd>/</kbd>
      </button>

      <div className="nx-sb-label">Plataformas</div>
      <div className="nx-sb-list">
        {items.map((item) => {
          const id = platformIdOf(item);
          const active = id === activePlatform;
          const isAll = item.systemId === null;
          return (
            <button
              key={item.key}
              className={`nx-sb-item${active ? " active" : ""}`}
              style={{ ["--tint" as string]: item.iconColor }}
              onClick={() => onSelect(id)}
            >
              {active && <span className="nx-sb-bar" />}
              <span className="nx-sb-glyph">
                {isAll || !item.icon ? (
                  <LibraryIcon size={20} />
                ) : (
                  <img src={item.icon} alt="" />
                )}
              </span>
              <span className="nx-sb-name">{item.label}</span>
              <span className="nx-sb-count">{counts[id] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="nx-sb-spacer" />

      <div className="nx-sb-foot">
        <div className="nx-sb-label">Vista</div>
        <button
          className={`nx-sb-item${layout === "hero" ? " active" : ""}`}
          style={{ ["--tint" as string]: "var(--accent)" }}
          onClick={() => onLayoutChange("hero")}
        >
          <span className="nx-sb-glyph">
            <LayersIcon size={20} />
          </span>
          <span className="nx-sb-name">Destacado</span>
        </button>
        <button
          className={`nx-sb-item${layout === "grid" ? " active" : ""}`}
          style={{ ["--tint" as string]: "var(--accent)" }}
          onClick={() => onLayoutChange("grid")}
        >
          <span className="nx-sb-glyph">
            <GridIcon size={20} />
          </span>
          <span className="nx-sb-name">Cuadrícula</span>
        </button>
        <button
          className="nx-sb-item"
          style={{ ["--tint" as string]: "var(--accent)" }}
          onClick={onToggleNav}
          title="Cambiar a selector tipo consola"
        >
          <span className="nx-sb-glyph">
            <ConsoleIcon size={20} />
          </span>
          <span className="nx-sb-name">Modo consola</span>
        </button>
      </div>
    </nav>
  );
}
