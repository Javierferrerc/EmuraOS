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
    isScraping,
    scrapeProgress,
    lastScrapeResult,
    startScraping,
    isFetchingCovers,
    coverFetchProgress,
    lastCoverFetchResult,
    startFetchingCovers,
    isDetectingEmulators,
    coreDownloadProgress,
    readinessReport,
  } = useApp();

  const [romsPath, setRomsPath] = useState(config?.romsPath ?? "./roms");
  const [emulatorsPath, setEmulatorsPath] = useState(
    config?.emulatorsPath ?? "./emulators"
  );
  const [ssDevId, setSsDevId] = useState(
    config?.screenScraperDevId ?? ""
  );
  const [ssDevPassword, setSsDevPassword] = useState(
    config?.screenScraperDevPassword ?? ""
  );
  const [ssUserId, setSsUserId] = useState(
    config?.screenScraperUserId ?? ""
  );
  const [ssUserPassword, setSsUserPassword] = useState(
    config?.screenScraperUserPassword ?? ""
  );
  const [saved, setSaved] = useState(false);
  const [credsSaved, setCredsSaved] = useState(false);

  async function handleSave() {
    await updateConfig({ romsPath, emulatorsPath });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSaveCreds() {
    await updateConfig({
      screenScraperDevId: ssDevId || undefined,
      screenScraperDevPassword: ssDevPassword || undefined,
      screenScraperUserId: ssUserId || undefined,
      screenScraperUserPassword: ssUserPassword || undefined,
    });
    setCredsSaved(true);
    setTimeout(() => setCredsSaved(false), 2000);
  }

  async function handleDetect() {
    await detectEmulators();
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
                disabled={isDetectingEmulators}
                className="mb-4 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
              >
                {isDetectingEmulators ? "Setting up..." : "Detect Emulators"}
              </button>

              {/* Core download progress */}
              {isDetectingEmulators && coreDownloadProgress && (
                <div className="mb-4">
                  <div className="mb-1 flex justify-between text-xs text-gray-400">
                    <span>
                      {coreDownloadProgress.current} / {coreDownloadProgress.total}
                    </span>
                    <span className="ml-2 truncate">
                      {coreDownloadProgress.status === "downloading"
                        ? `Downloading ${coreDownloadProgress.coreName}...`
                        : coreDownloadProgress.status === "installed"
                          ? `Installed ${coreDownloadProgress.coreName}`
                          : coreDownloadProgress.status === "already_installed"
                            ? `${coreDownloadProgress.coreName} already installed`
                            : coreDownloadProgress.status === "error"
                              ? `Failed: ${coreDownloadProgress.coreName}`
                              : `${coreDownloadProgress.coreName}`}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all duration-300"
                      style={{
                        width: `${Math.round((coreDownloadProgress.current / coreDownloadProgress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {lastDetection && !isDetectingEmulators && (
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
                        {lastDetection.detected.map((emu) => {
                          const readiness = readinessReport?.results.find(
                            (r) => r.emulatorId === emu.id
                          );
                          return (
                            <div
                              key={emu.id}
                              className="flex items-center justify-between rounded bg-gray-700/50 px-3 py-1.5 text-sm"
                            >
                              <span className="text-gray-200">{emu.name}</span>
                              <div className="flex items-center gap-2">
                                {readiness && (
                                  <span
                                    className={`text-xs font-medium ${
                                      readiness.errors.length > 0
                                        ? "text-red-400"
                                        : readiness.fixed.length > 0
                                          ? "text-blue-400"
                                          : "text-green-400"
                                    }`}
                                  >
                                    {readiness.errors.length > 0
                                      ? `${readiness.errors.length} error(s)`
                                      : readiness.fixed.length > 0
                                        ? `${readiness.fixed.length} core(s) installed`
                                        : "Ready"}
                                  </span>
                                )}
                                <span className="text-xs text-gray-400">
                                  {emu.source === "emulatorsPath"
                                    ? "Custom path"
                                    : "Default path"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
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

          {/* Covers (Automatic) Section */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Covers (Automatic)
            </h2>
            <div className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="text-sm text-gray-400">
                Download box art from Libretro Thumbnails. No credentials
                needed — covers are fetched automatically when ROMs are scanned.
              </p>
              <button
                onClick={startFetchingCovers}
                disabled={isFetchingCovers}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {isFetchingCovers ? "Downloading..." : "Download Covers"}
              </button>

              {isFetchingCovers && coverFetchProgress && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-gray-400">
                    <span>
                      {coverFetchProgress.current} /{" "}
                      {coverFetchProgress.total}
                    </span>
                    <span className="ml-2 truncate">
                      {coverFetchProgress.romFileName}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-300"
                      style={{
                        width: `${Math.round((coverFetchProgress.current / coverFetchProgress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {lastCoverFetchResult && !isFetchingCovers && (
                <div className="space-y-1 rounded bg-gray-700/50 p-3 text-sm">
                  <p className="text-gray-300">
                    Processed:{" "}
                    <span className="font-medium text-gray-100">
                      {lastCoverFetchResult.totalProcessed}
                    </span>
                  </p>
                  <p className="text-green-400">
                    Found: {lastCoverFetchResult.totalFound}
                  </p>
                  <p className="text-yellow-400">
                    Not Found: {lastCoverFetchResult.totalNotFound}
                  </p>
                  {lastCoverFetchResult.totalErrors > 0 && (
                    <p className="text-red-400">
                      Errors: {lastCoverFetchResult.totalErrors}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Full Metadata (ScreenScraper) Section */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Full Metadata (ScreenScraper)
            </h2>
            <div className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="text-sm text-gray-400">
                Fetch descriptions, genres, years, and additional covers from
                ScreenScraper. Requires credentials.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm text-gray-300">
                    ScreenScraper Dev ID
                  </label>
                  <input
                    type="text"
                    value={ssDevId}
                    onChange={(e) => setSsDevId(e.target.value)}
                    className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Your dev ID"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">
                    Dev Password
                  </label>
                  <input
                    type="password"
                    value={ssDevPassword}
                    onChange={(e) => setSsDevPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Your dev password"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">
                    User ID (optional)
                  </label>
                  <input
                    type="text"
                    value={ssUserId}
                    onChange={(e) => setSsUserId(e.target.value)}
                    className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="ScreenScraper username"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">
                    User Password (optional)
                  </label>
                  <input
                    type="password"
                    value={ssUserPassword}
                    onChange={(e) => setSsUserPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="ScreenScraper password"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSaveCreds}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                >
                  {credsSaved ? "Saved!" : "Save Credentials"}
                </button>
                <button
                  onClick={startScraping}
                  disabled={isScraping || !ssDevId || !ssDevPassword}
                  className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600 disabled:opacity-50"
                >
                  {isScraping ? "Scraping..." : "Scrape All Metadata"}
                </button>
              </div>

              {isScraping && scrapeProgress && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-gray-400">
                    <span>
                      {scrapeProgress.current} / {scrapeProgress.total}
                    </span>
                    <span className="ml-2 truncate">
                      {scrapeProgress.romFileName}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                    <div
                      className="h-full rounded-full bg-purple-500 transition-all duration-300"
                      style={{
                        width: `${Math.round((scrapeProgress.current / scrapeProgress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {lastScrapeResult && !isScraping && (
                <div className="space-y-1 rounded bg-gray-700/50 p-3 text-sm">
                  <p className="text-gray-300">
                    Processed:{" "}
                    <span className="font-medium text-gray-100">
                      {lastScrapeResult.totalProcessed}
                    </span>
                  </p>
                  <p className="text-green-400">
                    Found: {lastScrapeResult.totalFound}
                  </p>
                  <p className="text-yellow-400">
                    Not Found: {lastScrapeResult.totalNotFound}
                  </p>
                  {lastScrapeResult.totalErrors > 0 && (
                    <p className="text-red-400">
                      Errors: {lastScrapeResult.totalErrors}
                    </p>
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
