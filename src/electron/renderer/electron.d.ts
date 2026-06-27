import type {
  AppConfig,
  SystemDefinition,
  ScanResult,
  DiscoveredRom,
  LaunchResult,
  EmbeddedLaunchResult,
  DetectionResult,
  GameMetadata,
  GameSessionEvent,
  ScrapeResult,
  ScrapeProgress,
  CoverFetchResult,
  CoverFetchProgress,
  CoreDownloadProgress,
  ReadinessReport,
  UserLibraryFile,
  Collection,
  SmartCollectionFilter,
  EmulatorConfigData,
  EmulatorDefinition,
  DriveEmulatorMapping,
  EmulatorDownloadProgress,
  UpdateCheckResult,
  UpdateDownloadProgress,
  UpdateInfo,
  AddRomsProgress,
  SgdbCandidate,
  GameOverride,
  DolphinGameConfig,
  RetroArchGameConfig,
  RaStatus,
  RaAchievementsResult,
} from "../../core/types";

export interface ElectronAPI {
  getConfig(): Promise<AppConfig>;
  updateConfig(partial: Partial<AppConfig>): Promise<AppConfig>;
  configExists(): Promise<boolean>;
  getSystems(): Promise<SystemDefinition[]>;
  scanRoms(): Promise<ScanResult>;
  getEmulatorsForSystem(systemId: string): Promise<Array<{ emulatorId: string; emulatorName: string }>>;
  launchGame(rom: DiscoveredRom, emulatorId?: string): Promise<LaunchResult>;
  detectEmulators(): Promise<DetectionResult & { readiness?: ReadinessReport }>;
  getAllMetadata(): Promise<Record<string, Record<string, GameMetadata>>>;
  getMetadata(
    systemId: string,
    romFileName: string
  ): Promise<GameMetadata | null>;
  scrapeAllMetadata(): Promise<ScrapeResult>;
  getCoverPath(
    systemId: string,
    romFileName: string
  ): Promise<string | null>;
  readCoverDataUrl(coverPath: string): Promise<string | null>;
  readThumbnailDataUrl(
    systemId: string,
    romFileName: string
  ): Promise<string | null>;
  rebuildThumbnails(): Promise<{
    generated: number;
    skipped: number;
    failed: number;
  }>;
  getPathForFile(file: File): string;
  setCustomCover(
    systemId: string,
    romFileName: string,
    sourcePath: string
  ): Promise<{ success: boolean; coverPath?: string; error?: string }>;
  resetCustomCover(
    systemId: string,
    romFileName: string
  ): Promise<{ success: boolean; error?: string }>;
  fetchCoverFromLibretro(
    systemId: string,
    romFileName: string
  ): Promise<{ success: boolean; coverPath?: string; error?: string }>;
  listSteamGridDbCandidates(
    systemId: string,
    romFileName: string
  ): Promise<{
    success: boolean;
    candidates: SgdbCandidate[];
    error?: string;
  }>;
  applySteamGridDbCandidate(
    systemId: string,
    romFileName: string,
    fullUrl: string
  ): Promise<{ success: boolean; coverPath?: string; error?: string }>;
  searchSteamGridDbImages(
    query: string,
    filter?: string
  ): Promise<{
    success: boolean;
    candidates: SgdbCandidate[];
    kind?: "hero" | "grid";
    error?: string;
  }>;
  ensureGameHero(
    systemId: string,
    romFileName: string
  ): Promise<{ success: boolean; heroPath?: string | null; error?: string }>;
  imageFileToAvatar(
    sourcePath: string
  ): Promise<{ success: boolean; dataUrl?: string; error?: string }>;
  readBackgroundDataUrl(imagePath: string): Promise<string | null>;
  onScrapeProgress(callback: (progress: ScrapeProgress) => void): void;
  removeScrapeProgressListener(): void;
  fetchCovers(): Promise<CoverFetchResult>;
  onCoverFetchProgress(
    callback: (progress: CoverFetchProgress) => void
  ): void;
  removeCoverFetchProgressListener(): void;
  onCoreDownloadProgress(
    callback: (progress: CoreDownloadProgress) => void
  ): void;
  removeCoreDownloadProgressListener(): void;
  toggleFullscreen(): Promise<void>;
  getFullscreen(): Promise<boolean>;
  onFullscreenChanged(callback: (isFullscreen: boolean) => void): void;
  removeFullscreenChangedListener(): void;
  getUserLibrary(): Promise<UserLibraryFile>;
  /** Point the per-profile activity store at the given profile (null = default). */
  setActiveProfile(id: string | null): Promise<boolean>;
  toggleFavorite(systemId: string, fileName: string): Promise<boolean>;
  getCollections(): Promise<Collection[]>;
  createCollection(name: string): Promise<Collection>;
  createSmartCollection(
    name: string,
    filter: SmartCollectionFilter
  ): Promise<Collection>;
  updateSmartCollectionFilter(
    id: string,
    filter: SmartCollectionFilter
  ): Promise<void>;
  renameCollection(id: string, name: string): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  addToCollection(
    collectionId: string,
    systemId: string,
    fileName: string
  ): Promise<void>;
  removeFromCollection(
    collectionId: string,
    systemId: string,
    fileName: string
  ): Promise<void>;
  reorderCollection(collectionId: string, keys: string[]): Promise<void>;
  getRecentlyPlayed(limit?: number): Promise<string[]>;
  getRomAddedDates(): Promise<Record<string, string>>;
  recordPlayTime(systemId: string, fileName: string, seconds: number): Promise<void>;

