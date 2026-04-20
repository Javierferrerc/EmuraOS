import { useEffect, useRef } from "react";
import type { FocusAction } from "./useFocusManager";

const KEY_MAP: Record<string, FocusAction> = {
  ArrowUp: { type: "MOVE_UP" },
  ArrowDown: { type: "MOVE_DOWN" },
  ArrowLeft: { type: "MOVE_LEFT" },
  ArrowRight: { type: "MOVE_RIGHT" },
  Enter: { type: "ACTIVATE" },
  " ": { type: "ACTIVATE" },
  Escape: { type: "BACK" },
  Tab: { type: "SECONDARY_ACTION" },
};

export function useKeyboardNav(options: {
  onAction: (action: FocusAction) => void;
  onToggleFullscreen: () => void;
  disabled?: boolean;
}) {
  const { onAction, onToggleFullscreen, disabled } = options;
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const onToggleRef = useRef(onToggleFullscreen);
  onToggleRef.current = onToggleFullscreen;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (disabledRef.current) return;
      // F10 toggles fullscreen
      if (e.key === "F10") {
        e.preventDefault();
        onToggleRef.current();
        return;
      }

      // Don't intercept when typing in input fields
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        // Still allow Escape to blur the input
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      const action = KEY_MAP[e.key];
      if (action) {
        e.preventDefault();
        onActionRef.current(action);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
