import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SettingsContext } from "../../../../../schemas/settings-schema-types";
import { useApp } from "../../../../../context/AppContext";

/*
 * Native editor for Dolphin's GameCube controller config (GCPadNew.ini).
 *
 * Scope of this first cut:
 *  - Read/write the 4 [GCPadN] sections, preserving keys we don't manage
 *    (stick calibration, modifiers, etc).
 *  - Button detection via the Web Gamepad API, mapping the pressed button
 *    to Dolphin's SDL or XInput name depending on the Device line.
 *  - Stick / trigger axis remapping is deferred — detection flags axis
 *    movement and asks the user to use Dolphin's own dialog (reachable
 *    via the "Abrir Dolphin" button). The reason is that the Y-axis
 *    sign and trigger axis-vs-button conventions differ between Dolphin
 *    backends and Chromium's standard-mapping gamepads, so silent
 *    mis-detection would be worse than an honest fallback.
 */

type GcPadPort = 1 | 2 | 3 | 4;

interface GcPadPortConfig {
  entries: Record<string, string>;
}

interface GcPadConfig {
  configPath: string;
  exists: boolean;
  ports: Record<GcPadPort, GcPadPortConfig>;
  otherSections: Record<string, Record<string, string>>;
}

type ActionGroup = "buttons" | "main-stick" | "c-stick" | "triggers" | "d-pad";

interface GcPadAction {
  key: string;
  label: string;
  group: ActionGroup;
}

const ACTIONS: readonly GcPadAction[] = [
  { key: "Buttons/A", label: "A", group: "buttons" },
  { key: "Buttons/B", label: "B", group: "buttons" },
  { key: "Buttons/X", label: "X", group: "buttons" },
  { key: "Buttons/Y", label: "Y", group: "buttons" },
  { key: "Buttons/Z", label: "Z", group: "buttons" },
  { key: "Buttons/Start", label: "Start", group: "buttons" },
  { key: "Main Stick/Up", label: "Arriba", group: "main-stick" },
  { key: "Main Stick/Down", label: "Abajo", group: "main-stick" },
  { key: "Main Stick/Left", label: "Izquierda", group: "main-stick" },
  { key: "Main Stick/Right", label: "Derecha", group: "main-stick" },
  { key: "C-Stick/Up", label: "Arriba", group: "c-stick" },
  { key: "C-Stick/Down", label: "Abajo", group: "c-stick" },
  { key: "C-Stick/Left", label: "Izquierda", group: "c-stick" },
  { key: "C-Stick/Right", label: "Derecha", group: "c-stick" },
  { key: "Triggers/L", label: "L", group: "triggers" },
  { key: "Triggers/R", label: "R", group: "triggers" },
  { key: "D-Pad/Up", label: "Arriba", group: "d-pad" },
  { key: "D-Pad/Down", label: "Abajo", group: "d-pad" },
  { key: "D-Pad/Left", label: "Izquierda", group: "d-pad" },
  { key: "D-Pad/Right", label: "Derecha", group: "d-pad" },
] as const;

const GROUP_LABELS: Record<ActionGroup, string> = {
  buttons: "Botones",
  "main-stick": "Stick principal",
  "c-stick": "Stick C",
  triggers: "Gatillos",
  "d-pad": "Cruceta",
};

// Standard-mapping gamepad button index → Dolphin name, per backend.
// Keep both maps aligned in length; the button-only keys match
// Chromium's "Standard Gamepad" layout (0=south, 1=east, 2=west, 3=north).
const SDL_BUTTON_NAMES: Record<number, string> = {
  0: "Button S",
  1: "Button E",
  2: "Button W",
  3: "Button N",
  4: "Shoulder L",
  5: "Shoulder R",
  6: "Trigger L",
  7: "Trigger R",
  8: "Back",
  9: "Start",
  10: "Thumb L",
  11: "Thumb R",
  12: "Pad N",
  13: "Pad S",
  14: "Pad W",
  15: "Pad E",
  16: "Guide",
};

