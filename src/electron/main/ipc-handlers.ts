import { ipcMain, app, BrowserWindow, dialog, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
} from "node:fs";
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
import {
  applyCitraGamepadProfile,
  readCitraGamepadStatus,
  CITRA_GAMEPAD_PROFILES,
} from "../../core/citra-gamepad.js";
import {
  readGcPadConfig,
  writeGcPadConfig,
} from "../../core/dolphin-gcpad.js";
import { EmulatorDownloader } from "../../core/emulator-downloader.js";
import { EmulatorOverlay } from "./emulator-overlay.js";
import { AutoUpdater } from "./auto-updater.js";
import type {
  AppConfig,
  DiscoveredRom,
  DriveEmulatorMapping,
  EmulatorDefinition,
} from "../../core/types.js";
import { logSecurityEvent } from "../../core/security-logger.js";
import {
  AppConfigPartialSchema,
  DiscoveredRomSchema,
  SystemIdSchema,
  EmulatorIdSchema,
  CollectionIdSchema,
  FileNameSchema,
  BoundsSchema,
  FileFilterSchema,
  CemuKeysContentSchema,
  EmulatorConfigChangesSchema,
  GcPadUpdatesArraySchema,
  ExecutablePathSchema,
  CollectionNameSchema,
  RecentlyPlayedLimitSchema,
  ForceRefreshSchema,
  UrlSchema,
  FilePathsSchema,
  AddRomsSchema,
  OptionalEmulatorIdSchema,
  FolderPathSchema,
} from "./ipc-validators.js";

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
    return path.join(os.homedir(), "EmuraOS");
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

  // Play-time tracking for embedded sessions
  let sessionStartedAt: number | null = null;
  let sessionRom: { systemId: string; fileName: string } | null = null;

  function getOrCreateOverlay(): EmulatorOverlay | null {
    const win = getMainWindow();
    if (!win) return null;
    if (!overlay) {
      overlay = new EmulatorOverlay(win, {
        onSessionStarted: (event) => {
          sessionStartedAt = Date.now();
          sessionRom = event.rom
            ? { systemId: event.rom.systemId, fileName: event.rom.fileName }
            : null;
          win.setFullScreen(true);
          win.webContents.send("game-session-started", {
            ...event,
            sessionStartedAt,
          });
        },
        onSessionEnded: () => {
          // Persist accumulated play time
          if (sessionStartedAt && sessionRom) {
            const durationSeconds = Math.round(
              (Date.now() - sessionStartedAt) / 1000
            );
            if (durationSeconds > 0) {
              try {
                const lib = new UserLibrary(getProjectRoot());
                lib.addPlayTime(
                  sessionRom.systemId,
                  sessionRom.fileName,
                  durationSeconds
                );
              } catch (err) {
                console.warn("[play-time] failed to persist:", err);
              }
            }
          }
          sessionStartedAt = null;
          sessionRom = null;

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

  ipcMain.handle("update-config", (_event, partial: unknown) => {
    const validated = AppConfigPartialSchema.parse(partial);
    const configManager = new ConfigManager(getProjectRoot());
    configManager.update(validated);
    configManager.save();
    if (validated.romsPath || validated.emulatorsPath) {
      configManager.ensureDirectories();
    }
    return configManager.get();
  });

  ipcMain.handle("resolve-config-paths", () => {
    const cm = new ConfigManager(getProjectRoot());
    return { romsPath: cm.getRomsPath(), emulatorsPath: cm.getEmulatorsPath() };
  });

  ipcMain.handle("open-folder", async (_event, folderPath: unknown) => {
    const validated = FolderPathSchema.parse(folderPath);
    await shell.openPath(validated);
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
    const result = scanner.scan(configManager.getRomsPath());

    // Record added dates for newly discovered ROMs (single load/save)
    const lib = new UserLibrary(getProjectRoot());
    const allRoms: Array<{ systemId: string; fileName: string }> = [];
    for (const sys of result.systems) {
      for (const rom of sys.roms) {
        allRoms.push({ systemId: rom.systemId, fileName: rom.fileName });
      }
    }
    lib.recordRomAddedBatch(allRoms);

    return result;
  });

  ipcMain.handle("get-emulators-for-system", (_event, systemId: unknown) => {
    const validated = SystemIdSchema.parse(systemId);
    const configManager = new ConfigManager(getProjectRoot());
    const mapper = new EmulatorMapper(getEmulatorsPath());
    const emulatorsPath = configManager.getEmulatorsPath();
    return mapper.resolveAll(validated, emulatorsPath).map((r) => ({
      emulatorId: r.definition.id,
      emulatorName: r.definition.name,
    }));
  });

  ipcMain.handle("launch-game", (_event, rom: unknown, emulatorId?: unknown) => {
    const validated = DiscoveredRomSchema.parse(rom) as DiscoveredRom;
    const validatedEmuId = OptionalEmulatorIdSchema.parse(emulatorId);
    const configManager = new ConfigManager(getProjectRoot());
    const mapper = new EmulatorMapper(getEmulatorsPath());
    const launcher = new GameLauncher(mapper);
    const emulatorsPath = configManager.getEmulatorsPath();
    const resolved = validatedEmuId
      ? mapper.resolveById(validatedEmuId, validated.systemId, emulatorsPath)
      : mapper.resolve(validated.systemId, emulatorsPath);
    if (resolved) {
      runPerEmulatorSetup(
        resolved.definition.id,
        validated.systemId,
        resolved.executablePath,
        configManager.getRomsPath()
      );
    }
    const result = launcher.launch(validated, emulatorsPath, validatedEmuId);
    if (result.success) {
      const lib = new UserLibrary(getProjectRoot());
      lib.recordPlay(validated.systemId, validated.fileName);
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
    async (_event, forceRefresh?: unknown) => {
      const refresh = ForceRefreshSchema.parse(forceRefresh);
      if (cachedDriveListing && !refresh) {
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

  // Active download AbortControllers, keyed by emulatorId.
  const activeDownloads = new Map<string, AbortController>();

  ipcMain.handle(
    "download-emulator",
    async (event, emulatorId: unknown) => {
      const validatedId = EmulatorIdSchema.parse(emulatorId);
      const controller = new AbortController();
      activeDownloads.set(validatedId, controller);
      const configManager = new ConfigManager(getProjectRoot());
      const downloader = new EmulatorDownloader(getProjectRoot());
      try {
        return await downloader.download(
          validatedId,
          configManager.getEmulatorsPath(),
          (progress) => {
            event.sender.send("emulator-download-progress", progress);
          },
          controller.signal
        );
      } finally {
        activeDownloads.delete(validatedId);
      }
    }
  );

  ipcMain.handle("cancel-emulator-download", (_event, emulatorId: unknown) => {
    const validatedId = EmulatorIdSchema.parse(emulatorId);
    const controller = activeDownloads.get(validatedId);
    if (controller) {
      controller.abort();
    }
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
    (_event: IpcMainInvokeEvent, systemId: unknown, romFileName: unknown) => {
      const validatedSystem = SystemIdSchema.parse(systemId);
      const validatedFile = FileNameSchema.parse(romFileName);
      const cache = new MetadataCache(getProjectRoot());
      return cache.getMetadata(validatedSystem, validatedFile);
    }
  );

  ipcMain.handle(
    "scrape-all-metadata",
    async (event: IpcMainInvokeEvent) => {
      const configManager = new ConfigManager(getProjectRoot());
      const appConfig = configManager.get();

      // Env vars take priority over config file
      const devId =
        process.env.SCREENSCRAPER_DEV_ID || appConfig.screenScraperDevId;
      const devPassword =
        process.env.SCREENSCRAPER_DEV_PASSWORD ||
        appConfig.screenScraperDevPassword;
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
    (_event: IpcMainInvokeEvent, systemId: unknown, romFileName: unknown) => {
      const validatedSystem = SystemIdSchema.parse(systemId);
      const validatedFile = FileNameSchema.parse(romFileName);
      const cache = new MetadataCache(getProjectRoot());
      if (cache.coverExists(validatedSystem, validatedFile)) {
        return cache.getCoverPath(validatedSystem, validatedFile);
      }
      return null;
    }
  );

  ipcMain.handle(
    "read-cover-data-url",
    (_event: IpcMainInvokeEvent, coverPath: string) => {
      if (!coverPath || typeof coverPath !== "string") return null;

      // Validate path is within allowed directories to prevent path traversal
      const projectRoot = getProjectRoot();
      const allowedRoots = [
        path.join(projectRoot, "metadata"),
        path.join(projectRoot, "covers"),
        path.join(projectRoot, "config", "metadata"),
      ];
      const resolved = path.resolve(coverPath);
      const isAllowed = allowedRoots.some(
        (root) => resolved.startsWith(root + path.sep) || resolved === root
      );
      if (!isAllowed) {
        logSecurityEvent({
          type: "PATH_TRAVERSAL_BLOCKED",
          channel: "read-cover-data-url",
          detail: `Blocked path: ${coverPath}`,
          severity: "warn",
        });
        return null;
      }

      if (!existsSync(resolved)) return null;
      try {
        const data = readFileSync(resolved);
        const ext = path.extname(resolved).toLowerCase();
        const mimeMap: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
        const mime = mimeMap[ext] ?? "image/png";
        return `data:${mime};base64,${data.toString("base64")}`;
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle(
    "set-custom-cover",
    (
      _event: IpcMainInvokeEvent,
      systemId: unknown,
      romFileName: unknown,
      sourcePath: unknown
    ) => {
      const validatedSystem = SystemIdSchema.parse(systemId);
      const validatedFile = FileNameSchema.parse(romFileName);
      const validatedSource = FolderPathSchema.parse(sourcePath);

      // Validate file extension
      const ext = path.extname(validatedSource).toLowerCase();
      const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
      if (!allowedExts.includes(ext)) {
        return { success: false, error: "Unsupported image format. Use jpg, png, or webp." };
      }

      // Validate source file exists
      if (!existsSync(validatedSource)) {
        return { success: false, error: "Source image file not found." };
      }

      const cache = new MetadataCache(getProjectRoot());
      const destPath = cache.getCoverPath(validatedSystem, validatedFile);

      // Security check: destination must be inside config/metadata/
      const projectRoot = getProjectRoot();
      const metadataRoot = path.resolve(projectRoot, "config", "metadata");
      const resolvedDest = path.resolve(destPath);
      if (!resolvedDest.startsWith(metadataRoot + path.sep)) {
        logSecurityEvent({
          type: "PATH_TRAVERSAL_BLOCKED",
          channel: "set-custom-cover",
          detail: `Blocked dest: ${destPath}`,
          severity: "warn",
        });
        return { success: false, error: "Invalid destination path." };
      }

      try {
        // Ensure the cover directory exists
        cache.ensureDirectories(validatedSystem);

        // Copy the image to the covers directory
        copyFileSync(validatedSource, resolvedDest);

        // Update metadata cache
        const existing = cache.getMetadata(validatedSystem, validatedFile);
        if (existing) {
          existing.coverPath = resolvedDest;
          existing.coverSource = "custom";
          cache.setMetadata(validatedSystem, validatedFile, existing);
        } else {
          // Create minimal metadata entry
          cache.setMetadata(validatedSystem, validatedFile, {
            title: "",
            description: "",
            year: "",
            genre: "",
            publisher: "",
            developer: "",
            players: "",
            rating: "",
            coverPath: resolvedDest,
            coverSource: "custom",
            screenshotPath: "",
            screenScraperId: "",
            lastScraped: "",
          });
        }

        return { success: true, coverPath: resolvedDest };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }
  );

  ipcMain.handle(
    "reset-custom-cover",
    (
      _event: IpcMainInvokeEvent,
      systemId: unknown,
      romFileName: unknown
    ) => {
      const validatedSystem = SystemIdSchema.parse(systemId);
      const validatedFile = FileNameSchema.parse(romFileName);

      const cache = new MetadataCache(getProjectRoot());
      const coverPath = cache.getCoverPath(validatedSystem, validatedFile);
      const resolvedCover = path.resolve(coverPath);

      // Security check
      const projectRoot = getProjectRoot();
      const metadataRoot = path.resolve(projectRoot, "config", "metadata");
      if (!resolvedCover.startsWith(metadataRoot + path.sep)) {
        logSecurityEvent({
          type: "PATH_TRAVERSAL_BLOCKED",
          channel: "reset-custom-cover",
          detail: `Blocked path: ${coverPath}`,
          severity: "warn",
        });
        return { success: false, error: "Invalid path." };
      }

      try {
        // Delete the cover file if it exists
        if (existsSync(resolvedCover)) {
          rmSync(resolvedCover, { force: true });
        }

        // Clear coverPath and coverSource from metadata
        const existing = cache.getMetadata(validatedSystem, validatedFile);
        if (existing) {
          existing.coverPath = "";
          existing.coverSource = undefined;
          cache.setMetadata(validatedSystem, validatedFile, existing);
        }

        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }
  );

  ipcMain.handle(
    "read-background-data-url",
    (_event: IpcMainInvokeEvent, imagePath: string) => {
      if (!imagePath || typeof imagePath !== "string") return null;
      const resolved = path.resolve(imagePath);
      const ext = path.extname(resolved).toLowerCase();
      const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
      if (!allowedExts.includes(ext)) return null;
      if (!existsSync(resolved)) return null;
      try {
        const data = readFileSync(resolved);
        const mimeMap: Record<string, string> = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".webp": "image/webp",
        };
        const mime = mimeMap[ext] ?? "image/png";
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

    // Env var takes priority over config file
    const sgdbKey =
      process.env.STEAMGRIDDB_API_KEY || appConfig.steamGridDbApiKey;
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
    (_event: IpcMainInvokeEvent, systemId: unknown, fileName: unknown) => {
      const validatedSystem = SystemIdSchema.parse(systemId);
      const validatedFile = FileNameSchema.parse(fileName);
      const lib = new UserLibrary(getProjectRoot());
      return lib.toggleFavorite(validatedSystem, validatedFile);
    }
  );

  ipcMain.handle("get-collections", () => {
    const lib = new UserLibrary(getProjectRoot());
    return lib.getCollections();
  });

  ipcMain.handle(
    "create-collection",
    (_event: IpcMainInvokeEvent, name: unknown) => {
      const validatedName = CollectionNameSchema.parse(name);
      const lib = new UserLibrary(getProjectRoot());
      return lib.createCollection(validatedName);
    }
  );

  ipcMain.handle(
    "rename-collection",
    (_event: IpcMainInvokeEvent, id: unknown, name: unknown) => {
      const validatedId = CollectionIdSchema.parse(id);
      const validatedName = CollectionNameSchema.parse(name);
      const lib = new UserLibrary(getProjectRoot());
      lib.renameCollection(validatedId, validatedName);
    }
  );

  ipcMain.handle(
    "delete-collection",
    (_event: IpcMainInvokeEvent, id: unknown) => {
      const validatedId = CollectionIdSchema.parse(id);
      const lib = new UserLibrary(getProjectRoot());
      lib.deleteCollection(validatedId);
    }
  );

  ipcMain.handle(
    "add-to-collection",
    (
      _event: IpcMainInvokeEvent,
      collectionId: unknown,
      systemId: unknown,
      fileName: unknown
    ) => {
      const validatedColl = CollectionIdSchema.parse(collectionId);
      const validatedSystem = SystemIdSchema.parse(systemId);
      const validatedFile = FileNameSchema.parse(fileName);
      const lib = new UserLibrary(getProjectRoot());
      lib.addToCollection(validatedColl, validatedSystem, validatedFile);
    }
  );

  ipcMain.handle(
    "remove-from-collection",
    (
      _event: IpcMainInvokeEvent,
      collectionId: unknown,
      systemId: unknown,
      fileName: unknown
    ) => {
      const validatedColl = CollectionIdSchema.parse(collectionId);
      const validatedSystem = SystemIdSchema.parse(systemId);
      const validatedFile = FileNameSchema.parse(fileName);
      const lib = new UserLibrary(getProjectRoot());
      lib.removeFromCollection(validatedColl, validatedSystem, validatedFile);
    }
  );

  ipcMain.handle(
    "get-recently-played",
    (_event: IpcMainInvokeEvent, limit?: unknown) => {
      const validatedLimit = RecentlyPlayedLimitSchema.parse(limit);
      const lib = new UserLibrary(getProjectRoot());
      return lib.getRecentlyPlayed(validatedLimit);
    }
  );

  ipcMain.handle("get-rom-added-dates", () => {
    const lib = new UserLibrary(getProjectRoot());
    return lib.getRomAddedDates();
  });

  ipcMain.handle(
    "record-play-time",
    (_event: IpcMainInvokeEvent, systemId: unknown, fileName: unknown, seconds: unknown) => {
      const validatedSystem = SystemIdSchema.parse(systemId);
      const validatedFile = FileNameSchema.parse(fileName);
      const validatedSeconds = typeof seconds === "number" && seconds > 0 ? Math.round(seconds) : 0;
      if (validatedSeconds > 0) {
        const lib = new UserLibrary(getProjectRoot());
        lib.addPlayTime(validatedSystem, validatedFile, validatedSeconds);
      }
    }
  );

  // --- Embedded overlay handlers ---

  ipcMain.handle(
    "launch-game-embedded",
    async (_event: IpcMainInvokeEvent, rom: unknown, emulatorId?: unknown) => {
      const validated = DiscoveredRomSchema.parse(rom) as DiscoveredRom;
      const validatedEmuId = OptionalEmulatorIdSchema.parse(emulatorId);
      console.log("[ipc] launch-game-embedded called for:", validated.fileName);
      const ov = getOrCreateOverlay();
      if (!ov) {
        return {
          success: false,
          emulatorId: "",
          romPath: validated.filePath,
          command: "",
          error: "Main window not available",
        };
      }

      const configManager = new ConfigManager(getProjectRoot());
      const mapper = new EmulatorMapper(getEmulatorsPath());
      const launcher = new GameLauncher(mapper);
      const emulatorsPath = configManager.getEmulatorsPath();
      const resolved = validatedEmuId
        ? mapper.resolveById(validatedEmuId, validated.systemId, emulatorsPath)
        : mapper.resolve(validated.systemId, emulatorsPath);

      if (!resolved) {
        return {
          success: false,
          emulatorId: "",
          romPath: validated.filePath,
          command: "",
          error: `No emulator found for system "${validated.systemId}"`,
        };
      }

      runPerEmulatorSetup(
        resolved.definition.id,
        validated.systemId,
        resolved.executablePath,
        configManager.getRomsPath()
      );

      // Citra first-launch gamepad auto-config. Patches qt-config.ini
      // with a known-good PS DualShock profile so the controller works
      // out of the box without the user walking Emulation → Configure
      // → Controls → Auto-Assign inside Citra. Runs at most once: the
      // `citraGamepadAutoConfigured` flag flips after the first attempt
      // so subsequent launches no-op. If the user has already customized
      // their bindings via Citra's own UI we respect that and mark the
      // flag without overwriting anything.
      //
      // Edge case: if qt-config.ini does not exist yet (Citra was never
      // launched even once), we defer without flipping the flag. That
      // means the user may still need one manual Auto-Assign on their
      // very first 3DS launch ever; the next launch will catch up.
      if (
        resolved.definition.id === "citra" &&
        validated.systemId === "3ds" &&
        !configManager.get().citraGamepadAutoConfigured
      ) {
        try {
          const citraConfigPath = path.join(
            app.getPath("appData"),
            "Citra",
            "config",
            "qt-config.ini"
          );
          const status = readCitraGamepadStatus(citraConfigPath);
          if (status.configExists) {
            if (status.hasCustomGamepad) {
              console.log(
                "[citra-gamepad] user already has custom bindings (guid:",
                status.currentGuid,
                ") — marking configured without overwriting"
              );
            } else {
              const applyResult = applyCitraGamepadProfile(
                citraConfigPath,
                CITRA_GAMEPAD_PROFILES["ps-dualshock"]
              );
              if (applyResult.success) {
                console.log(
                  "[citra-gamepad] applied ps-dualshock profile — replaced:",
                  applyResult.linesReplaced,
                  "inserted:",
                  applyResult.linesInserted
                );
              } else {
                console.warn(
                  "[citra-gamepad] failed to apply profile:",
                  applyResult.error
                );
              }
            }
            // Flip the flag regardless of apply success: either we wrote
            // the profile, or we detected existing bindings we don't
            // want to pave over. Either way, don't re-check next launch.
            configManager.update({ citraGamepadAutoConfigured: true });
            configManager.save();
          } else {
            console.log(
              "[citra-gamepad] qt-config.ini not yet created; deferring"
            );
          }
        } catch (err) {
          console.warn("[citra-gamepad] auto-config failed:", err);
        }
      }

      const result = await ov.launchEmbedded(
        validated,
        resolved,
        launcher,
        emulatorsPath
      );

      console.log("[ipc] launch-game-embedded result:", result.success, result.error || "");

      if (result.success) {
        const lib = new UserLibrary(getProjectRoot());
        lib.recordPlay(validated.systemId, validated.fileName);
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
    (_event: IpcMainInvokeEvent, bounds: unknown) => {
      const validatedBounds = BoundsSchema.parse(bounds);
      if (overlay) {
        overlay.setGameAreaBounds(validatedBounds);
      }
    }
  );

  // --- Emulator Config handlers ---

  ipcMain.handle(
    "get-emulator-config",
    (_event: IpcMainInvokeEvent, emulatorId: unknown, executablePath?: string) => {
      const validatedId = EmulatorIdSchema.parse(emulatorId);
      const manager = new EmulatorConfigManager(getSchemasPath());
      return manager.read(validatedId, executablePath);
    }
  );

  ipcMain.handle(
    "update-emulator-config",
    (
      _event: IpcMainInvokeEvent,
      emulatorId: unknown,
      changes: unknown,
      executablePath?: string
    ) => {
      const validatedId = EmulatorIdSchema.parse(emulatorId);
      const validatedChanges = EmulatorConfigChangesSchema.parse(changes);
      const manager = new EmulatorConfigManager(getSchemasPath());
      manager.write(validatedId, validatedChanges, executablePath);
    }
  );

  ipcMain.handle("get-emulator-schemas", () => {
    const manager = new EmulatorConfigManager(getSchemasPath());
    return manager.getAvailableSchemas();
  });

  ipcMain.handle(
    "open-config-file",
    async (_event: IpcMainInvokeEvent, emulatorId: unknown, executablePath?: string) => {
      const validatedId = EmulatorIdSchema.parse(emulatorId);
      const { shell } = await import("electron");
      const manager = new EmulatorConfigManager(getSchemasPath());
      const configPath = manager.getConfigPath(validatedId, executablePath);
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
    (_event: IpcMainInvokeEvent, content: unknown) => {
      const validatedContent = CemuKeysContentSchema.parse(content);
      const configManager = new ConfigManager(getProjectRoot());
      const mapper = new EmulatorMapper(getEmulatorsPath());
      const resolved = mapper.resolve(
        "wiiu",
        configManager.getEmulatorsPath()
      );
      if (!resolved || resolved.definition.id !== "cemu") {
        throw new Error("Cemu not detected");
      }
      const keysPath = writeCemuKeys(resolved.executablePath, validatedContent);
      return { path: keysPath };
    }
  );

  // --- Dolphin GameCube controller config (GCPadNew.ini) ---

  ipcMain.handle("get-dolphin-gcpad-config", () => {
    return readGcPadConfig(app.getPath("appData"));
  });

  ipcMain.handle(
    "update-dolphin-gcpad-config",
    (_event: IpcMainInvokeEvent, updates: unknown) => {
      const validated = GcPadUpdatesArraySchema.parse(updates);
      return writeGcPadConfig(app.getPath("appData"), validated);
    }
  );

  ipcMain.handle(
    "launch-emulator-gui",
    (_event: IpcMainInvokeEvent, executablePath: unknown) => {
      const validated = ExecutablePathSchema.parse(executablePath);
      if (!existsSync(validated)) {
        throw new Error(`Executable not found: ${validated}`);
      }
      const child = spawn(validated, [], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return { pid: child.pid ?? null };
    }
  );

  // ── Phase 13: File system pickers ────────────────────────────────
  // Generic folder/file picker dialogs used by the new Settings widgets
  // (FolderRow, PathRow). The renderer invokes these instead of rolling
  // its own HTML file inputs so the UX stays consistent and gamepad-
  // friendly.
  ipcMain.handle("dialog:pick-folder", async () => {
    const win = getMainWindow();
    const result = await (win
      ? dialog.showOpenDialog(win, { properties: ["openDirectory"] })
      : dialog.showOpenDialog({ properties: ["openDirectory"] }));
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    "dialog:pick-file",
    async (
      _event: IpcMainInvokeEvent,
      filters?: unknown
    ) => {
      const validatedFilters = filters != null
        ? FileFilterSchema.array().parse(filters)
        : [];
      const win = getMainWindow();
      const options: Electron.OpenDialogOptions = {
        properties: ["openFile"],
        filters: validatedFilters,
      };
      const result = await (win
        ? dialog.showOpenDialog(win, options)
        : dialog.showOpenDialog(options));
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    }
  );

  // ── Add ROMs handlers ───────────────────────────────────────────────

  ipcMain.handle("dialog:pick-roms", async (_event: IpcMainInvokeEvent, systemId?: string) => {
    const registry = new SystemsRegistry(getSystemsPath());
    const allSystems = registry.getAll();
    const extSet = new Set<string>();
    for (const sys of allSystems) {
      for (const ext of sys.extensions) {
        // extensions in systems.json have leading dot, strip it for the dialog filter
        extSet.add(ext.replace(/^\./, ""));
      }
    }

    // Resolve defaultPath to the selected system's ROM folder (or the general roms folder)
    const configManager = new ConfigManager(getProjectRoot());
    const romsPath = configManager.getRomsPath();
    let defaultPath = romsPath;
    if (systemId) {
      const system = registry.getById(systemId);
      if (system) {
        const systemFolder = path.join(romsPath, system.romFolder);
        if (existsSync(systemFolder)) {
          defaultPath = systemFolder;
        }
      }
    }

    const win = getMainWindow();
    const options: Electron.OpenDialogOptions = {
      defaultPath,
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "ROM files", extensions: [...extSet] }],
    };
    const result = await (win
      ? dialog.showOpenDialog(win, options)
      : dialog.showOpenDialog(options));
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths;
  });

  ipcMain.handle(
    "resolve-rom-systems",
    (_event: IpcMainInvokeEvent, filePaths: unknown) => {
      const validated = FilePathsSchema.parse(filePaths);
      const registry = new SystemsRegistry(getSystemsPath());
      return validated.map((fp) => {
        const ext = path.extname(fp).toLowerCase();
        const systems = registry.getByExtension(ext);
        return {
          filePath: fp,
          fileName: path.basename(fp),
          systems: systems.map((s) => ({ id: s.id, name: s.name })),
        };
      });
    }
  );

  ipcMain.handle(
    "add-roms",
    (_event: IpcMainInvokeEvent, entries: unknown) => {
      const validated = AddRomsSchema.parse(entries);
      const configManager = new ConfigManager(getProjectRoot());
      const registry = new SystemsRegistry(getSystemsPath());
      const romsPath = configManager.getRomsPath();
      const projectRoot = getProjectRoot();

      return validated.map((entry) => {
        const { filePath, systemId } = entry;
        const fileName = path.basename(filePath);
        try {
          const system = registry.getById(systemId);
          if (!system) {
            return { filePath, fileName, systemId, success: false, error: `Unknown system: ${systemId}` };
          }
          if (!existsSync(filePath)) {
            return { filePath, fileName, systemId, success: false, error: "Source file not found" };
          }

          const destDir = path.join(romsPath, system.romFolder);
          const destFile = path.join(destDir, fileName);

          // Path traversal check
          const resolvedDest = path.resolve(destFile);
          if (!resolvedDest.startsWith(path.resolve(romsPath) + path.sep)) {
            logSecurityEvent({
              type: "PATH_TRAVERSAL_BLOCKED",
              channel: "add-roms",
              detail: `Blocked dest: ${destFile}`,
              severity: "warn",
            });
            return { filePath, fileName, systemId, success: false, error: "Invalid destination path" };
          }

          mkdirSync(destDir, { recursive: true });
          copyFileSync(filePath, resolvedDest);
          return { filePath, fileName, systemId, success: true };
        } catch (err) {
          return { filePath, fileName, systemId, success: false, error: String(err) };
        }
      });
    }
  );

  // ── Phase 13 PR2: Library / diagnostics / reset handlers ──────────
  // These power the Biblioteca and Avanzado Settings sections. Every
  // destructive handler is wrapped in a try/catch so the renderer can
  // surface errors without the whole IPC invocation crashing.

  /**
   * Walks a directory recursively and removes every file matching the
   * metadata cache shape (JSON files under `metadata/<systemId>/*.json`
   * and covers under `metadata/covers/<systemId>/*`).
   */
  ipcMain.handle("clear-metadata-cache", () => {
    try {
      const root = getProjectRoot();
      const metaDir = path.join(root, "metadata");
      if (existsSync(metaDir)) {
        rmSync(metaDir, { recursive: true, force: true });
      }
      const coverDir = path.join(root, "covers");
      if (existsSync(coverDir)) {
        rmSync(coverDir, { recursive: true, force: true });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("reset-play-history", () => {
    try {
      const lib = new UserLibrary(getProjectRoot());
      lib.resetPlayHistory();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  /**
   * Dumps the user library JSON to a user-chosen file. Pops a save
   * dialog so the target location stays under user control.
   */
  ipcMain.handle("export-user-library", async () => {
    const win = getMainWindow();
    const saveOptions: Electron.SaveDialogOptions = {
      defaultPath: "emuraos-library.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    };
    const result = await (win
      ? dialog.showSaveDialog(win, saveOptions)
      : dialog.showSaveDialog(saveOptions));
    if (result.canceled || !result.filePath) return null;
    try {
      const lib = new UserLibrary(getProjectRoot());
      const data = lib.getAll();
      writeFileSync(result.filePath, JSON.stringify(data, null, 2), "utf-8");
      return { success: true, path: result.filePath };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("open-logs-folder", async () => {
    try {
      const logsDir = app.getPath("logs");
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }
      await shell.openPath(logsDir);
      return { success: true, path: logsDir };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  /**
   * Bundles config + user library + a directory listing of metadata into
   * a single JSON "diagnostic" payload written to the user's chosen
   * location. Intentionally lightweight — no actual ZIP dependency.
   */
  ipcMain.handle("export-diagnostic-bundle", async () => {
    const win = getMainWindow();
    const saveOptions: Electron.SaveDialogOptions = {
      defaultPath: `emuraos-diagnostic-${Date.now()}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    };
    const result = await (win
      ? dialog.showSaveDialog(win, saveOptions)
      : dialog.showSaveDialog(saveOptions));
    if (result.canceled || !result.filePath) return null;
    try {
      const configManager = new ConfigManager(getProjectRoot());
      const lib = new UserLibrary(getProjectRoot());
      const metaDir = path.join(getProjectRoot(), "metadata");
      let metadataListing: string[] = [];
      if (existsSync(metaDir)) {
        try {
          metadataListing = readdirSync(metaDir).map((name) => {
            const full = path.join(metaDir, name);
            try {
              const s = statSync(full);
              return s.isDirectory() ? `${name}/` : name;
            } catch {
              return name;
            }
          });
        } catch {
          /* ignore */
        }
      }
      const bundle = {
        generatedAt: new Date().toISOString(),
        appVersion: app.getVersion(),
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        config: configManager.get(),
        library: lib.getAll(),
        metadataListing,
      };
      writeFileSync(
        result.filePath,
        JSON.stringify(bundle, null, 2),
        "utf-8"
      );
      return { success: true, path: result.filePath };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("reset-config", () => {
    try {
      const configManager = new ConfigManager(getProjectRoot());
      const configPath = configManager.getConfigFilePath();
      if (existsSync(configPath)) {
        rmSync(configPath, { force: true });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle("get-app-version", () => {
    return {
      app: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
    };
  });

  ipcMain.handle("open-app-config-file", async () => {
    try {
      const configManager = new ConfigManager(getProjectRoot());
      const configPath = configManager.getConfigFilePath();
      if (!existsSync(configPath)) {
        // Ensure the file exists so shell.openPath can open it.
        configManager.save();
      }
      await shell.openPath(configPath);
      return { success: true, path: configPath };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(
    "open-external",
    async (_event: IpcMainInvokeEvent, url: string) => {
      try {
        if (!url || typeof url !== "string") {
          return { success: false, error: "Invalid URL" };
        }

        // Only allow http: and https: schemes — block file://, javascript:, data:, etc.
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          return { success: false, error: "Malformed URL" };
        }

        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          logSecurityEvent({
            type: "URL_SCHEME_BLOCKED",
            channel: "open-external",
            detail: `Blocked scheme "${parsed.protocol}" for URL: ${url}`,
            severity: "warn",
          });
          return { success: false, error: "Only HTTP(S) URLs are allowed" };
        }

        await shell.openExternal(url);
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }
  );

  // ── Auto-Update handlers ──────────────────────────────────────────
  const autoUpdater = new AutoUpdater();

  ipcMain.handle("check-for-updates", async () => {
    try {
      return await autoUpdater.checkForUpdates();
    } catch (err) {
      console.warn("[auto-update] check failed:", err);
      return { available: false, currentVersion: app.getVersion() };
    }
  });

  ipcMain.handle(
    "download-update",
    async (event, url: unknown) => {
      const validatedUrl = UrlSchema.parse(url);
      return await autoUpdater.downloadUpdate(validatedUrl, (progress) => {
        event.sender.send("update-download-progress", progress);
      });
    }
  );

  ipcMain.handle("install-update", () => {
    autoUpdater.installUpdate();
  });

  ipcMain.handle("cancel-update-download", () => {
    autoUpdater.cancelDownload();
  });
}
