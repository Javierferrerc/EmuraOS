import { useState, useEffect } from "react";
import type { SettingsContext } from "../../../schemas/settings-schema-types";
import type {
  Prerequisite,
  PrerequisiteCheckResult,
} from "./prerequisite-types";

interface Props {
  prerequisite: Prerequisite;
  ctx: SettingsContext;
}

const SEVERITY_STYLES: Record<
  string,
  { border: string; bg: string; text: string }
> = {
  error: {
    border: "border-[var(--color-bad)]/30",
    bg: "bg-[var(--color-bad)]/5",
    text: "text-[var(--color-bad)]",
  },
  warning: {
    border: "border-[var(--color-warn)]/30",
    bg: "bg-[var(--color-warn)]/5",
    text: "text-[var(--color-warn)]",
  },
  ok: {
    border: "border-[var(--color-good)]/30",
    bg: "bg-[var(--color-good)]/5",
    text: "text-[var(--color-good)]",
  },
};

export function PrerequisiteCard({ prerequisite, ctx }: Props) {
  const [result, setResult] = useState<PrerequisiteCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    prerequisite.check(ctx).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [prerequisite, ctx]);

  if (!result) return null;
  // Don't show card when everything is OK and there's no action needed
  if (result.severity === "ok" && !prerequisite.actionLabel) return null;

  const styles = SEVERITY_STYLES[result.severity] ?? SEVERITY_STYLES.warning;

  return (
    <div
      className={`rounded-[var(--radius-md)] border p-4 ${styles.border} ${styles.bg}`}
    >
      <h3 className={`mb-1 text-sm font-semibold ${styles.text}`}>
        {prerequisite.title}
      </h3>
      <p className="mb-1 text-xs text-[var(--color-text-muted)]">
        {prerequisite.description}
      </p>
      {result.detail && (
        <p className={`mb-2 text-xs font-medium ${styles.text}`}>
          {result.detail}
        </p>
      )}
      {prerequisite.legalNote && (
        <p className="mb-2 text-[10px] italic text-[var(--color-text-muted)] opacity-70">
          {prerequisite.legalNote}
        </p>
      )}
      <div className="flex items-center gap-2">
        {prerequisite.actionLabel && prerequisite.action && (
          <button
            onClick={() => prerequisite.action!(ctx)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]"
          >
            {prerequisite.actionLabel}
          </button>
        )}
        {prerequisite.docsUrl && (
          <button
            onClick={() =>
              window.electronAPI.openExternal(prerequisite.docsUrl!)
            }
            className="text-xs text-[var(--color-accent)] underline"
          >
            Documentación
          </button>
        )}
      </div>
    </div>
  );
}
