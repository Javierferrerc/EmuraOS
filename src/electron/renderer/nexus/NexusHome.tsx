/**
 * NexusHome — the main content area. Two layouts (design "tweakables"):
 *   - "hero": featured banner + horizontal carousels
 *   - "grid": full responsive grid, optionally topped by a "Continuar" hero
 *     that highlights the most recent in-progress game (the configured default)
 *
 * Keyboard navigation is a 2D focus model ({row, col}) over the visible cards.
 * Per the handoff we DON'T use scrollIntoView — focus auto-scrolls by nudging
 * the scroll container / row track via getBoundingClientRect deltas.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { NexusGame, NexusRow } from "./nexusModel";
import type { NexusLayout } from "./nexusTypes";
import { NexusGameCard } from "./NexusGameCard";
import { NexusHeroBanner } from "./NexusHeroBanner";
import { SparkIcon, GridIcon } from "./NexusIcons";

interface NexusHomeProps {
  rows: NexusRow[];
  gridGames: NexusGame[];
  hero: NexusGame | null;
  heroContinue: boolean;
  continueHero: NexusGame | null;
  layout: NexusLayout;
  platformLabel: string;
  active: boolean;
  isFavorite: (game: NexusGame) => boolean;
  onOpen: (game: NexusGame) => void;
  onLaunch: (game: NexusGame) => void;
  onToggleFavorite: (game: NexusGame) => void;
}

const GRID_MIN = 168;
const GRID_GAP = 18;

export function NexusHome({
  rows,
  gridGames,
  hero,
  heroContinue,
  continueHero,
  layout,
  platformLabel,
  active,
  isFavorite,
  onOpen,
  onLaunch,
  onToggleFavorite,
}: NexusHomeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [focus, setFocus] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [cols, setCols] = useState(1);

  // In the grid layout the "Continuar" hero (when present) occupies nav row 0.
  const gridHeroOffset = layout === "grid" && continueHero ? 1 : 0;

  // Measure grid columns from the container width (matches the CSS minmax).
  useLayoutEffect(() => {
    if (layout !== "grid") return;
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setCols(Math.max(1, Math.floor((w + GRID_GAP) / (GRID_MIN + GRID_GAP))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout]);

  // Build the 2D focusable matrix.
  const navRows: NexusGame[][] = useMemo(() => {
    if (layout === "grid") {
      const out: NexusGame[][] = [];
      if (continueHero) out.push([continueHero]);
      for (let i = 0; i < gridGames.length; i += cols) {
        out.push(gridGames.slice(i, i + cols));
      }
      return out;
    }
    const out: NexusGame[][] = [];
    if (hero) out.push([hero]);
    for (const row of rows) out.push(row.games);
    return out;
  }, [layout, gridGames, cols, hero, rows, continueHero]);

  // Reset focus when the matrix shape changes (platform/layout switch).
  useEffect(() => {
    setFocus({ r: 0, c: 0 });
    scrollRef.current?.scrollTo({ top: 0 });
  }, [platformLabel, layout]);

  const focusedGame = navRows[focus.r]?.[focus.c] ?? null;

  // Auto-scroll the focused card into view without scrollIntoView. Cards are
  // keyed by their matrix coordinate (a game can appear in several rows, so a
  // plain game key would be ambiguous).
  useEffect(() => {
    if (!focusedGame) return;
    const el = cardRefs.current.get(`${focus.r}:${focus.c}`);
    const scroller = scrollRef.current;
    if (!el || !scroller) return;
    const margin = 28;
    const sRect = scroller.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    if (eRect.top < sRect.top + margin) {
      scroller.scrollTop -= sRect.top + margin - eRect.top;
    } else if (eRect.bottom > sRect.bottom - margin) {
      scroller.scrollTop += eRect.bottom - (sRect.bottom - margin);
    }
    // Horizontal nudge within a carousel track (hero layout only).
    const track = el.closest(".nx-row-track") as HTMLElement | null;
    if (track) {
      const tRect = track.getBoundingClientRect();
      if (eRect.left < tRect.left + margin) {
        track.scrollLeft -= tRect.left + margin - eRect.left;
      } else if (eRect.right > tRect.right - margin) {
        track.scrollLeft += eRect.right - (tRect.right - margin);
      }
    }
  }, [focusedGame, focus.r, focus.c]);

  // Keyboard 2D navigation.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const rowsLen = navRows.length;
      if (rowsLen === 0) return;
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          setFocus((f) => {
            const len = navRows[f.r]?.length ?? 1;
            return { r: f.r, c: Math.min(len - 1, f.c + 1) };
          });
          break;
        case "ArrowLeft":
          e.preventDefault();
          setFocus((f) => ({ r: f.r, c: Math.max(0, f.c - 1) }));
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocus((f) => {
            const r = Math.min(rowsLen - 1, f.r + 1);
            const len = navRows[r]?.length ?? 1;
            return { r, c: Math.min(f.c, len - 1) };
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocus((f) => {
            const r = Math.max(0, f.r - 1);
            const len = navRows[r]?.length ?? 1;
            return { r, c: Math.min(f.c, len - 1) };
          });
          break;
        case "Enter":
          e.preventDefault();
          if (focusedGame) onOpen(focusedGame);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, navRows, focusedGame, onOpen]);

  const registerRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(key, el);
    else cardRefs.current.delete(key);
  }, []);

  const isFocused = (r: number, c: number) => focus.r === r && focus.c === c;

  // ── Empty state ──────────────────────────────────────────────────
  const emptyHero = layout === "hero" && !hero;
  const emptyGrid = layout === "grid" && gridGames.length === 0;
  if (navRows.length === 0 || emptyHero || emptyGrid) {
    return (
      <div className="nx-scroll" ref={scrollRef}>
        <div className="nx-root-empty">
          <SparkIcon size={28} />
          <div>No hay juegos en {platformLabel.toLowerCase()}.</div>
        </div>
      </div>
    );
  }

  // ── Grid layout (optionally topped by the "Continuar" hero) ──────
  if (layout === "grid") {
    return (
      <div className="nx-scroll" ref={scrollRef}>
        <div className="nx-home">
          {continueHero && (
            <NexusHeroBanner
              ref={(el) => registerRef("0:0", el)}
              game={continueHero}
              focused={isFocused(0, 0)}
              continueMode
              onOpen={onOpen}
              onLaunch={onLaunch}
              onHover={() => setFocus({ r: 0, c: 0 })}
            />
          )}
          <div className="nx-grid-wrap">
            <div className="nx-grid-head">
              <span className="nx-row-glyph">
                <GridIcon size={18} />
              </span>
              <h3 className="nx-row-title">{platformLabel}</h3>
              <span className="nx-row-count">{gridGames.length}</span>
            </div>
            <div className="nx-game-grid" ref={gridRef}>
              {gridGames.map((g, i) => {
                const r = gridHeroOffset + Math.floor(i / cols);
                const c = i % cols;
                return (
                  <NexusGameCard
                    key={g.key}
                    ref={(el) => registerRef(`${r}:${c}`, el)}
                    game={g}
                    showFooter
                    focused={isFocused(r, c)}
                    isFavorite={isFavorite(g)}
                    onOpen={onOpen}
                    onLaunch={onLaunch}
                    onToggleFavorite={onToggleFavorite}
                    onHover={() => setFocus({ r, c })}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Hero layout ──────────────────────────────────────────────────
  return (
    <div className="nx-scroll" ref={scrollRef}>
      <div className="nx-home">
        {hero && (
          <NexusHeroBanner
            ref={(el) => registerRef("0:0", el)}
            game={hero}
            focused={isFocused(0, 0)}
            continueMode={heroContinue}
            onOpen={onOpen}
            onLaunch={onLaunch}
            onHover={() => setFocus({ r: 0, c: 0 })}
          />
        )}

        <div className="nx-rows">
          {rows.map((row, ri) => {
            const navR = hero ? ri + 1 : ri;
            return (
              <div className="nx-row" key={row.id}>
                <div className="nx-row-head">
                  <span className="nx-row-glyph">
                    <SparkIcon size={16} />
                  </span>
                  <h3 className="nx-row-title">{row.title}</h3>
                  <span className="nx-row-count">{row.games.length}</span>
                </div>
                <div className="nx-row-track">
                  {row.games.map((g, ci) => (
                    <NexusGameCard
                      key={g.key}
                      ref={(el) => registerRef(`${navR}:${ci}`, el)}
                      game={g}
                      focused={isFocused(navR, ci)}
                      isFavorite={isFavorite(g)}
                      onOpen={onOpen}
                      onLaunch={onLaunch}
                      onToggleFavorite={onToggleFavorite}
                      onHover={() => setFocus({ r: navR, c: ci })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
