import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import type { DiscoveredRom } from "../../../core/types";
import { fuzzyMatch, substringMatch } from "../utils/fuzzyMatch";
import { useCommandPaletteActions } from "../hooks/useCommandPaletteActions";
import {
  ACTION_GROUP_ORDER,
  type CommandAction,
  type ActionGroup,
} from "../utils/commandPaletteActions";

const MAX_GAMES = 8;
const MAX_ACTIONS_PER_GROUP = 6;
const GROUP_LABEL_GAMES = "Juegos";

/**
 * Render a string with match indices highlighted. Returns an array of
 * React nodes — matched characters are wrapped in <mark> with a neutral
 * class so the palette controls the actual colouring.
 *
 * We build the node list with a linear scan instead of dangerouslySetInnerHTML
 * so React handles escaping for us — names can contain arbitrary characters
 * (apostrophes, ampersands) that would otherwise need manual encoding.
 */
function highlightMatches(text: string, indices: number[]): React.ReactNode {
  if (indices.length === 0) return text;
  const set = new Set(indices);
  const out: React.ReactNode[] = [];
  let runStart = 0;
  let runIsMatch = set.has(0);
  for (let i = 0; i <= text.length; i++) {
    const isMatch = i < text.length && set.has(i);
    if (i === text.length || isMatch !== runIsMatch) {
      const chunk = text.slice(runStart, i);
      if (chunk.length > 0) {
        out.push(
          runIsMatch ? (
            <mark
              key={runStart}
              className="rounded-sm bg-[var(--color-accent)]/30 px-0 text-[var(--color-text-primary)]"
            >
              {chunk}
            </mark>
          ) : (
            <span key={runStart}>{chunk}</span>
          )
        );
      }
      runStart = i;
      runIsMatch = isMatch;
    }
  }
  return out;
}

// Discriminated union so renderer and Enter handler branch by `kind`
// without ever having to null-check a sibling field.
interface GameResult {
  kind: "game";
  id: string;
  rom: DiscoveredRom;
  displayName: string;
  indices: number[];
  score: number;
}
interface ActionResult {
  kind: "action";
  id: string;
  action: CommandAction;
  displayLabel: string;
  indices: number[];
  score: number;
}
type Result = GameResult | ActionResult;

interface Group {
  title: string;
  items: Result[];
}

const SYSTEM_NAMES: Record<string, string> = {
  nes: "NES", snes: "SNES", n64: "N64", gb: "GB", gbc: "GBC", gba: "GBA",
  nds: "NDS", gamecube: "GCN", wii: "Wii", megadrive: "MD",
  mastersystem: "SMS", dreamcast: "DC", psx: "PSX", ps2: "PS2", psp: "PSP",
};

