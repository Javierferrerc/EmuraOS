import { useEffect } from "react";
import type { SettingsContext } from "../../../../schemas/settings-schema-types";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * List of all known emulators with their status:
 * - Installed (detected locally)
 * - Available (on Drive, downloadable)
 * - Not available
 *
 * Clicking an installed or available emulator navigates to its detail view.
 */
export function EmuladoresList({ ctx }: { ctx: SettingsContext }) {
  // Kick off Drive listing on first mount if not loaded
  useEffect(() => {
    if (Object.keys(ctx.driveEmulators).length === 0 && !ctx.isLoadingDrive) {
      ctx.refreshDriveEmulators(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDetect = async () => {
    await ctx.detectEmulators();
  };

  return (
    <div className="space-y-4">
      {/* Header: title + description + detect button */}
      <div className="flex items-center justify-between rounded-[var(--radius-md)] px-5 py-4 folder-row-glass">
        <div className="flex-1 pr-4">
          <div className="text-base font-semibold text-primary">Emuladores</div>
          <div className="mt-0.5 text-xs text-muted">
            Detecta y gestiona los emuladores instalados en tu sistema
          </div>
        </div>
        <button
          onClick={handleDetect}
          disabled={ctx.isDetectingEmulators || ctx.isLoadingDrive}
          className="relative cursor-pointer whitespace-nowrap rounded-[var(--radius-sm)] px-4 py-1.5 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden isolate"
        >
          <span
            className="absolute inset-0 -z-10 rounded-inherit"
            style={{ background: "linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))", opacity: 0.72 }}
          />
          {ctx.isDetectingEmulators || ctx.isLoadingDrive
            ? "Detectando..."
            : "Detectar emuladores"}
        </button>
      </div>

      {/* Emulator list */}
      <div className="space-y-2">
        {ctx.emulatorDefs.map((def) => {
          const detected = ctx.lastDetection?.detected.find(
            (d) => d.id === def.id
          );
          const readiness = ctx.readinessReport?.results.find(
            (r) => r.emulatorId === def.id
          );
          const driveEntry = ctx.driveEmulators[def.id.toLowerCase()];
          const isDownloading = ctx.downloadingEmulatorId === def.id;

          // Variant 1: Installed
          if (detected) {
            return (
              <button
                key={def.id}
                onClick={() =>
                  ctx.navigation.navigateTo(
                    `/settings/emuladores/${def.id}`
                  )
                }
                className="flex w-full items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-surface-1)] px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <span className="font-medium text-[var(--color-text-primary)]">
                  {def.name}
                </span>
                <div className="flex items-center gap-3">
                  {readiness && (
                    <span
                      className={`text-xs font-medium ${
                        readiness.errors.length > 0
                          ? "text-[var(--color-bad)]"
                          : readiness.fixed.length > 0
                            ? "text-[var(--color-accent)]"
                            : "text-[var(--color-good)]"
                      }`}
                    >
                      {readiness.errors.length > 0
                        ? `${readiness.errors.length} error(es)`
                        : readiness.fixed.length > 0
                          ? `${readiness.fixed.length} core(s) instalados`
                          : "Listo"}
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {detected.source === "emulatorsPath"
                      ? "Ruta personalizada"
                      : "Ruta por defecto"}
                  </span>
                  <svg
                    className="h-4 w-4 text-[var(--color-text-muted)]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            );
          }

          // Variant 2: Available on Drive
          if (driveEntry) {
            return (
              <div
                key={def.id}
                className="rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-[var(--color-text-primary)]">
                      {def.name}
                    </span>
                    <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                      {driveEntry.fileCount > 0
                        ? `${driveEntry.fileCount} archivos · ${formatBytes(driveEntry.totalBytes)}`
                        : "Disponible en Drive"}
                    </span>
                  </div>
                  <button
                    onClick={() => ctx.downloadEmulator(def.id)}
                    disabled={
                      isDownloading || ctx.downloadingEmulatorId !== null
                    }
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors bg-[var(--color-good)] hover:opacity-90 disabled:opacity-50"
                  >
                    {isDownloading ? "Descargando..." : "Descargar"}
                  </button>
                </div>
                {isDownloading && ctx.emulatorDownloadProgress && (
                  <div className="mt-2">
                    <div className="mb-1 flex justify-between gap-2 text-xs text-[var(--color-text-muted)]">
                      <span>
                        {ctx.emulatorDownloadProgress.filesCompleted} /{" "}
                        {ctx.emulatorDownloadProgress.filesTotal} archivos ·{" "}
                        {formatBytes(
                          ctx.emulatorDownloadProgress.bytesReceived
                        )}{" "}
                        /{" "}
                        {formatBytes(ctx.emulatorDownloadProgress.bytesTotal)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                      <div
                        className="h-full bg-[var(--color-good)] transition-all"
                        style={{
                          width: `${
                            ctx.emulatorDownloadProgress.bytesTotal > 0
                              ? (ctx.emulatorDownloadProgress.bytesReceived /
                                  ctx.emulatorDownloadProgress.bytesTotal) *
                                100
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

          // Variant 3: Not available
          return (
            <div
              key={def.id}
              className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-surface-0)] px-4 py-3 opacity-60"
            >
              <span className="text-sm text-[var(--color-text-muted)]">
                {def.name}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                No disponible
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
