import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import type { SmartCollectionFilter } from "../../../core/types";

/**
 * Form for the filter that backs a smart collection. Shown both when creating
 * a new smart collection (initialFilter empty) and when editing an existing
 * one. The "preview count" computes how many roms the current criteria would
 * match against the live library, so the user can iterate quickly without
 * needing to save and navigate to see the result.
 */

interface Props {
  /** Existing collection to edit, or null when creating fresh. */
  initialName?: string;
  initialFilter?: SmartCollectionFilter;
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (name: string, filter: SmartCollectionFilter) => void;
}

const DECADES = ["all", "2020s", "2010s", "2000s", "1990s", "1980s", "1970s"];

export function SmartCollectionEditorModal({
  initialName = "",
  initialFilter = {},
  mode,
  onClose,
  onSubmit,
}: Props) {
  const { systems, scanResult, getMetadataForRom, favorites, recentlyPlayed } =
    useApp();

  const [name, setName] = useState(initialName);
  const [systemsFilter, setSystemsFilter] = useState<string[]>(
    initialFilter.systems ?? []
  );
  const [genre, setGenre] = useState(initialFilter.genre ?? "");
  const [minRating, setMinRating] = useState<string>(
    initialFilter.minRating !== undefined ? String(initialFilter.minRating) : "0"
  );
  const [decade, setDecade] = useState(initialFilter.decade ?? "all");
  const [onlyFavorites, setOnlyFavorites] = useState(
    !!initialFilter.onlyFavorites
  );
  const [onlyRecent, setOnlyRecent] = useState(!!initialFilter.onlyRecent);
  const [hasCover, setHasCover] = useState<"all" | "yes" | "no">(
    initialFilter.hasCover ?? "all"
  );

  // Genres available across the library — populates the dropdown so the
  // user picks an existing one instead of guessing strings that may not
  // match metadata exactly.
  const availableGenres = useMemo(() => {
    if (!scanResult) return [];
    const set = new Set<string>();
    for (const sys of scanResult.systems) {
      for (const rom of sys.roms) {
        const meta = getMetadataForRom(rom.systemId, rom.fileName);
        if (meta?.genre) {
          for (const g of meta.genre.split(/[,/]/).map((s) => s.trim())) {
            if (g) set.add(g);
          }
        }
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [scanResult, getMetadataForRom]);

  const buildFilter = (): SmartCollectionFilter => ({
    systems: systemsFilter.length > 0 ? systemsFilter : undefined,
    genre: genre || undefined,
    minRating: minRating !== "0" ? Number(minRating) : undefined,
    decade: decade !== "all" ? decade : undefined,
    onlyFavorites: onlyFavorites || undefined,
    onlyRecent: onlyRecent || undefined,
    hasCover: hasCover !== "all" ? hasCover : undefined,
  });

  // Live preview of how many roms match the current draft filter.
  const previewCount = useMemo(() => {
    if (!scanResult) return 0;
    const filter = buildFilter();
    let count = 0;
    const recentSet = new Set(recentlyPlayed);
    for (const sys of scanResult.systems) {
      for (const rom of sys.roms) {
        if (filter.systems && !filter.systems.includes(rom.systemId)) continue;
        const key = `${rom.systemId}:${rom.fileName}`;
        if (filter.onlyFavorites && !favorites.has(key)) continue;
        if (filter.onlyRecent && !recentSet.has(key)) continue;
        const meta = getMetadataForRom(rom.systemId, rom.fileName);
        if (filter.genre) {
          const g = filter.genre.toLowerCase();
          if (!meta?.genre || !meta.genre.toLowerCase().includes(g)) continue;
        }
        if (filter.minRating !== undefined && filter.minRating > 0) {
          const r = parseFloat(meta?.rating ?? "");
          if (!Number.isFinite(r) || r < filter.minRating) continue;
        }
        if (filter.decade) {
          const start = parseInt(filter.decade, 10);
          const year = parseInt(meta?.year ?? "", 10);
          if (!Number.isFinite(year) || year < start || year >= start + 10) continue;
        }
        if (filter.hasCover) {
          const has = !!meta?.coverPath;
          if (filter.hasCover === "yes" && !has) continue;
          if (filter.hasCover === "no" && has) continue;
        }
        count++;
      }
    }
    return count;
  }, [
    scanResult,
    getMetadataForRom,
    favorites,
    recentlyPlayed,
    systemsFilter,
    genre,
    minRating,
    decade,
    onlyFavorites,
    onlyRecent,
    hasCover,
  ]);

  // Esc to cancel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit() {
    if (!name.trim()) return;
    onSubmit(name.trim(), buildFilter());
  }

  function toggleSystem(id: string) {
    setSystemsFilter((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-lg bg-[var(--color-surface-1)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-text-primary)]">
          {mode === "create" ? "Nueva colección inteligente" : "Editar filtro"}
        </h2>

        <div className="mb-4">
          <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
            Nombre
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. RPG de SNES"
            autoFocus
            className="w-full rounded border border-[var(--color-surface-2)] bg-[var(--color-surface-0)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
            Sistemas (vacío = todos)
          </label>
          <div className="flex flex-wrap gap-1">
            {systems.map((s) => {
              const active = systemsFilter.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSystem(s.id)}
                  className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                      : "border-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
              Género
            </label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full rounded border border-[var(--color-surface-2)] bg-[var(--color-surface-0)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">Cualquiera</option>
              {availableGenres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
              Década
            </label>
            <select
              value={decade}
              onChange={(e) => setDecade(e.target.value)}
              className="w-full rounded border border-[var(--color-surface-2)] bg-[var(--color-surface-0)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            >
              {DECADES.map((d) => (
                <option key={d} value={d}>
                  {d === "all" ? "Cualquiera" : d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
              Rating mínimo
            </label>
            <select
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
              className="w-full rounded border border-[var(--color-surface-2)] bg-[var(--color-surface-0)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            >
              <option value="0">Sin filtro</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
              Portada
            </label>
            <select
              value={hasCover}
              onChange={(e) => setHasCover(e.target.value as "all" | "yes" | "no")}
              className="w-full rounded border border-[var(--color-surface-2)] bg-[var(--color-surface-0)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            >
              <option value="all">Cualquiera</option>
              <option value="yes">Solo con portada</option>
              <option value="no">Solo sin portada</option>
            </select>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={onlyFavorites}
              onChange={(e) => setOnlyFavorites(e.target.checked)}
            />
            Solo favoritos
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={onlyRecent}
              onChange={(e) => setOnlyRecent(e.target.checked)}
            />
            Solo recientes
          </label>
        </div>

        <p className="mb-4 text-xs text-[var(--color-text-muted)]">
          Coincidencias actuales:{" "}
          <span className="font-mono text-[var(--color-text-secondary)]">
            {previewCount}
          </span>{" "}
          juego{previewCount === 1 ? "" : "s"}
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-[var(--color-surface-2)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {mode === "create" ? "Crear" : "Guardar"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
