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
});
