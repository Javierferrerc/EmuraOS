import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_CONFIG: AppConfig = {
  romsPath: "./roms",
  emulatorsPath: "./emulators",
  configPath: "./config",
  systems: [],
  language: "es",
  fullscreenOnStart: false,
  autoScanOnStartup: true,
  libretroCoversEnabled: true,
  coverSourcePriority: "libretro-first",
  firstRunCompleted: false,
  navSoundEnabled: true,
  navSoundVolume: 70,
  devMode: false,
};

export class ConfigManager {
  private config: AppConfig;
  private configFilePath: string;
  private projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot =
      projectRoot ?? resolve(__dirname, "..", "..");
    this.configFilePath = resolve(
      this.projectRoot,
      "config",
      "retro-launcher.json"
    );
    this.config = this.load();
  }

  private load(): AppConfig {
    if (existsSync(this.configFilePath)) {
      const raw = readFileSync(this.configFilePath, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
    return { ...DEFAULT_CONFIG };
  }

  save(): void {
    const dir = dirname(this.configFilePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(
      this.configFilePath,
      JSON.stringify(this.config, null, 2),
      "utf-8"
    );
  }

  get(): AppConfig {
    return { ...this.config };
  }

  getRomsPath(): string {
    return resolve(this.projectRoot, this.config.romsPath);
  }

  getEmulatorsPath(): string {
    return resolve(this.projectRoot, this.config.emulatorsPath);
  }

  update(partial: Partial<AppConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  getConfigFilePath(): string {
    return this.configFilePath;
  }

  exists(): boolean {
    return existsSync(this.configFilePath);
  }

  ensureDirectories(): void {
    const dirs = [this.getRomsPath(), this.getEmulatorsPath()];
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }
}
