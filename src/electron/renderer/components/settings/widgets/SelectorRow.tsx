import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * Console-style inline selector: displays the current option centred
 * between left/right chevron arrows. Cycles through options via
 * click, keyboard arrows, or the `selector-nav` CustomEvent
 * dispatched by the wizard's gamepad handler.
 *
 * Includes a slide animation when the value changes direction.
 */
export function SelectorRow({ setting, ctx, focused }: Props) {
  const disabled = useMemo(() => isDisabled(setting, ctx), [setting, ctx]);
  const value = setting.get(ctx);

  const currentIdx = setting.options.findIndex(
    (o) => String(o.value) === String(value)
  );
  const idx = currentIdx >= 0 ? currentIdx : 0;
  const currentLabel = setting.options[idx]?.label ?? String(value);
  const canPrev = idx > 0;
  const canNext = idx < setting.options.length - 1;

  // Animation state
  const [animClass, setAnimClass] = useState("");
  const prevIdxRef = useRef(idx);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (prevIdxRef.current === idx) return;
    const dir = idx > prevIdxRef.current ? "slide-left" : "slide-right";
    prevIdxRef.current = idx;

    // Clear any pending reset
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Start from offset position (no transition), then animate to center
    setAnimClass(`${dir}-start`);
    // Force reflow before adding the animated class
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimClass(`${dir}-end`);
        timeoutRef.current = setTimeout(() => setAnimClass(""), 200);
      });
    });
  }, [idx]);

  function goTo(dir: -1 | 1) {
    if (disabled) return;
    const next = idx + dir;
    if (next < 0 || next >= setting.options.length) return;
    void setting.set(setting.options[next].value, ctx);
  }

  // Listen for gamepad selector-nav events when focused
  const handleNav = useCallback(
    (e: Event) => {
      if (!focused || disabled) return;
      const detail = (e as CustomEvent).detail as string;
      if (detail === "left") goTo(-1);
      else if (detail === "right") goTo(1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focused, disabled, idx, setting.options.length]
  );

  useEffect(() => {
    if (!focused) return;
    document.addEventListener("selector-nav", handleNav);
    return () => document.removeEventListener("selector-nav", handleNav);
  }, [focused, handleNav]);

  // Compute inline transform for the animation
  let transform = "translateX(0)";
  let transition = "none";
  if (animClass === "slide-left-start") {
    transform = "translateX(20px)";
  } else if (animClass === "slide-right-start") {
    transform = "translateX(-20px)";
  } else if (animClass === "slide-left-end" || animClass === "slide-right-end") {
    transform = "translateX(0)";
    transition = "transform var(--duration-base) var(--ease-standard), opacity var(--duration-base) var(--ease-standard)";
  }

  const opacity = animClass.endsWith("-start") ? 0 : 1;

  return (
    <div
      className={`flex items-center justify-between rounded-[var(--radius-md)] px-4 py-3 transition-colors folder-row-glass ${
        focused ? "ring-focus" : ""
      } ${disabled ? "opacity-50" : ""}`}
      style={{ marginBottom: "var(--spacing-row)" }}
    >
      <div className="flex-1 pr-4">
        <div className="text-sm font-medium text-primary">{setting.label}</div>
        {setting.description && (
          <div className="mt-0.5 text-xs text-muted">{setting.description}</div>
        )}
      </div>

      <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-surface-0 px-1 py-1 overflow-hidden">
        {/* Left arrow */}
        <button
          type="button"
          onClick={() => goTo(-1)}
          disabled={disabled || !canPrev}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors text-primary hover:bg-[var(--color-surface-1)] disabled:opacity-25"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        {/* Current value with slide animation */}
        <span
          className="min-w-[120px] text-center text-sm text-primary"
          style={{ transform, transition, opacity }}
        >
          {currentLabel}
        </span>

        {/* Right arrow */}
        <button
          type="button"
          onClick={() => goTo(1)}
          disabled={disabled || !canNext}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors text-primary hover:bg-[var(--color-surface-1)] disabled:opacity-25"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
