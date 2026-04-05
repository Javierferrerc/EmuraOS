import type { SettingsContext } from "../../../../../schemas/settings-schema-types";
import { PrerequisiteCard } from "../../../prerequisites/PrerequisiteCard";
import { getPrerequisitesForEmulator } from "../../../prerequisites/registry";

interface Props {
  ctx: SettingsContext;
  emulatorId: string;
}

export function EstadoTab({ ctx, emulatorId }: Props) {
  const detected = ctx.lastDetection?.detected.find(
    (d) => d.id === emulatorId
  );
  const readiness = ctx.readinessReport?.results.find(
    (r) => r.emulatorId === emulatorId
  );
  const def = ctx.emulatorDefs.find((d) => d.id === emulatorId);
  const prerequisites = getPrerequisitesForEmulator(emulatorId);

  return (
    <div className="space-y-4">
      {/* Status info */}
      <div className="space-y-2 rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-secondary)]">
            Estado
          </span>
          <span
            className={`text-sm font-medium ${
              detected
                ? "text-[var(--color-good)]"
                : "text-[var(--color-text-muted)]"
            }`}
          >
            {detected ? "Instalado" : "No detectado"}
          </span>
        </div>

        {detected && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-secondary)]">
                Ruta
              </span>
              <span className="max-w-[60%] truncate text-xs text-[var(--color-text-muted)]">
                {detected.executablePath}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-secondary)]">
                Origen
              </span>
              <span className="text-sm text-[var(--color-text-muted)]">
                {detected.source === "emulatorsPath"
                  ? "Ruta personalizada"
                  : "Ruta por defecto"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-secondary)]">
                Sistemas
              </span>
              <span className="text-sm text-[var(--color-text-muted)]">
                {def?.systems.join(", ") ?? "-"}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Readiness */}
      {readiness && (
        <div className="space-y-2 rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Comprobación de preparación
          </h3>
          {readiness.isReady && readiness.errors.length === 0 && (
            <p className="text-sm text-[var(--color-good)]">
              Listo para usar.
            </p>
          )}
          {readiness.issues.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--color-warn)]">
                Avisos:
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-[var(--color-text-muted)]">
                {readiness.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          {readiness.fixed.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--color-accent)]">
                Cores instalados:
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-[var(--color-text-muted)]">
                {readiness.fixed.map((fix, i) => (
                  <li key={i}>{fix}</li>
                ))}
              </ul>
            </div>
          )}
          {readiness.errors.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--color-bad)]">
                Errores:
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-[var(--color-bad)]">
                {readiness.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Prerequisite cards */}
      {detected &&
        prerequisites.map((p) => (
          <PrerequisiteCard key={p.id} prerequisite={p} ctx={ctx} />
        ))}
    </div>
  );
}
