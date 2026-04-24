import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SettingsContext } from "../../../../../schemas/settings-schema-types";
import { useApp } from "../../../../../context/AppContext";

/*
 * Native editor for Dolphin's GameCube controller config (GCPadNew.ini).
 *
 * Scope:
 *  - Read/write the 4 [GCPadN] sections, preserving keys we don't manage.
 *  - Button detection via the Web Gamepad API, mapping the pressed button
 *    to Dolphin's SDL or XInput name depending on the Device line.
 *  - Stick calibration (Main Stick + C-Stick) via a wizard: auto-detect
 *    the axis pair, capture rest-position noise, then sample the full
 *    rotation and emit Dolphin's 32-float radial gate plus Center and
 *    Dead Zone. The bin ordering mirrors Dolphin's own layout (bin 0 at
 *    angle 0 going CCW in math terms); most sticks are near-circular so
 *    rotational alignment isn't critical for input feel.
 *  - Analog trigger calibration is still deferred: the Triggers/L-Analog
 *    input expression isn't exposed in this UI yet, and writing only
 *    Range/Dead Zone without a mapping has no effect. Separate pass.
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

// Map a Chromium standard-mapping axis (index + sign) to the expression
// Dolphin expects for the given backend.
//
// Both Dolphin's SDL and XInput backends consume SDL_GameController /
// XInput respectively — two APIs that normalize controllers into the
// same Left X/Y + Right X/Y layout and report Y positive UP. Chromium's
// standard mapping reports Y positive DOWN (up = -1), so we invert the
// sign for Y axes when translating either way.
const STANDARD_AXIS_NAMES: Record<
  number,
  { name: string; invertSign: boolean }
> = {
  0: { name: "Left X", invertSign: false },
  1: { name: "Left Y", invertSign: true },
  2: { name: "Right X", invertSign: false },
  3: { name: "Right Y", invertSign: true },
};

function axisToDolphinExpr(
  axisIdx: number,
  sign: 1 | -1,
  backend: Backend
): string | null {
  if (backend === "SDL" || backend === "XInput") {
    const info = STANDARD_AXIS_NAMES[axisIdx];
    if (!info) return null;
    const eff = info.invertSign ? ((-sign) as 1 | -1) : sign;
    return `\`${info.name}${eff === 1 ? "+" : "-"}\``;
  }
  // DInput / unknown: raw axis index fallback. User can hand-edit if
  // Dolphin rejects it.
  return `\`Axis ${axisIdx}${sign === 1 ? "+" : "-"}\``;
}

const STICK_DIRECTION_KEYS = new Set<string>([
  "Main Stick/Up",
  "Main Stick/Down",
  "Main Stick/Left",
  "Main Stick/Right",
  "C-Stick/Up",
  "C-Stick/Down",
  "C-Stick/Left",
  "C-Stick/Right",
]);

/* ── Calibration helpers ────────────────────────────────────────── */

type CalibTarget = "main-stick" | "c-stick";

interface AxisPair {
  padIdx: number;
  xIdx: number;
  yIdx: number;
}

const CALIB_BINS = 32;

// First axis to deviate from baseline by more than `threshold` anchors the
// pair. Chromium standard-mapping pairs axes as (0,1) and (2,3); we round
// down to the even index so either axis of the pair triggers the same
// detection.
function detectAxisPair(
  baseline: Array<{ axes: number[] } | null>,
  now: (Gamepad | null)[],
  threshold = 0.5
): AxisPair | null {
  for (let i = 0; i < now.length; i++) {
    const pad = now[i];
    const base = baseline[i];
    if (!pad || !base) continue;
    for (let a = 0; a < pad.axes.length; a++) {
      const delta = Math.abs(pad.axes[a] - (base.axes[a] ?? 0));
      if (delta > threshold) {
        const start = Math.floor(a / 2) * 2;
        return { padIdx: i, xIdx: start, yIdx: start + 1 };
      }
    }
  }
  return null;
}

function computeCenter(samples: Array<{ x: number; y: number }>): {
  cx: number;
  cy: number;
  noise: number;
} {
  if (samples.length === 0) return { cx: 0, cy: 0, noise: 0 };
  const cx = samples.reduce((a, s) => a + s.x, 0) / samples.length;
  const cy = samples.reduce((a, s) => a + s.y, 0) / samples.length;
  let noise = 0;
  for (const s of samples) {
    const d = Math.hypot(s.x - cx, s.y - cy);
    if (d > noise) noise = d;
  }
  return { cx, cy, noise };
}

