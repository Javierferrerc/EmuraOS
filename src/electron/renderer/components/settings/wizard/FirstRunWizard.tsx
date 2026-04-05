import { useState } from "react";
import type { SettingsContext } from "../../../schemas/settings-schema-types";
import { WIZARD_STEPS } from "./wizard-steps";
import { SettingsListView } from "../shell/SettingsListView";

interface Props {
  ctx: SettingsContext;
  onComplete: () => void;
}

/**
 * Multi-step first-run wizard. Reuses SettingsListView to render each
 * step's groups — zero UI code duplication with Settings.
 */
export function FirstRunWizard({ ctx, onComplete }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = WIZARD_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === WIZARD_STEPS.length - 1;

  async function handleNext() {
    if (isLast) {
      await ctx.updateConfig({ firstRunCompleted: true });
      onComplete();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function handleBack() {
    if (!isFirst) setStepIndex((i) => i - 1);
  }

  function handleSkip() {
    ctx.updateConfig({ firstRunCompleted: true });
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-[var(--radius-xl)] bg-[var(--color-bg)] shadow-2xl">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 px-6 pt-6">
          {WIZARD_STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-2 rounded-full transition-all ${
                i === stepIndex
                  ? "w-6 bg-[var(--color-accent)]"
                  : i < stepIndex
                    ? "w-2 bg-[var(--color-accent)]/50"
                    : "w-2 bg-[var(--color-surface-2)]"
              }`}
            />
          ))}
        </div>

        {/* Step label */}
        <div className="px-6 pt-4 text-center">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            {step.label}
          </h2>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <SettingsListView
            groups={step.groups}
            ctx={ctx}
            focusedRowIndex={-1}
            regionFocused={false}
            onRowActivate={() => {}}
          />
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between border-t border-[var(--color-surface-1)] px-6 py-4">
          <button
            onClick={handleSkip}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          >
            Saltar
          </button>
          <div className="flex gap-2">
            {!isFirst && (
              <button
                onClick={handleBack}
                className="rounded-lg border border-[var(--color-surface-2)] px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)]"
              >
                Atrás
              </button>
            )}
            <button
              onClick={handleNext}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]"
            >
              {isLast ? "Empezar" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
