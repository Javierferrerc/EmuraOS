import { ipcMain, app, BrowserWindow, dialog, shell, desktopCapturer, screen, globalShortcut } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { z } from "zod";
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
} from "node:fs";
import type { Dirent } from "node:fs";
import { pipeline } from "node:stream/promises";
import { ConfigManager } from "../../core/config-manager.js";
import { SystemsRegistry } from "../../core/systems-registry.js";
import { RomScanner } from "../../core/rom-scanner.js";
import { EmulatorMapper } from "../../core/emulator-mapper.js";
import { GameLauncher } from "../../core/game-launcher.js";
import { EmulatorDetector } from "../../core/emulator-detector.js";
import { EmulatorReadiness } from "../../core/emulator-readiness.js";
import { MetadataCache } from "../../core/metadata-cache.js";
import { MetadataScraper } from "../../core/metadata-scraper.js";
import { runMetadataCascade, previewMetadata } from "../../core/metadata-cascade.js";
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
import {
  detectGameId,
  readDolphinGameConfig,
  resolveDolphinUserDir,
  writeDolphinGameConfig,
} from "../../core/dolphin-game-config.js";
import {
  coreDisplayName,
  resolveRetroArchConfigDir,
  writeRetroArchGameConfig,
} from "../../core/retroarch-game-config.js";
import {
  runPostLaunchScript,
  runPreLaunchScript,
  type LaunchScriptEnv,
} from "../../core/launch-scripts.js";
import { RetroAchievementsClient } from "../../core/retroachievements-client.js";
import { hashRomFile } from "../../core/rom-hasher.js";
import {
  isRaInjectable,
  injectRetroArch,
  injectDolphin,
  injectDuckStation,
  resolveRetroArchCfgPath,
  resolveDolphinIniPath,
  resolveDuckStationIniPath,
  type RaCredentials,
} from "../../core/retroachievements-config.js";
import {
  backfillThumbnails,
  ensureThumbnail,
} from "../../core/thumbnail-cache.js";
import { EmulatorDownloader } from "../../core/emulator-downloader.js";
import { EmulatorOverlay } from "./emulator-overlay.js";
import { AutoUpdater } from "./auto-updater.js";
import type {
  AppConfig,
  DiscoveredRom,
  DriveEmulatorMapping,
  EmulatorDefinition,
  SgdbCandidate,
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
  SmartCollectionFilterSchema,
  CollectionNameSchema,
  RomCollectionKeySchema,
  RecentlyPlayedLimitSchema,
  ForceRefreshSchema,
  UrlSchema,
  FilePathsSchema,
  AddRomsSchema,
  OptionalEmulatorIdSchema,
  FolderPathSchema,
  NullableEmulatorIdSchema,
  DolphinGameConfigPatchSchema,
  RetroArchGameConfigPatchSchema,
  RaLoginSchema,
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
  // Phase 22 — remember the active emulator id and rom title so the
  // post-launch script hook (fired from onSessionEnded) has the same env
  // bundle the pre-launch hook received. We also stash the file path so
  // a detached emulator that never emits a session-end can be ignored
  // cleanly without holding stale state.
  let sessionLaunchContext: {
    emulatorId: string;
    title: string;
    romPath: string;
  } | null = null;

  /**
   * Phase 22 — common pre-spawn work shared by `launch-game` and
   * `launch-game-embedded`:
   *   1. Look up any per-game emulator override stored in user-library.json
   *      and let it win over both the system default and any explicit
   *      `emulatorId` the caller passed (UI clicks already encode the
   *      override; CLI / shortcuts also benefit).
   *   2. If the resolved emulator is Dolphin and the game has a detectable
   *      6-char GameID, write the curated per-game `<GameID>.ini` so the
   *      Widescreen Hack / overclock / etc. toggles take effect on launch
   *      without touching Dolphin's global config.
   *   3. Run the pre-launch wrapper script (if configured) and await it
   *      with a 5s timeout so a hanging hook can't trap the user.
   *
   * Returns the effective `emulatorId` so the caller hands it to the
   * launcher and stashes it in `sessionLaunchContext` for the symmetric
   * post-launch hook.
   */
  async function resolveLaunchOverrides(
    rom: DiscoveredRom,
    callerEmulatorId: string | undefined,
    mapper: EmulatorMapper,
    emulatorsPath: string
  ): Promise<string | undefined> {
    const lib = new UserLibrary(getProjectRoot());
    const override = lib.getGameOverride(rom.systemId, rom.fileName);
    const effective = override?.emulatorId ?? callerEmulatorId;

    if (override?.dolphin) {
      const resolved = effective
        ? mapper.resolveById(effective, rom.systemId, emulatorsPath)
        : mapper.resolve(rom.systemId, emulatorsPath);
      if (resolved && resolved.definition.id === "dolphin") {
        try {
          const userDir = resolveDolphinUserDir(
            resolved.executablePath,
            app.getPath("appData"),
            app.getPath("documents")
          );
          const gameId = detectGameId(rom.filePath);
          if (userDir && gameId) {
            writeDolphinGameConfig(userDir, gameId, override.dolphin);
          } else if (userDir && !gameId) {
            console.warn(
              "[dolphin-config] could not detect GameID for",
              rom.fileName,
              "— skipping per-game config write"
            );
          }
        } catch (err) {
          console.warn(
            "[dolphin-config] failed to apply per-game override:",
            err
          );
        }
      }
    }

    if (override?.retroarch) {
      const resolved = effective
        ? mapper.resolveById(effective, rom.systemId, emulatorsPath)
        : mapper.resolve(rom.systemId, emulatorsPath);
      if (resolved && resolved.definition.id === "retroarch") {
        try {
          const coreArg =
            resolved.definition.args[rom.systemId] ??
            resolved.definition.defaultArgs;
          const core = coreArg ? coreDisplayName(coreArg) : null;
          const configDir = resolveRetroArchConfigDir(
            resolved.executablePath,
            app.getPath("appData")
          );
          if (configDir && core) {
            writeRetroArchGameConfig(
              configDir,
              core,
              rom.filePath,
              override.retroarch
            );
          } else if (!core) {
            console.warn(
              "[retroarch-config] no known core display name for",
              rom.systemId,
              "— skipping per-game override write"
            );
          }
        } catch (err) {
          console.warn(
            "[retroarch-config] failed to apply per-game override:",
            err
          );
        }
      }
    }

    const cm = new ConfigManager(getProjectRoot());
    const cfg = cm.get();

    // Phase 23 — inject RetroAchievements credentials into the resolved
    // emulator's config so achievements work on launch. Only for emulators
    // whose token lives in the config file (RetroArch/Dolphin/DuckStation);
    // PCSX2/PPSSPP keep their token in OS secret storage and must be logged
    // in manually. Best-effort: a failure never blocks the launch.
    if (
      cfg.retroAchievementsEnabled &&
      cfg.retroAchievementsUsername &&
      cfg.retroAchievementsToken
    ) {
      const resolved = effective
        ? mapper.resolveById(effective, rom.systemId, emulatorsPath)
        : mapper.resolve(rom.systemId, emulatorsPath);
      const emuId = resolved?.definition.id;
      if (resolved && emuId && isRaInjectable(emuId)) {
        const creds: RaCredentials = {
          username: cfg.retroAchievementsUsername,
          token: cfg.retroAchievementsToken,
          enabled: true,
          hardcore: cfg.retroAchievementsHardcore ?? false,
        };
        try {
          if (emuId === "retroarch") {
            const p = resolveRetroArchCfgPath(
              resolved.executablePath,
              app.getPath("appData")
            );
            if (p) injectRetroArch(p, creds);
          } else if (emuId === "dolphin") {
            const userDir = resolveDolphinUserDir(
              resolved.executablePath,
              app.getPath("appData"),
              app.getPath("documents")
            );
            if (userDir) injectDolphin(resolveDolphinIniPath(userDir), creds);
          } else if (emuId === "duckstation") {
            const p = resolveDuckStationIniPath(
              resolved.executablePath,
              app.getPath("documents")
            );
            if (p) injectDuckStation(p, creds);
          }
        } catch (err) {
          console.warn("[retroachievements] credential injection failed:", err);
        }
      }
    }

    const preScript = cfg.preLaunchScript;
    if (preScript) {
      const env: LaunchScriptEnv = {
        systemId: rom.systemId,
        romPath: rom.filePath,
        title: rom.fileName,
        emulatorId: effective ?? "",
      };
      try {
        await runPreLaunchScript(preScript, env);
      } catch (err) {
        console.warn("[launch-scripts] pre-launch hook failed:", err);
      }
    }

    return effective;
  }

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
        onSessionEnded: (exitCode) => {
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

          // Phase 22 — fire post-launch wrapper script. Fire-and-forget; its
          // exit status never blocks the UI returning to the library.
          // `exitCode` is the emulator's real exit code (null when we tore
          // the session down ourselves) and reaches the script as
          // EMURA_EXIT_CODE.
          if (sessionRom && sessionLaunchContext) {
            try {
              const cm = new ConfigManager(getProjectRoot());
              const scriptPath = cm.get().postLaunchScript;
              if (scriptPath) {
                runPostLaunchScript(scriptPath, {
                  systemId: sessionRom.systemId,
                  romPath: sessionLaunchContext.romPath,
                  title: sessionLaunchContext.title,
                  emulatorId: sessionLaunchContext.emulatorId,
                  exitCode,
                });
              }
            } catch (err) {
              console.warn("[launch-scripts] post-launch hook failed:", err);
            }
          }

          sessionStartedAt = null;
          sessionRom = null;
          sessionLaunchContext = null;

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

  // Phase 20 — reveal a rom file in the system file browser. shell.showItemInFolder
  // opens Explorer/Finder with the file pre-selected so the user can verify the
  // on-disk location without having to navigate manually.
  ipcMain.handle("show-in-explorer", (_event, filePath: unknown) => {
    const validated = FolderPathSchema.parse(filePath);
    shell.showItemInFolder(validated);
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

  ipcMain.handle(
    "launch-game",
    async (_event, rom: unknown, emulatorId?: unknown) => {
      const validated = DiscoveredRomSchema.parse(rom) as DiscoveredRom;
      const validatedEmuId = OptionalEmulatorIdSchema.parse(emulatorId);
      const configManager = new ConfigManager(getProjectRoot());
      const mapper = new EmulatorMapper(getEmulatorsPath());
      const launcher = new GameLauncher(mapper);
      const emulatorsPath = configManager.getEmulatorsPath();

      const effectiveEmuId = await resolveLaunchOverrides(
        validated,
        validatedEmuId,
        mapper,
        emulatorsPath
      );

      const resolved = effectiveEmuId
        ? mapper.resolveById(effectiveEmuId, validated.systemId, emulatorsPath)
        : mapper.resolve(validated.systemId, emulatorsPath);
      if (resolved) {
        runPerEmulatorSetup(
          resolved.definition.id,
          validated.systemId,
          resolved.executablePath,
          configManager.getRomsPath()
        );
      }
      const result = launcher.launch(validated, emulatorsPath, effectiveEmuId);
      if (result.success) {
        const lib = new UserLibrary(getProjectRoot());
        lib.recordPlay(validated.systemId, validated.fileName);
      }
      return result;
    }
  );

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

      const registry = new SystemsRegistry(getSystemsPath());
      const scanner = new RomScanner(registry);
      const scanResult = scanner.scan(configManager.getRomsPath());
      const cache = new MetadataCache(getProjectRoot());

      const onProgress = (progress: unknown) =>
        event.sender.send("scrape-progress", progress);

      // Default to the credential-free multi-source cascade (libretro →
      // OpenVGDB → Wikidata), which covers cartridge AND disc/portable systems
      // without any account. ScreenScraper is opt-in and only used when
      // explicitly selected (it adds descriptions and ratings but needs an
      // account).
      const source = appConfig.metadataSource ?? "libretro";

      if (source !== "screenscraper") {
        const systemMapPath = path.join(getDataPath(), "libretro-systems.json");
        return runMetadataCascade(
          scanResult.systems,
          cache,
          { systemMapPath },
          onProgress
        );
      }

      // ── ScreenScraper ────────────────────────────────────────────────
      // Env vars take priority over config file
      const devId =
        process.env.SCREENSCRAPER_DEV_ID || appConfig.screenScraperDevId;
      const devPassword =
        process.env.SCREENSCRAPER_DEV_PASSWORD ||
        appConfig.screenScraperDevPassword;
      if (!devId || !devPassword) {
        throw new Error("ScreenScraper credentials not configured");
      }

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

      return scraper.scrapeAll(scanResult.systems, onProgress);
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

  /**
   * Read a 200px thumbnail as a dataURL. Falls back to the full cover if the
   * thumbnail doesn't exist yet (e.g. a user upgrading from a pre-thumbnail
   * build who hasn't rebuilt yet). The renderer uses this for grid cards;
   * detail/modal views should keep calling read-cover-data-url for full res.
   */
  ipcMain.handle(
    "read-thumbnail-data-url",
    (_event: IpcMainInvokeEvent, systemId: unknown, romFileName: unknown) => {
      if (typeof systemId !== "string" || typeof romFileName !== "string") {
        return null;
      }
      const cache = new MetadataCache(getProjectRoot());
      const thumbPath = cache.getThumbnailPath(systemId, romFileName);
      const coverPath = cache.getCoverPath(systemId, romFileName);
      const resolved = existsSync(thumbPath) ? thumbPath : coverPath;
      if (!existsSync(resolved)) return null;
      try {
        const data = readFileSync(resolved);
        const ext = path.extname(resolved).toLowerCase();
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

  ipcMain.handle("rebuild-thumbnails", async () => {
    const cache = new MetadataCache(getProjectRoot());
    return backfillThumbnails(cache);
  });

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
        path.join(projectRoot, "config", "metadata", "thumbnails"),
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
    async (
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

        // Regenerate the grid thumbnail so GameCard's read-thumbnail-data-url
        // returns the new image. Without this the renderer keeps falling back
        // to the (still-cached) full cover or to the placeholder. Awaited so
        // the renderer sees a fully-staged result on success.
        const thumbPath = cache.getThumbnailPath(validatedSystem, validatedFile);
        await ensureThumbnail(resolvedDest, thumbPath);

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
        // Also delete the thumbnail — leaving it would let read-thumbnail
        // keep returning the old cached image after a reset, since the
        // thumbnail handler prefers the thumb file over the (now missing)
        // cover.
        const thumbPath = cache.getThumbnailPath(validatedSystem, validatedFile);
        const resolvedThumb = path.resolve(thumbPath);
        if (
          resolvedThumb.startsWith(metadataRoot + path.sep) &&
          existsSync(resolvedThumb)
        ) {
          rmSync(resolvedThumb, { force: true });
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

  // ── Per-game cover source picker ─────────────────────────────────────
  // The user opens a card in the Galería and picks a source (Libretro,
  // SteamGridDB, custom, reset). Libretro/SGDB run a single-rom fetch and
  // overwrite the existing cover/thumbnail. SGDB additionally exposes a
  // "list candidates" handler so the user can choose between several covers.

  /** Delete the current cover + thumbnail for one ROM. Used as the first
   *  step of every "switch source" action so the next downloader writes
   *  to a clean slot (otherwise libretro/sgdb early-return on coverExists). */
  function clearCoverFiles(systemId: string, romFileName: string): void {
    const cache = new MetadataCache(getProjectRoot());
    const coverPath = path.resolve(cache.getCoverPath(systemId, romFileName));
    const thumbPath = path.resolve(
      cache.getThumbnailPath(systemId, romFileName)
    );
    const projectRoot = getProjectRoot();
    const metadataRoot = path.resolve(projectRoot, "config", "metadata");
    for (const p of [coverPath, thumbPath]) {
      if (!p.startsWith(metadataRoot + path.sep)) continue;
      if (existsSync(p)) {
        try {
          rmSync(p, { force: true });
        } catch {
          /* ignore — best-effort cleanup */
        }
      }
    }
  }

  ipcMain.handle(
    "fetch-cover-from-libretro",
    async (
      _event: IpcMainInvokeEvent,
      systemId: unknown,
      romFileName: unknown
    ) => {
      try {
        const validatedSystem = SystemIdSchema.parse(systemId);
        const validatedFile = FileNameSchema.parse(romFileName);

        clearCoverFiles(validatedSystem, validatedFile);

        const cache = new MetadataCache(getProjectRoot());
        const systemMapPath = path.join(getDataPath(), "libretro-systems.json");
        const thumbs = new LibretroThumbnails(cache, { systemMapPath });

        const coverPath = await thumbs.fetchCover(validatedSystem, validatedFile);
        if (!coverPath) {
          return {
            success: false,
            error: "No se encontró ninguna portada en Libretro para este juego.",
          };
        }
        return { success: true, coverPath };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }
  );

  ipcMain.handle(
    "list-steamgriddb-candidates",
    async (
      _event: IpcMainInvokeEvent,
      systemId: unknown,
      romFileName: unknown
    ) => {
      try {
        const validatedSystem = SystemIdSchema.parse(systemId);
        const validatedFile = FileNameSchema.parse(romFileName);

        const configManager = new ConfigManager(getProjectRoot());
        const appConfig = configManager.get();
        const sgdbKey =
          process.env.STEAMGRIDDB_API_KEY || appConfig.steamGridDbApiKey;
        if (!sgdbKey) {
          return {
            success: false,
            error:
              "Falta la API key de SteamGridDB. Configúrala en Ajustes → Portadas → Credenciales.",
            candidates: [],
          };
        }

        const cache = new MetadataCache(getProjectRoot());
        const sgdb = new SteamGridDb(cache, { apiKey: sgdbKey });
        const title = sgdb.extractTitle(validatedFile);
        if (!title) {
          return { success: false, error: "Título vacío.", candidates: [] };
        }
        const gameId = await sgdb.resolveGameId(title);
        if (gameId === null) {
          return {
            success: true,
            candidates: [],
            error: `SteamGridDB no encontró ningún juego para "${title}".`,
          };
        }
        const candidates = await sgdb.listGridCandidates(gameId);
        // mark the variables as used to satisfy lint rules — the parser
        // checks happen via Zod above, the `validatedSystem` value isn't
        // needed for the lookup itself but the validation must not be skipped.
        void validatedSystem;
        return { success: true, candidates };
      } catch (err) {
        return { success: false, error: String(err), candidates: [] };
      }
    }
  );

  // Free-text image search for the profile-banner picker. Unlike the per-game
  // cover handler this isn't tied to a ROM: it resolves an arbitrary title,
  // aggregates images across every matching game, and honours an optional
  // dimension/type filter ("all" | "hero" | a specific grid size).
  const ALLOWED_GRID_DIMS = new Set([
    "460x215",
    "920x430",
    "600x900",
    "342x482",
    "512x512",
    "1024x1024",
    "660x930",
  ]);
  ipcMain.handle(
    "search-steamgriddb-images",
    async (_event: IpcMainInvokeEvent, query: unknown, filter: unknown) => {
      try {
        if (typeof query !== "string" || !query.trim()) {
          return { success: false, error: "Búsqueda vacía.", candidates: [] };
        }
        const title = query.trim().slice(0, 120);
        const sel = typeof filter === "string" ? filter : "all";

        const configManager = new ConfigManager(getProjectRoot());
        const appConfig = configManager.get();
        const sgdbKey =
          process.env.STEAMGRIDDB_API_KEY || appConfig.steamGridDbApiKey;
        if (!sgdbKey) {
          return {
            success: false,
            error:
              "Falta la API key de SteamGridDB. Configúrala en Ajustes → Portadas → Credenciales.",
            candidates: [],
          };
        }

        const cache = new MetadataCache(getProjectRoot());
        const sgdb = new SteamGridDb(cache, { apiKey: sgdbKey });

        // Aggregate across EVERY matching game (like the SteamGridDB website's
        // multi-game search), not just the single best resolved game — that's
        // why the site shows far more images for a broad term like "zelda".
        const games = await sgdb.searchGames(title, 8);
        if (games.length === 0) {
          return {
            success: true,
            candidates: [],
            error: `SteamGridDB no encontró ningún juego para "${title}".`,
          };
        }

        const MAX_TOTAL = 150;
        const seen = new Set<number>();
        const candidates: SgdbCandidate[] = [];

        const wantHeroes = sel === "all" || sel === "hero";
        const wantGrids = sel !== "hero";
        // Only an allowlisted dimension is ever interpolated into the API URL;
        // anything else falls back to "all sizes" (null) — no query injection.
        const gridDims =
          sel === "all" ? null : ALLOWED_GRID_DIMS.has(sel) ? sel : null;

        if (wantHeroes) {
          // Hero-only filter pulls heroes from every matching game; "all" just
          // needs the best match's heroes up front.
          const heroGames = sel === "hero" ? games : games.slice(0, 1);
          for (const game of heroGames) {
            if (candidates.length >= MAX_TOTAL) break;
            for (const h of await sgdb.listHeroCandidates(game.id, 20)) {
              if (candidates.length >= MAX_TOTAL) break;
              if (!seen.has(h.gridId)) {
                seen.add(h.gridId);
                candidates.push(h);
              }
            }
          }
        }

        if (wantGrids) {
          for (const game of games) {
            if (candidates.length >= MAX_TOTAL) break;
            const grids = await sgdb.listGridCandidates(game.id, 40, gridDims);
            for (const g of grids) {
              if (candidates.length >= MAX_TOTAL) break;
              if (!seen.has(g.gridId)) {
                seen.add(g.gridId);
                candidates.push(g);
              }
            }
          }
        }

        return { success: true, candidates };
      } catch (err) {
        return { success: false, error: String(err), candidates: [] };
      }
    }
  );

  // Lazily resolve + cache a wide hero/banner for one game (used by the NEXUS
  // "Continuar" hero). Returns the cached path instantly on subsequent calls;
  // returns heroPath:null when the game has no hero on SteamGridDB.
  ipcMain.handle(
    "ensure-game-hero",
    async (
      _event: IpcMainInvokeEvent,
      systemId: unknown,
      romFileName: unknown
    ) => {
      try {
        const validatedSystem = SystemIdSchema.parse(systemId);
        const validatedFile = FileNameSchema.parse(romFileName);

        const cache = new MetadataCache(getProjectRoot());
        if (cache.heroExists(validatedSystem, validatedFile)) {
          return {
            success: true,
            heroPath: cache.getHeroPath(validatedSystem, validatedFile),
          };
        }

        const configManager = new ConfigManager(getProjectRoot());
        const appConfig = configManager.get();
        const sgdbKey =
          process.env.STEAMGRIDDB_API_KEY || appConfig.steamGridDbApiKey;
        if (!sgdbKey) {
          return { success: false, error: "no-api-key", heroPath: null };
        }

        const sgdb = new SteamGridDb(cache, { apiKey: sgdbKey });
        const heroPath = await sgdb.fetchHero(validatedSystem, validatedFile);
        return { success: true, heroPath: heroPath ?? null };
      } catch (err) {
        return { success: false, error: String(err), heroPath: null };
      }
    }
  );

  ipcMain.handle(
    "apply-steamgriddb-candidate",
    async (
      _event: IpcMainInvokeEvent,
      systemId: unknown,
      romFileName: unknown,
      fullUrl: unknown
    ) => {
      try {
        const validatedSystem = SystemIdSchema.parse(systemId);
        const validatedFile = FileNameSchema.parse(romFileName);
        if (typeof fullUrl !== "string" || !/^https:\/\//.test(fullUrl)) {
          return { success: false, error: "URL no válida." };
        }
        // Defense-in-depth: only accept URLs from the SteamGridDB CDN so a
        // compromised renderer can't exfiltrate or exec arbitrary downloads
        // through this handler.
        const allowedHosts = ["cdn2.steamgriddb.com", "steamgriddb.com"];
        let parsed: URL;
        try {
          parsed = new URL(fullUrl);
        } catch {
          return { success: false, error: "URL malformada." };
        }
        if (!allowedHosts.some((h) => parsed.hostname.endsWith(h))) {
          logSecurityEvent({
            type: "PATH_TRAVERSAL_BLOCKED",
            channel: "apply-steamgriddb-candidate",
            detail: `Blocked host: ${parsed.hostname}`,
            severity: "warn",
          });
          return { success: false, error: "Host no permitido." };
        }

        clearCoverFiles(validatedSystem, validatedFile);

        const configManager = new ConfigManager(getProjectRoot());
        const appConfig = configManager.get();
        const sgdbKey =
          process.env.STEAMGRIDDB_API_KEY || appConfig.steamGridDbApiKey;
        if (!sgdbKey) {
          return {
            success: false,
            error: "Falta la API key de SteamGridDB.",
          };
        }
        const cache = new MetadataCache(getProjectRoot());
        const sgdb = new SteamGridDb(cache, { apiKey: sgdbKey });
        const coverPath = await sgdb.applyCoverFromUrl(
          validatedSystem,
          validatedFile,
          fullUrl
        );
        if (!coverPath) {
          return { success: false, error: "No se pudo descargar la portada." };
        }
        return { success: true, coverPath };
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
    "create-smart-collection",
    (_event: IpcMainInvokeEvent, name: unknown, filter: unknown) => {
      const validatedName = CollectionNameSchema.parse(name);
      const validatedFilter = SmartCollectionFilterSchema.parse(filter);
      const lib = new UserLibrary(getProjectRoot());
      return lib.createSmartCollection(validatedName, validatedFilter);
    }
  );

  ipcMain.handle(
    "update-smart-collection-filter",
    (_event: IpcMainInvokeEvent, id: unknown, filter: unknown) => {
      const validatedId = z.string().min(1).max(100).parse(id);
      const validatedFilter = SmartCollectionFilterSchema.parse(filter);
      const lib = new UserLibrary(getProjectRoot());
      lib.updateSmartCollectionFilter(validatedId, validatedFilter);
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
    "reorder-collection",
    (
      _event: IpcMainInvokeEvent,
      collectionId: unknown,
      keys: unknown
    ) => {
      const validatedColl = CollectionIdSchema.parse(collectionId);
      // Cap at 5000 entries — no manual collection should ever approach
      // this, and it keeps a hostile renderer from forcing arbitrarily
      // long parse loops.
      const validatedKeys = z
        .array(RomCollectionKeySchema)
        .max(5000)
        .parse(keys);
      const lib = new UserLibrary(getProjectRoot());
      lib.reorderCollection(validatedColl, validatedKeys);
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

  // ── Phase 22 — Per-game overrides ────────────────────────────────

  ipcMain.handle("get-game-overrides", () => {
    const lib = new UserLibrary(getProjectRoot());
    return lib.getGameOverrides();
  });

  ipcMain.handle(
    "set-emulator-override",
    (
      _event: IpcMainInvokeEvent,
      systemId: unknown,
      fileName: unknown,
      emulatorId: unknown
    ) => {
      const validatedSystem = SystemIdSchema.parse(systemId);
      const validatedFile = FileNameSchema.parse(fileName);
      const validatedEmu = NullableEmulatorIdSchema.parse(emulatorId);
      const lib = new UserLibrary(getProjectRoot());
      lib.setEmulatorOverride(validatedSystem, validatedFile, validatedEmu);
    }
  );

  ipcMain.handle(
    "set-dolphin-game-config",
    (
      _event: IpcMainInvokeEvent,
      systemId: unknown,
      fileName: unknown,
      patch: unknown
    ) => {
      const validatedSystem = SystemIdSchema.parse(systemId);
      const validatedFile = FileNameSchema.parse(fileName);
      // null clears the whole Dolphin block; a partial object merges.
      const validatedPatch =
        patch === null ? null : DolphinGameConfigPatchSchema.parse(patch);
      const lib = new UserLibrary(getProjectRoot());
      lib.setDolphinOverride(validatedSystem, validatedFile, validatedPatch);
    }
  );

  // Used by GameDetailModal to decide whether to render the Dolphin
  // override section at all. Returns null when the ROM's first 6 bytes
  // aren't a valid GameID (compressed RVZ/CISO etc.) so the UI can show
  // a "GameID not detectable" hint instead of broken controls.
  ipcMain.handle(
    "detect-dolphin-game-id",
    (_event: IpcMainInvokeEvent, romPath: unknown) => {
      const validatedPath = z.string().min(1).max(500).parse(romPath);
      return detectGameId(validatedPath);
    }
  );

  ipcMain.handle(
    "set-retroarch-game-config",
    (
      _event: IpcMainInvokeEvent,
      systemId: unknown,
      fileName: unknown,
      patch: unknown
    ) => {
      const validatedSystem = SystemIdSchema.parse(systemId);
      const validatedFile = FileNameSchema.parse(fileName);
      // null clears the whole RetroArch block; a partial object merges.
      const validatedPatch =
        patch === null ? null : RetroArchGameConfigPatchSchema.parse(patch);
      const lib = new UserLibrary(getProjectRoot());
      lib.setRetroArchOverride(validatedSystem, validatedFile, validatedPatch);
    }
  );

  // Used by GameDetailModal to decide whether to render the RetroArch
  // override section. Returns the core's RetroArch display name (the
  // override folder name) for the system, or null when RetroArch isn't the
  // resolved emulator or the core isn't one we have a verified name for.
  ipcMain.handle(
    "resolve-retroarch-core",
    (_event: IpcMainInvokeEvent, systemId: unknown) => {
      const validatedSystem = SystemIdSchema.parse(systemId);
      const configManager = new ConfigManager(getProjectRoot());
      const mapper = new EmulatorMapper(getEmulatorsPath());
      const resolved = mapper.resolveById(
        "retroarch",
        validatedSystem,
        configManager.getEmulatorsPath()
      );
      if (!resolved) return null;
      const coreArg =
        resolved.definition.args[validatedSystem] ??
        resolved.definition.defaultArgs;
      return coreArg ? coreDisplayName(coreArg) : null;
    }
  );

  // ── Phase 23 — RetroAchievements ─────────────────────────────────

  // Connect: derive the emulator token from username+password via login2 and
  // persist it (plus the web API key) so future launches inject credentials.
  // Never returns the token/password to the renderer.
  ipcMain.handle(
    "ra-login",
    async (_event: IpcMainInvokeEvent, payload: unknown) => {
      const { username, password, webApiKey } = RaLoginSchema.parse(payload);
      const client = new RetroAchievementsClient();
      const result = await client.login(username, password);
      if (!result.success || !result.token) {
        return { success: false, error: result.error ?? "Login fallido" };
      }
      const cm = new ConfigManager(getProjectRoot());
      cm.update({
        retroAchievementsUsername: result.username ?? username,
        retroAchievementsPassword: password,
        retroAchievementsToken: result.token,
        retroAchievementsWebApiKey: webApiKey ?? cm.get().retroAchievementsWebApiKey,
        retroAchievementsEnabled: true,
      });
      cm.save();
      return { success: true, username: result.username ?? username };
    }
  );

  // Disconnect: wipe all RA credentials and disable the feature.
  ipcMain.handle("ra-logout", () => {
    const cm = new ConfigManager(getProjectRoot());
    cm.update({
      retroAchievementsUsername: "",
      retroAchievementsPassword: "",
      retroAchievementsToken: "",
      retroAchievementsWebApiKey: "",
      retroAchievementsEnabled: false,
    });
    cm.save();
  });

  // Status for the renderer — never exposes secrets, only presence flags.
  ipcMain.handle("ra-status", () => {
    const cfg = new ConfigManager(getProjectRoot()).get();
    return {
      connected: Boolean(cfg.retroAchievementsToken),
      username: cfg.retroAchievementsUsername ?? "",
      enabled: Boolean(cfg.retroAchievementsEnabled),
      hardcore: Boolean(cfg.retroAchievementsHardcore),
      hasWebApiKey: Boolean(cfg.retroAchievementsWebApiKey),
    };
  });

  // Achievements for one ROM: hash → resolve game id → fetch user progress.
  // Returns a discriminated result so the UI shows a precise hint for each
  // dead-end (not-configured / disabled / unhashable / not-found / error).
  ipcMain.handle(
    "get-achievements-for-rom",
    async (_event: IpcMainInvokeEvent, rom: unknown) => {
      const validated = DiscoveredRomSchema.parse(rom) as DiscoveredRom;
      const cfg = new ConfigManager(getProjectRoot()).get();
      if (cfg.retroAchievementsEnabled === false) {
        return { status: "disabled" };
      }
      const username = cfg.retroAchievementsUsername;
      const webApiKey = cfg.retroAchievementsWebApiKey;
      if (!username || !webApiKey) {
        return { status: "not-configured" };
      }
      const hash = hashRomFile(validated.filePath, validated.systemId);
      if (!hash) return { status: "unhashable" };
      try {
        const client = new RetroAchievementsClient();
        const gameId = await client.resolveGameId(hash);
        if (!gameId) return { status: "not-found" };
        const progress = await client.getGameProgress(
          username,
          webApiKey,
          gameId
        );
        if (!progress) {
          return { status: "error", message: "No se pudo leer el progreso" };
        }
        return { status: "ok", progress };
      } catch (err) {
        return {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );

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

      const effectiveEmuId = await resolveLaunchOverrides(
        validated,
        validatedEmuId,
        mapper,
        emulatorsPath
      );

      const resolved = effectiveEmuId
        ? mapper.resolveById(effectiveEmuId, validated.systemId, emulatorsPath)
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

      // Phase 22 — record launch context so the symmetric post-launch script
      // hook in onSessionEnded receives the same env bundle the pre-launch
      // hook saw. Detached/fallback launches (no embedded overlay) don't
      // emit session-end events, so post-launch only fires for embedded.
      sessionLaunchContext = {
        emulatorId: resolved.definition.id,
        title: validated.fileName,
        romPath: validated.filePath,
      };

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

  // --- Game screenshots (user uploads + in-game capture) ---

  ipcMain.handle(
    "list-game-screenshots",
    (_event: IpcMainInvokeEvent, systemId: unknown, fileName: unknown) => {
      const sys = SystemIdSchema.parse(systemId);
      const file = FileNameSchema.parse(fileName);
      const cache = new MetadataCache(getProjectRoot());
      return cache.listScreenshots(sys, file);
    }
  );

  // Copy a user-picked image into the game's screenshot store.
  ipcMain.handle(
    "add-game-screenshot",
    (_event: IpcMainInvokeEvent, systemId: unknown, fileName: unknown, sourcePath: unknown) => {
      const sys = SystemIdSchema.parse(systemId);
      const file = FileNameSchema.parse(fileName);
      const src = z.string().min(1).max(4000).parse(sourcePath);
      if (!existsSync(src) || !/\.(png|jpe?g|webp)$/i.test(src)) {
        return { success: false as const, error: "Imagen no válida." };
      }
      try {
        const cache = new MetadataCache(getProjectRoot());
        const ext = path.extname(src).slice(1) || "png";
        const dest = cache.newScreenshotPath(sys, file, ext, Date.now());
        copyFileSync(src, dest);
        return { success: true as const, path: dest };
      } catch (err) {
        return { success: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle("delete-game-screenshot", (_event: IpcMainInvokeEvent, shotPath: unknown) => {
    const p = z.string().min(1).max(4000).parse(shotPath);
    const cache = new MetadataCache(getProjectRoot());
    if (!cache.isScreenshotPath(p)) return { success: false as const, error: "Ruta no permitida." };
    try {
      if (existsSync(p)) rmSync(p);
      return { success: true as const };
    } catch (err) {
      return { success: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Capture the embedded emulator (screen region of the game area) → saved as a
  // screenshot of the running game. Triggered by F12 or the pause menu.
  const captureGameScreenshot = async (): Promise<{ success: boolean; path?: string; error?: string }> => {
    const rom = overlay?.getCurrentRom();
    const bounds = overlay?.getCaptureBounds();
    const win = getMainWindow();
    if (!rom || !bounds || !win) return { success: false, error: "No hay ningún juego en marcha." };
    try {
      const display = screen.getDisplayMatching(win.getContentBounds());
      const sf = display.scaleFactor;
      const dispW = Math.round(display.size.width * sf);
      const dispH = Math.round(display.size.height * sf);
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: dispW, height: dispH },
      });
      const src =
        sources.find((s) => String(s.display_id) === String(display.id)) ?? sources[0];
      if (!src) return { success: false, error: "No se pudo capturar la pantalla." };

      let img = src.thumbnail;
      const ts = img.getSize();
      // Crop relative to this display's physical origin, clamped to the image.
      const ox = Math.round(display.bounds.x * sf);
      const oy = Math.round(display.bounds.y * sf);
      const cx = Math.max(0, Math.min(bounds.x - ox, ts.width - 1));
      const cy = Math.max(0, Math.min(bounds.y - oy, ts.height - 1));
      const cw = Math.max(1, Math.min(bounds.width, ts.width - cx));
      const ch = Math.max(1, Math.min(bounds.height, ts.height - cy));
      img = img.crop({ x: cx, y: cy, width: cw, height: ch });

      const cache = new MetadataCache(getProjectRoot());
      const dest = cache.newScreenshotPath(rom.systemId, rom.fileName, "png", Date.now());
      writeFileSync(dest, img.toPNG());
      win.webContents.send("game-screenshot-captured", {
        systemId: rom.systemId,
        fileName: rom.fileName,
        path: dest,
      });
      return { success: true, path: dest };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
  ipcMain.handle("capture-game-screenshot", () => captureGameScreenshot());
  // F12 captures the running game (no-op when nothing is playing). Registered
  // globally so it works while the embedded emulator owns the foreground.
  try {
    globalShortcut.register("F12", () => {
      if (overlay?.isActive()) void captureGameScreenshot();
    });
  } catch {
    /* shortcut unavailable — the in-ficha upload + IPC still work */
  }

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

  // Resize a user-picked image into a small square avatar data URL. Returns a
  // ~256px JPEG data URL (tiny — safe to persist in localStorage and render via
  // <img> under the 'self'/data: CSP, unlike a raw file:// path).
  ipcMain.handle(
    "image-file-to-avatar",
    async (_event: IpcMainInvokeEvent, sourcePath: unknown) => {
      try {
        if (typeof sourcePath !== "string" || !sourcePath) {
          return { success: false, error: "Ruta no válida." };
        }
        const resolved = path.resolve(sourcePath);
        if (!existsSync(resolved)) {
          return { success: false, error: "El archivo no existe." };
        }
        const ext = path.extname(resolved).toLowerCase();
        const allowed = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"];
        if (!allowed.includes(ext)) {
          return { success: false, error: "Formato de imagen no soportado." };
        }
        const sharp = (await import("sharp")).default;
        const buf = await sharp(resolved)
          .resize(256, 256, { fit: "cover" })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer();
        return {
          success: true,
          dataUrl: `data:image/jpeg;base64,${buf.toString("base64")}`,
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }
  );

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

  // Scan a mix of file and directory paths (from the native picker or a
  // drag-drop) for importable ROMs. Directories are walked recursively (bounded
  // depth) and only files whose extension matches a known system are kept, so
  // junk files in a folder don't flood the import review. Explicitly-passed
  // FILES are always returned (even unrecognized) so the user can reassign them.
  ipcMain.handle(
    "scan-import-paths",
    (_event: IpcMainInvokeEvent, inputPaths: unknown) => {
      const validated = FilePathsSchema.parse(inputPaths);
      const registry = new SystemsRegistry(getSystemsPath());
      const MAX_DEPTH = 6;
      const MAX_FILES = 5000;
      const seen = new Set<string>();
      const out: Array<{
        filePath: string;
        fileName: string;
        sizeBytes: number;
        systems: { id: string; name: string }[];
      }> = [];

      const addFile = (fp: string, fromDir: boolean) => {
        if (out.length >= MAX_FILES || seen.has(fp)) return;
        const ext = path.extname(fp).toLowerCase();
        const systems = registry.getByExtension(ext);
        if (fromDir && systems.length === 0) return; // skip folder junk
        let sizeBytes = 0;
        try {
          sizeBytes = statSync(fp).size;
        } catch {
          return;
        }
        seen.add(fp);
        out.push({
          filePath: fp,
          fileName: path.basename(fp),
          sizeBytes,
          systems: systems.map((s) => ({ id: s.id, name: s.name })),
        });
      };

      const walk = (dir: string, depth: number) => {
        if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
        let entries: Dirent[];
        try {
          entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
        } catch {
          return;
        }
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full, depth + 1);
          else if (e.isFile()) addFile(full, true);
        }
      };

      for (const p of validated) {
        try {
          const st = statSync(p);
          if (st.isDirectory()) walk(p, 0);
          else if (st.isFile()) addFile(p, false);
        } catch {
          /* unreadable path — skip */
        }
      }
      return out;
    }
  );

  // Dry-run metadata lookup for files that aren't imported yet — used by the
  // importer to preview género/año/etc. before the user confirms. Writes nothing.
  const ImportPreviewSchema = z
    .array(z.object({ fileName: FileNameSchema, systemId: SystemIdSchema }))
    .min(1)
    .max(500);
  ipcMain.handle(
    "preview-import-metadata",
    async (_event: IpcMainInvokeEvent, items: unknown) => {
      const validated = ImportPreviewSchema.parse(items);
      const cache = new MetadataCache(getProjectRoot());
      const systemMapPath = path.join(getDataPath(), "libretro-systems.json");
      return previewMetadata(validated, cache, { systemMapPath });
    }
  );

  // Persist previewed metadata for imported games (called on confirm). Fills
  // only empty fields so any existing/manual data survives.
  const ImportApplySchema = z
    .array(
      z.object({
        systemId: SystemIdSchema,
        fileName: FileNameSchema,
        fields: z.object({
          genre: z.string().max(200).optional(),
          developer: z.string().max(200).optional(),
          publisher: z.string().max(200).optional(),
          year: z.string().max(20).optional(),
          players: z.string().max(20).optional(),
          description: z.string().max(4000).optional(),
        }),
      })
    )
    .max(500);
  ipcMain.handle(
    "apply-import-metadata",
    (_event: IpcMainInvokeEvent, entries: unknown) => {
      const validated = ImportApplySchema.parse(entries);
      const cache = new MetadataCache(getProjectRoot());
      for (const e of validated) {
        const existing = cache.getMetadata(e.systemId, e.fileName);
        const base = existing ?? {
          title: "",
          description: "",
          year: "",
          genre: "",
          publisher: "",
          developer: "",
          players: "",
          rating: "",
          coverPath: "",
          screenshotPath: "",
          screenScraperId: "",
          lastScraped: "",
        };
        const f = e.fields;
        const merged = {
          ...base,
          genre: base.genre || f.genre || "",
          developer: base.developer || f.developer || "",
          publisher: base.publisher || f.publisher || "",
          year: base.year || f.year || "",
          players: base.players || f.players || "",
          description: base.description || f.description || "",
          lastScraped: new Date().toISOString(),
        };
        cache.setMetadata(e.systemId, e.fileName, merged);
      }
      return { ok: true };
    }
  );

  ipcMain.handle(
    "add-roms",
    async (event: IpcMainInvokeEvent, entries: unknown) => {
      const validated = AddRomsSchema.parse(entries);
      const configManager = new ConfigManager(getProjectRoot());
      const registry = new SystemsRegistry(getSystemsPath());
      const romsPath = configManager.getRomsPath();
      const sender = event.sender;
      const totalFiles = validated.length;

      // Sends progress to the invoking renderer if it's still alive.
      // Streamed copy emits 'data' on every chunk; we throttle to 10/s
      // per file to avoid flooding IPC for large multi-GB ROMs.
      const sendProgress = (payload: {
        fileIndex: number;
        totalFiles: number;
        fileName: string;
        copiedBytes: number;
        totalBytes: number;
        percent: number;
      }) => {
        if (sender.isDestroyed()) return;
        sender.send("add-roms:progress", payload);
      };

      const results: Array<{
        filePath: string;
        fileName: string;
        systemId: string;
        success: boolean;
        error?: string;
      }> = [];

      for (let i = 0; i < validated.length; i++) {
        const entry = validated[i];
        const { filePath, systemId } = entry;
        const fileName = path.basename(filePath);

        try {
          const system = registry.getById(systemId);
          if (!system) {
            results.push({ filePath, fileName, systemId, success: false, error: `Unknown system: ${systemId}` });
            continue;
          }
          if (!existsSync(filePath)) {
            results.push({ filePath, fileName, systemId, success: false, error: "Source file not found" });
            continue;
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
            results.push({ filePath, fileName, systemId, success: false, error: "Invalid destination path" });
            continue;
          }

          mkdirSync(destDir, { recursive: true });

          const totalBytes = statSync(filePath).size;
          let copiedBytes = 0;
          let lastEmitMs = 0;

          sendProgress({
            fileIndex: i,
            totalFiles,
            fileName,
            copiedBytes: 0,
            totalBytes,
            percent: 0,
          });

          // 1 MiB chunks — keeps libuv thread-pool happy and IPC traffic
          // tractable. pipeline() handles back-pressure and cleanup.
          const readStream = createReadStream(filePath, {
            highWaterMark: 1024 * 1024,
          });
          const writeStream = createWriteStream(resolvedDest);

          readStream.on("data", (chunk) => {
            copiedBytes += chunk.length;
            const now = Date.now();
            const finished = copiedBytes >= totalBytes;
            if (finished || now - lastEmitMs >= 100) {
              lastEmitMs = now;
              sendProgress({
                fileIndex: i,
                totalFiles,
                fileName,
                copiedBytes,
                totalBytes,
                percent: totalBytes > 0 ? copiedBytes / totalBytes : 0,
              });
            }
          });

          await pipeline(readStream, writeStream);

          results.push({ filePath, fileName, systemId, success: true });
        } catch (err) {
          results.push({ filePath, fileName, systemId, success: false, error: String(err) });
        }
      }

      if (!sender.isDestroyed()) {
        sender.send("add-roms:complete", { results });
      }
      return results;
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

  ipcMain.handle("install-update", async () => {
    await autoUpdater.installUpdate();
  });

  // Fallback for the renderer: when "Instalar y reiniciar" fails (locked
  // policies, AV quarantine, manifest denial, etc.) the user needs a way
  // out. The renderer surfaces this path so the user can click "Open
  // installer folder" and run the .exe manually.
  ipcMain.handle("get-downloaded-installer-path", () => {
    return autoUpdater.getDownloadedInstallerPath();
  });

  ipcMain.handle("cancel-update-download", () => {
    autoUpdater.cancelDownload();
  });
}
