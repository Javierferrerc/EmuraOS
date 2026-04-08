import { useMemo } from "react";
import type {
  SettingsContext,
  SliderSetting,
} from "../../../schemas/settings-schema-types";
import { isDisabled } from "../../../schemas/settings-schema-types";

interface Props {
  setting: SliderSetting;
  ctx: SettingsContext;
  focused: boolean;
}

export function SliderRow({ setting, ctx, focused }: Props) {
  const disabled = useMemo(() => isDisabled(setting, ctx), [setting, ctx]);
  const value = setting.get(ctx);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (disabled) return;
    const n = Number(e.target.value);
    if (Number.isFinite(n)) void setting.set(n, ctx);
  }

  return (
    <div
      className={`rounded-[var(--radius-md)] px-4 py-3 transition-colors folder-row-glass ${
        focused ? "ring-focus" : ""
      } ${disabled ? "opacity-50" : ""}`}
      style={{ marginBottom: "var(--spacing-row)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex-1 pr-4">
          <div className="text-sm font-medium text-primary">
            {setting.label}
          </div>
          {setting.description && (
            <div className="mt-0.5 text-xs text-muted">
              {setting.description}
            </div>
          )}
        </div>
        <div className="min-w-[40px] text-right text-sm font-mono text-secondary">
          {value}
        </div>
      </div>
      <input
        type="range"
        min={setting.min}
        max={setting.max}
        step={setting.step ?? 1}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        className="w-full accent-[var(--color-accent)]"
      />
    </div>
  );
}
