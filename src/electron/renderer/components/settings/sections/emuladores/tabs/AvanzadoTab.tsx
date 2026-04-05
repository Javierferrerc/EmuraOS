import type { SettingsContext } from "../../../../../schemas/settings-schema-types";

interface Props {
  ctx: SettingsContext;
  emulatorId: string;
}

export function AvanzadoTab({ ctx, emulatorId }: Props) {
  const detected = ctx.lastDetection?.detected.find(
    (d) => d.id === emulatorId
  );

  return (
    <div className="space-y-4">
      {/* Path info */}
      {detected && (
        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
          <div className="mb-1 text-sm text-[var(--color-text-secondary)]">
            Ruta del ejecutable
          </div>
          <p className="break-all text-xs text-[var(--color-text-muted)]">
            {detected.executablePath}
          </p>
        </div>
      )}

      {/* Open config file */}
      {detected && (
        <button
          onClick={() =>
            window.electronAPI.openConfigFile(
              emulatorId,
              detected.executablePath
            )
          }
          className="rounded-lg border border-[var(--color-surface-2)] px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)]"
        >
          Abrir config en explorador
        </button>
      )}

      {!detected && (
        <p className="py-4 text-sm text-[var(--color-text-muted)]">
          Emulador no detectado. No hay opciones avanzadas disponibles.
        </p>
      )}
    </div>
  );
}
