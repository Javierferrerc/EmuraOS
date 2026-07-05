import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ConfigManager,
  SECRET_MASK,
} from "../../src/core/config-manager.js";

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

  describe("getPublicConfig (secret redaction)", () => {
    it("masks user-entered secrets and drops the derived token", () => {
      const manager = new ConfigManager(TEST_PROJECT_ROOT);
      manager.update({
        steamGridDbApiKey: "sgdb-real-key",
        retroAchievementsPassword: "hunter2",
        retroAchievementsWebApiKey: "web-key",
        retroAchievementsToken: "derived-token",
        screenScraperDevPassword: "dev-pass",
        screenScraperUserPassword: "user-pass",
        retroAchievementsUsername: "player1",
      });

      const pub = manager.getPublicConfig();

      expect(pub.steamGridDbApiKey).toBe(SECRET_MASK);
      expect(pub.retroAchievementsPassword).toBe(SECRET_MASK);
      expect(pub.retroAchievementsWebApiKey).toBe(SECRET_MASK);
      expect(pub.screenScraperDevPassword).toBe(SECRET_MASK);
      expect(pub.screenScraperUserPassword).toBe(SECRET_MASK);
      // Derived token is removed entirely — the renderer never needs it.
      expect(pub.retroAchievementsToken).toBeUndefined();
      // Non-secret fields pass through untouched.
      expect(pub.retroAchievementsUsername).toBe("player1");
    });

    it("leaves unset secrets empty (no mask on empty values)", () => {
      const manager = new ConfigManager(TEST_PROJECT_ROOT);
      const pub = manager.getPublicConfig();
      expect(pub.steamGridDbApiKey).toBeUndefined();
      expect(pub.retroAchievementsPassword).toBeUndefined();
    });

    it("does not persist a masked secret echoed back via update()", () => {
      const manager = new ConfigManager(TEST_PROJECT_ROOT);
      manager.update({ steamGridDbApiKey: "sgdb-real-key" });

      // Renderer echoes the masked value back — must not clobber the real one.
      manager.update({ steamGridDbApiKey: SECRET_MASK });
      expect(manager.get().steamGridDbApiKey).toBe("sgdb-real-key");

      // A genuine new value still overwrites.
      manager.update({ steamGridDbApiKey: "new-key" });
      expect(manager.get().steamGridDbApiKey).toBe("new-key");
    });
  });

  describe("defensive load", () => {
    it("falls back to defaults on corrupt JSON instead of throwing", () => {
      const manager = new ConfigManager(TEST_PROJECT_ROOT);
      manager.save();
      writeFileSync(manager.getConfigFilePath(), "{ not valid json", "utf-8");

      const reloaded = new ConfigManager(TEST_PROJECT_ROOT);
      expect(reloaded.get().romsPath).toBe("./roms");
    });

    it("ignores prototype-polluting keys in the config file", () => {
      const manager = new ConfigManager(TEST_PROJECT_ROOT);
      manager.save();
      writeFileSync(
        manager.getConfigFilePath(),
        '{ "__proto__": { "polluted": true }, "romsPath": "./ok" }',
        "utf-8"
      );

      const reloaded = new ConfigManager(TEST_PROJECT_ROOT);
      expect(reloaded.get().romsPath).toBe("./ok");
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  it("should return false for exists() when no config file, true after save()", () => {
    const manager = new ConfigManager(TEST_PROJECT_ROOT);
    expect(manager.exists()).toBe(false);

    manager.save();
    expect(manager.exists()).toBe(true);
  });
});
