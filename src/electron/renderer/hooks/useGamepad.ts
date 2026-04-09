import { useEffect, useRef, useState, useCallback } from "react";
import type { FocusAction } from "./useFocusManager";

// Standard Gamepad button → FocusAction mapping
const BUTTON_MAP: Record<number, FocusAction> = {
  0: { type: "ACTIVATE" },        // A / Cross
  1: { type: "BACK" },            // B / Circle
  2: { type: "SECONDARY_ACTION" }, // X / Square
  3: { type: "TOGGLE_FAVORITE" },  // Y / Triangle
  4: { type: "PREV_FILTER" },   // LB
  5: { type: "NEXT_FILTER" },   // RB
  9: { type: "OPEN_SETTINGS" }, // Start
  12: { type: "MOVE_UP" },      // D-pad Up
  13: { type: "MOVE_DOWN" },    // D-pad Down
  14: { type: "MOVE_LEFT" },    // D-pad Left
  15: { type: "MOVE_RIGHT" },   // D-pad Right
};

const DEADZONE = 0.5;
const INITIAL_DELAY = 400;
const REPEAT_INTERVAL = 120;

interface ButtonState {
  lastPressTime: number;
  isRepeating: boolean;
}

export function useGamepad(options: {
  onAction: (action: FocusAction) => void;
  disabled?: boolean;
}): { gamepadConnected: boolean; gamepadName: string | null } {
  const { onAction, disabled } = options;
  const [connected, setConnected] = useState(false);
  const [gamepadName, setGamepadName] = useState<string | null>(null);

  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const prevButtonsRef = useRef<Record<number, boolean>>({});
  const buttonStateRef = useRef<Record<number, ButtonState>>({});
  const prevAxesRef = useRef<Record<string, boolean>>({});
  const axisStateRef = useRef<Record<string, ButtonState>>({});
  const rafRef = useRef<number>(0);

  const handleConnect = useCallback((e: GamepadEvent) => {
    setConnected(true);
    setGamepadName(e.gamepad.id);
  }, []);

  const handleDisconnect = useCallback(() => {
    setConnected(false);
    setGamepadName(null);
    prevButtonsRef.current = {};
    buttonStateRef.current = {};
    prevAxesRef.current = {};
    axisStateRef.current = {};
  }, []);

  useEffect(() => {
    window.addEventListener("gamepadconnected", handleConnect);
    window.addEventListener("gamepaddisconnected", handleDisconnect);

    // Check if gamepad already connected
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp) {
        setConnected(true);
        setGamepadName(gp.id);
        break;
      }
    }

    return () => {
      window.removeEventListener("gamepadconnected", handleConnect);
      window.removeEventListener("gamepaddisconnected", handleDisconnect);
    };
  }, [handleConnect, handleDisconnect]);

  useEffect(() => {
    if (!connected) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    function fireWithRepeat(
      key: string,
      pressed: boolean,
      wasPressed: boolean,
      stateMap: Record<string, ButtonState>,
      action: FocusAction
    ) {
      const now = performance.now();

      if (pressed && !wasPressed) {
        // Rising edge — fire immediately
        onActionRef.current(action);
        stateMap[key] = { lastPressTime: now, isRepeating: false };
      } else if (pressed && wasPressed) {
        // Held down — check repeat
        const bs = stateMap[key];
        if (bs) {
          const elapsed = now - bs.lastPressTime;
          if (!bs.isRepeating && elapsed >= INITIAL_DELAY) {
            onActionRef.current(action);
            stateMap[key] = { lastPressTime: now, isRepeating: true };
          } else if (bs.isRepeating && elapsed >= REPEAT_INTERVAL) {
            onActionRef.current(action);
            stateMap[key] = { lastPressTime: now, isRepeating: true };
          }
        }
      } else if (!pressed) {
        delete stateMap[key];
      }
    }

    // Seed previous state with the current gamepad snapshot so that
    // buttons/sticks already held when this hook mounts are not treated
    // as new presses (avoids phantom activations on view transitions).
    {
      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (!gp) continue;
        for (const indexStr of Object.keys(BUTTON_MAP)) {
          const idx = Number(indexStr);
          prevButtonsRef.current[idx] = gp.buttons[idx]?.pressed ?? false;
        }
        const axisX = gp.axes[0] ?? 0;
        const axisY = gp.axes[1] ?? 0;
        const absX = Math.abs(axisX);
        const absY = Math.abs(axisY);
        prevAxesRef.current["stick-left"] = absX >= DEADZONE && axisX < 0;
        prevAxesRef.current["stick-right"] = absX >= DEADZONE && axisX > 0;
        prevAxesRef.current["stick-up"] = absY >= DEADZONE && axisY < 0;
        prevAxesRef.current["stick-down"] = absY >= DEADZONE && axisY > 0;
        break;
      }
    }

    function poll() {
      if (disabledRef.current) {
        rafRef.current = requestAnimationFrame(poll);
        return;
      }
      const gamepads = navigator.getGamepads();
      let gp: Gamepad | null = null;
      for (const g of gamepads) {
        if (g) {
          gp = g;
          break;
        }
      }

      if (gp) {
        // Buttons
        for (const [indexStr, action] of Object.entries(BUTTON_MAP)) {
          const idx = Number(indexStr);
          const pressed = gp.buttons[idx]?.pressed ?? false;
          const wasPressed = prevButtonsRef.current[idx] ?? false;

          fireWithRepeat(
            `btn-${idx}`,
            pressed,
            wasPressed,
            buttonStateRef.current,
            action
          );
          prevButtonsRef.current[idx] = pressed;
        }

        // Left stick axes — only fire the dominant axis to prevent diagonal inputs
        const axisX = gp.axes[0] ?? 0;
        const axisY = gp.axes[1] ?? 0;
        const absX = Math.abs(axisX);
        const absY = Math.abs(axisY);
        const allowX = absX >= DEADZONE && absX > absY;
        const allowY = absY >= DEADZONE && absY >= absX;

        const stickActions: Array<{
          key: string;
          pressed: boolean;
          action: FocusAction;
        }> = [
          {
            key: "stick-left",
            pressed: allowX && axisX < 0,
            action: { type: "MOVE_LEFT" },
          },
          {
            key: "stick-right",
            pressed: allowX && axisX > 0,
            action: { type: "MOVE_RIGHT" },
          },
          {
            key: "stick-up",
            pressed: allowY && axisY < 0,
            action: { type: "MOVE_UP" },
          },
          {
            key: "stick-down",
            pressed: allowY && axisY > 0,
            action: { type: "MOVE_DOWN" },
          },
        ];

        for (const { key, pressed, action } of stickActions) {
          const wasPressed = prevAxesRef.current[key] ?? false;
          fireWithRepeat(
            key,
            pressed,
            wasPressed,
            axisStateRef.current,
            action
          );
          prevAxesRef.current[key] = pressed;
        }
      }

      rafRef.current = requestAnimationFrame(poll);
    }

    rafRef.current = requestAnimationFrame(poll);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [connected]);

  return { gamepadConnected: connected, gamepadName };
}
