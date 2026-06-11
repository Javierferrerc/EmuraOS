/**
 * NexusSearchOverlay — full-screen fuzzy-ish search over the real library.
 * Ported from the design's search-overlay.jsx. Matches title, genre, developer
 * and system name. Esc closes; clicking a result opens its detail panel.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { NexusGame } from "./nexusModel";
import { NexusGameCard } from "./NexusGameCard";
import { SearchIcon } from "./NexusIcons";

interface NexusSearchOverlayProps {
  games: NexusGame[];
  isFavorite: (game: NexusGame) => boolean;
  onClose: () => void;
  onOpen: (game: NexusGame) => void;
  onLaunch: (game: NexusGame) => void;
  onToggleFavorite: (game: NexusGame) => void;
}

export function NexusSearchOverlay({
  games,
  isFavorite,
  onClose,
  onOpen,
  onLaunch,
  onToggleFavorite,
}: NexusSearchOverlayProps) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Genre suggestions drawn from the actual library.
  const suggestions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of games) {
      if (g.genre) counts.set(g.genre, (counts.get(g.genre) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([genre]) => genre);
  }, [games]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return games
      .filter((g) => {
        const hay = `${g.title} ${g.genre} ${g.developer} ${g.systemName}`.toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 60);
  }, [q, games]);

  return (
    <div className="nx-so" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="nx-so-panel">
        <div className="nx-so-bar">
          <SearchIcon size={22} />
          <input
            ref={inputRef}
            className="nx-so-input"
            placeholder="Buscar por título, género, sistema…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="nx-so-close" onClick={onClose}>
            Esc
          </button>
        </div>

        {!q.trim() ? (
          suggestions.length > 0 && (
            <div className="nx-so-sugg">
              {suggestions.map((s) => (
                <button key={s} className="nx-so-chip" onClick={() => setQ(s)}>
                  {s}
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="nx-so-results-head">
            {results.length} resultado{results.length === 1 ? "" : "s"}
          </div>
        )}

        {q.trim() && (
          <div className="nx-so-grid">
            {results.length === 0 ? (
              <div className="nx-so-empty">Sin resultados para “{q}”.</div>
            ) : (
              results.map((g) => (
                <NexusGameCard
                  key={g.key}
                  game={g}
                  showFooter
                  isFavorite={isFavorite(g)}
                  onOpen={(game) => {
                    onClose();
                    onOpen(game);
                  }}
                  onLaunch={onLaunch}
                  onToggleFavorite={onToggleFavorite}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
