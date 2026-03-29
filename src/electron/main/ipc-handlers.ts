import { ipcMain, app } from "electron";
import path from "node:path";
import { ConfigManager } from "../../core/config-manager.js";
import { SystemsRegistry } from "../../core/systems-registry.js";
import { RomScanner } from "../../core/rom-scanner.js";
import { EmulatorMapper } from "../../core/emulator-mapper.js";
import { GameLauncher } from "../../core/game-launcher.js";
import { EmulatorDetector } from "../../core/emulator-detector.js";
import type { AppConfig, DiscoveredRom } from "../../core/types.js";

function getDataPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "data");
  }
  return path.join(app.getAppPath(), "src", "data");
}

function getSystemsPath(): string {
  return path.join(getDataPath(), "systems.json");
}

function getEmulatorsPath(): string {
  return path.join(getDataPath(), "emulators.json");
}

function getProjectRoot(): string {
  if (app.isPackaged) {
    return path.dirname(app.getPath("exe"));
  }
  return app.getAppPath();
}

export function registerIpcHandlers(): void {
  ipcMain.handle("get-config", () => {
    const configManager = new ConfigManager(getProjectRoot());
    return configManager.get();
  });

  ipcMain.handle("update-config", (_event, partial: Partial<AppConfig>) => {
    const configManager = new ConfigManager(getProjectRoot());
    configManager.update(partial);
    configManager.save();
    return configManager.get();
  });

  ipcMain.handle("config-exists", () => {
    const configManager = new ConfigManager(getProjectRoot());
    return configManager.exists();
  });

  ipcMain.handle("get-systems", () => {
    const registry = new SystemsRegistry(getSystemsPath());
    return registry.getAll();
  });

  ipcMain.handle("scan-roms", () => {
    const configManager = new ConfigManager(getProjectRoot());
    const registry = new SystemsRegistry(getSystemsPath());
    const scanner = new RomScanner(registry);
    return scanner.scan(configManager.getRomsPath());
  });

  ipcMain.handle("launch-game", (_event, rom: DiscoveredRom) => {
    const configManager = new ConfigManager(getProjectRoot());
    const mapper = new EmulatorMapper(getEmulatorsPath());
    const launcher = new GameLauncher(mapper);
    return launcher.launch(rom, configManager.getEmulatorsPath());
  });

  ipcMain.handle("detect-emulators", () => {
    const configManager = new ConfigManager(getProjectRoot());
    const mapper = new EmulatorMapper(getEmulatorsPath());
    const detector = new EmulatorDetector(mapper);
    return detector.detect(configManager.getEmulatorsPath());
  });
}