// Takes radial samples (relative to center) and returns CALIB_BINS radii,
// each the maximum observed in its angular bucket. Empty buckets are
// linearly interpolated from the nearest filled neighbours so a user who
// skips a few angles still gets a closed gate. If everything is empty we
// fall back to a unit circle.
function computeStickCalibration(
  samples: Array<{ x: number; y: number }>,
  center: { cx: number; cy: number }
): number[] {
  const bins = new Array<number>(CALIB_BINS).fill(0);
  for (const s of samples) {
    const dx = s.x - center.cx;
    const dy = s.y - center.cy;
    const radius = Math.hypot(dx, dy);
    if (radius < 0.05) continue; // ignore near-center noise
    const angle = Math.atan2(dy, dx) + Math.PI; // 0..2π
    const bin = Math.min(
      CALIB_BINS - 1,
      Math.floor((angle / (2 * Math.PI)) * CALIB_BINS)
    );
    if (radius > bins[bin]) bins[bin] = radius;
  }
  if (bins.every((b) => b === 0)) return new Array(CALIB_BINS).fill(1);

  for (let i = 0; i < CALIB_BINS; i++) {
    if (bins[i] > 0) continue;
    let prev = -1;
    let next = -1;
    for (let j = 1; j < CALIB_BINS; j++) {
      const a = (i - j + CALIB_BINS) % CALIB_BINS;
      if (bins[a] > 0) {
        prev = a;
        break;
      }
    }
    for (let j = 1; j < CALIB_BINS; j++) {
      const a = (i + j) % CALIB_BINS;
      if (bins[a] > 0) {
        next = a;
        break;
      }
    }
    if (prev === -1) bins[i] = bins[next];
    else if (next === -1) bins[i] = bins[prev];
    else {
      const dp = (i - prev + CALIB_BINS) % CALIB_BINS;
      const dn = (next - i + CALIB_BINS) % CALIB_BINS;
      bins[i] = bins[prev] + (bins[next] - bins[prev]) * (dp / (dp + dn));
    }
  }
  // Clamp to a sane range — some sticks over-travel slightly past 1.0.
  return bins.map((b) => Math.max(0, Math.min(1.5, b)));
}

function formatCalibArray(bins: number[]): string {
  return bins.map((b) => (b * 100).toFixed(2)).join(" ");
}

function formatCenter(cx: number, cy: number): string {
  return `${(cx * 100).toFixed(2)} ${(cy * 100).toFixed(2)}`;
}

function targetKeyPrefix(t: CalibTarget): string {
  return t === "main-stick" ? "Main Stick" : "C-Stick";
}

