import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef(0);
  highlightRef.current = highlightIdx;

  // Position of the fixed panel, computed from the button's bounding rect.
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

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

  // Compute the panel position when it opens, anchored below the trigger button.
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }, [isOpen]);

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
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
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
          ref={buttonRef}
          type="button"
          onClick={() => { if (!disabled) setIsOpen((o) => !o); }}
          disabled={disabled}
          className="flex min-w-[140px] items-center justify-between rounded-md border bg-surface-0 px-3 py-1.5 text-sm text-primary outline-none transition-colors focus:border-[var(--color-accent)]"
          style={{ borderColor: "var(--color-border)" }}
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

      {/* Options panel — fixed so it escapes overflow containers */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed z-[9999] rounded-[var(--radius-md)] border py-1 shadow-xl shadow-themed"
          style={{
            top: panelPos.top,
            left: panelPos.left,
            minWidth: panelPos.width,
            background: "var(--color-dropdown-bg)",
            borderColor: "var(--color-border)",
          }}
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
