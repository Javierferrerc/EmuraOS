/**
 * QuickDownloadButton — one-click emulator install from the card grid and the
 * detail header (no need to go Emulador → Descarga → Descargar). While the
 * download runs, a ring around the icon fills with the byte progress; phases
 * without a known size (resolving the release, extracting) spin instead.
 * Clicking again during the download cancels it.
 */

import { useState, type MouseEvent } from "react";
import type { SettingsContext } from "../../schemas/settings-schema-types";
import { SetIcon } from "./SetIcon";

const R = 17;
const CIRC = 2 * Math.PI * R;

export function QuickDownloadButton({
  ctx,
  emulatorId,
  size = "md",
}: {
  ctx: SettingsContext;
  emulatorId: string;
  size?: "md" | "lg";
}) {
  const [error, setError] = useState<string | null>(null);
  const isDownloading = ctx.downloadingEmulatorId === emulatorId;
  const otherBusy = ctx.downloadingEmulatorId !== null && !isDownloading;
  const progress = isDownloading ? ctx.emulatorDownloadProgress : null;

  const fraction =
    progress?.phase === "downloading" && progress.bytesTotal > 0
      ? Math.min(1, progress.bytesReceived / progress.bytesTotal)
      : null;
  const indeterminate = isDownloading && fraction === null;

  const onClick = async (e: MouseEvent) => {
    // Lives inside the clickable card — don't open the detail view.
    e.stopPropagation();
    if (isDownloading) {
      ctx.cancelEmulatorDownload();
      return;
    }
    setError(null);
    const result = await ctx.downloadEmulator(emulatorId);
    if (!result.success && result.error !== "cancelled") {
      setError(result.error ?? "error desconocido");
    }
  };

  const title = isDownloading
    ? fraction !== null
      ? `Descargando… ${Math.round(fraction * 100)}% · clic para cancelar`
      : progress?.phase === "finalizing"
        ? "Instalando… · clic para cancelar"
        : "Preparando descarga… · clic para cancelar"
    : error
      ? `No se pudo instalar: ${error} · clic para reintentar`
      : "Descargar e instalar";

  return (
    <button
      type="button"
      className={
        "emu-qdl " +
        size +
        (isDownloading ? " is-active" : "") +
        (indeterminate ? " is-indeterminate" : "") +
        (error ? " is-error" : "")
      }
      title={title}
      aria-label={title}
      disabled={otherBusy}
      onClick={(e) => void onClick(e)}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <svg className="emu-qdl-ring" viewBox="0 0 40 40" aria-hidden="true">
        <circle className="track" cx="20" cy="20" r={R} />
        {isDownloading && (
          <circle
            className="fill"
            cx="20"
            cy="20"
            r={R}
            strokeDasharray={CIRC}
            strokeDashoffset={indeterminate ? CIRC * 0.72 : CIRC * (1 - (fraction ?? 0))}
          />
        )}
      </svg>
      <span className="emu-qdl-icon">
        {isDownloading ? <span className="emu-qdl-stop" /> : <SetIcon name="download" size={size === "lg" ? 18 : 16} />}
      </span>
    </button>
  );
}
