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

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { NexusGame, NexusRow } from "./nexusModel";
import type { NexusLayout, NavDir, NexusHomeHandle } from "./nexusTypes";
import { NexusGameCard } from "./NexusGameCard";
import { NexusHeroBanner } from "./NexusHeroBanner";
import { useHorizontalWheel } from "./useHorizontalWheel";
import { SparkIcon, GridIcon } from "./NexusIcons";

/** A carousel row whose vertical wheel scrolls it horizontally. */
function RowTrack({ children }: { children: React.ReactNode }) {
  const ref = useHorizontalWheel<HTMLDivElement>();
  return (
    <div className="nx-row-track" ref={ref}>
      {children}
    </div>
  );
}

interface NexusHomeProps {
  rows: NexusRow[];
  gridGames: NexusGame[];
  hero: NexusGame | null;
  heroContinue: boolean;
  continueHero: NexusGame | null;
  layout: NexusLayout;
  platformLabel: string;
  isFavorite: (game: NexusGame) => boolean;
  onOpen: (game: NexusGame) => void;
  onLaunch: (game: NexusGame) => void;
  onToggleFavorite: (game: NexusGame) => void;
  onImport: () => void;
}

/** "+" tile that opens the importer — appended at the end of the grid / each
 * row and used as the empty-state CTA. Not part of the keyboard focus matrix;
 * keyboard/gamepad users use the top-bar "Importar" button. */
function AddTile({ variant, onImport }: { variant: "grid" | "row" | "cta"; onImport: () => void }) {
  return (
    <button className={`nx-add-tile ${variant}`} onClick={onImport} title="Importar juegos">
      <span className="nx-add-plus">
        <svg viewBox="0 0 24 24" width={variant === "cta" ? 22 : 26} height={variant === "cta" ? 22 : 26} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span className="nx-add-lbl">{variant === "cta" ? "Importar juegos" : "Añadir juegos"}</span>
    </button>
  );
}

const GRID_MIN = 168;
const GRID_GAP = 18;

export const NexusHome = forwardRef<NexusHomeHandle, NexusHomeProps>(function NexusHome(
  {
    rows,
    gridGames,
    hero,
    heroContinue,
    continueHero,
    layout,
    platformLabel,
    isFavorite,
    onOpen,
    onLaunch,
    onToggleFavorite,
    onImport,
  },
  ref
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [focus, setFocus] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [cols, setCols] = useState(1);
  // Tracks what moved the focus: keyboard/gamepad nav auto-scrolls the focused
  // card into view; plain mouse hover must NOT (it makes the page jump). Default
  // "key" so the initial/reset focus still behaves.
  const focusSrc = useRef<"key" | "mouse">("key");
  const focusByHover = useCallback((r: number, c: number) => {
    focusSrc.current = "mouse";
    setFocus({ r, c });
  }, []);

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
    // Only keyboard/gamepad navigation auto-scrolls; mouse hover must not move
    // the page (it caused partially-visible cards to jump fully into view).
    if (focusSrc.current !== "key") return;
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

  // Latest focus + matrix in refs so the imperative handle (driven by the
  // shell's unified keyboard/gamepad dispatcher) always reads current values
  // without being recreated on every move.
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const navRowsRef = useRef(navRows);
  navRowsRef.current = navRows;

  useImperativeHandle(ref, (): NexusHomeHandle => ({
    handleAction(dir: NavDir) {
      const f = focusRef.current;
      const nr = navRowsRef.current;
      focusSrc.current = "key";
      if (nr.length === 0) {
        // Nothing focusable — still let the user escape back to the rail.
        if (dir === "up") return "escape-up";
        if (dir === "left") return "escape-left";
        return "ok";
      }
      const g = nr[f.r]?.[f.c] ?? null;
      switch (dir) {
        case "activate":
          if (g) onOpen(g);
          return "ok";
        case "favorite":
          if (g) onToggleFavorite(g);
          return "ok";
        case "left":
          if (f.c === 0) return "escape-left";
          setFocus({ r: f.r, c: f.c - 1 });
          return "ok";
        case "right":
          setFocus({ r: f.r, c: Math.min((nr[f.r]?.length ?? 1) - 1, f.c + 1) });
          return "ok";
        case "up": {
          if (f.r === 0) return "escape-up";
          const r = f.r - 1;
          setFocus({ r, c: Math.min(f.c, (nr[r]?.length ?? 1) - 1) });
          return "ok";
        }
        case "down": {
          const r = Math.min(nr.length - 1, f.r + 1);
          setFocus({ r, c: Math.min(f.c, (nr[r]?.length ?? 1) - 1) });
          return "ok";
        }
        default:
          return "ok";
      }
    },
  }));

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
          <AddTile variant="cta" onImport={onImport} />
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
              onHover={() => focusByHover(0, 0)}
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
                    onHover={() => focusByHover(r, c)}
                  />
                );
              })}
              <AddTile variant="grid" onImport={onImport} />
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
                <RowTrack>
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
                      onHover={() => focusByHover(navR, ci)}
                    />
                  ))}
                  <AddTile variant="row" onImport={onImport} />
                </RowTrack>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
