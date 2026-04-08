import { useMemo } from "react";
import type {
  SettingsContext,
  ToggleSetting,
} from "../../../schemas/settings-schema-types";
import { isDisabled } from "../../../schemas/settings-schema-types";

interface Props {
  setting: ToggleSetting;
  ctx: SettingsContext;
  focused: boolean;
}

export function ToggleRow({ setting, ctx, focused }: Props) {
  const disabled = useMemo(() => isDisabled(setting, ctx), [setting, ctx]);
  const value = setting.get(ctx);

  function onToggle() {
    if (disabled) return;
    void setting.set(!value, ctx);
  }

  return (
    <div
      role="switch"
      aria-checked={value}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`flex cursor-pointer items-center justify-between rounded-[var(--radius-md)] px-4 py-3 transition-colors folder-row-glass ${
        focused ? "ring-focus" : ""
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      style={{ marginBottom: "var(--spacing-row)" }}
    >
      <div className="flex-1 pr-4">
        <div className="text-sm font-medium text-primary">{setting.label}</div>
        {setting.description && (
          <div className="mt-0.5 text-xs text-muted">{setting.description}</div>
        )}
      </div>
      <div
        className="relative inline-block h-6 w-11 flex-shrink-0 rounded-full transition-colors"
        style={{
          background: value
            ? "var(--color-accent)"
            : "rgba(100, 116, 139, 0.4)",
        }}
      >
        <span
          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform"
          style={{
            transform: value ? "translateX(20px)" : "translateX(0)",
          }}
        />
      </div>
    </div>
  );
}
