import { useMemo } from "react";
import type {
  DropdownSetting,
  SettingsContext,
  SettingValue,
} from "../../../schemas/settings-schema-types";
import { isDisabled } from "../../../schemas/settings-schema-types";

interface Props {
  setting: DropdownSetting<SettingValue>;
  ctx: SettingsContext;
  focused: boolean;
}

export function DropdownRow({ setting, ctx, focused }: Props) {
  const disabled = useMemo(() => isDisabled(setting, ctx), [setting, ctx]);
  const value = setting.get(ctx);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (disabled) return;
    const raw = e.target.value;
    // Coerce the string back to the original value type.
    const original = setting.options.find((o) => String(o.value) === raw);
    if (!original) return;
    void setting.set(original.value, ctx);
  }

  return (
    <div
      className={`flex items-center justify-between rounded-md px-4 py-3 transition-colors ${
        focused ? "ring-focus bg-surface-2" : "bg-surface-1"
      } ${disabled ? "opacity-50" : ""}`}
      style={{ marginBottom: "var(--spacing-row)" }}
    >
      <div className="flex-1 pr-4">
        <div className="text-sm font-medium text-primary">{setting.label}</div>
        {setting.description && (
          <div className="mt-0.5 text-xs text-muted">{setting.description}</div>
        )}
      </div>
      <select
        value={String(value)}
        onChange={handleChange}
        disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        className="min-w-[140px] rounded-md border border-white/10 bg-surface-0 px-3 py-1.5 text-sm text-primary outline-none focus:border-[var(--color-accent)]"
      >
        {setting.options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
