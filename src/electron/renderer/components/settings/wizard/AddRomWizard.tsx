import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigationSounds } from "../../../hooks/useNavigationSounds";
import triangleIcon from "../../../assets/icons/controls/triangle.svg";
import xIcon from "../../../assets/icons/controls/x.svg";

interface Props {
  onComplete: () => void;
  onAddRoms: () => Promise<void>;
  availableSystems: Array<{ id: string; name: string }>;
  gamepadConnected: boolean;
  isAddingRoms: boolean;
}

// ── Gamepad polling (simplified for 2-button wizard) ─────────────
const DEADZONE = 0.5;
const INITIAL_DELAY = 400;
const REPEAT_INTERVAL = 120;

type SimpleAction = "LEFT" | "RIGHT" | "ACTIVATE" | "BACK";

export function AddRomWizard({
  onComplete,
  onAddRoms,
  availableSystems,
  gamepadConnected,
  isAddingRoms,
}: Props) {
  const { playNavigate, playSelect } = useNavigationSounds();
  // 0 = Skip, 1 = Agregar ROMs
  const [focusedButton, setFocusedButton] = useState(1);

  // ── Action handler ──
  const handleAction = useCallback(
    (action: SimpleAction) => {
      switch (action) {
        case "LEFT":
          playNavigate();
          setFocusedButton(0);
          break;
        case "RIGHT":
          playNavigate();
          setFocusedButton(1);
          break;
        case "ACTIVATE":
          playSelect();
          if (focusedButton === 0) {
            onComplete();
          } else {
            onAddRoms();
          }
          break;
        case "BACK":
          playSelect();
          onComplete();
          break;
      }
    },
    [focusedButton, onComplete, onAddRoms, playNavigate, playSelect]
  );

  // ── Keyboard ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      let action: SimpleAction | null = null;
      switch (e.key) {
        case "ArrowLeft":
          action = "LEFT";
          break;
        case "ArrowRight":
          action = "RIGHT";
          break;
        case "Enter":
        case " ":
          action = "ACTIVATE";
          break;
        case "Escape":
          action = "BACK";
          break;
      }
      if (action) {
        e.preventDefault();
        handleAction(action);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleAction]);

  // ── Gamepad polling ──
  const handleActionRef = useRef(handleAction);
  handleActionRef.current = handleAction;

  const prevRef = useRef<Record<string, boolean>>({});
  const stateRef = useRef<Record<string, { t: number; rep: boolean }>>({});

  useEffect(() => {
    function fire(
      key: string,
      pressed: boolean,
      was: boolean,
      action: SimpleAction
    ) {
      const now = performance.now();
      if (pressed && !was) {
        handleActionRef.current(action);
        stateRef.current[key] = { t: now, rep: false };
      } else if (pressed && was) {
        const s = stateRef.current[key];
        if (s) {
          const dt = now - s.t;
          if (
            (!s.rep && dt >= INITIAL_DELAY) ||
            (s.rep && dt >= REPEAT_INTERVAL)
          ) {
            handleActionRef.current(action);
            stateRef.current[key] = { t: now, rep: true };
          }
        }
      } else if (!pressed) {
        delete stateRef.current[key];
      }
    }

    let raf = 0;
    function poll() {
      const gp = navigator.getGamepads?.();
      let pad: Gamepad | null = null;
      if (gp) for (const g of gp) if (g) { pad = g; break; }

      if (pad) {
        // A = activate, B = back
        const bindings: Array<[number, SimpleAction]> = [
          [0, "ACTIVATE"],
          [1, "BACK"],
          [14, "LEFT"],
          [15, "RIGHT"],
        ];
        for (const [i, action] of bindings) {
          const pressed = pad.buttons[i]?.pressed ?? false;
          const was = prevRef.current[`b${i}`] ?? false;
          fire(`b${i}`, pressed, was, action);
          prevRef.current[`b${i}`] = pressed;
        }

        // Left stick horizontal
        const ax = pad.axes[0] ?? 0;
        const leftPressed = Math.abs(ax) >= DEADZONE && ax < 0;
        const rightPressed = Math.abs(ax) >= DEADZONE && ax > 0;

        fire("sl", leftPressed, prevRef.current["sl"] ?? false, "LEFT");
        prevRef.current["sl"] = leftPressed;
        fire("sr", rightPressed, prevRef.current["sr"] ?? false, "RIGHT");
        prevRef.current["sr"] = rightPressed;
      }
      raf = requestAnimationFrame(poll);
    }

    raf = requestAnimationFrame(poll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="flex w-full max-w-lg flex-col rounded-[var(--radius-xl)] shadow-2xl"
        style={{ background: "var(--color-bg-gradient)" }}
      >
        {/* Header */}
        <div className="px-6 pt-6 text-center">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            Agrega tus primeros juegos
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            No se encontraron ROMs. Selecciona archivos para empezar a jugar.
          </p>
        </div>

        {/* Systems chips */}
        <div className="px-6 py-4">
          {availableSystems.length > 0 ? (
            <>
              <p className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
                Sistemas disponibles
              </p>
              <div className="flex flex-wrap gap-2">
                {availableSystems.map((sys) => (
                  <span
                    key={sys.id}
                    className="rounded-full bg-[var(--color-surface-1)] px-3 py-1 text-xs text-[var(--color-text-secondary)]"
                  >
                    {sys.name}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              No se detectaron emuladores. Puedes agregar ROMs igualmente y
              configurar emuladores después.
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between border-t border-[var(--color-surface-1)] px-6 py-4">
          <button
            onClick={onComplete}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              focusedButton === 0
                ? "text-[var(--color-text-primary)] ring-focus rounded px-2 py-1"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            {gamepadConnected && (
              <img src={triangleIcon} alt="" className="h-4 w-4" />
            )}
            Saltar
          </button>
          <button
            onClick={() => onAddRoms()}
            disabled={isAddingRoms}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60 ${
              focusedButton === 1 ? "ring-focus" : ""
            }`}
          >
            {gamepadConnected && (
              <img src={xIcon} alt="" className="h-4 w-4" />
            )}
            {isAddingRoms ? "Agregando..." : "Agregar ROMs"}
          </button>
        </div>
      </div>
    </div>
  );
}
