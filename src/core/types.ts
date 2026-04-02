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
  coverSource?: "libretro" | "screenscraper";
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

export interface UserLibraryFile {
  version: 1;
  favorites: string[];
  collections: Collection[];
  recentlyPlayed: string[];
  playHistory: Record<string, PlayRecord>;
}
