import { ipcMain, app, BrowserWindow } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { ConfigManager } from "../../core/config-manager.js";
import { SystemsRegistry } from "../../core/systems-registry.js";
import { RomScanner } from "../../core/rom-scanner.js";
import { EmulatorMapper } from "../../core/emulator-mapper.js";
import { GameLauncher } from "../../core/game-launcher.js";
import { EmulatorDetector } from "../../core/emulator-detector.js";
import { EmulatorReadiness } from "../../core/emulator-readiness.js";
import { MetadataCache } from "../../core/metadata-cache.js";
import { MetadataScraper } from "../../core/metadata-scraper.js";
import { LibretroThumbnails } from "../../core/libretro-thumbnails.js";
import { SteamGridDb } from "../../core/steamgriddb.js";
import { UserLibrary } from "../../core/user-library.js";
import { EmulatorConfigManager } from "../../core/emulator-config.js";
import {
  ensureCemuGamePath,
  checkCemuKeys,
  writeCemuKeys,
} from "../../core/cemu-setup.js";
import { ensurePpssppPortable } from "../../core/ppsspp-setup.js";
import { EmulatorDownloader } from "../../core/emulator-downloader.js";
import { EmulatorOverlay } from "./emulator-overlay.js";
import type {
  AppConfig,
  DiscoveredRom,
  DriveEmulatorMapping,
  EmulatorDefinition,
} from "../../core/types.js";

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

function getSchemasPath(): string {
  return path.join(getDataPath(), "emulator-schemas");
}

function getProjectRoot(): string {
  if (app.isPackaged) {
    return path.dirname(app.getPath("exe"));
  }
  return app.getAppPath();
}

/**
 * Run emulator-specific first-launch setup (e.g. write ROM folder into
 * Cemu's settings.xml so users are not prompted for a game path).
 */
