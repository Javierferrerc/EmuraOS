import { useMemo, useState } from "react";
import type {
  ButtonSetting,
  SettingsContext,
} from "../../../schemas/settings-schema-types";
import { isDisabled } from "../../../schemas/settings-schema-types";

interface Props {
  setting: ButtonSetting;
  ctx: SettingsContext;
  focused: boolean;
}

export function ButtonRow({ setting, ctx, focused }: Props) {
  const disabled = useMemo(() => isDisabled(setting, ctx), [setting, ctx]);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const status = setting.status?.(ctx);

  async function handleClick() {
    if (disabled) return;
    if (setting.confirmLabel && !awaitingConfirm) {
      setAwaitingConfirm(true);
      return;
    }
    setAwaitingConfirm(false);
    await setting.run(ctx);
  }

  const variant = setting.variant ?? "primary";
  const bg =
    variant === "danger"
      ? "rgba(239, 68, 68, 0.85)"
      : variant === "ghost"
        ? "transparent"
        : "var(--color-accent)";
  const border = variant === "ghost" ? "1px solid rgba(255,255,255,0.15)" : "none";

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
        {status && (
          <div className="mt-1 text-xs text-secondary">{status}</div>
        )}
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed"
        style={{ background: bg, border }}
      >
        {awaitingConfirm
          ? (setting.confirmLabel ?? setting.label)
          : setting.label}
      </button>
    </div>
  );
}
