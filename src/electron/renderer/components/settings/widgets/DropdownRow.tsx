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

export function DropdownRow({ setting, ctx, focused }: Props) {
  const disabled = useMemo(() => isDisabled(setting, ctx), [setting, ctx]);
  const value = setting.get(ctx);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef(0);
  highlightRef.current = highlightIdx;

  const currentLabel =
    setting.options.find((o) => String(o.value) === String(value))?.label ??
    String(value);

  // Sync highlight to current value when opening
  useEffect(() => {
    if (isOpen) {
      const idx = setting.options.findIndex(
        (o) => String(o.value) === String(value)
      );
      const i = idx >= 0 ? idx : 0;
      setHighlightIdx(i);
      highlightRef.current = i;
    }
  }, [isOpen, value, setting.options]);

  // Close when row loses focus
  useEffect(() => {
    if (!focused) setIsOpen(false);
  }, [focused]);

  function selectOption(idx: number) {
    const opt = setting.options[idx];
    if (opt) void setting.set(opt.value, ctx);
    setIsOpen(false);
  }

  // Listen for gamepad dropdown-nav events
  const handleNav = useCallback(
    (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      if (detail === "open" && focused && !isOpen) {
        if (!disabled) setIsOpen(true);
        return;
      }
      if (!isOpen) return;
      switch (detail) {
        case "up":
          setHighlightIdx((i) => {
            const next = Math.max(0, i - 1);
            highlightRef.current = next;
            return next;
          });
          break;
        case "down":
          setHighlightIdx((i) => {
            const next = Math.min(setting.options.length - 1, i + 1);
            highlightRef.current = next;
            return next;
          });
          break;
        case "confirm":
          selectOption(highlightRef.current);
          break;
        case "cancel":
          setIsOpen(false);
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focused, isOpen, disabled, setting.options.length]
  );

  useEffect(() => {
    if (!focused && !isOpen) return;
    document.addEventListener("dropdown-nav", handleNav);
    return () => document.removeEventListener("dropdown-nav", handleNav);
  }, [focused, isOpen, handleNav]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      data-dropdown-open={isOpen || undefined}
      className="relative"
      style={{ marginBottom: "var(--spacing-row)" }}
    >
      {/* Row */}
      <div
        className={`flex items-center justify-between rounded-[var(--radius-md)] px-4 py-3 transition-colors folder-row-glass ${
          focused ? "ring-focus" : ""
        } ${disabled ? "opacity-50" : ""}`}
      >
        <div className="flex-1 pr-4">
          <div className="text-sm font-medium text-primary">{setting.label}</div>
          {setting.description && (
            <div className="mt-0.5 text-xs text-muted">{setting.description}</div>
          )}
        </div>

        <button
          type="button"
          onClick={() => { if (!disabled) setIsOpen((o) => !o); }}
          disabled={disabled}
          className="flex min-w-[140px] items-center justify-between rounded-md border border-white/10 bg-surface-0 px-3 py-1.5 text-sm text-primary outline-none transition-colors hover:border-white focus:border-[var(--color-accent)]"
        >
          <span className="truncate">{currentLabel}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ml-2 shrink-0 text-muted transition-transform"
            style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Options panel — absolute, floats over content below */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 z-50 mt-2 rounded-[var(--radius-md)] border border-white/10 py-1 shadow-xl"
          style={{ background: "#2c2e60" }}
        >
          {setting.options.map((opt, i) => (
            <div
              key={String(opt.value)}
              onMouseEnter={() => setHighlightIdx(i)}
              onClick={() => selectOption(i)}
              className={`cursor-pointer whitespace-nowrap px-3 py-2 text-sm transition-colors ${
                i === highlightIdx
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-primary hover:bg-[var(--color-surface-1)]"
              } ${
                String(opt.value) === String(value)
                  ? "font-medium"
                  : ""
              }`}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