function runPerEmulatorSetup(
  emulatorId: string,
  systemId: string,
  executablePath: string,
  romsPath: string
): void {
  if (emulatorId === "cemu" && systemId === "wiiu") {
    try {
      const registry = new SystemsRegistry(getSystemsPath());
      const wiiuSystem = registry.getById("wiiu");
      if (!wiiuSystem) return;
      const wiiuFolder = path.join(romsPath, wiiuSystem.romFolder);
      if (!existsSync(wiiuFolder)) {
        mkdirSync(wiiuFolder, { recursive: true });
      }
      const result = ensureCemuGamePath(executablePath, wiiuFolder);
      if (result.updated) {
        console.log(
          "[cemu-setup] registered Wii U ROM folder in",
          result.settingsPath
        );
      }
    } catch (err) {
      console.warn("[cemu-setup] failed:", err);
    }
  }

  if (emulatorId === "ppsspp") {
    try {
      const result = ensurePpssppPortable(executablePath);
      if (result.updated) {
        console.log(
          "[ppsspp-setup] enabled portable mode, memstick at",
          result.memstickPath
        );
      }
    } catch (err) {
      console.warn("[ppsspp-setup] failed:", err);
    }
  }
}

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null
): void {
  let overlay: EmulatorOverlay | null = null;
  // Cached Drive listing for the duration of the app session. Invalidated
  // when the renderer passes forceRefresh=true to `list-drive-emulators`.
  let cachedDriveListing: Record<string, DriveEmulatorMapping> | null = null;

  function getOrCreateOverlay(): EmulatorOverlay | null {
    const win = getMainWindow();
    if (!win) return null;
    if (!overlay) {
      overlay = new EmulatorOverlay(win, {
        onSessionStarted: (event) => {
          win.setFullScreen(true);
          win.webContents.send("game-session-started", event);
        },
        onSessionEnded: () => {
          if (win.isFullScreen()) win.setFullScreen(false);
          win.webContents.send("game-session-ended");
          overlay = null;
        },
      });
    }
    return overlay;
  }

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
    const emulatorsPath = configManager.getEmulatorsPath();
    const resolved = mapper.resolve(rom.systemId, emulatorsPath);
    if (resolved) {
      runPerEmulatorSetup(
        resolved.definition.id,
        rom.systemId,
        resolved.executablePath,
        configManager.getRomsPath()
      );
    }
    const result = launcher.launch(rom, emulatorsPath);
    if (result.success) {
      const lib = new UserLibrary(getProjectRoot());
      lib.recordPlay(rom.systemId, rom.fileName);
    }
    return result;
  });

  ipcMain.handle("detect-emulators", async (event) => {
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

    // Run one-shot per-emulator setup for detected emulators that need a
    // portable-mode marker so their config files land where we write them.
    for (const detected of result.detected) {
      if (detected.id === "ppsspp" && detected.executablePath) {
        try {
          const setup = ensurePpssppPortable(detected.executablePath);
          if (setup.updated) {
            console.log(
              "[ppsspp-setup] enabled portable mode, memstick at",
              setup.memstickPath
            );
          }
        } catch (err) {
          console.warn("[ppsspp-setup] failed:", err);
        }
      }
    }

    // Validate emulator readiness and auto-download missing cores
    const emulatorDefs: EmulatorDefinition[] = JSON.parse(
      readFileSync(getEmulatorsPath(), "utf-8")
    );
    const readiness = new EmulatorReadiness();
    const readinessReport = await readiness.validateAndFix(
      result.detected,
      emulatorDefs,
      (progress) => {
        event.sender.send("core-download-progress", progress);
      }
    );

    return { ...result, readiness: readinessReport };
  });

  ipcMain.handle("get-emulator-defs", () => {
    return JSON.parse(
      readFileSync(getEmulatorsPath(), "utf-8")
    ) as EmulatorDefinition[];
  });

  ipcMain.handle(
    "list-drive-emulators",
    async (_event, forceRefresh?: boolean) => {
      if (cachedDriveListing && !forceRefresh) {
        return cachedDriveListing;
      }
      try {
        const emulatorDefs: EmulatorDefinition[] = JSON.parse(
          readFileSync(getEmulatorsPath(), "utf-8")
        );
        const downloader = new EmulatorDownloader(getProjectRoot());
        cachedDriveListing = await downloader.listAvailable(emulatorDefs);
        return cachedDriveListing;
      } catch (err) {
        console.warn("[drive] list failed:", err);
        return {};
      }
    }
  );

  ipcMain.handle(
    "download-emulator",
    async (event, emulatorId: string) => {
      const configManager = new ConfigManager(getProjectRoot());
      const downloader = new EmulatorDownloader(getProjectRoot());
      return await downloader.download(
        emulatorId,
        configManager.getEmulatorsPath(),
        (progress) => {
          event.sender.send("emulator-download-progress", progress);
        }
      );
    }
  );

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
    const appConfig = configManager.get();
    const registry = new SystemsRegistry(getSystemsPath());
    const scanner = new RomScanner(registry);
    const scanResult = scanner.scan(configManager.getRomsPath());

    const cache = new MetadataCache(getProjectRoot());
    const systemMapPath = path.join(
      getDataPath(),
      "libretro-systems.json"
    );
    const thumbs = new LibretroThumbnails(cache, { systemMapPath });

    // Phase 1: Libretro (no credentials required).
    const libretroResult = await thumbs.fetchAllCovers(
      scanResult.systems,
      (progress) => {
        event.sender.send("cover-fetch-progress", {
          ...progress,
          phase: "libretro",
        });
      }
    );

    const sgdbKey = appConfig.steamGridDbApiKey;
    if (!sgdbKey) {
      return libretroResult;
    }

    // Phase 2: Build a filtered list of ROMs still missing covers.
    const missingBySystem: { systemId: string; roms: DiscoveredRom[] }[] = [];
    for (const system of scanResult.systems) {
      const missing = system.roms.filter(
        (r) => !cache.coverExists(r.systemId, r.fileName)
      );
      if (missing.length > 0) {
        missingBySystem.push({ systemId: system.systemId, roms: missing });
      }
    }

    if (missingBySystem.length === 0) {
      return libretroResult;
    }

    const sgdb = new SteamGridDb(cache, { apiKey: sgdbKey });
    const sgdbResult = await sgdb.fetchAllCovers(
      missingBySystem,
      (progress) => {
        event.sender.send("cover-fetch-progress", progress);
      }
    );

    // Merge both phases. Libretro already counted its ROMs; SGDB phase only
    // processed the subset that was still missing, so the "found" delta from
    // SGDB should reduce notFound from the libretro phase.
    return {
      totalProcessed: libretroResult.totalProcessed,
      totalFound: libretroResult.totalFound + sgdbResult.totalFound,
      totalNotFound: Math.max(
        0,
        libretroResult.totalNotFound -
          sgdbResult.totalFound -
          sgdbResult.totalErrors
      ),
      totalErrors: libretroResult.totalErrors + sgdbResult.totalErrors,
    };
  });

  // --- Fullscreen handlers ---

  ipcMain.handle("toggle-fullscreen", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.setFullScreen(!win.isFullScreen());
    }
  });

  ipcMain.handle("get-fullscreen", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isFullScreen() ?? false;
  });

  // --- User Library handlers ---

  ipcMain.handle("get-user-library", () => {
    const lib = new UserLibrary(getProjectRoot());
    return lib.getAll();
  });

  ipcMain.handle(
    "toggle-favorite",
    (_event: IpcMainInvokeEvent, systemId: string, fileName: string) => {
      const lib = new UserLibrary(getProjectRoot());
      return lib.toggleFavorite(systemId, fileName);
    }
  );

  ipcMain.handle("get-collections", () => {
    const lib = new UserLibrary(getProjectRoot());
    return lib.getCollections();
  });

  ipcMain.handle(
    "create-collection",
    (_event: IpcMainInvokeEvent, name: string) => {
      const lib = new UserLibrary(getProjectRoot());
      return lib.createCollection(name);
    }
  );

  ipcMain.handle(
    "rename-collection",
    (_event: IpcMainInvokeEvent, id: string, name: string) => {
      const lib = new UserLibrary(getProjectRoot());
      lib.renameCollection(id, name);
    }
  );

  ipcMain.handle(
    "delete-collection",
    (_event: IpcMainInvokeEvent, id: string) => {
      const lib = new UserLibrary(getProjectRoot());
      lib.deleteCollection(id);
    }
  );

  ipcMain.handle(
    "add-to-collection",
    (
      _event: IpcMainInvokeEvent,
      collectionId: string,
      systemId: string,
      fileName: string
    ) => {
      const lib = new UserLibrary(getProjectRoot());
      lib.addToCollection(collectionId, systemId, fileName);
    }
  );

  ipcMain.handle(
    "remove-from-collection",
    (
      _event: IpcMainInvokeEvent,
      collectionId: string,
      systemId: string,
      fileName: string
    ) => {
      const lib = new UserLibrary(getProjectRoot());
      lib.removeFromCollection(collectionId, systemId, fileName);
    }
  );

  ipcMain.handle(
    "get-recently-played",
    (_event: IpcMainInvokeEvent, limit?: number) => {
      const lib = new UserLibrary(getProjectRoot());
      return lib.getRecentlyPlayed(limit);
    }
  );

  // --- Embedded overlay handlers ---

  ipcMain.handle(
    "launch-game-embedded",
    async (_event: IpcMainInvokeEvent, rom: DiscoveredRom) => {
      console.log("[ipc] launch-game-embedded called for:", rom.fileName);
      const ov = getOrCreateOverlay();
      if (!ov) {
        return {
          success: false,
          emulatorId: "",
          romPath: rom.filePath,
          command: "",
          error: "Main window not available",
        };
      }

      const configManager = new ConfigManager(getProjectRoot());
      const mapper = new EmulatorMapper(getEmulatorsPath());
      const launcher = new GameLauncher(mapper);
      const emulatorsPath = configManager.getEmulatorsPath();
      const resolved = mapper.resolve(rom.systemId, emulatorsPath);

      if (!resolved) {
        return {
          success: false,
          emulatorId: "",
          romPath: rom.filePath,
          command: "",
          error: `No emulator found for system "${rom.systemId}"`,
        };
      }

      runPerEmulatorSetup(
        resolved.definition.id,
        rom.systemId,
        resolved.executablePath,
        configManager.getRomsPath()
      );

      const result = await ov.launchEmbedded(
        rom,
        resolved,
        launcher,
        emulatorsPath
      );

      console.log("[ipc] launch-game-embedded result:", result.success, result.error || "");

      if (result.success) {
        const lib = new UserLibrary(getProjectRoot());
        lib.recordPlay(rom.systemId, rom.fileName);
      }

      return result;
    }
  );

  ipcMain.handle("stop-embedded-game", () => {
    if (overlay) {
      overlay.stopGame();
    }
  });

  ipcMain.handle("is-game-running", () => {
    return overlay?.isActive() ?? false;
  });

  ipcMain.handle(
    "set-game-area-bounds",
    (
      _event: IpcMainInvokeEvent,
      bounds: { x: number; y: number; width: number; height: number }
    ) => {
      if (overlay) {
        overlay.setGameAreaBounds(bounds);
      }
    }
  );

  // --- Emulator Config handlers ---

  ipcMain.handle(
    "get-emulator-config",
    (_event: IpcMainInvokeEvent, emulatorId: string, executablePath?: string) => {
      const manager = new EmulatorConfigManager(getSchemasPath());
      return manager.read(emulatorId, executablePath);
    }
  );

  ipcMain.handle(
    "update-emulator-config",
    (
      _event: IpcMainInvokeEvent,
      emulatorId: string,
      changes: Record<string, string>,
      executablePath?: string
    ) => {
      const manager = new EmulatorConfigManager(getSchemasPath());
      manager.write(emulatorId, changes, executablePath);
    }
  );

  ipcMain.handle("get-emulator-schemas", () => {
    const manager = new EmulatorConfigManager(getSchemasPath());
    return manager.getAvailableSchemas();
  });

  ipcMain.handle(
    "open-config-file",
    async (_event: IpcMainInvokeEvent, emulatorId: string, executablePath?: string) => {
      const { shell } = await import("electron");
      const manager = new EmulatorConfigManager(getSchemasPath());
      const configPath = manager.getConfigPath(emulatorId, executablePath);
      if (configPath && existsSync(configPath)) {
        shell.openPath(configPath);
      }
    }
  );

  // --- Cemu keys.txt handlers ---

  ipcMain.handle("check-cemu-keys", () => {
    const configManager = new ConfigManager(getProjectRoot());
    const mapper = new EmulatorMapper(getEmulatorsPath());
    const resolved = mapper.resolve("wiiu", configManager.getEmulatorsPath());
    if (!resolved || resolved.definition.id !== "cemu") {
      return {
        emulatorFound: false,
        exists: false,
        path: null,
        entryCount: 0,
      };
    }
    const status = checkCemuKeys(resolved.executablePath);
    return { emulatorFound: true, ...status };
  });

  ipcMain.handle(
    "write-cemu-keys",
    (_event: IpcMainInvokeEvent, content: string) => {
      const configManager = new ConfigManager(getProjectRoot());
      const mapper = new EmulatorMapper(getEmulatorsPath());
      const resolved = mapper.resolve(
        "wiiu",
        configManager.getEmulatorsPath()
      );
      if (!resolved || resolved.definition.id !== "cemu") {
        throw new Error("Cemu not detected");
      }
      const keysPath = writeCemuKeys(resolved.executablePath, content);
      return { path: keysPath };
    }
  );
}
