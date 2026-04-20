import { useEffect, useMemo, useState } from "react";
import type {
  PathSetting,
  SettingsContext,
} from "../../../schemas/settings-schema-types";
import { isDisabled } from "../../../schemas/settings-schema-types";

interface Props {
  setting: PathSetting;
  ctx: SettingsContext;
  focused: boolean;
}

export function PathRow({ setting, ctx, focused }: Props) {
  const disabled = useMemo(() => isDisabled(setting, ctx), [setting, ctx]);
  const initial = setting.get(ctx);
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  function commit() {
    if (disabled) return;
    if (draft !== initial) {
      void setting.set(draft, ctx);
    }
  }

  return (
    <div
      className={`rounded-[var(--radius-md)] px-4 py-3 transition-colors folder-row-glass ${
        focused ? "ring-focus" : ""
      } ${disabled ? "opacity-50" : ""}`}
      style={{ marginBottom: "var(--spacing-row)" }}
    >
      <div className="mb-2">
        <div className="text-sm font-medium text-primary">{setting.label}</div>
        {setting.description && (
          <div className="mt-0.5 text-xs text-muted">{setting.description}</div>
        )}
      </div>
      <input
        type={setting.secret ? "password" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        className="w-full rounded-md border bg-surface-0 px-3 py-1.5 text-sm text-primary outline-none focus:border-[var(--color-accent)]"
        style={{ borderColor: "var(--color-border)" }}
      />
    </div>
  );
}
