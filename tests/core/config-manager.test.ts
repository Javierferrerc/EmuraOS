import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ConfigManager } from "../../src/core/config-manager.js";

const TEST_PROJECT_ROOT = resolve(import.meta.dirname, "__test_project__");

describe("ConfigManager", () => {
  beforeEach(() => {
    mkdirSync(TEST_PROJECT_ROOT, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
  });

  it("should return default config when no config file exists", () => {
    const manager = new ConfigManager(TEST_PROJECT_ROOT);
    const config = manager.get();

    expect(config.romsPath).toBe("./roms");
    expect(config.emulatorsPath).toBe("./emulators");
  });

  it("should resolve roms path relative to project root", () => {
    const manager = new ConfigManager(TEST_PROJECT_ROOT);
    const romsPath = manager.getRomsPath();

    expect(romsPath).toBe(resolve(TEST_PROJECT_ROOT, "roms"));
  });

  it("should save and reload config", () => {
    const manager = new ConfigManager(TEST_PROJECT_ROOT);
    manager.update({ romsPath: "./my-roms" });
    manager.save();

    expect(existsSync(manager.getConfigFilePath())).toBe(true);

    const manager2 = new ConfigManager(TEST_PROJECT_ROOT);
    expect(manager2.get().romsPath).toBe("./my-roms");
  });

  it("should create config directory if it does not exist", () => {
    const manager = new ConfigManager(TEST_PROJECT_ROOT);
    manager.save();

    const configDir = resolve(TEST_PROJECT_ROOT, "config");
    expect(existsSync(configDir)).toBe(true);
  });

  it("should ensure roms and emulators directories exist", () => {
    const manager = new ConfigManager(TEST_PROJECT_ROOT);
    manager.ensureDirectories();

    expect(existsSync(resolve(TEST_PROJECT_ROOT, "roms"))).toBe(true);
    expect(existsSync(resolve(TEST_PROJECT_ROOT, "emulators"))).toBe(true);
  });
});
