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

  const isGlass = setting.variant === "glass";

  const bgClass = isGlass
    ? "info-row-glass"
    : `folder-row-glass ${focused ? "ring-focus" : ""}`;

  return (
    <div
      className={`flex ${setting.column ? "flex-col gap-1" : "items-center justify-between"} rounded-[var(--radius-md)] px-4 py-3 transition-colors ${bgClass}`}
      style={{ marginBottom: "var(--spacing-row)" }}
    >
      <div className={setting.column ? "" : "flex-1 pr-4"}>
        <div className="text-sm font-medium text-primary">{setting.label}</div>
        {setting.description && (
          <div className="mt-0.5 text-xs text-muted">{setting.description}</div>
        )}
      </div>
      <div className="text-sm" style={{ color: toneColor, fontFamily: "Poppins, sans-serif", fontWeight: 400 }}>
        {value}
      </div>
    </div>
  );
}
