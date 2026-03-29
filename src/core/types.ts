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
}
