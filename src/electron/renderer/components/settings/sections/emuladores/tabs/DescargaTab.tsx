import type { SettingsContext } from "../../../../../schemas/settings-schema-types";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

interface Props {
  ctx: SettingsContext;
  emulatorId: string;
}

export function DescargaTab({ ctx, emulatorId }: Props) {
  const driveEntry = ctx.driveEmulators[emulatorId.toLowerCase()];
  const isDownloading = ctx.downloadingEmulatorId === emulatorId;
  const progress = ctx.emulatorDownloadProgress;
  const detected = ctx.lastDetection?.detected.find(
    (d) => d.id === emulatorId
  );

  return (
    <div className="space-y-4">
      {/* Current install status */}
      <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-secondary)]">
            Instalación local
          </span>
          <span
            className={`text-sm font-medium ${
              detected
                ? "text-[var(--color-good)]"
                : "text-[var(--color-text-muted)]"
            }`}
          >
            {detected ? "Instalado" : "No instalado"}
          </span>
        </div>
      </div>

      {/* Drive info */}
      <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-secondary)]">
            Disponible en Drive
          </span>
          <span className="text-sm text-[var(--color-text-muted)]">
            {driveEntry
              ? `${driveEntry.fileCount} archivos · ${formatBytes(driveEntry.totalBytes)}`
              : "No disponible"}
          </span>
        </div>
      </div>

      {/* Refresh + Download */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => ctx.refreshDriveEmulators(true)}
          disabled={ctx.isLoadingDrive}
          className="rounded-lg border border-[var(--color-surface-2)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] disabled:opacity-50"
        >
          {ctx.isLoadingDrive ? "Actualizando..." : "Refrescar Drive"}
        </button>
        {driveEntry && (
          <button
            onClick={() => ctx.downloadEmulator(emulatorId)}
            disabled={isDownloading || ctx.downloadingEmulatorId !== null}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors bg-[var(--color-good)] hover:opacity-90 disabled:opacity-50"
          >
            {isDownloading ? "Descargando..." : "Descargar"}
          </button>
        )}
      </div>

      {/* Download progress */}
      {isDownloading && progress && (
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
          <div className="mb-2 flex justify-between text-xs text-[var(--color-text-muted)]">
            <span>
              {progress.filesCompleted} / {progress.filesTotal} archivos ·{" "}
              {formatBytes(progress.bytesReceived)} /{" "}
              {formatBytes(progress.bytesTotal)}
            </span>
            <span className="max-w-[200px] truncate">
              {progress.currentFile ?? progress.phase}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--color-good)] transition-all"
              style={{
                width: `${
                  progress.bytesTotal > 0
                    ? (progress.bytesReceived / progress.bytesTotal) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