function targetLabel(t: CalibTarget): string {
  return t === "main-stick" ? "stick principal" : "stick C";
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
  const [calibrating, setCalibrating] = useState<CalibTarget | null>(null);
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

  function applyFieldChanges(changes: Record<string, string>) {
    setEdits((prev) => {
      const portEdits = { ...prev[activePort] };
      for (const [key, value] of Object.entries(changes)) {
        if ((portConfig?.entries[key] ?? "") === value) {
          delete portEdits[key];
        } else {
          portEdits[key] = value;
        }
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
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">
                {GROUP_LABELS[group]}
              </h3>
              {(group === "main-stick" || group === "c-stick") && (
                <button
                  onClick={() => setCalibrating(group as CalibTarget)}
                  className="rounded border border-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
                  title="Calibra el centro, rango y zona muerta del stick."
                >
                  Calibrar
                </button>
              )}
            </div>
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

      {/* Calibration wizard */}
      {calibrating !== null && (
        <CalibrationModal
          target={calibrating}
          onSave={(changes) => {
            applyFieldChanges(changes);
            setCalibrating(null);
          }}
          onCancel={() => setCalibrating(null)}
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
          const delta = pad.axes[a] - base.axes[a];
          if (Math.abs(delta) > 0.5) {
            const sign: 1 | -1 = delta > 0 ? 1 : -1;
            const expr = axisToDolphinExpr(a, sign, backendRef.current);
            if (expr) {
              onChangeRef.current(expr);
              setDetectionHint(
                `Detectado: eje ${a}${sign === 1 ? "+" : "-"} → ${expr} (${backendRef.current}). Pulsa Aplicar para confirmar o vuelve a detectar.`
              );
            } else {
              setDetectionHint(
                `Eje ${a} detectado pero no hay mapeo conocido para ${backendRef.current}. Escríbelo a mano.`
              );
            }
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

/* ── Stick calibration wizard ───────────────────────────────────── */

type CalibStep = "detect" | "center" | "range" | "preview";

interface CalibrationModalProps {
  target: CalibTarget;
  onSave: (changes: Record<string, string>) => void;
  onCancel: () => void;
  setCaptureActive: (active: boolean) => void;
}

const CENTER_CAPTURE_MS = 1200;
const RANGE_CAPTURE_MS = 4000;

function CalibrationModal({
  target,
  onSave,
  onCancel,
  setCaptureActive,
}: CalibrationModalProps) {
  const prefix = targetKeyPrefix(target);
  const label = targetLabel(target);

  const [step, setStep] = useState<CalibStep>("detect");
  const [axisPair, setAxisPair] = useState<AxisPair | null>(null);
  const [center, setCenter] = useState<{ cx: number; cy: number }>({
    cx: 0,
    cy: 0,
  });
  const [noise, setNoise] = useState(0);
  const [bins, setBins] = useState<number[]>([]);
  const [deadZone, setDeadZone] = useState(15);
  const [livePos, setLivePos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [progress, setProgress] = useState(0);
  const [detachedPad, setDetachedPad] = useState(false);

  const rafRef = useRef<number | null>(null);
  const baselineRef = useRef<Array<{ axes: number[] } | null>>([]);
  const centerSamplesRef = useRef<Array<{ x: number; y: number }>>([]);
  const rangeSamplesRef = useRef<Array<{ x: number; y: number }>>([]);

  const cancelRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    setCaptureActive(true);
    return () => {
      setCaptureActive(false);
      cancelRaf();
    };
  }, [setCaptureActive, cancelRaf]);

  // Detection: record baseline, then wait for any axis to move past 0.5.
  useEffect(() => {
    if (step !== "detect") return;
    setDetachedPad(false);
    const pads = navigator.getGamepads();
    baselineRef.current = pads.map((p) =>
      p ? { axes: Array.from(p.axes) } : null
    );
    if (!baselineRef.current.some((b) => b !== null)) {
      setDetachedPad(true);
    }
    const tick = () => {
      const now = navigator.getGamepads();
      const pair = detectAxisPair(baselineRef.current, now);
      if (pair) {
        const pad = now[pair.padIdx];
        if (pad) {
          setLivePos({
            x: pad.axes[pair.xIdx] ?? 0,
            y: pad.axes[pair.yIdx] ?? 0,
          });
        }
        setAxisPair(pair);
        // Transition to center capture on next tick so the RAF chain unwinds
        // cleanly before the next useEffect restarts it.
        setStep("center");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return cancelRaf;
  }, [step, cancelRaf]);

  // Center capture: 1.2s of samples with stick at rest.
  useEffect(() => {
    if (step !== "center" || !axisPair) return;
    centerSamplesRef.current = [];
    setProgress(0);
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      const now = navigator.getGamepads();
      const pad = now[axisPair.padIdx];
      if (pad) {
        const x = pad.axes[axisPair.xIdx] ?? 0;
        const y = pad.axes[axisPair.yIdx] ?? 0;
        centerSamplesRef.current.push({ x, y });
        setLivePos({ x, y });
      }
      setProgress(Math.min(1, elapsed / CENTER_CAPTURE_MS));
      if (elapsed >= CENTER_CAPTURE_MS) {
        const c = computeCenter(centerSamplesRef.current);
        setCenter({ cx: c.cx, cy: c.cy });
        setNoise(c.noise);
        // Suggest dead zone = 1.5× observed drift, clamped to 5–30%.
        const suggested = Math.max(
          5,
          Math.min(30, Math.round(c.noise * 100 * 1.5))
        );
        setDeadZone(suggested);
        setStep("range");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return cancelRaf;
  }, [step, axisPair, cancelRaf]);

  // Range capture: 4s of samples while user draws circles.
  useEffect(() => {
    if (step !== "range" || !axisPair) return;
    rangeSamplesRef.current = [];
    setProgress(0);
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      const now = navigator.getGamepads();
      const pad = now[axisPair.padIdx];
      if (pad) {
        const x = pad.axes[axisPair.xIdx] ?? 0;
        const y = pad.axes[axisPair.yIdx] ?? 0;
        rangeSamplesRef.current.push({ x, y });
        setLivePos({ x, y });
      }
      setProgress(Math.min(1, elapsed / RANGE_CAPTURE_MS));
      if (elapsed >= RANGE_CAPTURE_MS) {
        const computed = computeStickCalibration(
          rangeSamplesRef.current,
          center
        );
        setBins(computed);
        setStep("preview");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return cancelRaf;
  }, [step, axisPair, center, cancelRaf]);

  const handleApply = () => {
    const changes: Record<string, string> = {
      [`${prefix}/Calibration`]: formatCalibArray(bins),
      [`${prefix}/Center`]: formatCenter(center.cx, center.cy),
      [`${prefix}/Dead Zone`]: deadZone.toFixed(1),
    };
    onSave(changes);
  };

  const handleRetry = () => {
    cancelRaf();
    setAxisPair(null);
    setBins([]);
    setProgress(0);
    setLivePos({ x: 0, y: 0 });
    setStep("detect");
  };

  const vizSize = 220;
  const cx = vizSize / 2;
  const cy = vizSize / 2;
  const radius = 88;

  const hint =
    step === "detect"
      ? `Mueve el ${label} para detectar sus ejes.`
      : step === "center"
      ? "Deja el stick en reposo. Midiendo el centro..."
      : step === "range"
      ? "Gira el stick en círculos completos tocando todos los bordes..."
      : "Revisa la forma capturada y ajusta la zona muerta.";

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
          Calibrar {label}
        </h3>
        <p className="mb-4 text-xs text-[var(--color-text-muted)]">{hint}</p>

        {detachedPad && step === "detect" && (
          <p className="mb-3 text-xs text-[var(--color-warn)]">
            Ningún mando activo. Pulsa cualquier botón para que Chromium lo
            enumere y mueve el stick.
          </p>
        )}

        <div className="flex justify-center">
          <svg
            width={vizSize}
            height={vizSize}
            className="rounded bg-[var(--color-surface-0)]"
          >
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="var(--color-surface-2)"
              strokeWidth="1"
            />
            <line
              x1={cx}
              y1={cy - radius}
              x2={cx}
              y2={cy + radius}
              stroke="var(--color-surface-2)"
              strokeWidth="0.5"
            />
            <line
              x1={cx - radius}
              y1={cy}
              x2={cx + radius}
              y2={cy}
              stroke="var(--color-surface-2)"
              strokeWidth="0.5"
            />

            {step === "preview" && bins.length === CALIB_BINS && (
              <polygon
                points={bins
                  .map((b, i) => {
                    const angle =
                      (i / CALIB_BINS) * 2 * Math.PI - Math.PI;
                    const px = cx + Math.cos(angle) * radius * b;
                    const py = cy + Math.sin(angle) * radius * b;
                    return `${px},${py}`;
                  })
                  .join(" ")}
                fill="var(--color-accent)"
                fillOpacity="0.25"
                stroke="var(--color-accent)"
                strokeWidth="1.5"
              />
            )}

            {step === "preview" && (
              <circle
                cx={cx + center.cx * radius}
                cy={cy + center.cy * radius}
                r={(deadZone / 100) * radius}
                fill="var(--color-warn)"
                fillOpacity="0.15"
                stroke="var(--color-warn)"
                strokeWidth="1"
                strokeDasharray="3,3"
              />
            )}

            {step !== "preview" && (
              <circle
                cx={cx + livePos.x * radius}
                cy={cy + livePos.y * radius}
                r="5"
                fill="var(--color-accent)"
              />
            )}
          </svg>
        </div>

        {(step === "center" || step === "range") && (
          <div className="mt-3 h-1.5 overflow-hidden rounded bg-[var(--color-surface-0)]">
            <div
              className="h-full bg-[var(--color-accent)]"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}

        {step === "preview" && (
          <div className="mt-4 space-y-3">
            <div className="text-xs text-[var(--color-text-muted)]">
              Centro:{" "}
              <span className="font-mono text-[var(--color-text-secondary)]">
                {(center.cx * 100).toFixed(2)}, {(center.cy * 100).toFixed(2)}
              </span>
              {" · "}
              Ruido en reposo:{" "}
              <span className="font-mono text-[var(--color-text-secondary)]">
                {(noise * 100).toFixed(2)}%
              </span>
              {" · "}
              Ejes:{" "}
              <span className="font-mono text-[var(--color-text-secondary)]">
                {axisPair?.xIdx},{axisPair?.yIdx}
              </span>
            </div>
            <div>
              <label className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
                <span>Zona muerta</span>
                <span className="font-mono">{deadZone}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={40}
                step={1}
                value={deadZone}
                onChange={(e) => setDeadZone(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded border border-[var(--color-surface-2)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
          >
            Cancelar
          </button>
          {step === "preview" && (
            <>
              <button
                onClick={handleRetry}
                className="rounded border border-[var(--color-surface-2)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
              >
                Repetir
              </button>
              <button
                onClick={handleApply}
                className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
              >
                Aplicar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
