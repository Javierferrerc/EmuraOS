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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
