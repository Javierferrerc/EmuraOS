import { useState, useEffect, useCallback, useRef, type MutableRefObject } from "react";
import type { SettingsContext } from "../../../../../schemas/settings-schema-types";
import type { EmulatorConfigData } from "../../../../../../core/types";

type FocusArea = "subtabs" | "settings" | "actions";

interface Props {
  ctx: SettingsContext;
  emulatorId: string;
  /** Receives directional + activate actions from SettingsRoot via EmuladorDetail. */
  actionRef: MutableRefObject<((action: "up" | "down" | "left" | "right" | "activate") => boolean) | null>;
}

export function ConfiguracionTab({ ctx, emulatorId, actionRef }: Props) {
  const detected = ctx.lastDetection?.detected.find(
    (d) => d.id === emulatorId
  );
  const executablePath = detected?.executablePath;

  const [configData, setConfigData] = useState<EmulatorConfigData | null>(null);
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>(
    {}
  );
  const [activeCategoryIdx, setActiveCategoryIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [showRawEditor, setShowRawEditor] = useState(false);
  const [rawText, setRawText] = useState("");

  // Internal gamepad focus state
  const [focusArea, setFocusArea] = useState<FocusArea>("subtabs");
  const [focusSettingIdx, setFocusSettingIdx] = useState(0);
  // 0 = Guardar, 1 = Restablecer
  const [focusActionIdx, setFocusActionIdx] = useState(0);

  // Keep refs for the stable action handler
  const focusAreaRef = useRef(focusArea);
  focusAreaRef.current = focusArea;
  const focusSettingIdxRef = useRef(focusSettingIdx);
  focusSettingIdxRef.current = focusSettingIdx;
  const focusActionIdxRef = useRef(focusActionIdx);
  focusActionIdxRef.current = focusActionIdx;
  const activeCategoryIdxRef = useRef(activeCategoryIdx);
  activeCategoryIdxRef.current = activeCategoryIdx;
  const configDataRef = useRef(configData);
  configDataRef.current = configData;
  const editedSettingsRef = useRef(editedSettings);
  editedSettingsRef.current = editedSettings;
  const showRawEditorRef = useRef(showRawEditor);
  showRawEditorRef.current = showRawEditor;

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    setConfigData(null);
    setEditedSettings({});
    setSaveMessage("");
    setShowRawEditor(false);
    try {
      const data = await window.electronAPI.getEmulatorConfig(
        emulatorId,
        executablePath
      );
      setConfigData(data);
      setEditedSettings({ ...data.settings });
      if (data.schema.categories.length > 0) {
        setActiveCategoryIdx(0);
      } else {
        setShowRawEditor(true);
      }
      setRawText(
        Object.entries(data.settings)
          .map(([k, v]) => `${k} = ${v}`)
          .join("\n")
      );
    } catch (err) {
      console.error("Failed to load emulator config:", err);
    } finally {
      setIsLoading(false);
    }
  }, [emulatorId, executablePath]);

  useEffect(() => {
    if (detected) loadConfig();
  }, [detected, loadConfig]);

  function handleSettingChange(key: string, value: string) {
    setEditedSettings((prev) => ({ ...prev, [key]: value }));
  }

  const handleSave = useCallback(async () => {
    const cd = configDataRef.current;
    if (!cd) return;
    setIsSaving(true);
    setSaveMessage("");
    try {
      const changes: Record<string, string> = {};
      for (const [key, value] of Object.entries(editedSettingsRef.current)) {
        if (cd.settings[key] !== value) {
          changes[key] = value;
        }
      }
      if (Object.keys(changes).length === 0) {
        setSaveMessage("Sin cambios.");
        setIsSaving(false);
        setTimeout(() => setSaveMessage(""), 2000);
        return;
      }
      await window.electronAPI.updateEmulatorConfig(
        cd.emulatorId,
        changes,
        executablePath
      );
      await loadConfig();
      setSaveMessage("Guardado!");
      setTimeout(() => setSaveMessage(""), 2000);
    } catch (err) {
      setSaveMessage(`Error: ${err}`);
    } finally {
      setIsSaving(false);
    }
  }, [executablePath, loadConfig]);

  const handleReset = useCallback(() => {
    const cd = configDataRef.current;
    if (!cd) return;
    setEditedSettings({ ...cd.settings });
    setSaveMessage("");
  }, []);

  function handleRawApply() {
    const parsed: Record<string, string> = {};
    for (const line of rawText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";"))
        continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        parsed[key] = value;
      }
    }
    setEditedSettings(parsed);
  }

  // Get the current category's settings count
  const getCurrentSettings = useCallback(() => {
    const cd = configDataRef.current;
    if (!cd || showRawEditorRef.current) return [];
    const cat = cd.schema.categories[activeCategoryIdxRef.current];
    return cat?.settings ?? [];
  }, []);

  // Gamepad action handler
  const handleAction = useCallback((action: "up" | "down" | "left" | "right" | "activate"): boolean => {
    const cd = configDataRef.current;
    if (!cd || showRawEditorRef.current) return false;

    const area = focusAreaRef.current;
    const catCount = cd.schema.categories.length;
    if (catCount === 0) return false;

    const settings = getCurrentSettings();
    const settingsCount = settings.length;

    switch (action) {
      case "up": {
        if (area === "subtabs") return true; // stay at top — use LEFT to escape to sidebar
        if (area === "settings") {
          if (focusSettingIdxRef.current <= 0) {
            setFocusArea("subtabs");
          } else {
            setFocusSettingIdx(focusSettingIdxRef.current - 1);
          }
          return true;
        }
        if (area === "actions") {
          if (settingsCount > 0) {
            setFocusArea("settings");
            setFocusSettingIdx(settingsCount - 1);
          } else {
            setFocusArea("subtabs");
          }
          return true;
        }
        return false;
      }
      case "down": {
        if (area === "subtabs") {
          if (settingsCount > 0) {
            setFocusArea("settings");
            setFocusSettingIdx(0);
          } else {
            setFocusArea("actions");
            setFocusActionIdx(0);
          }
          return true;
        }
        if (area === "settings") {
          if (focusSettingIdxRef.current >= settingsCount - 1) {
            setFocusArea("actions");
            setFocusActionIdx(0);
          } else {
            setFocusSettingIdx(focusSettingIdxRef.current + 1);
          }
          return true;
        }
        // actions: stay at bottom
        return true;
      }
      case "left": {
        if (area === "subtabs") {
          if (activeCategoryIdxRef.current <= 0) return false; // escape to sidebar
          setActiveCategoryIdx(activeCategoryIdxRef.current - 1);
          setFocusSettingIdx(0);
          return true;
        }
        if (area === "settings") {
          // For enum/boolean, cycle value left
          const setting = settings[focusSettingIdxRef.current];
          if (setting) {
            cycleSettingValue(setting, -1);
          }
          return true;
        }
        if (area === "actions") {
          setFocusActionIdx(Math.max(0, focusActionIdxRef.current - 1));
          return true;
        }
        return false;
      }
      case "right": {
        if (area === "subtabs") {
          if (activeCategoryIdxRef.current >= catCount - 1) return true; // stay
          setActiveCategoryIdx(activeCategoryIdxRef.current + 1);
          setFocusSettingIdx(0);
          return true;
        }
        if (area === "settings") {
          // For enum/boolean, cycle value right
          const setting = settings[focusSettingIdxRef.current];
          if (setting) {
            cycleSettingValue(setting, 1);
          }
          return true;
        }
        if (area === "actions") {
          setFocusActionIdx(Math.min(1, focusActionIdxRef.current + 1));
          return true;
        }
        return false;
      }
      case "activate": {
        if (area === "subtabs") return true; // sub-tabs are navigated with left/right
        if (area === "settings") {
          const setting = settings[focusSettingIdxRef.current];
          if (setting) {
            activateSetting(setting);
          }
          return true;
        }
        if (area === "actions") {
          if (focusActionIdxRef.current === 0) {
            handleSave();
          } else {
            handleReset();
          }
          return true;
        }
        return false;
      }
    }
    return false;
  }, [getCurrentSettings, handleSave, handleReset]);

  // Cycle a setting value (for boolean toggle, enum prev/next)
  function cycleSettingValue(
    setting: { key: string; type: string; options?: (string | { value: string; label: string })[] },
    direction: -1 | 1
  ) {
    const currentVal = editedSettingsRef.current[setting.key] ?? "";
    if (setting.type === "boolean") {
      const isOn = currentVal.toLowerCase() === "true";
      handleSettingChange(setting.key, isOn ? "false" : "true");
    } else if (setting.type === "enum" && setting.options) {
      const values = setting.options.map((o) =>
        typeof o === "string" ? o : o.value
      );
      const idx = values.indexOf(currentVal);
      const nextIdx =
        idx < 0
          ? 0
          : (idx + direction + values.length) % values.length;
      handleSettingChange(setting.key, values[nextIdx]);
    } else if (setting.type === "number") {
      const num = parseFloat(currentVal) || 0;
      handleSettingChange(setting.key, String(num + direction));
    }
  }

  // Activate a setting (toggle boolean, etc.)
  function activateSetting(
    setting: { key: string; type: string }
  ) {
    const currentVal = editedSettingsRef.current[setting.key] ?? "";
    if (setting.type === "boolean") {
      const isOn = currentVal.toLowerCase() === "true";
      handleSettingChange(setting.key, isOn ? "false" : "true");
    }
    // For other types, activate doesn't do anything special — user uses left/right
  }

  // Wire the action ref
  useEffect(() => {
    actionRef.current = handleAction;
    return () => {
      actionRef.current = null;
    };
  }, [actionRef, handleAction]);

  // Reset focus when category changes
  useEffect(() => {
    setFocusSettingIdx(0);
  }, [activeCategoryIdx]);

  if (!detected) {
    return (
      <p className="py-4 text-sm text-[var(--color-text-muted)]">
        Emulador no detectado. Ejecuta la detección primero.
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="py-4 text-sm text-[var(--color-text-muted)]">
        Cargando configuración...
      </p>
    );
  }

  if (!configData) {
    return (
      <p className="py-4 text-sm text-[var(--color-text-muted)]">
        No se pudo cargar la configuración.
      </p>
    );
  }

  const currentCategory = configData.schema.categories[activeCategoryIdx];

  return (
    <div className="space-y-4">
      {/* Config path info */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--color-text-muted)]">
          {configData.configPath ? (
            <>
              Config:{" "}
              <span className="text-[var(--color-text-secondary)]">
                {configData.configPath}
              </span>
            </>
          ) : (
            <span className="text-[var(--color-warn)]">
              Archivo de config no encontrado
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {configData.configPath && (
            <button
              onClick={() =>
                window.electronAPI.openConfigFile(
                  configData!.emulatorId,
                  executablePath
                )
              }
              className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text-secondary)]"
            >
              Abrir en editor
            </button>
          )}
          <button
            onClick={() => setShowRawEditor(!showRawEditor)}
            className={`rounded px-2 py-1 text-xs transition-colors ${
              showRawEditor
                ? "bg-[var(--color-surface-1)] text-[var(--color-text-secondary)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)]"
            }`}
          >
            Editor raw
          </button>
        </div>
      </div>

      {!showRawEditor && configData.schema.categories.length > 0 ? (
        <>
          {/* Category tab bar */}
          <div className="flex gap-1 border-b border-[var(--color-surface-1)]">
            {configData.schema.categories.map((cat, idx) => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategoryIdx(idx);
                  setFocusArea("subtabs");
                }}
                className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeCategoryIdx === idx
                    ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                    : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                } ${
                  focusArea === "subtabs" && activeCategoryIdx === idx
                    ? "ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-surface-0)] rounded-t"
                    : ""
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Settings form */}
          {currentCategory && (
            <div className="space-y-1 rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
              {currentCategory.settings.map((setting, idx) => (
                <SettingField
                  key={setting.key}
                  setting={setting}
                  value={
                    editedSettings[setting.key] ?? setting.default ?? ""
                  }
                  onChange={(val) => handleSettingChange(setting.key, val)}
                  focused={focusArea === "settings" && focusSettingIdx === idx}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        /* Raw editor */
        <div className="space-y-3">
          {Object.keys(editedSettings).length === 0 &&
            !configData.configPath && (
              <div className="rounded-[var(--radius-md)] border border-[var(--color-warn)]/50 bg-[var(--color-warn)]/10 p-4 text-sm text-[var(--color-warn)]">
                No se encontró archivo de configuración. Inicia el emulador una
                vez para generarlo.
              </div>
            )}
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className="h-96 w-full rounded-[var(--radius-md)] border border-[var(--color-surface-2)] bg-[var(--color-surface-0)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            placeholder="key = value (una por línea)"
            spellCheck={false}
          />
          <button
            onClick={handleRawApply}
            className="rounded-lg border border-[var(--color-surface-2)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)]"
          >
            Aplicar cambios raw
          </button>
        </div>
      )}

      {/* Save/Reset bar */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving || !configData.configPath}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 ${
            focusArea === "actions" && focusActionIdx === 0
              ? "ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-surface-0)]"
              : ""
          }`}
        >
          {isSaving ? "Guardando..." : "Guardar"}
        </button>
        <button
          onClick={handleReset}
          className={`rounded-lg border border-[var(--color-surface-2)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] ${
            focusArea === "actions" && focusActionIdx === 1
              ? "ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-surface-0)]"
              : ""
          }`}
        >
          Restablecer
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
    </div>
  );
}

/* ── Individual setting renderer ──────────────────────────────────── */

interface SettingFieldProps {
  setting: {
    key: string;
    label: string;
    type: "boolean" | "enum" | "number" | "string" | "path";
    default?: string;
    options?: (string | { value: string; label: string })[];
    min?: number;
    max?: number;
    description?: string;
  };
  value: string;
  onChange: (value: string) => void;
  focused?: boolean;
}

function SettingField({ setting, value, onChange, focused }: SettingFieldProps) {
  const inputClass =
    "w-full rounded-[var(--radius-sm)] border border-[var(--color-surface-2)] bg-[var(--color-surface-0)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]";

  const rowRef = useRef<HTMLDivElement>(null);

  // Auto-scroll focused setting into view
  useEffect(() => {
    if (focused && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focused]);

  return (
    <div
      ref={rowRef}
      className={`flex items-start justify-between gap-4 rounded-lg px-3 py-3 transition-colors ${
        focused
          ? "bg-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)]"
          : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <label className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">
          {setting.label}
        </label>
        {setting.description && (
          <p className="mb-1 text-xs text-[var(--color-text-muted)]">
            {setting.description}
          </p>
        )}
        <p className="text-xs text-[var(--color-text-muted)] opacity-50">
          {setting.key}
        </p>
      </div>

      <div className="w-64 shrink-0">
        {setting.type === "boolean" &&
          (() => {
            const isOn = value.toLowerCase() === "true";
            return (
              <button
                onClick={() => onChange(isOn ? "false" : "true")}
                className={`relative h-7 w-12 rounded-full transition-colors ${
                  isOn ? "bg-[var(--color-accent)]" : "bg-[var(--color-surface-2)]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                    isOn ? "left-[1.375rem]" : "left-0.5"
                  }`}
                />
              </button>
            );
          })()}

        {setting.type === "enum" && setting.options && (
          <div className="flex items-center gap-2">
            {focused && (
              <span className="text-xs text-[var(--color-text-muted)]">
                &larr;
              </span>
            )}
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={`${inputClass} flex-1`}
            >
              {!setting.options.some(
                (opt) => (typeof opt === "string" ? opt : opt.value) === value
              ) &&
                value && <option value={value}>{value} (actual)</option>}
              {setting.options.map((opt) => {
                const val = typeof opt === "string" ? opt : opt.value;
                const label = typeof opt === "string" ? opt : opt.label;
                return (
                  <option key={val} value={val}>
                    {label}
                  </option>
                );
              })}
            </select>
            {focused && (
              <span className="text-xs text-[var(--color-text-muted)]">
                &rarr;
              </span>
            )}
          </div>
        )}

        {setting.type === "number" && (
          <div className="flex items-center gap-2">
            {focused && (
              <span className="text-xs text-[var(--color-text-muted)]">
                &larr;
              </span>
            )}
            <input
              type="number"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              min={setting.min}
              max={setting.max}
              className={`${inputClass} flex-1`}
            />
            {focused && (
              <span className="text-xs text-[var(--color-text-muted)]">
                &rarr;
              </span>
            )}
          </div>
        )}

        {(setting.type === "string" || setting.type === "path") && (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
            placeholder={setting.type === "path" ? "Ruta..." : ""}
          />
        )}
      </div>
    </div>
  );
}
