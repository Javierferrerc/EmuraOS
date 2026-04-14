export interface SystemDefinition {
  id: string;
  name: string;
  manufacturer: string;
  extensions: string[];
  romFolder: string;
}

export interface DiscoveredRom {
  fileName: string;
  filePath: string;
  systemId: string;
  systemName: string;
  sizeBytes: number;
}

export interface ScanResult {
  totalRoms: number;
  systems: {
    systemId: string;
    systemName: string;
    roms: DiscoveredRom[];
  }[];
}

export interface AppConfig {
  romsPath: string;
  emulatorsPath: string;
  configPath: string;
  systems: string[];
  screenScraperDevId?: string;
  screenScraperDevPassword?: string;
  screenScraperUserId?: string;
  screenScraperUserPassword?: string;
  steamGridDbApiKey?: string;

  // Phase 13 — UI-managed app preferences
  language?: "es" | "en";
  fullscreenOnStart?: boolean;
  autoScanOnStartup?: boolean;
  metadataPath?: string;
  savesPath?: string;
  libretroCoversEnabled?: boolean;
  coverSourcePriority?: "libretro-first" | "sgdb-first" | "libretro-only" | "sgdb-only";
  firstRunCompleted?: boolean;
  navSoundEnabled?: boolean;
  navSoundVolume?: number;
  cardTiltEnabled?: boolean;
  // Toggle the fullscreen 3D cube shown while a game is launching. When
  // false, game launches go straight from double-click to GameModeView
  // without the intermediate loader.
  gameLoadingOverlayEnabled?: boolean;
  // Toggle the dock-style magnification on the horizontal system slider.
  // When false, the slider behaves like a normal flat list with no mouse
  // tracking.
  systemSliderMagnificationEnabled?: boolean;
  devMode?: boolean;
  // One-shot flag: set to true after we auto-apply the Citra gamepad
  // profile on the first 3DS launch. Prevents re-patching qt-config.ini
  // on every subsequent launch and keeps the user in control if they
  // later customize their bindings inside Citra.
  citraGamepadAutoConfigured?: boolean;
}

export interface EmulatorDefinition {
  id: string;
  name: string;
  executable: string;
  defaultPaths: string[];
  systems: string[];
  launchTemplate: string;
  args: Record<string, string>;
  defaultArgs: string;
  coreUrls?: Record<string, string>;
}

export interface ResolvedEmulator {
  definition: EmulatorDefinition;
  executablePath: string;
  systemId: string;
}

export interface LaunchResult {
  success: boolean;
  emulatorId: string;
  romPath: string;
  command: string;
  pid?: number;
  error?: string;
}

export interface DetectedEmulator {
  id: string;
  name: string;
  executablePath: string;
  systems: string[];
  source: "emulatorsPath" | "defaultPath";
}

export interface DetectionResult {
  detected: DetectedEmulator[];
  notFound: string[];
  totalChecked: number;
}

export interface GameMetadata {
  title: string;
  description: string;
  year: string;
  genre: string;
  publisher: string;
  developer: string;
  players: string;
  rating: string;
  coverPath: string;
  coverSource?: "libretro" | "screenscraper" | "steamgriddb";
  screenshotPath: string;
  screenScraperId: string;
  lastScraped: string;
}

export interface MetadataCacheFile {
  systemId: string;
  lastUpdated: string;
  games: Record<string, GameMetadata>;
}

export interface ScrapeResult {
  totalProcessed: number;
  totalFound: number;
  totalNotFound: number;
  totalErrors: number;
  errors: ScrapeError[];
}

export interface ScrapeError {
  romFileName: string;
  systemId: string;
  error: string;
}

export interface ScrapeProgress {
  current: number;
  total: number;
  romFileName: string;
  systemId: string;
  status: "scraping" | "found" | "not_found" | "error" | "cached";
}

export interface ScreenScraperCredentials {
  devId: string;
  devPassword: string;
  softName: string;
  ssId?: string;
  ssPassword?: string;
}

export interface CoverFetchProgress {
  current: number;
  total: number;
  romFileName: string;
  systemId: string;
  status: "downloading" | "found" | "not_found" | "error" | "already_cached";
  phase?: "libretro" | "steamgriddb";
}

export interface CoverFetchResult {
  totalProcessed: number;
  totalFound: number;
  totalNotFound: number;
  totalErrors: number;
}

export interface RomReference {
  systemId: string;
  fileName: string;
}

export interface PlayRecord {
  lastPlayed: string;
  playCount: number;
}

export interface Collection {
  id: string;
  name: string;
  roms: string[]; // "systemId:fileName" keys
  createdAt: string;
  updatedAt: string;
}

export interface EmbeddedLaunchResult {
  success: boolean;
  emulatorId: string;
  romPath: string;
  command: string;
  pid?: number;
  error?: string;
}

export interface GameSessionEvent {
  rom: DiscoveredRom;
  emulatorId: string;
}

export interface CoreDownloadProgress {
  current: number;
  total: number;
  coreName: string;
  status: "downloading" | "extracting" | "installed" | "already_installed" | "error";
}

export interface DriveEmulatorMapping {
  emulatorId: string;
  folderId: string;
  fileCount: number;
  totalBytes: number;
}

export interface EmulatorDownloadProgress {
  emulatorId: string;
  phase: "listing" | "downloading" | "finalizing" | "done" | "error" | "cancelled";
  filesCompleted: number;
  filesTotal: number;
  bytesReceived: number;
  bytesTotal: number;
  currentFile?: string;
  message?: string;
}

export interface EmulatorReadinessResult {
  emulatorId: string;
  isReady: boolean;
  issues: string[];
  fixed: string[];
  errors: string[];
}

export interface ReadinessReport {
  results: EmulatorReadinessResult[];
  totalFixed: number;
  totalErrors: number;
}

export interface UserLibraryFile {
  version: 1;
  favorites: string[];
  collections: Collection[];
  recentlyPlayed: string[];
  playHistory: Record<string, PlayRecord>;
}

// ── Emulator Configuration System ──────────────────────────────────

export interface EmulatorSettingDefinition {
  key: string;
  label: string;
  type: "boolean" | "enum" | "number" | "string" | "path";
  category: string;
  default?: string;
  // Labeled options let schemas show human-readable dropdowns
  // (e.g. {value: "0", label: "Default"}) while still storing the raw value.
  // Plain strings remain supported for backward compatibility.
  options?: (string | { value: string; label: string })[];
  min?: number;
  max?: number;
  description?: string;
}

export interface EmulatorConfigSchema {
  configFile: string;
  configFormat: "ini" | "keyvalue" | "json" | "yaml" | "xml";
  configLocations: string[];
  categories: {
    id: string;
    name: string;
    settings: Omit<EmulatorSettingDefinition, "category">[];
  }[];
}

export interface EmulatorConfigData {
  emulatorId: string;
  configPath: string | null;
  settings: Record<string, string>;
  schema: EmulatorConfigSchema;
}

// ── Auto-Update System ─────────────────────────────────────────────

export interface UpdateInfo {
  version: string;
  releaseNotes: string;
  downloadUrl: string;
  publishedAt: string;
  size: number;
}

export interface UpdateDownloadProgress {
  bytesDownloaded: number;
  bytesTotal: number;
  percentComplete: number;
  status: "downloading" | "complete" | "cancelled" | "error";
}

export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateInfo?: UpdateInfo;
}
