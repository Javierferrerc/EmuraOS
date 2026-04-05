import { useState, useEffect, useCallback } from "react";
import type { SettingsContext } from "../../../../../schemas/settings-schema-types";
import type { EmulatorConfigData } from "../../../../../../core/types";

interface Props {
  ctx: SettingsContext;
  emulatorId: string;
}

export function ConfiguracionTab({ ctx, emulatorId }: Props) {
  const detected = ctx.lastDetection?.detected.find(
    (d) => d.id === emulatorId
  );
  const executablePath = detected?.executablePath;

  const [configData, setConfigData] = useState<EmulatorConfigData | null>(null);
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>(
    {}
  );
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [showRawEditor, setShowRawEditor] = useState(false);
  const [rawText, setRawText] = useState("");

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
        setActiveCategory(data.schema.categories[0].id);
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

  async function handleSave() {
    if (!configData) return;
    setIsSaving(true);
    setSaveMessage("");
    try {
      const changes: Record<string, string> = {};
      for (const [key, value] of Object.entries(editedSettings)) {
        if (configData.settings[key] !== value) {
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
        configData.emulatorId,
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
  }

  function handleReset() {
    if (!configData) return;
    setEditedSettings({ ...configData.settings });
    setSaveMessage("");
  }

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

  const currentCategory = configData.schema.categories.find(
    (c) => c.id === activeCategory
  );

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
            {configData.schema.categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeCategory === cat.id
                    ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                    : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Settings form */}
          {currentCategory && (
            <div className="space-y-4 rounded-[var(--radius-md)] bg-[var(--color-surface-0)] p-4">
              {currentCategory.settings.map((setting) => (
                <SettingField
                  key={setting.key}
                  setting={setting}
                  value={
                    editedSettings[setting.key] ?? setting.default ?? ""
                  }
                  onChange={(val) => handleSettingChange(setting.key, val)}
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
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {isSaving ? "Guardando..." : "Guardar"}
        </button>
        <button
          onClick={handleReset}
          className="rounded-lg border border-[var(--color-surface-2)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)]"
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
}

function SettingField({ setting, value, onChange }: SettingFieldProps) {
  const inputClass =
    "w-full rounded-[var(--radius-sm)] border border-[var(--color-surface-2)] bg-[var(--color-surface-0)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]";

  return (
    <div className="flex items-start justify-between gap-4">
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
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
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
        )}

        {setting.type === "number" && (
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            min={setting.min}
            max={setting.max}
            className={inputClass}
          />
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