const XINPUT_BUTTON_NAMES: Record<number, string> = {
  0: "Button A",
  1: "Button B",
  2: "Button X",
  3: "Button Y",
  4: "Shoulder L",
  5: "Shoulder R",
  6: "Trigger L",
  7: "Trigger R",
  8: "Back",
  9: "Start",
  10: "Thumb L",
  11: "Thumb R",
  12: "Pad N",
  13: "Pad S",
  14: "Pad W",
  15: "Pad E",
  16: "Guide",
};

type Backend = "SDL" | "XInput" | "DInput" | "unknown";

function stripBackticks(s: string): string {
  return s.replace(/^`|`$/g, "").trim();
}

function detectBackend(deviceLine: string | undefined): Backend {
  if (!deviceLine) return "unknown";
  const stripped = stripBackticks(deviceLine);
  if (stripped.startsWith("SDL/")) return "SDL";
  if (stripped.startsWith("XInput/")) return "XInput";
  if (stripped.startsWith("DInput/")) return "DInput";
  return "unknown";
}

// Strip Chromium's "(STANDARD GAMEPAD Vendor: ... Product: ...)" suffix so
// the raw gamepad id becomes closer to what SDL reports. Imperfect but a
// useful hint in the Device dropdown.
function cleanGamepadName(raw: string): string {
  return raw.replace(/\s*\(.*\)\s*$/, "").trim();
}

function buttonIndexToDolphinName(
  idx: number,
  backend: Backend
): string | null {
  const table =
    backend === "XInput" ? XINPUT_BUTTON_NAMES : SDL_BUTTON_NAMES;
  const name = table[idx];
  if (!name) return null;
  // Wrap in backticks if the name contains spaces — matches how Dolphin
  // itself writes the file.
  return name.includes(" ") ? `\`${name}\`` : name;
}

interface Props {
  ctx: SettingsContext;
  emulatorId: string;
}

