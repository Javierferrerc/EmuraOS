import { useEffect, useRef, type MutableRefObject } from "react";
import type { SettingsContext } from "../../../../schemas/settings-schema-types";
import { EmulatorIcon } from "./EmulatorIcon";

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
export function EmuladoresList({
  ctx,
  focusIndex,
  regionFocused,
  activateRef,
  secondaryRef,
}: {
  ctx: SettingsContext;
  focusIndex: number;
  regionFocused: boolean;
  activateRef: MutableRefObject<(() => void) | null>;
  secondaryRef: MutableRefObject<(() => void) | null>;
}) {
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

  // Sorted list: installed & drive-available first, not-available last.
  const sortedDefs = [...ctx.emulatorDefs].sort((a, b) => {
    const aAvail = (ctx.lastDetection?.detected.some((d) => d.id === a.id)
      || ctx.driveEmulators[a.id.toLowerCase()]) ? 0 : 1;
    const bAvail = (ctx.lastDetection?.detected.some((d) => d.id === b.id)
      || ctx.driveEmulators[b.id.toLowerCase()]) ? 0 : 1;
    return aAvail - bAvail;
  });

  // Focus index 0 = detect header, 1..N = grid items.
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  // Scroll focused item into view.
  useEffect(() => {
    if (!regionFocused) return;
    const el = itemRefs.current[focusIndex];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusIndex, regionFocused]);

  // Wire activateRef so SettingsRoot's ACTIVATE triggers the right action.
  // Wire secondaryRef so SECONDARY_ACTION (Square) triggers download.
  useEffect(() => {
    if (!regionFocused) {
      activateRef.current = null;
      secondaryRef.current = null;
      return;
    }
    if (focusIndex === 0) {
      // Detect button
      activateRef.current = () => { void handleDetect(); };
      secondaryRef.current = null;
      return;
    }
    const def = sortedDefs[focusIndex - 1];
    if (!def) { activateRef.current = null; secondaryRef.current = null; return; }
    const detected = ctx.lastDetection?.detected.find((d) => d.id === def.id);
    const driveEntry = ctx.driveEmulators[def.id.toLowerCase()];
    if (detected) {
      activateRef.current = () => {
        ctx.navigation.navigateTo(`/settings/emuladores/${def.id}`);
      };
    } else if (driveEntry) {
      activateRef.current = () => { void ctx.downloadEmulator(def.id); };
    } else {
      activateRef.current = null;
    }
    // Secondary (Square) always triggers download if drive entry exists
    if (driveEntry && !ctx.downloadingEmulatorId) {
      secondaryRef.current = () => { void ctx.downloadEmulator(def.id); };
    } else {
      secondaryRef.current = null;
    }
  });

  const isFocused = (idx: number) => regionFocused && focusIndex === idx;

  return (
    <div className="space-y-4 px-6 py-6">
      {/* Header: title + description + detect button — focus index 0 */}
      <div
        ref={(el) => { itemRefs.current[0] = el; }}
        className={`flex items-center justify-between rounded-[var(--radius-md)] px-5 py-4 folder-row-glass ${isFocused(0) ? "ring-focus" : ""}`}
      >
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

      {/* Emulator grid — focus indices 1..N */}
      <div className="grid grid-cols-3 gap-2">
        {sortedDefs.map((def, i) => {
          const gridIdx = i + 1; // focus index (0 is the header)
          const focused = isFocused(gridIdx);
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
                ref={(el) => { itemRefs.current[gridIdx] = el; }}
                onClick={() =>
                  ctx.navigation.navigateTo(
                    `/settings/emuladores/${def.id}`
                  )
                }
                className={`flex items-center gap-3 rounded-[var(--radius-md)] folder-row-glass px-4 py-3 text-left text-sm transition-colors hover:bg-white/[0.06] ${focused ? "ring-focus" : ""}`}
              >
                <EmulatorIcon id={def.id} className="h-9 w-9 text-base" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[var(--color-text-primary)]">
                      {def.name}
                    </span>
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
                            : <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z"></path></svg>}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {detected.source === "emulatorsPath"
                      ? "Configuración personalizada"
                      : "Configuración por defecto"}
                  </div>
                </div>
              </button>
            );
          }

          // Variant 2: Available on Drive
          if (driveEntry) {
            return (
              <div
                key={def.id}
                ref={(el) => { itemRefs.current[gridIdx] = el; }}
                className={`flex items-start gap-3 rounded-[var(--radius-md)] folder-row-glass p-4 ${focused ? "ring-focus" : ""}`}
              >
                <EmulatorIcon id={def.id} className="h-9 w-9 text-base" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--color-text-primary)]">
                      {def.name}
                    </span>
                    <button
                      onClick={() => ctx.downloadEmulator(def.id)}
                      disabled={
                        isDownloading || ctx.downloadingEmulatorId !== null
                      }
                      className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors bg-[var(--color-good)] hover:opacity-90 disabled:opacity-50"
                    >
                      {isDownloading ? "Descargando..." : "Descargar"}
                    </button>
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {driveEntry.fileCount > 0
                      ? `${driveEntry.fileCount} archivos · ${formatBytes(driveEntry.totalBytes)}`
                      : "Descarga disponible"}
                  </span>
                {isDownloading && ctx.emulatorDownloadProgress && (
                  <div>
                    <div className="mb-1 flex justify-between gap-2 text-xs text-[var(--color-text-muted)]">
                      <span>
                        {ctx.emulatorDownloadProgress.filesCompleted} /{" "}
                        {ctx.emulatorDownloadProgress.filesTotal} archivos
                      </span>
                      <span>
                        {formatBytes(ctx.emulatorDownloadProgress.bytesReceived)}{" "}
                        / {formatBytes(ctx.emulatorDownloadProgress.bytesTotal)}
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
              </div>
            );
          }

          // Variant 3: Not available
          return (
            <div
              key={def.id}
              ref={(el) => { itemRefs.current[gridIdx] = el; }}
              className={`flex items-center gap-3 rounded-[var(--radius-md)] folder-row-glass px-4 py-3 opacity-60 ${focused ? "ring-focus" : ""}`}
            >
              <EmulatorIcon id={def.id} className="h-9 w-9 text-base" />
              <span className="flex-1 text-sm text-[var(--color-text-muted)]">
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
