import { useEffect } from "react";

interface Props {
  gameName: string;
  onGoToSettings: () => void;
  onCancel: () => void;
}

/**
 * Shown when the user tries to launch a Wii U game but Cemu's keys.txt is
 * missing (or empty). Explains the problem and sends the user to Settings
 * where they can paste the keys — after which the pending game will launch
 * automatically.
 */
export function CemuKeysMissingModal({
  gameName,
  onGoToSettings,
  onCancel,
}: Props) {
  // Esc closes the modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-gray-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-gray-700 px-6 py-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-950/60">
            <svg
              className="h-6 w-6 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-white">
              No se puede iniciar el juego
            </h2>
            <p className="mt-1 truncate text-sm text-gray-400">{gameName}</p>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-3 px-6 py-4 text-sm text-gray-300">
          <p>
            Cemu no puede desencriptar este juego porque no se encontraron las
            <span className="font-semibold text-white"> disc keys</span>.
          </p>
          <p className="text-gray-400">
            Los juegos de Wii U en formato{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-blue-300">
              .wud
            </code>{" "}
            /{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-blue-300">
              .wux
            </code>{" "}
            están encriptados y requieren un archivo{" "}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-blue-300">
              keys.txt
            </code>{" "}
            con las claves correspondientes.
          </p>

          <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-3">
            <p className="text-xs text-amber-200">
              <strong>Nota legal:</strong> Las disc keys son material propietario
              de Nintendo. EmuraOS no puede distribuirlas. Necesitás
              obtenerlas de tu propia Wii U o tener juegos pre-desencriptados
              (formatos{" "}
              <code className="text-amber-100">.rpx</code> /{" "}
              <code className="text-amber-100">.wua</code>).
            </p>
          </div>

          <p className="text-xs text-gray-500">
            Hacé click en <strong className="text-gray-300">Ir a
            configuración</strong> para pegar tus keys. Después de guardarlas,
            el juego se iniciará automáticamente.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-700 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onGoToSettings}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            Ir a configuración
          </button>
        </div>
      </div>
    </div>
  );
}