  // Phase 22 — Per-game overrides
  getGameOverrides(): Promise<Record<string, GameOverride>>;
  setEmulatorOverride(
    systemId: string,
    fileName: string,
    emulatorId: string | null
  ): Promise<void>;
  setDolphinGameConfig(
    systemId: string,
    fileName: string,
    patch: Partial<DolphinGameConfig> | null
  ): Promise<void>;
  detectDolphinGameId(romPath: string): Promise<string | null>;
  setRetroArchGameConfig(
    systemId: string,
    fileName: string,
    patch: Partial<RetroArchGameConfig> | null
  ): Promise<void>;
  resolveRetroArchCore(systemId: string): Promise<string | null>;

  // Phase 23 — RetroAchievements
  raLogin(
    username: string,
    password: string,
    webApiKey?: string
  ): Promise<{ success: boolean; username?: string; error?: string }>;
  raLogout(): Promise<void>;
  raStatus(): Promise<RaStatus>;
  getAchievementsForRom(rom: DiscoveredRom): Promise<RaAchievementsResult>;

  // Embedded overlay
  launchGameEmbedded(rom: DiscoveredRom, emulatorId?: string): Promise<EmbeddedLaunchResult>;
  stopEmbeddedGame(): Promise<void>;
  isGameRunning(): Promise<boolean>;
  setGameAreaBounds(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<void>;
  onNexusTogglePause(callback: () => void): void;
  removeNexusTogglePauseListener(): void;
  onGameSessionStarted(callback: (event: GameSessionEvent) => void): void;
  removeGameSessionStartedListener(): void;
  onGameSessionEnded(callback: () => void): void;
  removeGameSessionEndedListener(): void;

  // Emulator config
  getEmulatorConfig(
    emulatorId: string,
    executablePath?: string
  ): Promise<EmulatorConfigData>;
  updateEmulatorConfig(
    emulatorId: string,
    changes: Record<string, string>,
    executablePath?: string
  ): Promise<void>;
  getEmulatorSchemas(): Promise<string[]>;
  openConfigFile(emulatorId: string, executablePath?: string): Promise<void>;

  // Cemu keys.txt
  checkCemuKeys(): Promise<{
    emulatorFound: boolean;
    exists: boolean;
    path: string | null;
    entryCount: number;
  }>;
  writeCemuKeys(content: string): Promise<{ path: string }>;

  // Dolphin GameCube controller (GCPadNew.ini)
  getDolphinGcPadConfig(): Promise<{
    configPath: string;
    exists: boolean;
    ports: Record<1 | 2 | 3 | 4, { entries: Record<string, string> }>;
    otherSections: Record<string, Record<string, string>>;
  }>;
  updateDolphinGcPadConfig(
    updates: Array<{
      port: 1 | 2 | 3 | 4;
      changes: Record<string, string>;
    }>
  ): Promise<{ configPath: string }>;
  launchEmulatorGui(executablePath: string): Promise<{ pid: number | null }>;

  // Emulator downloads (Google Drive)
  getEmulatorDefs(): Promise<EmulatorDefinition[]>;
  listDriveEmulators(
    forceRefresh?: boolean
  ): Promise<Record<string, DriveEmulatorMapping>>;
  downloadEmulator(
    emulatorId: string
  ): Promise<{ success: boolean; installPath: string; error?: string }>;
  cancelEmulatorDownload(emulatorId: string): Promise<void>;
  onEmulatorDownloadProgress(
    callback: (progress: EmulatorDownloadProgress) => void
  ): () => void;

  // Phase 13: File system pickers (Settings widgets)
  pickFolder(): Promise<string | null>;
  pickFile(
    filters?: Array<{ name: string; extensions: string[] }>
  ): Promise<string | null>;
  pickRomFiles(systemId?: string): Promise<string[] | null>;
  resolveRomSystems(
    filePaths: string[]
  ): Promise<
    Array<{
      filePath: string;
      fileName: string;
      systems: Array<{ id: string; name: string }>;
    }>
  >;
  scanImportPaths(
    paths: string[]
  ): Promise<
    Array<{
      filePath: string;
      fileName: string;
      sizeBytes: number;
      systems: Array<{ id: string; name: string }>;
    }>
  >;
  previewImportMetadata(
    items: Array<{ fileName: string; systemId: string }>
  ): Promise<
    Array<{
      genre: string;
      developer: string;
      publisher: string;
      year: string;
      players: string;
      description: string;
    }>
  >;
  applyImportMetadata(
    entries: Array<{
      systemId: string;
      fileName: string;
      fields: {
        genre?: string;
        developer?: string;
        publisher?: string;
        year?: string;
        players?: string;
        description?: string;
      };
    }>
  ): Promise<{ ok: boolean }>;
  listGameScreenshots(systemId: string, fileName: string): Promise<string[]>;
  addGameScreenshot(
    systemId: string,
    fileName: string,
    sourcePath: string
  ): Promise<{ success: boolean; path?: string; error?: string }>;
  deleteGameScreenshot(shotPath: string): Promise<{ success: boolean; error?: string }>;
  captureGameScreenshot(): Promise<{ success: boolean; path?: string; error?: string }>;
  onGameScreenshotCaptured(
    callback: (info: { systemId: string; fileName: string; path: string }) => void
  ): () => void;
  addRoms(
    entries: Array<{ filePath: string; systemId: string }>
  ): Promise<
    Array<{
      filePath: string;
      fileName: string;
      systemId: string;
      success: boolean;
      error?: string;
    }>
  >;
  onAddRomsProgress(
    callback: (progress: AddRomsProgress) => void
  ): () => void;
  onAddRomsComplete(
    callback: (data: {
      results: Array<{
        filePath: string;
        fileName: string;
        systemId: string;
        success: boolean;
        error?: string;
      }>;
    }) => void
  ): () => void;

  // Phase 13 PR2: Library / diagnostics / reset
  clearMetadataCache(): Promise<{ success: boolean; error?: string }>;
  resetPlayHistory(): Promise<{ success: boolean; error?: string }>;
  exportUserLibrary(): Promise<{
    success: boolean;
    path?: string;
    error?: string;
  } | null>;
  openLogsFolder(): Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;
  exportDiagnosticBundle(): Promise<{
    success: boolean;
    path?: string;
    error?: string;
  } | null>;
  resetConfig(): Promise<{ success: boolean; error?: string }>;
  getAppVersion(): Promise<{
    app: string;
    electron: string;
    node: string;
    chrome: string;
    platform: string;
    arch: string;
  }>;
  openAppConfigFile(): Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;
  openExternal(url: string): Promise<{ success: boolean; error?: string }>;
  showInExplorer(filePath: string): Promise<unknown>;
  resolveConfigPaths(): Promise<{ romsPath: string; emulatorsPath: string }>;
  openFolder(folderPath: string): Promise<void>;

  // Auto-update
  checkForUpdates(): Promise<UpdateCheckResult>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  getDownloadedInstallerPath(): Promise<string | null>;
  cancelUpdateDownload(): Promise<void>;
  onUpdateDownloadProgress(
    callback: (progress: UpdateDownloadProgress) => void
  ): () => void;
  onUpdateReady(callback: (info: UpdateInfo) => void): () => void;
  onUpdateError(callback: (message: string) => void): () => void;
  onStartupUpdateCheck(callback: () => void): () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
