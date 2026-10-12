import { useState } from "react";
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

/** Human label for where a downloadable emulator comes from. */
function sourceLabel(provider: string | undefined, fileCount: number, totalBytes: number): string {
  switch (provider) {
    case "github":
      return "Última versión oficial (GitHub)";
    case "https":
      return "Descarga oficial";
    default:
      return `Drive · ${fileCount} archivos · ${formatBytes(totalBytes)}`;
  }
}

export function DescargaTab({ ctx, emulatorId }: Props) {
  const driveEntry = ctx.driveEmulators[emulatorId.toLowerCase()];
  const def = ctx.emulatorDefs.find((d) => d.id === emulatorId);
  const acquisition = def?.acquisition;
  const isManual = acquisition?.provider === "manual";
  const isDownloading = ctx.downloadingEmulatorId === emulatorId;
  const progress = ctx.emulatorDownloadProgress;
  // Progress is cleared when the download settles, so keep the failure here.
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setError(null);
    const result = await ctx.downloadEmulator(emulatorId);
    if (!result.success && result.error !== "cancelled") {
      setError(result.error ?? "error desconocido");
    }
  };
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

      {/* Download source */}
      <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-secondary)]">
            Origen de la descarga
          </span>
          <span className="text-sm text-[var(--color-text-muted)]">
            {isManual
              ? "Instalación manual"
              : driveEntry
                ? sourceLabel(driveEntry.folderId, driveEntry.fileCount, driveEntry.totalBytes)
                : "No disponible"}
          </span>
        </div>
        {isManual && (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Este emulador no tiene descarga directa. Instálalo desde su página
            oficial y luego pulsa "Detectar emuladores".
          </p>
        )}
      </div>

      {/* Refresh + Download */}
      <div className="flex items-center gap-3">
        {isManual && acquisition?.pageUrl ? (
          <button
            onClick={() => void window.electronAPI.openExternal(acquisition.pageUrl!)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors bg-[var(--color-accent)] hover:opacity-90"
          >
            Abrir página oficial
          </button>
        ) : (
          <button
            onClick={() => ctx.refreshDriveEmulators(true)}
            disabled={ctx.isLoadingDrive}
            className="rounded-lg border border-[var(--color-surface-2)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] disabled:opacity-50"
          >
            {ctx.isLoadingDrive ? "Actualizando..." : "Actualizar lista"}
          </button>
        )}
        {driveEntry && !isDownloading && (
          <button
            onClick={() => void download()}
            disabled={ctx.downloadingEmulatorId !== null}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors bg-[var(--color-good)] hover:opacity-90 disabled:opacity-50"
          >
            {detected ? "Reinstalar / actualizar" : "Descargar"}
          </button>
        )}
        {isDownloading && (
          <button
            onClick={() => ctx.cancelEmulatorDownload()}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors bg-[var(--color-bad)] hover:opacity-90"
          >
            Cancelar
          </button>
        )}
      </div>

      {/* Download progress — listing phase */}
      {isDownloading && progress && progress.phase === "listing" && (
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
          <p className="mb-2 text-xs text-[var(--color-text-muted)]">
            Preparando la descarga...
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--color-good)]" />
          </div>
        </div>
      )}
      {/* Download progress — downloading phase */}
      {isDownloading && progress && progress.phase === "downloading" && (
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
          <div className="mb-2 flex justify-between text-xs text-[var(--color-text-muted)]">
            <span>
              {progress.filesTotal > 1 &&
                `${progress.filesCompleted} / ${progress.filesTotal} archivos · `}
              {formatBytes(progress.bytesReceived)}
              {progress.bytesTotal > 0 && ` / ${formatBytes(progress.bytesTotal)}`}
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
      {/* Extracting */}
      {isDownloading && progress && progress.phase === "finalizing" && (
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
          <p className="mb-2 text-xs text-[var(--color-text-muted)]">
            {progress.message ?? "Instalando..."}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div className="h-full w-full animate-pulse rounded-full bg-[var(--color-good)]" />
          </div>
        </div>
      )}
      {error && !isDownloading && (
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
          <p className="text-xs text-[var(--color-bad)]">
            No se pudo instalar: {error}
          </p>
        </div>
      )}
    </div>
  );
}
