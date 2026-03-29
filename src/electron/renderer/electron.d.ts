import type {
  AppConfig,
  SystemDefinition,
  ScanResult,
  DiscoveredRom,
  LaunchResult,
  DetectionResult,
} from "../../core/types";

export interface ElectronAPI {
  getConfig(): Promise<AppConfig>;
  updateConfig(partial: Partial<AppConfig>): Promise<AppConfig>;
  configExists(): Promise<boolean>;
  getSystems(): Promise<SystemDefinition[]>;
  scanRoms(): Promise<ScanResult>;
  launchGame(rom: DiscoveredRom): Promise<LaunchResult>;
  detectEmulators(): Promise<DetectionResult>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
