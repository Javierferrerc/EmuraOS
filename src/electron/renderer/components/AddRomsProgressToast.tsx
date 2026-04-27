import { useApp } from "../context/AppContext";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function AddRomsProgressToast() {
  const { addRomsProgress } = useApp();
  if (!addRomsProgress) return null;

  const {
    fileIndex,
    totalFiles,
    fileName,
    copiedBytes,
    totalBytes,
    percent,
  } = addRomsProgress;
  const pct = Math.min(100, Math.max(0, Math.round(percent * 100)));
  const showBatch = totalFiles > 1;

  return (
    <div
      className="w-80 rounded-lg bg-[var(--color-surface-1)]/95 p-3 shadow-2xl backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          {showBatch ? `Añadiendo ROMs (${fileIndex + 1}/${totalFiles})` : "Añadiendo ROM"}
        </span>
        <span className="font-mono text-xs text-[var(--color-text-muted)]">
          {pct}%
        </span>
      </div>

      <div
        className="truncate text-xs text-[var(--color-text-secondary)]"
        title={fileName}
      >
        {fileName}
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]/60">
        <div
          className="h-full bg-[var(--color-accent)] transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-1 text-[10px] text-[var(--color-text-muted)] font-mono">
        {formatBytes(copiedBytes)} / {formatBytes(totalBytes)}
      </div>
    </div>
  );
}
