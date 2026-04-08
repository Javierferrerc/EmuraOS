import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { SettingsContext } from "../../../schemas/settings-schema-types";
import type { EmulatorDefinition } from "../../../../../core/types";
import squareIcon from "../../../assets/icons/controls/square.svg";

interface Props {
  ctx: SettingsContext;
  /** Index of the focused item in this step (0 = detect btn, 1..N = emulators). */
  focusedIndex: number;
  /** Whether the content region is active (vs buttons). */
  regionFocused: boolean;
  /** Report the total focusable item count to the wizard. */
  onItemCount: (n: number) => void;
  /** Ref that the wizard writes a callback into. Called on ACTIVATE. */
  onActivate: MutableRefObject<(() => void) | null>;
  /** Ref that the wizard writes a callback into. Called on DOWNLOAD (Square). */
  onDownload: MutableRefObject<(() => void) | null>;
  /** Advance to the next wizard step. */
  onNext: () => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Map system IDs to short display names. */
const SYSTEM_NAMES: Record<string, string> = {
  nes: "NES",
  snes: "SNES",
  n64: "N64",
  gb: "Game Boy",
  gbc: "GBC",
  gba: "GBA",
  nds: "NDS",
  gamecube: "GameCube",
  wii: "Wii",
  megadrive: "Mega Drive",
  mastersystem: "Master System",
  dreamcast: "Dreamcast",
  psx: "PlayStation",
  ps2: "PS2",
  psp: "PSP",
  "3ds": "3DS",
  switch: "Switch",
  wiiu: "Wii U",
  ps3: "PS3",
};

const COMPAT_META: Record<
  NonNullable<EmulatorDefinition["compatibility"]>,
  { label: string; color: string; bg: string }
> = {
  perfecto: {
    label: "Perfecto",
    color: "var(--color-good)",
    bg: "rgba(34, 197, 94, 0.15)",
  },
  jugable: {
    label: "Jugable",
    color: "var(--color-warn)",
    bg: "rgba(234, 179, 8, 0.15)",
  },
  experimental: {
    label: "Experimental",
    color: "#f97316",
    bg: "rgba(249, 115, 22, 0.15)",
  },
  "no-soportado": {
    label: "No soportado",
    color: "var(--color-bad)",
    bg: "rgba(239, 68, 68, 0.15)",
  },
};

/**
 * Wizard step that detects emulators and shows results with
 * check/warning icons per emulator. Uninstalled emulators with
 * a Drive entry can be downloaded directly from here.
 *
 * Each row is expandable to show compatibility info, supported
 * systems, recommended version, and performance notes.
 *
 * Supports gamepad/keyboard navigation via focus props from
 * FirstRunWizard. Item 0 = detect button, items 1..N = emulators.
 */
export function WizardEmulatorStep({
  ctx,
  focusedIndex,
  regionFocused,
  onItemCount,
  onActivate,
  onDownload,
  onNext,
}: Props) {
  const {
    emulatorDefs,
    lastDetection,
    isDetectingEmulators,
    detectEmulators,
    driveEmulators,
    isLoadingDrive,
    refreshDriveEmulators,
    downloadingEmulatorId,
    emulatorDownloadProgress,
    downloadEmulator,
  } = ctx;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  const handleDetect = useCallback(async () => {
    await detectEmulators();
  }, [detectEmulators]);

  // Load Drive emulators list when the step mounts so download
  // buttons appear without an extra user action.
  useEffect(() => {
    if (Object.keys(driveEmulators).length === 0 && !isLoadingDrive) {
      refreshDriveEmulators(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detectedIds = new Set(
    lastDetection?.detected?.map((d) => d.id) ?? []
  );

  // Focusable items: detect button (always) + emulator rows (after detection)
  const hasResults = !!(lastDetection && emulatorDefs.length > 0);
  const itemCount = 1 + (hasResults ? emulatorDefs.length : 0);

  // Report item count to wizard whenever it changes
  useEffect(() => {
    onItemCount(itemCount);
  }, [itemCount, onItemCount]);

  // Scroll focused row into view after the expand/collapse animation settles
  useEffect(() => {
    if (!regionFocused || focusedIndex < 0) return;
    const timer = setTimeout(() => {
      const el = rowRefs.current[focusedIndex];
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 220); // wait for panel animation (--duration-base: 200ms)
    return () => clearTimeout(timer);
  }, [focusedIndex, regionFocused]);

  // Auto-expand emulator detail when gamepad focus lands on a row
  useEffect(() => {
    if (!ctx.gamepadConnected || !regionFocused) return;
    if (focusedIndex <= 0) {
      setExpandedId(null);
      return;
    }
    const emu = emulatorDefs[focusedIndex - 1];
    if (!emu) return;
    const isInstalled = detectedIds.has(emu.id);
    const driveEntry = driveEmulators[emu.id.toLowerCase()];
    if (isInstalled || driveEntry) {
      setExpandedId(emu.id);
    } else {
      setExpandedId(null);
    }
  }, [focusedIndex, regionFocused, ctx.gamepadConnected, emulatorDefs, detectedIds, driveEmulators]);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // Handle activation from gamepad/keyboard
  // Detect button (index 0) → detect; emulator rows → next step
  const handleActivateItem = useCallback(() => {
    if (focusedIndex === 0) {
      if (!isDetectingEmulators) handleDetect();
      return;
    }
    // Any emulator row → advance to next wizard step
    onNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, isDetectingEmulators, onNext]);

  // Handle download from gamepad Square button
  const handleDownloadItem = useCallback(() => {
    if (focusedIndex <= 0) return;
    const emu = emulatorDefs[focusedIndex - 1];
    if (!emu) return;
    const isInstalled = detectedIds.has(emu.id);
    const driveEntry = driveEmulators[emu.id.toLowerCase()];
    const isDownloading = downloadingEmulatorId === emu.id;
    if (!isInstalled && driveEntry && !isDownloading && downloadingEmulatorId === null) {
      downloadEmulator(emu.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, emulatorDefs, detectedIds, driveEmulators, downloadingEmulatorId]);

  // Wire activate and download refs so the wizard can call them
  useEffect(() => {
    onActivate.current = handleActivateItem;
    return () => { onActivate.current = null; };
  }, [handleActivateItem, onActivate]);

  useEffect(() => {
    onDownload.current = handleDownloadItem;
    return () => { onDownload.current = null; };
  }, [handleDownloadItem, onDownload]);

  const detectFocused = regionFocused && focusedIndex === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header description */}
      <p className="text-xs text-[var(--color-text-muted)]">
        Detecta los emuladores instalados en tu sistema para poder jugar.
      </p>

      {/* Detect button */}
      <div ref={(el) => { rowRefs.current[0] = el; }}>
        <button
          onClick={handleDetect}
          disabled={isDetectingEmulators}
          className={`flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-medium text-white transition-colors bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 ${
            detectFocused ? "ring-focus" : ""
          }`}
        >
          {isDetectingEmulators ? (
            <>
              <Spinner />
              Detectando...
            </>
          ) : (
            lastDetection ? "Volver a detectar" : "Detectar emuladores"
          )}
        </button>
      </div>

      {/* Results list */}
      {hasResults && (
        <div className="flex flex-col gap-1">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Resultados
          </h3>
          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-[var(--focus-ring-width)]">
            {emulatorDefs.map((emu, emuIdx) => {
              const isInstalled = detectedIds.has(emu.id);
              const detected = lastDetection!.detected?.find(
                (d) => d.id === emu.id
              );
              const driveEntry = driveEmulators[emu.id.toLowerCase()];
              const isDownloading = downloadingEmulatorId === emu.id;
              const progress = isDownloading ? emulatorDownloadProgress : null;
              const canExpand = isInstalled || !!driveEntry;
              const isExpanded = canExpand && expandedId === emu.id;
              const itemIdx = emuIdx + 1; // offset by 1 for detect button
              const isFocused = regionFocused && focusedIndex === itemIdx;

              return (
                <div
                  key={emu.id}
                  ref={(el) => { rowRefs.current[itemIdx] = el; }}
                  className="border-b border-[var(--color-surface-1)] last:border-b-0"
                >
                  {/* Main row */}
                  <div
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      canExpand ? "cursor-pointer hover:bg-[var(--color-surface-1)]/30" : ""
                    } ${isFocused ? "ring-focus rounded-[var(--radius-sm)]" : ""}`}
                    onClick={canExpand ? () => toggleExpand(emu.id) : undefined}
                  >
                    {/* Status icon */}
                    {isInstalled ? (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-good)]/20 text-[var(--color-good)]">
                        <CheckIcon />
                      </span>
                    ) : (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-warn)]/20 text-[var(--color-warn)]">
                        <WarningIcon />
                      </span>
                    )}

                    {/* Emulator info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {emu.name}
                      </p>
                      {isInstalled ? (
                        <p className="text-xs text-[var(--color-good)]">
                          Instalado
                        </p>
                      ) : driveEntry ? (
                        <p className="text-xs text-[var(--color-warn)]">
                          No detectado
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--color-text-muted)] opacity-60">
                          No disponible por el momento
                        </p>
                      )}
                    </div>

                    {/* Actions for uninstalled emulators */}
                    {!isInstalled && driveEntry && !isDownloading && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadEmulator(emu.id);
                        }}
                        disabled={downloadingEmulatorId !== null}
                        title="Descargar"
                        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-colors disabled:opacity-50"
                        style={{ background: "rgba(59, 130, 246, 0.2)" }}
                      >
                        {ctx.gamepadConnected && <img src={squareIcon} alt="" className="h-4 w-4" />}
                        <DownloadIcon />
                      </button>
                    )}

                    {/* Downloading indicator */}
                    {isDownloading && (
                      <span className="shrink-0 flex items-center gap-1.5 text-xs text-[var(--color-accent)]">
                        <Spinner />
                        Descargando...
                      </span>
                    )}

                    {/* Chevron (only for available emulators) */}
                    {canExpand && (
                      <span
                        className="shrink-0 text-[var(--color-text-muted)] transition-transform"
                        style={{
                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                          transitionDuration: "var(--duration-fast)",
                        }}
                      >
                        <ChevronIcon />
                      </span>
                    )}
                  </div>

                  {/* Download progress bar */}
                  {isDownloading && progress && (
                    <div className="px-4 pt-2 pb-2 ml-8">
                      <div className="mb-1 flex justify-between text-[10px] text-[var(--color-text-muted)]">
                        <span>
                          {progress.filesCompleted}/{progress.filesTotal} archivos
                          {" · "}
                          {formatBytes(progress.bytesReceived)}/{formatBytes(progress.bytesTotal)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                        <div
                          className="h-full rounded-full bg-[var(--color-accent)] transition-all"
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

                  {/* Expandable detail panel (always mounted for animation) */}
                  {canExpand && (
                    <div
                      className="grid transition-[grid-template-rows]"
                      style={{
                        gridTemplateRows: isExpanded ? "1fr" : "0fr",
                        transitionDuration: "var(--duration-base)",
                        transitionTimingFunction: "var(--ease-standard)",
                      }}
                    >
                      <div className="overflow-hidden">
                        <CompatibilityPanel emu={emu} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <p className="mt-1 text-center text-xs text-[var(--color-text-muted)]">
            {detectedIds.size} de {emulatorDefs.length} emuladores detectados
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Compatibility detail panel ── */

function CompatibilityPanel({ emu }: { emu: EmulatorDefinition }) {
  const compat = emu.compatibility
    ? COMPAT_META[emu.compatibility]
    : null;

  const systemNames = emu.systems
    .map((id) => SYSTEM_NAMES[id] ?? id.toUpperCase())
    .join(", ");

  return (
    <div
      className="mx-4 mt-3 mb-3 rounded-[var(--radius-sm)] px-4 py-3"
      style={{ background: "linear-gradient(135deg, var(--color-surface-1), var(--color-surface-0))" }}
    >
      <div className="flex flex-wrap items-center gap-3 mb-2">
        {/* Compatibility badge */}
        {compat && (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ color: compat.color, background: compat.bg }}
          >
            {compat.label}
          </span>
        )}

        {/* Recommended version */}
        {emu.recommendedVersion && (
          <span className="text-xs text-[var(--color-text-muted)]">
            v{emu.recommendedVersion}
          </span>
        )}
      </div>

      {/* Systems list */}
      <div className="mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Sistemas
        </span>
        <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
          {systemNames}
        </p>
      </div>

      {/* Performance note */}
      {emu.performanceNote && (
        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
          {emu.performanceNote}
        </p>
      )}
    </div>
  );
}

/* ── Inline SVG icons ── */

function ChevronIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-accent)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15V3" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 6.5L4.5 9L10 3" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4v2.5" />
      <circle cx="6" cy="8.5" r="0.5" fill="currentColor" stroke="none" />
      <path d="M5.13 1.5a1 1 0 0 1 1.74 0l4.03 7A1 1 0 0 1 10.03 10H1.97a1 1 0 0 1-.87-1.5l4.03-7z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
    </svg>
  );
}
