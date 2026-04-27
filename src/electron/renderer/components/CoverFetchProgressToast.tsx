import { useApp } from "../context/AppContext";

export function CoverFetchProgressToast() {
  const { isFetchingCovers, coverFetchProgress } = useApp();
  if (!isFetchingCovers || !coverFetchProgress) return null;

  const { current, total, romFileName } = coverFetchProgress;
  const ratio = total > 0 ? current / total : 0;
  const pct = Math.min(100, Math.max(0, Math.round(ratio * 100)));

  return (
    <div
      className="w-80 rounded-lg bg-[var(--color-surface-1)]/95 p-3 shadow-2xl backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          {total > 0
            ? `Descargando portadas (${current}/${total})`
            : "Descargando portadas"}
        </span>
        <span className="font-mono text-xs text-[var(--color-text-muted)]">
          {pct}%
        </span>
      </div>

      <div
        className="truncate text-xs text-[var(--color-text-secondary)]"
        title={romFileName}
      >
        {romFileName}
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]/60">
        <div
          className="h-full bg-[var(--color-accent)] transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
