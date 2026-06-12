/**
 * NexusRailNav — the "rail" platform selector: a horizontal strip with family
 * (manufacturer) separators and a chip per console. Ported from the updated
 * design's RailNav. Edge arrows + auto-centring of the active node; a vertical
 * wheel scrolls it horizontally. The right cluster keeps the layout toggle,
 * search and the switch-to-sidebar control.
 */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { NexusFamily } from "./nexusPlatforms";
import { ALL_PLATFORM } from "./nexusPlatforms";
import { useHorizontalWheel } from "./useHorizontalWheel";
import { LibraryIcon } from "./NexusIcons";

interface NexusRailNavProps {
  families: NexusFamily[];
  activePlatform: string;
  navFocused?: boolean;
  onSelect: (platformId: string) => void;
}

export function NexusRailNav({ families, activePlatform, navFocused, onSelect }: NexusRailNavProps) {
  const trackRef = useHorizontalWheel<HTMLDivElement>();
  const activeRef = useRef<HTMLButtonElement>(null);
  const [edges, setEdges] = useState({ l: false, r: true });

  const updateEdges = useCallback(() => {
    const t = trackRef.current;
    if (!t) return;
    setEdges({ l: t.scrollLeft > 4, r: t.scrollLeft + t.clientWidth < t.scrollWidth - 4 });
  }, [trackRef]);

  useEffect(() => {
    updateEdges();
  }, [updateEdges, families]);

  // Centre the active node when the selection changes.
  useEffect(() => {
    const t = trackRef.current;
    const el = activeRef.current;
    if (!t || !el) return;
    const target = el.offsetLeft - t.clientWidth / 2 + el.clientWidth / 2;
    t.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    const id = window.setTimeout(updateEdges, 360);
    return () => window.clearTimeout(id);
  }, [activePlatform, updateEdges, trackRef]);

  const nudge = (dir: number) => {
    const t = trackRef.current;
    if (t) t.scrollBy({ left: dir * t.clientWidth * 0.7, behavior: "smooth" });
  };

  const allActive = activePlatform === ALL_PLATFORM;

  return (
    <div className="nx-rail">
      <div className="nx-rail-wrap">
        <button
          className={`nx-rail-arrow left${edges.l ? " show" : ""}`}
          onClick={() => nudge(-1)}
          aria-label="Anterior"
        >
          ‹
        </button>
        <div className="nx-rail-track" ref={trackRef} onScroll={updateEdges}>
          {/* All */}
          <button
            ref={allActive ? activeRef : undefined}
            className={`nx-rail-chip all${allActive ? " active" : ""}${
              allActive && navFocused ? " nav-focused" : ""
            }`}
            style={{ ["--tint" as string]: "#9aa6c0" }}
            onClick={() => onSelect(ALL_PLATFORM)}
          >
            <span className="nx-rail-glow" />
            <span className="nx-rail-glyph">
              <LibraryIcon size={20} />
            </span>
            <span className="nx-rail-txt">
              <span className="nx-rail-name">Biblioteca</span>
            </span>
          </button>

          {families.map((fam) => {
            const famActive = activePlatform === fam.id;
            return (
              <Fragment key={fam.id}>
                <button
                  ref={famActive ? activeRef : undefined}
                  className={`nx-rail-fam${famActive ? " active" : ""}${
                    famActive && navFocused ? " nav-focused" : ""
                  }`}
                  style={{ ["--tint" as string]: fam.tint }}
                  onClick={() => onSelect(fam.id)}
                  title={`Ver todo ${fam.name}`}
                >
                  <span className="nx-rail-fam-dot" style={{ background: fam.tint }} />
                  <span>{fam.name}</span>
                </button>
                {fam.systems.map((sys) => {
                  const active = activePlatform === sys.id;
                  return (
                    <button
                      key={sys.id}
                      ref={active ? activeRef : undefined}
                      className={`nx-rail-chip${active ? " active" : ""}${
                        active && navFocused ? " nav-focused" : ""
                      }`}
                      style={{ ["--tint" as string]: sys.tint }}
                      onClick={() => onSelect(sys.id)}
                    >
                      <span className="nx-rail-glow" />
                      <span className="nx-rail-glyph">
                        {sys.icon ? <img src={sys.icon} alt="" /> : <LibraryIcon size={19} />}
                      </span>
                      <span className="nx-rail-txt">
                        <span className="nx-rail-name">{sys.name}</span>
                        {sys.year && <span className="nx-rail-sub">{sys.year}</span>}
                      </span>
                    </button>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
        <button
          className={`nx-rail-arrow right${edges.r ? " show" : ""}`}
          onClick={() => nudge(1)}
          aria-label="Siguiente"
        >
          ›
        </button>
      </div>
    </div>
  );
}
