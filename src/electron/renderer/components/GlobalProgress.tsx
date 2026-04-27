import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";

/**
 * Aggregates every long-running background task exposed by AppContext into
 * a single top-of-screen progress bar + a click-to-open detail popover.
 *
 * Sources (in the order of visual priority when multiple are active):
 *   - Emulator download (discrete files + bytes)
 *   - Cover fetching (per-rom)
 *   - Metadata scraping (per-rom)
 *   - Scan (no granular progress, just a "trabajando" state)
 *
 * This is intentionally additive to the StatusBar — it just bubbles the
 * same data up where it's visible from any view without needing to glance
 * at the bottom bar. Hidden entirely when nothing is running.
 */

interface Task {
  id: string;
  label: string;
  /** 0–1 when known, null for indeterminate. */
  progress: number | null;
  detail?: string;
}

export function GlobalProgress() {
  const {
    isScraping,
    scrapeProgress,
    downloadingEmulatorId,
    emulatorDownloadProgress,
  } = useApp();

  const [expanded, setExpanded] = useState(false);

  const tasks = useMemo<Task[]>(() => {
    const list: Task[] = [];

    if (downloadingEmulatorId && emulatorDownloadProgress) {
      const p = emulatorDownloadProgress;
      const total = p.bytesTotal || p.filesTotal || 0;
      const done = p.bytesTotal > 0 ? p.bytesReceived : p.filesCompleted;
      const progress =
        total > 0 ? Math.min(1, done / total) : null;
      list.push({
        id: "emu-dl",
        label: `Descargando ${p.emulatorId}`,
        progress,
        detail: p.currentFile ?? p.message ?? p.phase,
      });
    }

    if (isScraping && scrapeProgress) {
      const p = scrapeProgress;
      const progress = p.total > 0 ? p.current / p.total : null;
      list.push({
        id: "scrape",
        label: "Scraping de metadata",
        progress,
        detail: `${p.current}/${p.total} — ${p.romFileName}`,
      });
    }

    return list;
  }, [
    isScraping,
    scrapeProgress,
    downloadingEmulatorId,
    emulatorDownloadProgress,
  ]);

  if (tasks.length === 0) return null;

  // Use the first active task (highest priority) for the thin top bar and
  // let the expanded panel show all of them.
  const primary = tasks[0];

  return (
    <>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="fixed left-1/2 top-0 z-[70] -translate-x-1/2 rounded-b-md bg-[var(--color-surface-1)]/90 px-3 py-1 text-xs text-[var(--color-text-secondary)] shadow-md backdrop-blur-md hover:bg-[var(--color-surface-2)]"
        title="Ver progreso"
      >
        <span className="mr-2 inline-block">⏳</span>
        {primary.label}
        {primary.progress !== null && (
          <span className="ml-2 font-mono">
            {Math.round(primary.progress * 100)}%
          </span>
        )}
        {tasks.length > 1 && (
          <span className="ml-2 rounded bg-[var(--color-accent)]/20 px-1.5 py-0.5 text-[var(--color-accent)]">
            +{tasks.length - 1}
          </span>
        )}
      </button>

      {/* Thin progress bar flush against the top edge — indeterminate
          animation when the primary task has no progress number. */}
      <div
        className="fixed inset-x-0 top-0 z-[69] h-0.5 overflow-hidden bg-[var(--color-surface-2)]/40"
        aria-hidden
      >
        {primary.progress !== null ? (
          <div
            className="h-full bg-[var(--color-accent)] transition-all duration-200"
            style={{ width: `${primary.progress * 100}%` }}
          />
        ) : (
          <div className="global-progress-indeterminate h-full bg-[var(--color-accent)]" />
        )}
      </div>

      {expanded && (
        <div
          className="fixed left-1/2 top-8 z-[71] w-80 -translate-x-1/2 rounded-md bg-[var(--color-surface-1)] p-3 shadow-2xl backdrop-blur-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              Operaciones en curso
            </span>
            <button
              onClick={() => setExpanded(false)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              aria-label="Cerrar"
            >
              &times;
            </button>
          </div>
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={task.id} className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    {task.label}
                  </span>
                  {task.progress !== null && (
                    <span className="font-mono text-xs text-[var(--color-text-muted)]">
                      {Math.round(task.progress * 100)}%
                    </span>
                  )}
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]/60">
                  {task.progress !== null ? (
                    <div
                      className="h-full bg-[var(--color-accent)] transition-all duration-200"
                      style={{ width: `${task.progress * 100}%` }}
                    />
                  ) : (
                    <div className="global-progress-indeterminate h-full bg-[var(--color-accent)]" />
                  )}
                </div>
                {task.detail && (
                  <div className="truncate text-[10px] text-[var(--color-text-muted)]">
                    {task.detail}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
