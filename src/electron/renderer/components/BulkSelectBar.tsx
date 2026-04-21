import { useApp } from "../context/AppContext";

/**
 * Floating top banner shown while the library is in bulk-select mode. The
 * mode is entered from CollectionsModal ("Añadir juegos…" on a manual
 * collection) and exited either by pressing Cancelar or by committing the
 * batch with Listo. Cards register clicks against `toggleBulkSelectRom`
 * while this is mounted so the launch flow is suppressed.
 */
export function BulkSelectBar() {
  const {
    bulkSelectTarget,
    bulkSelectedRoms,
    exitBulkSelect,
    commitBulkSelect,
  } = useApp();

  if (!bulkSelectTarget) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[80] flex items-center justify-between gap-4 border-b border-[var(--color-accent)]/40 bg-[var(--color-accent)]/15 backdrop-blur-md px-5 py-3">
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          Añadiendo a:{" "}
          <span className="text-[var(--color-accent)]">
            {bulkSelectTarget.collectionName}
          </span>
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {bulkSelectedRoms.size} seleccionado{bulkSelectedRoms.size === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={exitBulkSelect}
          className="rounded border border-[var(--color-surface-2)] bg-[var(--color-surface-1)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
        >
          Cancelar
        </button>
        <button
          onClick={commitBulkSelect}
          disabled={bulkSelectedRoms.size === 0}
          className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          Listo
        </button>
      </div>
    </div>
  );
}
