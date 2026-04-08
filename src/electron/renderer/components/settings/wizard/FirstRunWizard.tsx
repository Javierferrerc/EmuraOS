import { useCallback, useEffect, useRef, useState } from "react";
import type { SettingsContext } from "../../../schemas/settings-schema-types";
import { WIZARD_STEPS } from "./wizard-steps";
import { SettingsListView, countVisibleRows } from "../shell/SettingsListView";
import { useNavigationSounds } from "../../../hooks/useNavigationSounds";
import xIcon from "../../../assets/icons/controls/x.svg";
import circleIcon from "../../../assets/icons/controls/circle.svg";
import triangleIcon from "../../../assets/icons/controls/triangle.svg";

interface Props {
  ctx: SettingsContext;
  onComplete: () => void;
}

// ── Focus model ──────────────────────────────────────────────────
// Two regions: "content" (rows / emulator list) and "buttons"
// (Skip · Atrás · Siguiente). D-pad navigates within a region;
// Down from content bottom → buttons; Up from buttons → content.

type WizardRegion = "content" | "buttons";

interface WizardFocusState {
  region: WizardRegion;
  contentIndex: number;
  buttonIndex: number;
}

type WizardFocusAction =
  | { type: "MOVE_UP" }
  | { type: "MOVE_DOWN" }
  | { type: "MOVE_LEFT" }
  | { type: "MOVE_RIGHT" }
  | { type: "ACTIVATE" }
  | { type: "BACK" }
  | { type: "SET_CONTENT"; index: number }
  | { type: "RESET"; contentCount: number };

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function createReducer(contentCount: number, buttonCount: number) {
  return function reducer(
    state: WizardFocusState,
    action: WizardFocusAction
  ): WizardFocusState {
    switch (action.type) {
      case "MOVE_UP":
        if (state.region === "content") {
          if (contentCount === 0) return state;
          return {
            ...state,
            contentIndex: clamp(state.contentIndex - 1, 0, contentCount - 1),
          };
        }
        // buttons → content (last item), skip if no content
        if (contentCount === 0) return state;
        return {
          ...state,
          region: "content",
          contentIndex: Math.max(0, contentCount - 1),
        };
      case "MOVE_DOWN":
        if (state.region === "content") {
          if (contentCount === 0 || state.contentIndex >= contentCount - 1) {
            // Jump to buttons
            return { ...state, region: "buttons", buttonIndex: Math.min(state.buttonIndex, buttonCount - 1) };
          }
          return {
            ...state,
            contentIndex: clamp(state.contentIndex + 1, 0, contentCount - 1),
          };
        }
        return state; // already at bottom
      case "MOVE_LEFT":
        if (state.region === "buttons") {
          return {
            ...state,
            buttonIndex: clamp(state.buttonIndex - 1, 0, buttonCount - 1),
          };
        }
        return state;
      case "MOVE_RIGHT":
        if (state.region === "buttons") {
          return {
            ...state,
            buttonIndex: clamp(state.buttonIndex + 1, 0, buttonCount - 1),
          };
        }
        return state;
      case "SET_CONTENT":
        return { ...state, region: "content", contentIndex: action.index };
      case "RESET":
        if (contentCount === 0) {
          return { region: "buttons", contentIndex: 0, buttonIndex: 0 };
        }
        return { region: "content", contentIndex: 0, buttonIndex: 0 };
      default:
        return state;
    }
  };
}

// ── Gamepad polling (wizard-scoped) ──────────────────────────────
const DEADZONE = 0.5;
const INITIAL_DELAY = 400;
const REPEAT_INTERVAL = 120;

type SimpleAction = "MOVE_UP" | "MOVE_DOWN" | "MOVE_LEFT" | "MOVE_RIGHT" | "ACTIVATE" | "BACK" | "SKIP" | "DOWNLOAD";

const GP_BUTTONS: Record<number, SimpleAction> = {
  0: "ACTIVATE",   // A / Cross
  1: "BACK",       // B / Circle
  2: "DOWNLOAD",   // X / Square
  3: "SKIP",       // Y / Triangle
  12: "MOVE_UP",   // D-pad Up
  13: "MOVE_DOWN", // D-pad Down
  14: "MOVE_LEFT", // D-pad Left
  15: "MOVE_RIGHT",// D-pad Right
};

