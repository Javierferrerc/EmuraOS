/**
 * NexusSidebar — the lateral platform rail (family → console hierarchy). Ported
 * from the updated design's grouped SidebarNav: "Biblioteca" (all) on top, then
 * each manufacturer as a header (dot + name + count) with its consoles below
 * (colour dot + name + year). Footer keeps the layout toggle + switch-to-rail.
 */

import type { NexusFamily } from "./nexusPlatforms";
import { ALL_PLATFORM } from "./nexusPlatforms";
import { LibraryIcon, SearchIcon } from "./NexusIcons";

interface NexusSidebarProps {
  families: NexusFamily[];
  activePlatform: string;
  navFocused?: boolean;
  onSelect: (platformId: string) => void;
  onOpenSearch: () => void;
}

export function NexusSidebar({
  families,
  activePlatform,
  navFocused,
  onSelect,
  onOpenSearch,
}: NexusSidebarProps) {
  const focusCls = (id: string) => (activePlatform === id && navFocused ? " nav-focused" : "");
  const allActive = activePlatform === ALL_PLATFORM;

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

      <div className="nx-sb-scroll">
        <button
          className={`nx-sb-item all${allActive ? " active" : ""}${focusCls(ALL_PLATFORM)}`}
          style={{ ["--tint" as string]: "#9aa6c0" }}
          onClick={() => onSelect(ALL_PLATFORM)}
        >
          {allActive && <span className="nx-sb-bar" />}
          <span className="nx-sb-glyph">
            <LibraryIcon size={20} />
          </span>
          <span className="nx-sb-name">Biblioteca</span>
        </button>

        {families.map((fam) => {
          const famActive = activePlatform === fam.id;
          return (
            <div className="nx-sb-group" key={fam.id}>
              <button
                className={`nx-sb-fam${famActive ? " active" : ""}${focusCls(fam.id)}`}
                style={{ ["--tint" as string]: fam.tint }}
                onClick={() => onSelect(fam.id)}
                title={`Ver todo ${fam.name}`}
              >
                <span className="nx-sb-fam-dot" style={{ background: fam.tint }} />
                <span className="nx-sb-fam-name">{fam.name}</span>
                <span className="nx-sb-fam-count">{fam.systems.length}</span>
              </button>
              <div className="nx-sb-systems">
                {fam.systems.map((sys) => {
                  const active = activePlatform === sys.id;
                  return (
                    <button
                      key={sys.id}
                      className={`nx-sb-item${active ? " active" : ""}${focusCls(sys.id)}`}
                      style={{ ["--tint" as string]: sys.tint }}
                      onClick={() => onSelect(sys.id)}
                    >
                      {active && <span className="nx-sb-bar" />}
                      <span className="nx-sb-dot" style={{ background: sys.tint }} />
                      <span className="nx-sb-name">{sys.name}</span>
                      {sys.year && <span className="nx-sb-year">'{String(sys.year).slice(2)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
