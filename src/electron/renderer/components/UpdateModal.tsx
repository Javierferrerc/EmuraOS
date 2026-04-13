import { useState, useEffect, useCallback } from "react";
import type {
  UpdateInfo,
  UpdateDownloadProgress,
} from "../../../core/types";

type ModalState = "info" | "downloading" | "downloaded" | "error";

interface Props {
  updateInfo: UpdateInfo;
  onDismiss: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateModal({ updateInfo, onDismiss }: Props) {
  const [state, setState] = useState<ModalState>("info");
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Esc closes only in dismissible states
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (state === "info" || state === "error")) {
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss, state]);

  const handleDownload = useCallback(async () => {
    setState("downloading");
    setProgress(null);

    const unsubscribe = window.electronAPI.onUpdateDownloadProgress(
      (p: UpdateDownloadProgress) => {
        setProgress(p);
        if (p.status === "complete") {
          setState("downloaded");
        } else if (p.status === "cancelled") {
          onDismiss();
        } else if (p.status === "error") {
          setErrorMessage("Error durante la descarga");
          setState("error");
        }
      }
    );

    try {
      await window.electronAPI.downloadUpdate(updateInfo.downloadUrl);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled — already handled by progress callback
        return;
      }
      setErrorMessage(
        err instanceof Error ? err.message : "Error desconocido"
      );
      setState("error");
    } finally {
      unsubscribe();
    }
  }, [updateInfo.downloadUrl, onDismiss]);

  const handleCancel = useCallback(() => {
    window.electronAPI.cancelUpdateDownload();
  }, []);

  const handleInstall = useCallback(() => {
    window.electronAPI.installUpdate();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-gray-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-gray-700 px-6 py-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-950/60">
            <svg
              className="h-6 w-6 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-white">
              {state === "error"
                ? "Error de actualización"
                : "Actualización disponible"}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              v{updateInfo.version}
              {updateInfo.size > 0 && ` — ${formatBytes(updateInfo.size)}`}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {state === "info" && (
            <div className="space-y-3 text-sm text-gray-300">
              <p>
                Una nueva versión de EmuraOS está disponible.
              </p>
              {updateInfo.releaseNotes && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/50 p-3 text-xs text-gray-400">
                  <p className="mb-1 font-semibold text-gray-300">
                    Notas de la versión:
                  </p>
                  <pre className="whitespace-pre-wrap font-sans">
                    {updateInfo.releaseNotes}
                  </pre>
                </div>
              )}
            </div>
          )}

          {state === "downloading" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300">Descargando actualización...</p>
              <div className="h-3 overflow-hidden rounded-full bg-gray-700">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${progress?.percentComplete ?? 0}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                {progress
                  ? `${formatBytes(progress.bytesDownloaded)} / ${formatBytes(progress.bytesTotal)} — ${progress.percentComplete}%`
                  : "Iniciando descarga..."}
              </p>
            </div>
          )}

          {state === "downloaded" && (
            <div className="space-y-2 text-sm text-gray-300">
              <p>
                Descarga completa. La aplicación se cerrará para instalar la
                actualización y se reiniciará automáticamente.
              </p>
            </div>
          )}

          {state === "error" && (
            <div className="space-y-2">
              <p className="text-sm text-red-400">{errorMessage}</p>
              <p className="text-xs text-gray-500">
                Podés intentar de nuevo más tarde o descargar la actualización
                manualmente desde GitHub.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-700 px-6 py-4">
          {state === "info" && (
            <>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600"
              >
                Más tarde
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Descargar actualización
              </button>
            </>
          )}

          {state === "downloading" && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600"
            >
              Cancelar
            </button>
          )}

          {state === "downloaded" && (
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500"
            >
              Instalar y reiniciar
            </button>
          )}

          {state === "error" && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
