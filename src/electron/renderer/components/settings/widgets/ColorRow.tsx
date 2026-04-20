import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  ColorSetting,
  SettingsContext,
} from "../../../schemas/settings-schema-types";
import { isDisabled } from "../../../schemas/settings-schema-types";

interface Props {
  setting: ColorSetting;
  ctx: SettingsContext;
  focused: boolean;
}

/** Walk up the DOM to find the first scrollable ancestor. */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    if (node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

export function ColorRow({ setting, ctx, focused }: Props) {
  const disabled = useMemo(() => isDisabled(setting, ctx), [setting, ctx]);
  const current = setting.get(ctx);
  const isCustom = current !== setting.defaultValue;
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const prevOverflowRef = useRef<string>("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Keep latest setting/ctx in refs so the native listener always reads
  // current values without needing to re-attach on every render.
  const settingRef = useRef(setting);
  const ctxRef = useRef(ctx);
  settingRef.current = setting;
  ctxRef.current = ctx;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      void setting.set(e.target.value, ctx);
    },
    [setting, ctx, disabled]
  );

  // Chromium's color picker fires the native "change" event (not "input")
  // when the user confirms. React's onChange only maps to "input", so we
  // attach a native listener to catch the confirmed value.
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onNativeChange = (e: Event) => {
      const value = (e.target as HTMLInputElement).value;
      void settingRef.current.set(value, ctxRef.current);
    };
    el.addEventListener("change", onNativeChange);
    return () => el.removeEventListener("change", onNativeChange);
  }, []);

  const handleReset = useCallback(() => {
    if (disabled) return;
    void setting.set(setting.defaultValue, ctx);
  }, [setting, ctx, disabled]);

  /** Lock the nearest scrollable ancestor so the Chromium popup doesn't drift. */
  const lockScroll = useCallback(() => {
    const parent = findScrollParent(wrapperRef.current);
    if (!parent) return;
    scrollParentRef.current = parent;
    prevOverflowRef.current = parent.style.overflow;
    parent.style.overflow = "hidden";
  }, []);

  const unlockScroll = useCallback(() => {
    if (scrollParentRef.current) {
      scrollParentRef.current.style.overflow = prevOverflowRef.current;
      scrollParentRef.current = null;
    }
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={`flex items-center gap-3 rounded-[var(--radius-md)] px-4 py-3 transition-colors ${
        focused ? "ring-focus" : ""
      } ${disabled ? "opacity-50" : ""}`}
      style={{ marginBottom: "var(--spacing-row)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-primary">{setting.label}</div>
        {setting.description && (
          <div className="mt-0.5 text-xs text-muted">{setting.description}</div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Swatch wrapper — the native <input type="color"> is overlaid on top
            at full size so the user's click directly triggers the Chromium
            color popup. The visible swatch is the div behind it. */}
        <div
          className="relative h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
          style={{
            backgroundColor: current,
            borderColor: "var(--color-border)",
          }}
        >
          <input
            ref={inputRef}
            type="color"
            value={current}
            onChange={handleChange}
            onClick={lockScroll}
            onBlur={unlockScroll}
            disabled={disabled}
            tabIndex={-1}
            title="Elegir color"
            className="absolute inset-0 cursor-pointer rounded-full opacity-0"
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        {/* Reset button — only shown when color differs from default */}
        {isCustom && (
          <button
            type="button"
            onClick={handleReset}
            disabled={disabled}
            className="flex h-7 w-7 items-center justify-center rounded-full border text-xs text-secondary transition-colors hover:bg-surface-2"
            style={{ borderColor: "var(--color-border)" }}
            title="Restaurar color por defecto"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
