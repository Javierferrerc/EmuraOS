import { useMemo, useCallback } from "react";
import { useApp } from "../context/AppContext";

/**
 * Thin strip shown between the system slider and the grid whenever the user
 * has at least one persistent library filter active in
 * `config.libraryFilters`. Each chip names the filter + its current value
 * and exposes an X button that clears just that one. A bulk "Limpiar todo"
 * appears when two or more filters are active.
 *
 * The filter editing UI itself still lives in Settings → Biblioteca →
 * Filtros — this bar exists purely so users don't end up staring at an
 * empty grid wondering which filter is hiding their library.
 *
 * Default values per filter key (anything else counts as "active"):
 *   genre     "" (empty)
 *   decade    "all"
 *   minRating "0"
 *   players   "all"
 *   hasCover  "all"
 */
type FilterKey = "genre" | "decade" | "minRating" | "players" | "hasCover";

interface ActiveChip {
  key: FilterKey;
  label: string;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function describeFilter(key: FilterKey, value: string): string | null {
  switch (key) {
    case "genre":
      return value ? `Género: ${capitalize(value)}` : null;
    case "decade":
      return value && value !== "all" ? `Década: ${value}` : null;
    case "minRating":
      return value && value !== "0" ? `Rating: ${value}+` : null;
    case "players":
      if (!value || value === "all") return null;
      if (value === "1") return "Jugadores: 1";
      if (value === "2") return "Jugadores: 2";
      if (value === "multi") return "Jugadores: Multi";
      return `Jugadores: ${value}`;
    case "hasCover":
      if (!value || value === "all") return null;
      return value === "yes" ? "Con portada" : "Sin portada";
  }
}

function defaultValueFor(key: FilterKey): string {
  switch (key) {
    case "genre":
      return "";
    case "decade":
    case "players":
    case "hasCover":
      return "all";
    case "minRating":
      return "0";
  }
}

export function ActiveFiltersBar() {
  const { config, updateConfig } = useApp();

  const filters = config?.libraryFilters;

  const activeChips = useMemo<ActiveChip[]>(() => {
    if (!filters) return [];
    const keys: FilterKey[] = [
      "genre",
      "decade",
      "minRating",
      "players",
      "hasCover",
    ];
    const out: ActiveChip[] = [];
    for (const k of keys) {
      const label = describeFilter(k, filters[k] ?? "");
      if (label) out.push({ key: k, label });
    }
    return out;
  }, [filters]);

  const clearOne = useCallback(
    (key: FilterKey) => {
      const existing = config?.libraryFilters ?? {};
      updateConfig({
        libraryFilters: { ...existing, [key]: defaultValueFor(key) },
      });
    },
    [config?.libraryFilters, updateConfig]
  );

  const clearAll = useCallback(() => {
    updateConfig({
      libraryFilters: {
        genre: "",
        decade: "all",
        minRating: "0",
        players: "all",
        hasCover: "all",
      },
    });
  }, [updateConfig]);

  if (activeChips.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-[var(--color-surface-2)]/60 px-6 py-2"
      role="region"
      aria-label="Filtros activos"
    >
      <span className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
        Filtros:
      </span>
      {activeChips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => clearOne(chip.key)}
          className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/15 px-3 py-1 text-xs font-medium text-[var(--color-text-primary)] transition hover:bg-[var(--color-accent)]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          aria-label={`Quitar filtro: ${chip.label}`}
          title={`Quitar filtro: ${chip.label}`}
        >
          <span>{chip.label}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-70 group-hover:opacity-100"
            aria-hidden
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      ))}
      {activeChips.length > 1 && (
        <button
          type="button"
          onClick={clearAll}
          className="ml-1 rounded-full px-2 py-1 text-xs text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text-primary)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Limpiar todo
        </button>
      )}
    </div>
  );
}
