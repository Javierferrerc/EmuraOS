import type {
  InfoSetting,
  SettingsContext,
} from "../../../schemas/settings-schema-types";

interface Props {
  setting: InfoSetting;
  ctx: SettingsContext;
  focused: boolean;
}

export function InfoRow({ setting, ctx, focused }: Props) {
  const value = setting.value(ctx);
  const tone = setting.tone ?? "default";
  const toneColor =
    tone === "good"
      ? "var(--color-good)"
      : tone === "warn"
        ? "var(--color-warn)"
        : tone === "bad"
          ? "var(--color-bad)"
          : "var(--color-text-secondary)";

  return (
    <div
      className={`flex items-center justify-between rounded-md px-4 py-3 transition-colors ${
        focused ? "ring-focus bg-surface-2" : "bg-surface-1"
      }`}
      style={{ marginBottom: "var(--spacing-row)" }}
    >
      <div className="flex-1 pr-4">
        <div className="text-sm font-medium text-primary">{setting.label}</div>
        {setting.description && (
          <div className="mt-0.5 text-xs text-muted">{setting.description}</div>
        )}
      </div>
      <div className="text-sm font-mono" style={{ color: toneColor }}>
        {value}
      </div>
    </div>
  );
}
