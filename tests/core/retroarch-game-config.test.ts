import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import {
  coreShortId,
  coreDisplayName,
  resolveRetroArchConfigDir,
  readRetroArchGameConfig,
  writeRetroArchGameConfig,
} from "../../src/core/retroarch-game-config.js";

const TEST_ROOT = resolve(
  import.meta.dirname,
  "__test_retroarch_game_config__"
);

describe("retroarch-game-config", () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
  });
  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  describe("coreShortId + coreDisplayName", () => {
    it("reduces a windows core arg to its short id", () => {
      expect(coreShortId("cores\\snes9x_libretro.dll")).toBe("snes9x");
      expect(coreShortId("cores/genesis_plus_gx_libretro.dll")).toBe(
        "genesis_plus_gx"
      );
      expect(coreShortId("mgba_libretro")).toBe("mgba");
    });

    it("maps known cores to their RetroArch display name", () => {
      expect(coreDisplayName("cores\\snes9x_libretro.dll")).toBe("Snes9x");
      expect(coreDisplayName("cores\\genesis_plus_gx_libretro.dll")).toBe(
        "Genesis Plus GX"
      );
      expect(coreDisplayName("cores\\mednafen_psx_hw_libretro.dll")).toBe(
        "Beetle PSX HW"
      );
    });

    it("returns null for an unmapped core so callers can skip writing", () => {
      expect(coreDisplayName("cores\\some_unknown_libretro.dll")).toBe(null);
    });
  });

  describe("writeRetroArchGameConfig + readRetroArchGameConfig", () => {
    const core = "Snes9x";
    const romPath = "D:/roms/snes/Super Mario World.sfc";

    it("writes the override into config/<Core>/<rom>.cfg with cfg keys", () => {
      const configDir = path.join(TEST_ROOT, "config");
      const { configPath } = writeRetroArchGameConfig(configDir, core, romPath, {
        bilinearFilter: true,
        integerScale: true,
        aspectRatio: 1,
        runAhead: true,
        runAheadFrames: 2,
      });
      // Folder name is the core display name; file stem is the rom basename.
      expect(configPath).toBe(
        path.join(configDir, "Snes9x", "Super Mario World.cfg")
      );
      expect(existsSync(configPath)).toBe(true);
      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain('video_smooth = "true"');
      expect(content).toContain('video_scale_integer = "true"');
      expect(content).toContain('aspect_ratio_index = "1"');
      expect(content).toContain('run_ahead_enabled = "true"');
      expect(content).toContain('run_ahead_frames = "2"');
    });

    it("round-trips via the curated reader", () => {
      const configDir = path.join(TEST_ROOT, "config");
      writeRetroArchGameConfig(configDir, core, romPath, {
        bilinearFilter: true,
        aspectRatio: 0,
        rewind: true,
      });
      const result = readRetroArchGameConfig(configDir, core, romPath);
      expect(result.bilinearFilter).toBe(true);
      expect(result.aspectRatio).toBe(0);
      expect(result.rewind).toBe(true);
      expect(result.integerScale).toBeUndefined();
    });

    it("preserves unknown keys the user hand-added", () => {
      const configDir = path.join(TEST_ROOT, "config");
      const dir = path.join(configDir, core);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path.join(dir, "Super Mario World.cfg"),
        'custom_shader = "crt.glslp"\n'
      );
      writeRetroArchGameConfig(configDir, core, romPath, {
        bilinearFilter: true,
      });
      const content = readFileSync(
        path.join(dir, "Super Mario World.cfg"),
        "utf-8"
      );
      expect(content).toContain('custom_shader = "crt.glslp"');
      expect(content).toContain('video_smooth = "true"');
    });

    it("removes a key when its value is cleared on a later write", () => {
      const configDir = path.join(TEST_ROOT, "config");
      writeRetroArchGameConfig(configDir, core, romPath, {
        bilinearFilter: true,
      });
      writeRetroArchGameConfig(configDir, core, romPath, {
        bilinearFilter: null as unknown as undefined,
      });
      const result = readRetroArchGameConfig(configDir, core, romPath);
      expect(result.bilinearFilter).toBeUndefined();
    });
  });

  describe("resolveRetroArchConfigDir", () => {
    it("uses the portable config dir when portable.ini is present", () => {
      const installDir = path.join(TEST_ROOT, "RetroArch");
      mkdirSync(installDir, { recursive: true });
      writeFileSync(path.join(installDir, "portable.ini"), "");
      const exe = path.join(installDir, "retroarch.exe");
      const result = resolveRetroArchConfigDir(
        exe,
        path.join(TEST_ROOT, "appdata")
      );
      expect(result).toBe(path.join(installDir, "config"));
    });

    it("prefers the portable layout next to the exe by default", () => {
      const installDir = path.join(TEST_ROOT, "RetroArch");
      mkdirSync(installDir, { recursive: true });
      const exe = path.join(installDir, "retroarch.exe");
      const result = resolveRetroArchConfigDir(
        exe,
        path.join(TEST_ROOT, "appdata")
      );
      expect(result).toBe(path.join(installDir, "config"));
    });

    it("returns null when no exe and no roaming config exist", () => {
      const result = resolveRetroArchConfigDir(
        null,
        path.join(TEST_ROOT, "appdata")
      );
      expect(result).toBe(null);
    });
  });
});