export function QuickLaunch() {
  const {
    scanResult,
    launchGame,
    getMetadataForRom,
    closeQuickLaunch,
    config,
  } = useApp();

  const actions = useCommandPaletteActions();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build flat ROM list once
  const allRoms = useMemo(() => {
    if (!scanResult) return [];
    const roms: DiscoveredRom[] = [];
    for (const sys of scanResult.systems) {
      roms.push(...sys.roms);
    }
    return roms;
  }, [scanResult]);

  const fuzzyEnabled = config?.fuzzySearchEnabled ?? true;

  // Empty query: surface the curated "featured" actions grouped in the
  // "Acciones" section. Makes the palette self-documenting — a new user
  // pressing Ctrl+K immediately sees what's possible.
  const featuredActions = useMemo<Result[]>(
    () =>
      actions
        .filter((a) => a.featured)
        .map((action, i) => ({
          kind: "action",
          id: `featured:${action.id}:${i}`,
          action,
          displayLabel: action.label,
          indices: [],
          score: 0,
        })),
    [actions]
  );

  // Search: fuzzy-match both games and actions. Actions also match their
  // keywords; we pick the best score across label and keywords.
  const groups = useMemo<Group[]>(() => {
    const match = fuzzyEnabled ? fuzzyMatch : substringMatch;
    const trimmed = query.trim();

    if (!trimmed) {
      // Empty query → only the curated actions.
      return featuredActions.length > 0
        ? [{ title: "Acciones sugeridas", items: featuredActions }]
        : [];
    }

    // — Games
    const gameResults: GameResult[] = [];
    for (const rom of allRoms) {
      const meta = getMetadataForRom(rom.systemId, rom.fileName);
      const displayName =
        meta?.title || rom.fileName.replace(/\.[^.]+$/, "");
      const res = match(query, displayName);
      if (res) {
        gameResults.push({
          kind: "game",
          id: `game:${rom.systemId}:${rom.fileName}`,
          rom,
          displayName,
          indices: res.indices,
          score: res.score,
        });
      }
    }
    gameResults.sort((a, b) => b.score - a.score);

    // — Actions (with keyword matching)
    const actionResults: ActionResult[] = [];
    for (const action of actions) {
      const candidates = [action.label, ...(action.keywords ?? [])];
      let best: { score: number; indices: number[] } | null = null;
      let bestText = action.label;
      for (const text of candidates) {
        const res = match(query, text);
        if (res && (!best || res.score > best.score)) {
          best = { score: res.score, indices: res.indices };
          bestText = text;
        }
      }
      if (best) {
        // Indices are into `bestText`. If the winning candidate is a keyword
        // (not the label itself), we render the label verbatim without the
        // highlight — showing the label is more useful than highlighting
        // a keyword the user didn't see.
        const indices = bestText === action.label ? best.indices : [];
        actionResults.push({
          kind: "action",
          id: `action:${action.id}`,
          action,
          displayLabel: action.label,
          indices,
          score: best.score,
        });
      }
    }
    actionResults.sort((a, b) => b.score - a.score);

    // Group output — games first, then action groups in canonical order.
    const out: Group[] = [];
    if (gameResults.length > 0) {
      out.push({
        title: GROUP_LABEL_GAMES,
        items: gameResults.slice(0, MAX_GAMES),
      });
    }
    const byGroup = new Map<ActionGroup, ActionResult[]>();
    for (const r of actionResults) {
      const arr = byGroup.get(r.action.group) ?? [];
      arr.push(r);
      byGroup.set(r.action.group, arr);
    }
    for (const g of ACTION_GROUP_ORDER) {
      const arr = byGroup.get(g);
      if (!arr || arr.length === 0) continue;
      out.push({ title: g, items: arr.slice(0, MAX_ACTIONS_PER_GROUP) });
    }

    return out;
  }, [query, allRoms, getMetadataForRom, fuzzyEnabled, actions, featuredActions]);

  // Flattened list for arrow-key navigation. The index in this array is the
  // single source of truth for which row is highlighted.
  const flatResults = useMemo<Result[]>(
    () => groups.flatMap((g) => g.items),
    [groups]
  );

  // Reset selection when the flattened list changes identity. Using length
  // as the dep is enough — any time items come or go the count changes.
  useEffect(() => {
    setSelectedIndex(0);
  }, [flatResults.length]);

  // Autofocus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeQuickLaunch();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [closeQuickLaunch]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) closeQuickLaunch();
    },
    [closeQuickLaunch]
  );

  const executeResult = useCallback(
    (r: Result) => {
      closeQuickLaunch();
      if (r.kind === "game") {
        launchGame(r.rom);
      } else {
        r.action.run();
      }
    },
    [closeQuickLaunch, launchGame]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = flatResults[selectedIndex];
        if (r) executeResult(r);
      }
    },
    [flatResults, selectedIndex, executeResult]
  );

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-ql-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Cover loader for the games section
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    for (const r of flatResults) {
      if (r.kind !== "game") continue;
      const key = `${r.rom.systemId}:${r.rom.fileName}`;
      if (coverUrls[key]) continue;
      const meta = getMetadataForRom(r.rom.systemId, r.rom.fileName);
      if (!meta?.coverPath) continue;
      window.electronAPI.readCoverDataUrl(meta.coverPath).then((url) => {
        if (!cancelled && url) {
          setCoverUrls((prev) => ({ ...prev, [key]: url }));
        }
      });
    }
    return () => { cancelled = true; };
  }, [flatResults, getMetadataForRom, coverUrls]);

  let runningIndex = 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center pt-[15vh]"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/10 shadow-2xl backdrop-blur-xl"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <svg
            className="h-5 w-5 shrink-0 text-muted"
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
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar juegos y acciones..."
            className="flex-1 bg-transparent text-sm text-primary placeholder-[var(--color-text-muted)] outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-white/20 px-1.5 py-0.5 text-[10px] text-muted">
            ESC
          </kbd>
        </div>

        {/* Grouped results */}
        {groups.length > 0 && (
          <div ref={listRef} className="max-h-96 overflow-y-auto py-1">
            {groups.map((group) => (
              <div key={group.title}>
                <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {group.title}
                </div>
                {group.items.map((r) => {
                  const idx = runningIndex++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <QuickLaunchRow
                      key={r.id}
                      result={r}
                      selected={isSelected}
                      idx={idx}
                      coverUrl={
                        r.kind === "game"
                          ? coverUrls[`${r.rom.systemId}:${r.rom.fileName}`]
                          : undefined
                      }
                      onHover={() => setSelectedIndex(idx)}
                      onPick={() => executeResult(r)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Empty state (query active, no results) */}
        {query.trim() && groups.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted">
            Sin resultados para "{query}"
          </div>
        )}

        {/* Hint when there's no featured actions AND no query — shouldn't
            normally happen, but gives a graceful fallback. */}
        {!query.trim() && groups.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted">
            Escribe para buscar juegos o acciones
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

interface QuickLaunchRowProps {
  result: Result;
  selected: boolean;
  idx: number;
  coverUrl?: string;
  onHover: () => void;
  onPick: () => void;
}

function QuickLaunchRow({
  result,
  selected,
  idx,
  coverUrl,
  onHover,
  onPick,
}: QuickLaunchRowProps) {
  return (
    <button
      data-ql-index={idx}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
        selected ? "bg-white/15" : "hover:bg-white/8"
      }`}
      onClick={onPick}
      onMouseEnter={onHover}
    >
      {/* Left icon / cover */}
      <div className="h-11 w-8 shrink-0 overflow-hidden rounded flex items-center justify-center">
        {result.kind === "game" ? (
          coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white/5 text-xs">
              🎮
            </div>
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/5 text-lg">
            {result.action.icon ?? "•"}
          </div>
        )}
      </div>

      {/* Label + meta */}
      <div className="flex-1 min-w-0">
        {result.kind === "game" ? (
          <>
            <p className="truncate text-sm font-medium text-primary">
              {highlightMatches(result.displayName, result.indices)}
            </p>
          </>
        ) : (
          <p className="truncate text-sm font-medium text-primary">
            {highlightMatches(result.displayLabel, result.indices)}
          </p>
        )}
      </div>

      {/* Right-side chip */}
      {result.kind === "game" ? (
        <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-muted">
          {SYSTEM_NAMES[result.rom.systemId] ?? result.rom.systemId.toUpperCase()}
        </span>
      ) : (
        <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium text-muted">
          {result.action.group}
        </span>
      )}
    </button>
  );
}
