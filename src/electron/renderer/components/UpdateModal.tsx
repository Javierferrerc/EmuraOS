import { useState, useEffect, useCallback } from "react";
import type { UpdateInfo } from "../../../core/types";

type ModalState = "ready" | "installing" | "error";

interface Props {
  updateInfo: UpdateInfo;
  onDismiss: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Shown only once the update has finished downloading in the background
 * (see AppContext `update-ready`). The user picks "restart now" — which
 * installs silently and relaunches — or "later", in which case the update
 * is applied automatically the next time the app quits.
 */
export function UpdateModal({ updateInfo, onDismiss }: Props) {
  const [state, setState] = useState<ModalState>("ready");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Esc dismisses (defer install to next quit) unless mid-install.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state !== "installing") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss, state]);

  const handleInstall = useCallback(async () => {
    setState("installing");
    try {
      // On success the main process quits and relaunches — no UI follow-up.
      await window.electronAPI.installUpdate();
    } catch (err: unknown) {
      console.error("[update] installUpdate failed:", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "No se pudo aplicar la actualización automáticamente."
      );
      setState("error");
    }
  }, []);

  const handleOpenReleasesPage = useCallback(async () => {
    try {
      await window.electronAPI.openExternal(
        "https://github.com/Javierferrerc/EmuraOS/releases/latest"
      );
    } catch (e) {
      console.warn("[update] could not open releases page:", e);
    }
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
                : "Actualización lista"}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              v{updateInfo.version}
              {updateInfo.size > 0 && ` — ${formatBytes(updateInfo.size)}`}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {state === "ready" && (
            <div className="space-y-3 text-sm text-gray-300">
              <p>
                Se descargó una nueva versión de EmuraOS. Reiniciá la app para
                aplicarla — se instala sola, no hace falta volver a instalar
                nada.
              </p>
              {updateInfo.releaseNotes && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/50 p-3 text-xs text-gray-400">
                  <p className="mb-1 font-semibold text-gray-300">
                    Novedades:
                  </p>
                  <pre className="whitespace-pre-wrap font-sans">
                    {updateInfo.releaseNotes}
                  </pre>
                </div>
              )}
            </div>
          )}

          {state === "installing" && (
            <p className="text-sm text-gray-300">
              Aplicando actualización y reiniciando...
            </p>
          )}

          {state === "error" && (
            <div className="space-y-3">
              <p className="text-sm text-red-400">{errorMessage}</p>
              <p className="text-xs text-gray-500">
                Podés descargar la última versión manualmente desde la página
                de releases.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-700 px-6 py-4">
          {state === "ready" && (
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
                onClick={handleInstall}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500"
              >
                Reiniciar ahora
              </button>
            </>
          )}

          {state === "error" && (
            <>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleOpenReleasesPage}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Abrir página de releases
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
