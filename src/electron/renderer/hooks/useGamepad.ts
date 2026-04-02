import { useEffect, useRef, useState, useCallback } from "react";
import type { FocusAction } from "./useFocusManager";

// Standard Gamepad button → FocusAction mapping
const BUTTON_MAP: Record<number, FocusAction> = {
  0: { type: "ACTIVATE" },      // A / Cross
  1: { type: "BACK" },          // B / Circle
  3: { type: "TOGGLE_FAVORITE" }, // Y / Triangle
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
}): { gamepadConnected: boolean; gamepadName: string | null } {
  const { onAction } = options;
  const [connected, setConnected] = useState(false);
  const [gamepadName, setGamepadName] = useState<string | null>(null);

  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

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

    function poll() {
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

        // Left stick axes
        const axisX = gp.axes[0] ?? 0;
        const axisY = gp.axes[1] ?? 0;

        const stickActions: Array<{
          key: string;
          pressed: boolean;
          action: FocusAction;
        }> = [
          {
            key: "stick-left",
            pressed: axisX < -DEADZONE,
            action: { type: "MOVE_LEFT" },
          },
          {
            key: "stick-right",
            pressed: axisX > DEADZONE,
            action: { type: "MOVE_RIGHT" },
          },
          {
            key: "stick-up",
            pressed: axisY < -DEADZONE,
            action: { type: "MOVE_UP" },
          },
          {
            key: "stick-down",
            pressed: axisY > DEADZONE,
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
