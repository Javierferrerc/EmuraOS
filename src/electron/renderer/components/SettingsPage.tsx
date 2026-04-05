import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import type { EmulatorDownloadProgress } from "../../../core/types.js";
import { NEW_SETTINGS_ENABLED } from "./settings/feature-flags";
import { SettingsRoot } from "./settings/SettingsRoot";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function DownloadProgressBar({
  progress,
}: {
  progress: EmulatorDownloadProgress;
}) {
  const pct =
    progress.bytesTotal > 0
      ? (progress.bytesReceived / progress.bytesTotal) * 100
      : 0;
  return (
    <div className="mt-2">
      <div className="mb-1 flex justify-between gap-2 text-xs text-gray-400">
        <span>
          {progress.filesCompleted} / {progress.filesTotal} files ·{" "}
          {formatBytes(progress.bytesReceived)} /{" "}
          {formatBytes(progress.bytesTotal)}
        </span>
        <span className="ml-2 max-w-[200px] truncate">
          {progress.currentFile ?? progress.phase}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full bg-green-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface CemuKeysInfo {
  emulatorFound: boolean;
  exists: boolean;
  path: string | null;
  entryCount: number;
}

export function SettingsPage() {
  // PR1 feature flag: when enabled, render the new schema-driven shell
  // instead of the legacy inline page. Flag is `false` on main so users
  // see no change. PR2's final commit flips it to `true` and removes the
  // legacy body below.
  if (NEW_SETTINGS_ENABLED) {
    return <SettingsRoot />;
  }

  return <LegacySettingsPage />;
}

function LegacySettingsPage() {
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
    openCemuKeysModal,
    isCemuKeysModalOpen,
    pendingCemuKeysLaunch,
    emulatorDefs,
    driveEmulators,
    isLoadingDrive,
    refreshDriveEmulators,
    downloadingEmulatorId,
    emulatorDownloadProgress,
    downloadEmulator,
  } = useApp();

  // Kick off a Drive listing on first mount; subsequent opens reuse the
  // cached map until the user hits "Refresh Drive".
  useEffect(() => {
    if (Object.keys(driveEmulators).length === 0 && !isLoadingDrive) {
      refreshDriveEmulators(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [cemuKeysInfo, setCemuKeysInfo] = useState<CemuKeysInfo | null>(null);

  // Refresh Cemu keys status whenever the modal closes (so after the user
  // pastes keys, the count updates here) and on initial mount.
  useEffect(() => {
    const modalOpen = isCemuKeysModalOpen || pendingCemuKeysLaunch !== null;
    if (modalOpen) return;
    let cancelled = false;
    window.electronAPI
      .checkCemuKeys()
      .then((info) => {
        if (!cancelled) setCemuKeysInfo(info);
      })
      .catch((err) => {
        console.warn("Failed to check Cemu keys:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [isCemuKeysModalOpen, pendingCemuKeysLaunch]);

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
  const [sgdbApiKey, setSgdbApiKey] = useState(
    config?.steamGridDbApiKey ?? ""
  );
  const [saved, setSaved] = useState(false);
  const [credsSaved, setCredsSaved] = useState(false);
  const [sgdbSaved, setSgdbSaved] = useState(false);

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

  async function handleSaveSgdb() {
    await updateConfig({
      steamGridDbApiKey: sgdbApiKey || undefined,
    });
    setSgdbSaved(true);
    setTimeout(() => setSgdbSaved(false), 2000);
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
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={handleDetect}
                  disabled={isDetectingEmulators || isLoadingDrive}
                  className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
                >
                  {isDetectingEmulators || isLoadingDrive
                    ? "Detecting..."
                    : "Detect Emulators"}
                </button>
              </div>

              {/* Core download progress (during detect-emulators) */}
              {isDetectingEmulators && coreDownloadProgress && (
                <div className="mb-4">
                  <div className="mb-1 flex justify-between text-xs text-gray-400">
                    <span>
                      {coreDownloadProgress.current} /{" "}
                      {coreDownloadProgress.total}
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

              {/* Unified emulator list: 3 row variants */}
              <div className="space-y-2">
                {emulatorDefs.map((def) => {
                  const detected = lastDetection?.detected.find(
                    (d) => d.id === def.id
                  );
                  const readiness = readinessReport?.results.find(
                    (r) => r.emulatorId === def.id
                  );
                  const driveEntry = driveEmulators[def.id.toLowerCase()];
                  const isDownloading = downloadingEmulatorId === def.id;

                  // Variant 1: Installed
                  if (detected) {
                    return (
                      <div
                        key={def.id}
                        className="flex items-center justify-between rounded bg-gray-700/50 px-3 py-1.5 text-sm"
                      >
                        <span className="text-gray-200">{def.name}</span>
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
                            {detected.source === "emulatorsPath"
                              ? "Custom path"
                              : "Default path"}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  // Variant 2: Available to download from Drive
                  if (driveEntry) {
                    return (
                      <div
                        key={def.id}
                        className="rounded bg-gray-700/30 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-gray-200">
                              {def.name}
                            </span>
                            <span className="ml-2 text-xs text-gray-500">
                              {driveEntry.fileCount > 0
                                ? `${driveEntry.fileCount} files · ${formatBytes(driveEntry.totalBytes)}`
                                : "Available on Drive"}
                            </span>
                          </div>
                          <button
                            onClick={() => downloadEmulator(def.id)}
                            disabled={isDownloading || downloadingEmulatorId !== null}
                            className="rounded bg-green-700 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
                          >
                            {isDownloading ? "Downloading..." : "Download"}
                          </button>
                        </div>
                        {isDownloading && emulatorDownloadProgress && (
                          <DownloadProgressBar
                            progress={emulatorDownloadProgress}
                          />
                        )}
                      </div>
                    );
                  }

                  // Variant 3: Not available yet
                  return (
                    <div
                      key={def.id}
                      className="flex items-center justify-between rounded bg-gray-700/20 px-3 py-2"
                    >
                      <span className="text-sm text-gray-400">{def.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          Not available yet
                        </span>
                        <button
                          disabled
                          className="cursor-not-allowed rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-500"
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Emulator Configuration Section */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Emulator Configuration
            </h2>
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="mb-3 text-sm text-gray-400">
                Tweak emulator settings (graphics, audio, input, paths) directly
                from Retro Launcher without opening each emulator separately.
              </p>
              <button
                onClick={() => setCurrentView("emulator-config")}
                disabled={!lastDetection || lastDetection.detected.length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                Configure Emulators
              </button>
              {(!lastDetection || lastDetection.detected.length === 0) && (
                <p className="mt-2 text-xs text-gray-500">
                  Detect emulators first to enable configuration.
                </p>
              )}
            </div>
          </section>

          {/* Cemu (Wii U) Keys Section */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Cemu (Wii U) Disc Keys
            </h2>
            <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="text-sm text-gray-400">
                Cemu needs a <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-blue-300">keys.txt</code> file
                to decrypt encrypted Wii U games (.wud/.wux). Paste your keys
                here to save them in Cemu's config directory.
              </p>

              {cemuKeysInfo && !cemuKeysInfo.emulatorFound && (
                <p className="rounded bg-yellow-950/40 px-3 py-2 text-xs text-yellow-300">
                  Cemu not detected. Run "Detect Emulators" first.
                </p>
              )}

              {cemuKeysInfo && cemuKeysInfo.emulatorFound && (
                <div className="rounded bg-gray-700/50 px-3 py-2 text-xs text-gray-300">
                  <p>
                    Status:{" "}
                    {cemuKeysInfo.exists ? (
                      <span className="font-semibold text-green-400">
                        {cemuKeysInfo.entryCount}{" "}
                        {cemuKeysInfo.entryCount === 1 ? "key" : "keys"} found
                      </span>
                    ) : (
                      <span className="font-semibold text-red-400">
                        No keys found
                      </span>
                    )}
                  </p>
                  {cemuKeysInfo.path && (
                    <p className="mt-1 break-all text-gray-500">
                      {cemuKeysInfo.path}
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={openCemuKeysModal}
                disabled={!!cemuKeysInfo && !cemuKeysInfo.emulatorFound}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cemuKeysInfo?.exists ? "Edit Keys" : "Paste Keys"}
              </button>
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
                When a SteamGridDB API key is configured below, remaining
                covers are fetched from SteamGridDB as a fallback (fixes Switch
                and other modern systems).
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

          {/* SteamGridDB (Boxart Fallback) Section */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
              SteamGridDB (Boxart Fallback)
            </h2>
            <div className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="text-sm text-gray-400">
                Optional fallback source that fixes Switch and other modern
                systems Libretro doesn't cover. Requires a free API key from{" "}
                <span className="font-mono text-gray-300">
                  steamgriddb.com/profile/preferences/api
                </span>
                . When a key is set, remaining covers are automatically fetched
                from SteamGridDB after Libretro.
              </p>
              <div>
                <label className="mb-1 block text-sm text-gray-300">
                  SteamGridDB API Key
                </label>
                <input
                  type="password"
                  value={sgdbApiKey}
                  onChange={(e) => setSgdbApiKey(e.target.value)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Paste your SteamGridDB API key"
                />
              </div>
              <button
                onClick={handleSaveSgdb}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                {sgdbSaved ? "Saved!" : "Save API Key"}
              </button>
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
