import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  updateConfig: (partial: Record<string, unknown>) =>
    ipcRenderer.invoke("update-config", partial),
  configExists: () => ipcRenderer.invoke("config-exists"),
  getSystems: () => ipcRenderer.invoke("get-systems"),
  scanRoms: () => ipcRenderer.invoke("scan-roms"),
  launchGame: (rom: Record<string, unknown>) =>
    ipcRenderer.invoke("launch-game", rom),
  detectEmulators: () => ipcRenderer.invoke("detect-emulators"),
  getAllMetadata: () => ipcRenderer.invoke("get-all-metadata"),
  getMetadata: (systemId: string, romFileName: string) =>
    ipcRenderer.invoke("get-metadata", systemId, romFileName),
  scrapeAllMetadata: () => ipcRenderer.invoke("scrape-all-metadata"),
  getCoverPath: (systemId: string, romFileName: string) =>
    ipcRenderer.invoke("get-cover-path", systemId, romFileName),
  readCoverDataUrl: (coverPath: string) =>
    ipcRenderer.invoke("read-cover-data-url", coverPath),
  onScrapeProgress: (callback: (progress: unknown) => void) => {
    ipcRenderer.on("scrape-progress", (_event, progress) =>
      callback(progress)
    );
  },
  removeScrapeProgressListener: () => {
    ipcRenderer.removeAllListeners("scrape-progress");
  },
  fetchCovers: () => ipcRenderer.invoke("fetch-covers"),
  onCoverFetchProgress: (callback: (progress: unknown) => void) => {
    ipcRenderer.on("cover-fetch-progress", (_event, progress) =>
      callback(progress)
    );
  },
  removeCoverFetchProgressListener: () => {
    ipcRenderer.removeAllListeners("cover-fetch-progress");
  },
  toggleFullscreen: () => ipcRenderer.invoke("toggle-fullscreen"),
  getFullscreen: () => ipcRenderer.invoke("get-fullscreen"),
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => {
    ipcRenderer.on("fullscreen-changed", (_event, isFullscreen) =>
      callback(isFullscreen)
    );
  },
  removeFullscreenChangedListener: () => {
    ipcRenderer.removeAllListeners("fullscreen-changed");
  },
  getUserLibrary: () => ipcRenderer.invoke("get-user-library"),
  toggleFavorite: (systemId: string, fileName: string) =>
    ipcRenderer.invoke("toggle-favorite", systemId, fileName),
  getCollections: () => ipcRenderer.invoke("get-collections"),
  createCollection: (name: string) =>
    ipcRenderer.invoke("create-collection", name),
  renameCollection: (id: string, name: string) =>
    ipcRenderer.invoke("rename-collection", id, name),
  deleteCollection: (id: string) =>
    ipcRenderer.invoke("delete-collection", id),
  addToCollection: (collectionId: string, systemId: string, fileName: string) =>
    ipcRenderer.invoke("add-to-collection", collectionId, systemId, fileName),
  removeFromCollection: (collectionId: string, systemId: string, fileName: string) =>
    ipcRenderer.invoke("remove-from-collection", collectionId, systemId, fileName),
  getRecentlyPlayed: (limit?: number) =>
    ipcRenderer.invoke("get-recently-played", limit),

  onCoreDownloadProgress: (callback: (progress: unknown) => void) => {
    ipcRenderer.on("core-download-progress", (_event, progress) =>
      callback(progress)
    );
  },
  removeCoreDownloadProgressListener: () => {
    ipcRenderer.removeAllListeners("core-download-progress");
  },

  // Embedded overlay
  launchGameEmbedded: (rom: Record<string, unknown>) =>
    ipcRenderer.invoke("launch-game-embedded", rom),
  stopEmbeddedGame: () => ipcRenderer.invoke("stop-embedded-game"),
  isGameRunning: () => ipcRenderer.invoke("is-game-running"),
  setGameAreaBounds: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => ipcRenderer.invoke("set-game-area-bounds", bounds),
  onGameSessionStarted: (callback: (event: unknown) => void) => {
    ipcRenderer.on("game-session-started", (_event, data) => callback(data));
  },
  removeGameSessionStartedListener: () => {
    ipcRenderer.removeAllListeners("game-session-started");
  },
  onGameSessionEnded: (callback: () => void) => {
    ipcRenderer.on("game-session-ended", () => callback());
  },
  removeGameSessionEndedListener: () => {
    ipcRenderer.removeAllListeners("game-session-ended");
  },

  // Emulator config
  getEmulatorConfig: (emulatorId: string, executablePath?: string) =>
    ipcRenderer.invoke("get-emulator-config", emulatorId, executablePath),
  updateEmulatorConfig: (
    emulatorId: string,
    changes: Record<string, string>,
    executablePath?: string
  ) =>
    ipcRenderer.invoke(
      "update-emulator-config",
      emulatorId,
      changes,
      executablePath
    ),
  getEmulatorSchemas: () => ipcRenderer.invoke("get-emulator-schemas"),
  openConfigFile: (emulatorId: string, executablePath?: string) =>
    ipcRenderer.invoke("open-config-file", emulatorId, executablePath),

  // Cemu keys.txt
  checkCemuKeys: () => ipcRenderer.invoke("check-cemu-keys"),
  writeCemuKeys: (content: string) =>
    ipcRenderer.invoke("write-cemu-keys", content),

  // Emulator downloads (Google Drive)
  getEmulatorDefs: () => ipcRenderer.invoke("get-emulator-defs"),
  listDriveEmulators: (forceRefresh?: boolean) =>
    ipcRenderer.invoke("list-drive-emulators", forceRefresh),
  downloadEmulator: (emulatorId: string) =>
    ipcRenderer.invoke("download-emulator", emulatorId),
  onEmulatorDownloadProgress: (callback: (progress: unknown) => void) => {
    const listener = (_: unknown, progress: unknown) => callback(progress);
    ipcRenderer.on("emulator-download-progress", listener);
    return () => {
      ipcRenderer.removeListener("emulator-download-progress", listener);
    };
  },
});
