/**
 * NexusSwitchNav — the "Consola" platform selector: a horizontal carousel of
 * platform cards. The active card expands (flex:1), lights up with its tint and
 * shows a tagline. Ported from the design's PlatformNav "switch" variant. The
 * right cluster carries the layout toggle (Destacado | Cuadrícula), a search
 * button and a toggle back to the sidebar nav.
 */

import type { SliderItem } from "../utils/sliderItems";
import { taglineForSystem } from "./nexusModel";
import type { NexusLayout } from "./nexusTypes";
import { LibraryIcon, SearchIcon, LayersIcon, GridIcon, SidebarIcon } from "./NexusIcons";

interface NexusSwitchNavProps {
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

export function NexusSwitchNav({
  items,
  counts,
  activePlatform,
  onSelect,
  onOpenSearch,
  layout,
  onLayoutChange,
  onToggleNav,
}: NexusSwitchNavProps) {
  return (
    <div className="nx-switch">
      <div className="nx-switch-track">
        {items.map((item) => {
          const id = platformIdOf(item);
          const active = id === activePlatform;
          const isAll = item.systemId === null;
          return (
            <button
              key={item.key}
              className={`nx-switch-card${active ? " active" : ""}`}
              style={{ ["--tint" as string]: item.iconColor }}
              onClick={() => onSelect(id)}
            >
              <span className="nx-switch-glow" />
              <span className="nx-switch-glyph">
                {isAll || !item.icon ? <LibraryIcon size={active ? 30 : 24} /> : <img src={item.icon} alt="" />}
              </span>
              <span className="nx-switch-name">{item.label}</span>
              {active && <span className="nx-switch-tag">{taglineForSystem(item.systemId, counts[id] ?? 0)}</span>}
            </button>
          );
        })}
      </div>

      <div className="nx-switch-actions">
        <div className="nx-seg" role="group" aria-label="Vista de biblioteca">
          <button
            className={`nx-seg-btn${layout === "hero" ? " active" : ""}`}
            onClick={() => onLayoutChange("hero")}
          >
            <LayersIcon size={16} />
            Destacado
          </button>
          <button
            className={`nx-seg-btn${layout === "grid" ? " active" : ""}`}
            onClick={() => onLayoutChange("grid")}
          >
            <GridIcon size={16} />
            Cuadrícula
          </button>
        </div>
        <button className="nx-switch-search" onClick={onOpenSearch} title="Buscar (/)" aria-label="Buscar">
          <SearchIcon size={20} />
        </button>
        <button className="nx-icon-circle" onClick={onToggleNav} title="Cambiar a barra lateral" aria-label="Barra lateral">
          <SidebarIcon size={18} />
        </button>
      </div>
    </div>
  );
}
