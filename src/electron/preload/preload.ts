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
});