function useWizardGamepad(onAction: (a: SimpleAction) => void) {
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const prevRef = useRef<Record<string, boolean>>({});
  const stateRef = useRef<Record<string, { t: number; rep: boolean }>>({});
  const rafRef = useRef(0);

  useEffect(() => {
    function fire(
      key: string,
      pressed: boolean,
      was: boolean,
      action: SimpleAction
    ) {
      const now = performance.now();
      if (pressed && !was) {
        onActionRef.current(action);
        stateRef.current[key] = { t: now, rep: false };
      } else if (pressed && was) {
        const s = stateRef.current[key];
        if (s) {
          const dt = now - s.t;
          if ((!s.rep && dt >= INITIAL_DELAY) || (s.rep && dt >= REPEAT_INTERVAL)) {
            onActionRef.current(action);
            stateRef.current[key] = { t: now, rep: true };
          }
        }
      } else if (!pressed) {
        delete stateRef.current[key];
      }
    }

    function poll() {
      const gp = navigator.getGamepads?.();
      let pad: Gamepad | null = null;
      if (gp) for (const g of gp) { if (g) { pad = g; break; } }

      if (pad) {
        for (const [idx, action] of Object.entries(GP_BUTTONS)) {
          const i = Number(idx);
          const pressed = pad.buttons[i]?.pressed ?? false;
          const was = prevRef.current[`b${i}`] ?? false;
          fire(`b${i}`, pressed, was, action);
          prevRef.current[`b${i}`] = pressed;
        }

        // Left stick
        const ax = pad.axes[0] ?? 0;
        const ay = pad.axes[1] ?? 0;
        const absX = Math.abs(ax);
        const absY = Math.abs(ay);
        const sticks: Array<{ k: string; p: boolean; a: SimpleAction }> = [
          { k: "sl", p: absX >= DEADZONE && absX > absY && ax < 0, a: "MOVE_LEFT" },
          { k: "sr", p: absX >= DEADZONE && absX > absY && ax > 0, a: "MOVE_RIGHT" },
          { k: "su", p: absY >= DEADZONE && absY >= absX && ay < 0, a: "MOVE_UP" },
          { k: "sd", p: absY >= DEADZONE && absY >= absX && ay > 0, a: "MOVE_DOWN" },
        ];
        for (const { k, p, a } of sticks) {
          const was = prevRef.current[k] ?? false;
          fire(k, p, was, a);
          prevRef.current[k] = p;
        }
      }
      rafRef.current = requestAnimationFrame(poll);
    }

    rafRef.current = requestAnimationFrame(poll);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);
}

// ── Component ────────────────────────────────────────────────────

/**
 * Multi-step first-run wizard. Reuses SettingsListView to render each
 * step's groups — zero UI code duplication with Settings.
 *
 * Supports gamepad and keyboard navigation across content rows and
 * bottom action buttons.
 */
export function FirstRunWizard({ ctx, onComplete }: Props) {
  const { playNavigate, playSelect } = useNavigationSounds();
  const [stepIndex, setStepIndex] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Track dropdown open/close via DOM mutations
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDropdownOpen(!!document.querySelector("[data-dropdown-open]"));
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["data-dropdown-open"] });
    return () => observer.disconnect();
  }, []);
  const step = WIZARD_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === WIZARD_STEPS.length - 1;

  // Content item count: for SettingsListView steps, count visible rows.
  // For custom steps (Emuladores), the component reports its count via state
  // so changes trigger a re-render and the reducer always has the latest value.
  const [customContentCount, setCustomContentCount] = useState(0);
  const contentCount = step.customComponent
    ? customContentCount
    : countVisibleRows(step.groups);

  // Button layout: [(Skip?), (Back?), Next]
  const showSkip = !isFirst && !isLast;
  const buttons: Array<{ id: string; label: string; action: () => void }> = [];
  if (showSkip) buttons.push({ id: "skip", label: "Saltar", action: handleSkip });
  if (!isFirst) buttons.push({ id: "back", label: "Atrás", action: handleBack });
  buttons.push({ id: "next", label: isLast ? "Empezar" : "Siguiente", action: handleNext });
  const buttonCount = buttons.length;

  // Ref-backed focus state: each dispatch reads from the ref so rapid
  // gamepad inputs (batched by React) never skip boundary items.
  const reducerFn = createReducer(contentCount, buttonCount);
  const focusRef = useRef<WizardFocusState>({ region: "content", contentIndex: 0, buttonIndex: 0 });
  const [focus, setFocus] = useState<WizardFocusState>(focusRef.current);

  function dispatch(action: WizardFocusAction) {
    const next = reducerFn(focusRef.current, action);
    focusRef.current = next;
    setFocus(next);
  }

  // Reset focus when step changes or content count changes
  useEffect(() => {
    dispatch({ type: "RESET", contentCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, contentCount]);

  // ── Actions ──
  const activateRef = useRef<(() => void) | null>(null);
  const downloadRef = useRef<(() => void) | null>(null);

  async function handleNext() {
    if (isLast) {
      await ctx.updateConfig({ firstRunCompleted: true });
      onComplete();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function handleBack() {
    if (!isFirst) setStepIndex((i) => i - 1);
  }

  function handleSkip() {
    ctx.updateConfig({ firstRunCompleted: true });
    onComplete();
  }

  // ── Input handling ──
  const handleAction = useCallback(
    (action: SimpleAction) => {
      // When a custom dropdown is open, forward input to it.
      if (document.querySelector("[data-dropdown-open]")) {
        const map: Partial<Record<SimpleAction, string>> = {
          MOVE_UP: "up", MOVE_DOWN: "down",
          ACTIVATE: "confirm", BACK: "cancel",
        };
        const detail = map[action];
        if (detail) {
          if (detail === "up" || detail === "down") playNavigate();
          document.dispatchEvent(new CustomEvent("dropdown-nav", { detail }));
        }
        return;
      }

      switch (action) {
        case "MOVE_UP":
        case "MOVE_DOWN":
          playNavigate();
          dispatch({ type: action });
          break;
        case "MOVE_LEFT":
        case "MOVE_RIGHT":
          playNavigate();
          // Forward left/right to selector widgets when in content region
          if (focus.region === "content") {
            document.dispatchEvent(
              new CustomEvent("selector-nav", {
                detail: action === "MOVE_LEFT" ? "left" : "right",
              })
            );
          }
          dispatch({ type: action });
          break;
        case "ACTIVATE":
          playSelect();
          if (focus.region === "buttons") {
            buttons[focus.buttonIndex]?.action();
          } else {
            // Delegate to content (custom step handles via its own activate)
            activateRef.current?.();
          }
          break;
        case "BACK":
          playSelect();
          if (!isFirst) handleBack();
          break;
        case "SKIP":
          if (showSkip) {
            playSelect();
            handleSkip();
          }
          break;
        case "DOWNLOAD":
          playSelect();
          downloadRef.current?.();
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focus.region, focus.buttonIndex, isFirst, buttons, playNavigate, playSelect]
  );

  // Keyboard
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      let action: SimpleAction | null = null;
      switch (e.key) {
        case "ArrowUp": action = "MOVE_UP"; break;
        case "ArrowDown": action = "MOVE_DOWN"; break;
        case "ArrowLeft": action = "MOVE_LEFT"; break;
        case "ArrowRight": action = "MOVE_RIGHT"; break;
        case "Enter": case " ": action = "ACTIVATE"; break;
        case "Escape": case "Backspace": action = "BACK"; break;
      }
      if (action) {
        e.preventDefault();
        handleAction(action);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleAction]);

  // Gamepad
  useWizardGamepad(handleAction);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className={`flex w-full max-w-lg flex-col rounded-[var(--radius-xl)] shadow-2xl ${dropdownOpen ? "max-h-[95vh]" : "max-h-[80vh]"}`} style={{ background: "var(--color-bg-gradient)" }}>
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 px-6 pt-6">
          {WIZARD_STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-2 rounded-full transition-all ${
                i === stepIndex
                  ? "w-6 bg-[var(--color-accent)]"
                  : i < stepIndex
                    ? "w-2 bg-[var(--color-accent)]/50"
                    : "w-2 bg-[var(--color-surface-2)]"
              }`}
            />
          ))}
        </div>

        {/* Step label */}
        <div className="px-6 pt-4 text-center">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            {step.label}
          </h2>
        </div>

        {/* Step content */}
        <div className={`wizard-scroll px-6 py-4 ${dropdownOpen ? "flex-1 overflow-visible" : "flex-1 overflow-y-auto"}`}>
          {step.customComponent ? (
            <step.customComponent
              ctx={ctx}
              focusedIndex={focus.region === "content" ? focus.contentIndex : -1}
              regionFocused={focus.region === "content"}
              onItemCount={setCustomContentCount}
              onActivate={activateRef}
              onDownload={downloadRef}
              onNext={handleNext}
            />
          ) : (
            <SettingsListView
              groups={step.groups}
              ctx={ctx}
              focusedRowIndex={focus.region === "content" ? focus.contentIndex : -1}
              regionFocused={focus.region === "content"}
              onRowActivate={(index) => dispatch({ type: "SET_CONTENT", index })}
              activateRef={activateRef}
              overflowVisible={dropdownOpen}
              noPadding
            />
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between border-t border-[var(--color-surface-1)] px-6 py-4">
          {/* Skip (left side) — only shown when not on first step */}
          {buttons.find((b) => b.id === "skip") ? (
            (() => {
              const skipIdx = buttons.findIndex((b) => b.id === "skip");
              const skipBtn = buttons[skipIdx];
              return (
                <button
                  onClick={skipBtn.action}
                  className={`flex items-center gap-1.5 text-xs transition-colors ${
                    focus.region === "buttons" && focus.buttonIndex === skipIdx
                      ? "text-[var(--color-text-primary)] ring-focus rounded px-2 py-1"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                  }`}
                >
                  {ctx.gamepadConnected && <img src={triangleIcon} alt="" className="h-4 w-4" />}
                  {skipBtn.label}
                </button>
              );
            })()
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            {buttons.filter((b) => b.id !== "skip").map((btn) => {
              const globalIdx = buttons.findIndex((b) => b.id === btn.id);
              const isFocused = focus.region === "buttons" && focus.buttonIndex === globalIdx;
              const isNext = btn.id === "next";
              const gpIcon = ctx.gamepadConnected
                ? btn.id === "next" ? xIcon : btn.id === "back" ? circleIcon : null
                : null;
              return (
                <button
                  key={btn.id}
                  onClick={btn.action}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition-colors ${
                    isNext
                      ? "font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]"
                      : "border border-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)]"
                  } ${isFocused ? "ring-focus" : ""}`}
                >
                  {gpIcon && <img src={gpIcon} alt="" className="h-4 w-4" />}
                  {btn.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
