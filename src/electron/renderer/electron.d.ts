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
  EmulatorConfigData,
  EmulatorDefinition,
  DriveEmulatorMapping,
  EmulatorDownloadProgress,
} from "../../core/types";

export interface ElectronAPI {
  getConfig(): Promise<AppConfig>;
  updateConfig(partial: Partial<AppConfig>): Promise<AppConfig>;
  configExists(): Promise<boolean>;
  getSystems(): Promise<SystemDefinition[]>;
  scanRoms(): Promise<ScanResult>;
  launchGame(rom: DiscoveredRom): Promise<LaunchResult>;
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
  toggleFavorite(systemId: string, fileName: string): Promise<boolean>;
  getCollections(): Promise<Collection[]>;
  createCollection(name: string): Promise<Collection>;
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
  getRecentlyPlayed(limit?: number): Promise<string[]>;

  // Embedded overlay
  launchGameEmbedded(rom: DiscoveredRom): Promise<EmbeddedLaunchResult>;
  stopEmbeddedGame(): Promise<void>;
  isGameRunning(): Promise<boolean>;
  setGameAreaBounds(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<void>;
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

  // Emulator downloads (Google Drive)
  getEmulatorDefs(): Promise<EmulatorDefinition[]>;
  listDriveEmulators(
    forceRefresh?: boolean
  ): Promise<Record<string, DriveEmulatorMapping>>;
  downloadEmulator(
    emulatorId: string
  ): Promise<{ success: boolean; installPath: string; error?: string }>;
  onEmulatorDownloadProgress(
    callback: (progress: EmulatorDownloadProgress) => void
  ): () => void;

  // Phase 13: File system pickers (Settings widgets)
  pickFolder(): Promise<string | null>;
  pickFile(
    filters?: Array<{ name: string; extensions: string[] }>
  ): Promise<string | null>;

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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
