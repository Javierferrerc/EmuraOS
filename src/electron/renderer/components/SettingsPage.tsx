import { useState } from "react";
import { useApp } from "../context/AppContext";

export function SettingsPage() {
  const {
    config,
    updateConfig,
    refreshScan,
    detectEmulators,
    lastDetection,
    setCurrentView,
    isLoading,
  } = useApp();

  const [romsPath, setRomsPath] = useState(config?.romsPath ?? "./roms");
  const [emulatorsPath, setEmulatorsPath] = useState(
    config?.emulatorsPath ?? "./emulators"
  );
  const [saved, setSaved] = useState(false);
  const [detecting, setDetecting] = useState(false);

  async function handleSave() {
    await updateConfig({ romsPath, emulatorsPath });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDetect() {
    setDetecting(true);
    await detectEmulators();
    setDetecting(false);
  }

  async function handleRescan() {
    await refreshScan();
  }

  return (
    <div className="flex h-screen flex-col bg-gray-900">
      <header className="flex items-center gap-3 border-b border-gray-700 bg-gray-800 px-4 py-2">
        <button
          onClick={() => setCurrentView("library")}
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
          title="Back to Library"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="text-lg font-bold text-gray-100">Settings</div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* Paths Section */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Paths
            </h2>
            <div className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-4">
              <div>
                <label className="mb-1 block text-sm text-gray-300">
                  ROMs Directory
                </label>
                <input
                  type="text"
                  value={romsPath}
                  onChange={(e) => setRomsPath(e.target.value)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-300">
                  Emulators Directory
                </label>
                <input
                  type="text"
                  value={emulatorsPath}
                  onChange={(e) => setEmulatorsPath(e.target.value)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                >
                  {saved ? "Saved!" : "Save"}
                </button>
                <button
                  onClick={handleRescan}
                  disabled={isLoading}
                  className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-50"
                >
                  {isLoading ? "Scanning..." : "Re-scan ROMs"}
                </button>
              </div>
            </div>
          </section>

          {/* Emulator Detection Section */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Emulator Detection
            </h2>
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <button
                onClick={handleDetect}
                disabled={detecting}
                className="mb-4 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
              >
                {detecting ? "Detecting..." : "Detect Emulators"}
              </button>

              {lastDetection && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">
                    Checked {lastDetection.totalChecked} emulators
                  </p>

                  {lastDetection.detected.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-medium text-green-400">
                        Found ({lastDetection.detected.length})
                      </h3>
                      <div className="space-y-1">
                        {lastDetection.detected.map((emu) => (
                          <div
                            key={emu.id}
                            className="flex items-center justify-between rounded bg-gray-700/50 px-3 py-1.5 text-sm"
                          >
                            <span className="text-gray-200">{emu.name}</span>
                            <span className="text-xs text-gray-400">
                              {emu.source === "emulatorsPath"
                                ? "Custom path"
                                : "Default path"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {lastDetection.notFound.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-medium text-gray-500">
                        Not Found ({lastDetection.notFound.length})
                      </h3>
                      <p className="text-sm text-gray-500">
                        {lastDetection.notFound.join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
