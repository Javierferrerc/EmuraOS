import { useEffect, useMemo, useState } from "react";
import type {
  FolderSetting,
  SettingsContext,
} from "../../../schemas/settings-schema-types";
import { isDisabled } from "../../../schemas/settings-schema-types";

interface Props {
  setting: FolderSetting;
  ctx: SettingsContext;
  focused: boolean;
}

export function FolderRow({ setting, ctx, focused }: Props) {
  const disabled = useMemo(() => isDisabled(setting, ctx), [setting, ctx]);
  const initial = setting.get(ctx);
  const [draft, setDraft] = useState(initial);

  // Sync external changes into the draft when the underlying config moves.
  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const hintPath = setting.hint?.(ctx);
  // Only show the hint when it differs from the value the user sees.
  const showHint = hintPath && hintPath !== draft;

  function commit() {
    if (disabled) return;
    if (draft !== initial) {
      void setting.set(draft, ctx);
    }
  }

  async function browse() {
    if (disabled) return;
    try {
      const picked = await window.electronAPI.pickFolder();
      if (picked) {
        setDraft(picked);
        await setting.set(picked, ctx);
      }
    } catch (err) {
      console.warn("pickFolder failed:", err);
    }
  }

  async function openFolder() {
    const target = hintPath || draft;
    if (!target) return;
    try {
      await window.electronAPI.openFolder(target);
    } catch (err) {
      console.warn("openFolder failed:", err);
    }
  }

  return (
    <div
      className={`folder-row-glass rounded-[var(--radius-md)] px-4 py-3 transition-colors ${
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
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          className="flex-1 rounded-md border bg-surface-transparent px-3 py-1.5 text-sm text-primary outline-none focus:border-[var(--color-accent)]"
          style={{ borderColor: "var(--color-border)" }}
        />
        <button
          type="button"
          onClick={browse}
          disabled={disabled}
          className="rounded-md border bg-surface-transparent px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50"
            style={{ borderColor: "var(--color-border)" }}
        >
          Browse…
        </button>
        {setting.openable && (
          <button
            type="button"
            onClick={openFolder}
            disabled={disabled}
            title="Abrir carpeta"
            className="rounded-md border bg-surface-transparent px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50"
            style={{ borderColor: "var(--color-border)" }}
          >
            📂
          </button>
        )}
      </div>
      {showHint && (
        <div className="mt-1.5 truncate text-xs text-muted opacity-70">
          {hintPath}
        </div>
      )}
    </div>
  );
}
