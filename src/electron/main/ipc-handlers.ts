import { ipcMain, app } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { ConfigManager } from "../../core/config-manager.js";
import { SystemsRegistry } from "../../core/systems-registry.js";
import { RomScanner } from "../../core/rom-scanner.js";
import { EmulatorMapper } from "../../core/emulator-mapper.js";
import { GameLauncher } from "../../core/game-launcher.js";
import { EmulatorDetector } from "../../core/emulator-detector.js";
import { MetadataCache } from "../../core/metadata-cache.js";
import { MetadataScraper } from "../../core/metadata-scraper.js";
import { LibretroThumbnails } from "../../core/libretro-thumbnails.js";
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
    const result = detector.detect(configManager.getEmulatorsPath());

    // Create ROM directories for each system supported by detected emulators
    const registry = new SystemsRegistry(getSystemsPath());
    const detectedSystemIds = new Set(
      result.detected.flatMap((emu) => emu.systems)
    );
    const romsPath = configManager.getRomsPath();
    for (const systemId of detectedSystemIds) {
      const system = registry.getById(systemId);
      if (system) {
        mkdirSync(path.join(romsPath, system.romFolder), { recursive: true });
      }
    }

    return result;
  });

  ipcMain.handle("get-all-metadata", () => {
    const cache = new MetadataCache(getProjectRoot());
    const registry = new SystemsRegistry(getSystemsPath());
    const systemIds = registry.getAll().map((s) => s.id);
    const metadataMap = cache.getAllMetadataAllSystems(systemIds);
    // Convert Map to plain object for IPC serialization
    const result: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of metadataMap) {
      result[key] = value;
    }
    return result;
  });

  ipcMain.handle(
    "get-metadata",
    (_event: IpcMainInvokeEvent, systemId: string, romFileName: string) => {
      const cache = new MetadataCache(getProjectRoot());
      return cache.getMetadata(systemId, romFileName);
    }
  );

  ipcMain.handle(
    "scrape-all-metadata",
    async (event: IpcMainInvokeEvent) => {
      const configManager = new ConfigManager(getProjectRoot());
      const appConfig = configManager.get();

      const devId = appConfig.screenScraperDevId;
      const devPassword = appConfig.screenScraperDevPassword;
      if (!devId || !devPassword) {
        throw new Error("ScreenScraper credentials not configured");
      }

      const registry = new SystemsRegistry(getSystemsPath());
      const scanner = new RomScanner(registry);
      const scanResult = scanner.scan(configManager.getRomsPath());

      const cache = new MetadataCache(getProjectRoot());
      const systemMapPath = path.join(
        getDataPath(),
        "screenscraper-systems.json"
      );
      const scraper = new MetadataScraper(
        {
          devId,
          devPassword,
          softName: "retro-launcher",
          ssId: appConfig.screenScraperUserId,
          ssPassword: appConfig.screenScraperUserPassword,
        },
        cache,
        { systemMapPath }
      );

      return scraper.scrapeAll(scanResult.systems, (progress) => {
        event.sender.send("scrape-progress", progress);
      });
    }
  );

  ipcMain.handle(
    "get-cover-path",
    (_event: IpcMainInvokeEvent, systemId: string, romFileName: string) => {
      const cache = new MetadataCache(getProjectRoot());
      if (cache.coverExists(systemId, romFileName)) {
        return cache.getCoverPath(systemId, romFileName);
      }
      return null;
    }
  );

  ipcMain.handle(
    "read-cover-data-url",
    (_event: IpcMainInvokeEvent, coverPath: string) => {
      if (!coverPath || !existsSync(coverPath)) return null;
      try {
        const data = readFileSync(coverPath);
        const ext = path.extname(coverPath).toLowerCase();
        const mime =
          ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
        return `data:${mime};base64,${data.toString("base64")}`;
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle("fetch-covers", async (event: IpcMainInvokeEvent) => {
    const configManager = new ConfigManager(getProjectRoot());
    const registry = new SystemsRegistry(getSystemsPath());
    const scanner = new RomScanner(registry);
    const scanResult = scanner.scan(configManager.getRomsPath());

    const cache = new MetadataCache(getProjectRoot());
    const systemMapPath = path.join(
      getDataPath(),
      "libretro-systems.json"
    );
    const thumbs = new LibretroThumbnails(cache, { systemMapPath });

    return thumbs.fetchAllCovers(scanResult.systems, (progress) => {
      event.sender.send("cover-fetch-progress", progress);
    });
  });
}
