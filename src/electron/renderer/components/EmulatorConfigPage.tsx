import { useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import type { EmulatorConfigData } from "../../../core/types";

export function EmulatorConfigPage() {
  const { setCurrentView, lastDetection } = useApp();
  const detectedEmulators = lastDetection?.detected ?? [];

  const [selectedEmu, setSelectedEmu] = useState<string>("");
  const [configData, setConfigData] = useState<EmulatorConfigData | null>(null);
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [showRawEditor, setShowRawEditor] = useState(false);
  const [rawText, setRawText] = useState("");

  const executablePath = detectedEmulators.find((e) => e.id === selectedEmu)?.executablePath;

  const loadConfig = useCallback(
    async (emuId: string) => {
      if (!emuId) return;
      setIsLoading(true);
      setConfigData(null);
      setEditedSettings({});
      setSaveMessage("");
      setShowRawEditor(false);
      try {
        const exePath = detectedEmulators.find((e) => e.id === emuId)?.executablePath;
        const data = await window.electronAPI.getEmulatorConfig(emuId, exePath);
        setConfigData(data);
        setEditedSettings({ ...data.settings });
        // Set first category as active tab, or raw if no categories
        if (data.schema.categories.length > 0) {
          setActiveTab(data.schema.categories[0].id);
        } else {
          setShowRawEditor(true);
        }
        // Build raw text
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
    },
    [detectedEmulators]
  );

  useEffect(() => {
    if (selectedEmu) {
      loadConfig(selectedEmu);
    }
  }, [selectedEmu, loadConfig]);

  function handleSettingChange(key: string, value: string) {
    setEditedSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!configData) return;
    setIsSaving(true);
    setSaveMessage("");
    try {
      // Find only changed settings
      const changes: Record<string, string> = {};
      for (const [key, value] of Object.entries(editedSettings)) {
        if (configData.settings[key] !== value) {
          changes[key] = value;
        }
      }
      if (Object.keys(changes).length === 0) {
        setSaveMessage("No changes to save.");
        setIsSaving(false);
        setTimeout(() => setSaveMessage(""), 2000);
        return;
      }
      await window.electronAPI.updateEmulatorConfig(
        configData.emulatorId,
        changes,
        executablePath
      );
      // Reload to confirm
      await loadConfig(selectedEmu);
      setSaveMessage("Saved!");
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

  async function handleOpenFile() {
    if (!configData) return;
    await window.electronAPI.openConfigFile(configData.emulatorId, executablePath);
  }

  function handleRawApply() {
    const parsed: Record<string, string> = {};
    for (const line of rawText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
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

  const activeCategory = configData?.schema.categories.find((c) => c.id === activeTab);

  return (
    <div className="flex h-screen flex-col bg-gray-900">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-gray-700 bg-gray-800 px-4 py-2">
        <button
          onClick={() => setCurrentView("settings")}
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
          title="Back to Settings"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-lg font-bold text-gray-100">Emulator Configuration</div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — Emulator list */}
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-gray-700 bg-gray-800/50 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Detected Emulators
          </h3>
          {detectedEmulators.length === 0 ? (
            <p className="text-xs text-gray-500">
              No emulators detected. Run detection from Settings first.
            </p>
          ) : (
            <div className="space-y-1">
              {detectedEmulators.map((emu) => (
                <button
                  key={emu.id}
                  onClick={() => setSelectedEmu(emu.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selectedEmu === emu.id
                      ? "bg-blue-600/30 text-blue-300"
                      : "text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {emu.name}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedEmu && (
            <div className="flex h-full items-center justify-center">
              <p className="text-gray-500">Select an emulator to configure.</p>
            </div>
          )}

          {isLoading && (
            <div className="flex h-full items-center justify-center">
              <p className="text-gray-400">Loading configuration...</p>
            </div>
          )}

          {selectedEmu && !isLoading && configData && (
            <div className="mx-auto max-w-3xl space-y-4">
              {/* Config path info */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {configData.configPath ? (
                    <>
                      Config: <span className="text-gray-400">{configData.configPath}</span>
                    </>
                  ) : (
                    <span className="text-yellow-500">Config file not found</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {configData.configPath && (
                    <button
                      onClick={handleOpenFile}
                      className="rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
                    >
                      Open in Editor
                    </button>
                  )}
                  <button
                    onClick={() => setShowRawEditor(!showRawEditor)}
                    className={`rounded px-2 py-1 text-xs transition-colors ${
                      showRawEditor
                        ? "bg-gray-700 text-gray-200"
                        : "text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                    }`}
                  >
                    Raw Editor
                  </button>
                </div>
              </div>

              {!showRawEditor && configData.schema.categories.length > 0 ? (
                <>
                  {/* Tab bar */}
                  <div className="flex gap-1 border-b border-gray-700">
                    {configData.schema.categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveTab(cat.id)}
                        className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                          activeTab === cat.id
                            ? "border-blue-500 text-blue-400"
                            : "border-transparent text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>

                  {/* Settings form */}
                  {activeCategory && (
                    <div className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-4">
                      {activeCategory.settings.map((setting) => (
                        <SettingField
                          key={setting.key}
                          setting={setting}
                          value={editedSettings[setting.key] ?? setting.default ?? ""}
                          onChange={(val) => handleSettingChange(setting.key, val)}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                /* Raw Editor */
                <div className="space-y-3">
                  {Object.keys(editedSettings).length === 0 && !configData.configPath && (
                    <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 p-4 text-sm text-yellow-400">
                      No configuration file found for this emulator. The config file may
                      not exist yet — launch the emulator once to generate it.
                    </div>
                  )}
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    className="h-96 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 font-mono text-xs text-gray-200 outline-none focus:border-blue-500"
                    placeholder="key = value (one per line)"
                    spellCheck={false}
                  />
                  <button
                    onClick={handleRawApply}
                    className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
                  >
                    Apply Raw Changes
                  </button>
                </div>
              )}

              {/* Save/Reset bar */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !configData.configPath}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={handleReset}
                  className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700"
                >
                  Reset
                </button>
                {saveMessage && (
                  <span
                    className={`text-sm ${
                      saveMessage.startsWith("Error") ? "text-red-400" : "text-green-400"
                    }`}
                  >
                    {saveMessage}
                  </span>
                )}
              </div>
            </div>
          )}
        </main>
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
  const inputBase =
    "w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <label className="mb-1 block text-sm font-medium text-gray-300">
          {setting.label}
        </label>
        {setting.description && (
          <p className="mb-1 text-xs text-gray-500">{setting.description}</p>
        )}
        <p className="text-xs text-gray-600">{setting.key}</p>
      </div>

      <div className="w-64 shrink-0">
        {setting.type === "boolean" && (() => {
          // Case-insensitive boolean read — PPSSPP and other emulators write
          // booleans as "True"/"False" (PascalCase) in some keys and
          // "true"/"false" (lowercase) in others. Always write back lowercase
          // for consistency; every known emulator ini parser accepts it.
          const isOn = value.toLowerCase() === "true";
          return (
            <button
              onClick={() => onChange(isOn ? "false" : "true")}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                isOn ? "bg-blue-600" : "bg-gray-600"
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
            className={inputBase}
          >
            {!setting.options.some((opt) =>
              (typeof opt === "string" ? opt : opt.value) === value
            ) && value && (
              <option value={value}>{value} (current)</option>
            )}
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
            className={inputBase}
          />
        )}

        {setting.type === "string" && (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputBase}
          />
        )}

        {setting.type === "path" && (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputBase}
            placeholder="Path..."
          />
        )}
      </div>
    </div>
  );
}