export function MandosTab({ ctx, emulatorId }: Props) {
  const { setControllerCaptureOpen } = useApp();
  const detected = ctx.lastDetection?.detected.find(
    (d) => d.id === emulatorId
  );
  const executablePath = detected?.executablePath;

  const [config, setConfig] = useState<GcPadConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePort, setActivePort] = useState<GcPadPort>(1);

  // Edited overrides per port. Only keys the user changed live here.
  const [edits, setEdits] = useState<Record<GcPadPort, Record<string, string>>>({
    1: {},
    2: {},
    3: {},
    4: {},
  });

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await window.electronAPI.getDolphinGcPadConfig();
      setConfig(data as GcPadConfig);
      setEdits({ 1: {}, 2: {}, 3: {}, 4: {} });
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (detected) loadConfig();
  }, [detected, loadConfig]);

  const portConfig = config?.ports[activePort];
  const deviceLine =
    edits[activePort]["Device"] ?? portConfig?.entries["Device"];
  const backend = detectBackend(deviceLine);

  const effectiveValue = useCallback(
    (key: string) =>
      edits[activePort][key] ?? portConfig?.entries[key] ?? "",
    [edits, activePort, portConfig]
  );

  const hasChanges = useMemo(
    () =>
      (Object.values(edits) as Array<Record<string, string>>).some(
        (p) => Object.keys(p).length > 0
      ),
    [edits]
  );

  // Connected gamepads enumerated via the Web Gamepad API. We refresh on
  // `gamepadconnected` / `gamepaddisconnected` so the select stays current.
  const [connectedPads, setConnectedPads] = useState<string[]>([]);
  useEffect(() => {
    const refresh = () => {
      const pads = navigator.getGamepads();
      const names: string[] = [];
      for (const p of pads) {
        if (p?.id) names.push(p.id);
      }
      setConnectedPads(names);
    };
    refresh();
    window.addEventListener("gamepadconnected", refresh);
    window.addEventListener("gamepaddisconnected", refresh);
    return () => {
      window.removeEventListener("gamepadconnected", refresh);
      window.removeEventListener("gamepaddisconnected", refresh);
    };
  }, []);

  // Build the Device dropdown options. Order:
  //   1. Devices already used across the 4 ports (deduped) — known-good.
  //   2. Standard keyboard/mouse entries.
  //   3. SDL-format guesses for each connected gamepad.
  // The current value is guaranteed to be present (prepended if unknown).
  const deviceOptions = useMemo(() => {
    const set = new Set<string>();
    if (config) {
      for (const port of [1, 2, 3, 4] as const) {
        const d = config.ports[port].entries["Device"];
        if (d) set.add(stripBackticks(d));
      }
    }
    set.add("DInput/0/Keyboard Mouse");
    set.add("SDL/0/Keyboard");
    // Try to suggest SDL names for each connected pad. The index is
    // Chromium's, which usually (but not always) matches SDL's enumeration
    // order on the same machine. Good-enough hint; user can still pick
    // "Otro..." if it doesn't match.
    connectedPads.forEach((rawName, idx) => {
      const cleaned = cleanGamepadName(rawName);
      if (cleaned) set.add(`SDL/${idx}/${cleaned}`);
    });
    return Array.from(set);
  }, [config, connectedPads]);

  const currentDevice = stripBackticks(effectiveValue("Device"));
  const deviceSelectValue = deviceOptions.includes(currentDevice)
    ? currentDevice
    : currentDevice
    ? "__current_unknown__"
    : "";

  function applyFieldChange(key: string, value: string) {
    setEdits((prev) => {
      const portEdits = { ...prev[activePort] };
      // If value matches the on-disk version, drop the override to keep
      // hasChanges accurate.
      if ((portConfig?.entries[key] ?? "") === value) {
        delete portEdits[key];
      } else {
        portEdits[key] = value;
      }
      return { ...prev, [activePort]: portEdits };
    });
  }

  function openEditor(key: string) {
    setEditingKey(key);
    setEditingDraft(effectiveValue(key));
  }

  function closeEditor() {
    setEditingKey(null);
    setEditingDraft("");
  }

  function saveEditorDraft() {
    if (editingKey === null) return;
    applyFieldChange(editingKey, editingDraft.trim());
    closeEditor();
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveMessage("");
    try {
      const updates = (Object.entries(edits) as Array<
        [string, Record<string, string>]
      >)
        .filter(([, changes]) => Object.keys(changes).length > 0)
        .map(([port, changes]) => ({
          port: Number(port) as GcPadPort,
          changes,
        }));
      if (updates.length === 0) {
        setSaveMessage("Sin cambios.");
        setTimeout(() => setSaveMessage(""), 2000);
        return;
      }
      await window.electronAPI.updateDolphinGcPadConfig(updates);
      await loadConfig();
      setSaveMessage("Guardado.");
      setTimeout(() => setSaveMessage(""), 2000);
    } catch (err) {
      setSaveMessage(`Error: ${err}`);
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset() {
    setEdits((prev) => ({ ...prev, [activePort]: {} }));
  }

  async function handleOpenDolphin() {
    if (!executablePath) return;
    try {
      await window.electronAPI.launchEmulatorGui(executablePath);
    } catch (err) {
      setSaveMessage(`No se pudo abrir Dolphin: ${err}`);
    }
  }

  if (!detected) {
    return (
      <p className="py-4 text-sm text-[var(--color-text-muted)]">
        Dolphin no detectado. Ejecuta la detección primero.
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="py-4 text-sm text-[var(--color-text-muted)]">
        Cargando configuración de mandos...
      </p>
    );
  }

  if (loadError) {
    return (
      <p className="py-4 text-sm text-[var(--color-bad)]">
        Error al cargar: {loadError}
      </p>
    );
  }

  if (!config) return null;

  const grouped = groupActions();

  return (
    <div className="space-y-4">
      {/* Header + path */}
      <div className="text-xs text-[var(--color-text-muted)]">
        {config.exists ? (
          <>
            Archivo:{" "}
            <span className="text-[var(--color-text-secondary)]">
              {config.configPath}
            </span>
          </>
        ) : (
          <span className="text-[var(--color-warn)]">
            El archivo aún no existe. Se creará al guardar.
          </span>
        )}
      </div>

      {/* Port tabs */}
      <div className="flex gap-1 border-b border-[var(--color-surface-1)]">
        {([1, 2, 3, 4] as const).map((port) => (
          <button
            key={port}
            onClick={() => setActivePort(port)}
            className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
              activePort === port
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            Puerto {port}
            {Object.keys(edits[port]).length > 0 && (
              <span className="ml-1 text-[var(--color-accent)]">•</span>
            )}
          </button>
        ))}
      </div>

      {/* Device row */}
      <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
        <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
          Dispositivo
        </label>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Backend detectado: <span className="font-mono">{backend}</span>
        </p>
        <div className="mt-3 flex items-center gap-2">
          <select
            value={deviceSelectValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__custom__") {
                openEditor("Device");
              } else if (v !== "__current_unknown__") {
                applyFieldChange("Device", v);
              }
            }}
            className="flex-1 rounded border border-[var(--color-surface-2)] bg-[var(--color-surface-0)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          >
            {deviceSelectValue === "__current_unknown__" && (
              <option value="__current_unknown__">
                {currentDevice} (actual)
              </option>
            )}
            {deviceSelectValue === "" && (
              <option value="" disabled>
                (sin asignar — elige uno)
              </option>
            )}
            {deviceOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            <option value="__custom__">Otro... (editar a mano)</option>
          </select>
        </div>
        {connectedPads.length === 0 && (
          <p className="mt-2 text-xs text-[var(--color-warn)]">
            No se detecta ningún mando conectado. Pulsa cualquier botón del
            mando para que Chromium lo enumere.
          </p>
        )}
      </div>

      {/* Mapping groups */}
      {(Object.entries(grouped) as Array<[ActionGroup, GcPadAction[]]>).map(
        ([group, actions]) => (
          <div
            key={group}
            className="rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4"
          >
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-secondary)]">
              {GROUP_LABELS[group]}
            </h3>
            <div className="space-y-1">
              {actions.map((action) => {
                const value = effectiveValue(action.key);
                const edited = action.key in edits[activePort];
                return (
                  <div
                    key={action.key}
                    className="flex items-center justify-between gap-4 rounded px-3 py-2 hover:bg-[var(--color-surface-1)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-[var(--color-text-primary)]">
                        {action.label}
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)] opacity-60">
                        {action.key}
                      </div>
                    </div>
                    <div
                      className={`max-w-[40%] truncate font-mono text-xs ${
                        edited
                          ? "text-[var(--color-accent)]"
                          : "text-[var(--color-text-secondary)]"
                      }`}
                      title={value}
                    >
                      {value || <span className="opacity-50">(sin asignar)</span>}
                    </div>
                    <button
                      onClick={() => openEditor(action.key)}
                      className="shrink-0 rounded border border-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
                    >
                      Editar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {isSaving ? "Guardando..." : "Guardar"}
        </button>
        <button
          onClick={handleReset}
          disabled={Object.keys(edits[activePort]).length === 0}
          className="rounded-lg border border-[var(--color-surface-2)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] disabled:opacity-50"
        >
          Restablecer puerto
        </button>
        <button
          onClick={handleOpenDolphin}
          className="rounded-lg border border-[var(--color-surface-2)] px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)]"
          title="Abre Dolphin para configurar Wiimote, calibración de sticks y otros ajustes avanzados."
        >
          Abrir Dolphin (Wiimote / avanzado)
        </button>
        {saveMessage && (
          <span
            className={`text-sm ${
              saveMessage.startsWith("Error")
                ? "text-[var(--color-bad)]"
                : "text-[var(--color-good)]"
            }`}
          >
            {saveMessage}
          </span>
        )}
      </div>

      {/* Edit modal */}
      {editingKey !== null && (
        <EditModal
          actionKey={editingKey}
          initialValue={editingDraft}
          onChange={setEditingDraft}
          onSave={saveEditorDraft}
          onCancel={closeEditor}
          backend={backend}
          isDeviceField={editingKey === "Device"}
          setCaptureActive={setControllerCaptureOpen}
        />
      )}
    </div>
  );
}

function groupActions(): Record<ActionGroup, GcPadAction[]> {
  const grouped: Record<ActionGroup, GcPadAction[]> = {
    buttons: [],
    "main-stick": [],
    "c-stick": [],
    triggers: [],
    "d-pad": [],
  };
  for (const a of ACTIONS) grouped[a.group].push(a);
  return grouped;
}

/* ── Edit modal with live gamepad detection ─────────────────────── */

interface EditModalProps {
  actionKey: string;
  initialValue: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  backend: Backend;
  isDeviceField: boolean;
  /** Silences the global gamepad nav while we're listening for a press. */
  setCaptureActive: (active: boolean) => void;
}

function EditModal({
  actionKey,
  initialValue,
  onChange,
  onSave,
  onCancel,
  backend,
  isDeviceField,
  setCaptureActive,
}: EditModalProps) {
  const canDetect = !isDeviceField;
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionHint, setDetectionHint] = useState<string | null>(null);

  // Imperative RAF management via refs. Using refs instead of effect
  // dependencies avoids any re-render-driven cancel/restart that could drop
  // the first-frame detection on mount.
  const rafRef = useRef<number | null>(null);
  const baselineRef = useRef<
    Array<{ pressed: boolean[]; axes: number[] } | null>
  >([]);
  const backendRef = useRef(backend);
  backendRef.current = backend;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const stopDetection = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsDetecting(false);
    setCaptureActive(false);
  }, [setCaptureActive]);

  const startDetection = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setDetectionHint(null);
    setIsDetecting(true);
    setCaptureActive(true);

    // Defer baseline capture by one animation frame so that any button the
    // user pressed to open this modal (e.g. gamepad A to activate "Editar")
    // is either released or properly recorded as already-pressed — otherwise
    // releasing it could race with detection.
    const captureAndPoll = () => {
      const pads = navigator.getGamepads();
      baselineRef.current = pads.map((p) =>
        p
          ? {
              pressed: p.buttons.map((b) => b.pressed),
              axes: Array.from(p.axes),
            }
          : null
      );
      rafRef.current = requestAnimationFrame(tick);
    };

    const tick = () => {
      const now = navigator.getGamepads();
      const baseline = baselineRef.current;
      for (let i = 0; i < now.length; i++) {
        const pad = now[i];
        const base = baseline[i];
        if (!pad || !base) continue;

        for (let b = 0; b < pad.buttons.length; b++) {
          if (pad.buttons[b].pressed && !base.pressed[b]) {
            const name = buttonIndexToDolphinName(b, backendRef.current);
            if (name) {
              onChangeRef.current(name);
              setDetectionHint(
                `Detectado: botón ${b} → ${name} (${backendRef.current}). Pulsa Aplicar para confirmar o vuelve a detectar.`
              );
            } else {
              setDetectionHint(
                `Botón ${b} detectado pero no hay mapeo conocido para ${backendRef.current}. Escríbelo a mano.`
              );
            }
            stopDetection();
            return;
          }
        }

        for (let a = 0; a < pad.axes.length; a++) {
          if (Math.abs(pad.axes[a] - base.axes[a]) > 0.6) {
            setDetectionHint(
              `Movimiento de eje (${a}) detectado. La detección de sticks y gatillos no está soportada todavía — usa "Abrir Dolphin" para configurarlos.`
            );
            stopDetection();
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(captureAndPoll);
  }, [setCaptureActive, stopDetection]);

  // Auto-start detection on mount (only for fields that support it).
  useEffect(() => {
    if (canDetect) startDetection();
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setCaptureActive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleDetection = () => {
    if (isDetecting) {
      stopDetection();
    } else {
      startDetection();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-[var(--radius-md)] bg-[var(--color-surface-1)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-sm font-semibold text-[var(--color-text-primary)]">
          Editar asignación
        </h3>
        <p className="mb-3 font-mono text-xs text-[var(--color-text-muted)]">
          {actionKey}
        </p>

        <input
          type="text"
          value={initialValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isDeviceField ? "SDL/0/Nombre del mando" : "`Button S`"}
          className="w-full rounded border border-[var(--color-surface-2)] bg-[var(--color-surface-0)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          autoFocus
          spellCheck={false}
        />

        {canDetect && (
          <div className="mt-3 space-y-2">
            <button
              onClick={toggleDetection}
              className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isDetecting
                  ? "bg-[var(--color-warn)] text-black"
                  : "border border-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              {isDetecting
                ? "Esperando pulsación... (clic para cancelar)"
                : "Volver a detectar"}
            </button>
            {detectionHint && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {detectionHint}
              </p>
            )}
            {backend === "unknown" && (
              <p className="text-xs text-[var(--color-warn)]">
                No reconozco el backend del dispositivo. La detección emitirá
                nombres genéricos que Dolphin quizás no acepte.
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded border border-[var(--color-surface-2)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
