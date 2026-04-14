import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { EmulatorMapper } from "../../src/core/emulator-mapper.js";
import { GameLauncher } from "../../src/core/game-launcher.js";
import type {
  ResolvedEmulator,
  DiscoveredRom,
} from "../../src/core/types.js";

const TEST_DIR = resolve(import.meta.dirname, "__test_launcher__");

describe("GameLauncher", () => {
  let mapper: EmulatorMapper;
  let launcher: GameLauncher;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    mapper = new EmulatorMapper();
    launcher = new GameLauncher(mapper);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("should build a simple command from template", () => {
    const resolved: ResolvedEmulator = {
      definition: {
        id: "snes9x",
        name: "Snes9x",
        executable: "snes9x-x64.exe",
        defaultPaths: [],
        systems: ["snes"],
        launchTemplate: '"{executable}" "{romPath}"',
        args: {},
        defaultArgs: "",
      },
      executablePath: "C:\\Snes9x\\snes9x-x64.exe",
      systemId: "snes",
    };

    const command = launcher.buildCommand(
      resolved,
      "C:\\roms\\snes\\SuperMarioWorld.sfc"
    );
    expect(command).toBe(
      '"C:\\Snes9x\\snes9x-x64.exe" "C:\\roms\\snes\\SuperMarioWorld.sfc"'
    );
  });

  it("should build a command with per-system args", () => {
    const resolved: ResolvedEmulator = {
      definition: {
        id: "retroarch",
        name: "RetroArch",
        executable: "retroarch.exe",
        defaultPaths: [],
        systems: ["nes", "snes"],
        launchTemplate: '"{executable}" -L "{args}" "{romPath}"',
        args: {
          nes: "cores\\fceumm_libretro.dll",
          snes: "cores\\snes9x_libretro.dll",
        },
        defaultArgs: "",
      },
      executablePath: "C:\\RetroArch\\retroarch.exe",
      systemId: "snes",
    };

    const command = launcher.buildCommand(
      resolved,
      "C:\\roms\\snes\\SuperMarioWorld.sfc"
    );
    expect(command).toBe(
      '"C:\\RetroArch\\retroarch.exe" -L "cores\\snes9x_libretro.dll" "C:\\roms\\snes\\SuperMarioWorld.sfc"'
    );
  });

  it("should clean double spaces when args is empty", () => {
    const resolved: ResolvedEmulator = {
      definition: {
        id: "test-emu",
        name: "Test",
        executable: "test.exe",
        defaultPaths: [],
        systems: ["nes"],
        launchTemplate: '"{executable}" -L "{args}" "{romPath}"',
        args: {},
        defaultArgs: "",
      },
      executablePath: "C:\\test.exe",
      systemId: "nes",
    };

    const command = launcher.buildCommand(
      resolved,
      "C:\\roms\\nes\\game.nes"
    );
    // Should not have double spaces from empty {args}
    expect(command).not.toContain("  ");
    expect(command).toContain('"C:\\test.exe"');
    expect(command).toContain('"C:\\roms\\nes\\game.nes"');
  });

  it("should launch with a specific emulatorId", () => {
    const customData = [
      {
        id: "retroarch",
        name: "RetroArch",
        executable: "retroarch.exe",
        defaultPaths: [],
        systems: ["snes"],
        launchTemplate: '"{executable}" "{romPath}"',
        args: {},
        defaultArgs: "",
      },
      {
        id: "snes9x",
        name: "Snes9x",
        executable: "snes9x-x64.exe",
        defaultPaths: [],
        systems: ["snes"],
        launchTemplate: '"{executable}" "{romPath}"',
        args: {},
        defaultArgs: "",
      },
    ];
    const customPath = resolve(TEST_DIR, "emu-select.json");
    writeFileSync(customPath, JSON.stringify(customData));
    const isolatedMapper = new EmulatorMapper(customPath);
    const isolatedLauncher = new GameLauncher(isolatedMapper);

    // Create only snes9x executable — retroarch is NOT present
    const snesDir = resolve(TEST_DIR, "snes9x");
    mkdirSync(snesDir, { recursive: true });
    writeFileSync(resolve(snesDir, "snes9x-x64.exe"), "fake-exe");

    const rom: DiscoveredRom = {
      fileName: "Game.sfc",
      filePath: "C:\\roms\\snes\\Game.sfc",
      systemId: "snes",
      systemName: "Super Nintendo",
      sizeBytes: 2048,
    };

    // Without emulatorId — should fail because retroarch (first candidate)
    // is not installed, but snes9x IS installed so resolve() would find
    // snes9x since retroarch isn't there. Actually resolve() iterates
    // candidates in order, so it'll skip retroarch and find snes9x.
    const resultDefault = isolatedLauncher.launch(rom, TEST_DIR);
    expect(resultDefault.emulatorId).toBe("snes9x");

    // With explicit emulatorId=snes9x — should use snes9x
    const resultExplicit = isolatedLauncher.launch(rom, TEST_DIR, "snes9x");
    expect(resultExplicit.emulatorId).toBe("snes9x");
  });

  it("should return error when specified emulatorId is not found", () => {
    const customData = [
      {
        id: "snes9x",
        name: "Snes9x",
        executable: "snes9x-x64.exe",
        defaultPaths: [],
        systems: ["snes"],
        launchTemplate: '"{executable}" "{romPath}"',
        args: {},
        defaultArgs: "",
      },
    ];
    const customPath = resolve(TEST_DIR, "emu-notfound.json");
    writeFileSync(customPath, JSON.stringify(customData));
    const isolatedMapper = new EmulatorMapper(customPath);
    const isolatedLauncher = new GameLauncher(isolatedMapper);

    const rom: DiscoveredRom = {
      fileName: "Game.sfc",
      filePath: "C:\\roms\\snes\\Game.sfc",
      systemId: "snes",
      systemName: "Super Nintendo",
      sizeBytes: 2048,
    };

    const result = isolatedLauncher.launch(rom, TEST_DIR, "nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toContain("No emulator found");
  });

  it("should return error when no emulator is found", () => {
    // Use isolated mapper so defaultPaths don't find real system emulators
    const customData = [
      {
        id: "fake-emu",
        name: "Fake",
        executable: "fake.exe",
        defaultPaths: [],
        systems: ["nes"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
    ];
    const customPath = resolve(TEST_DIR, "no-emu.json");
    writeFileSync(customPath, JSON.stringify(customData));
    const isolatedMapper = new EmulatorMapper(customPath);
    const isolatedLauncher = new GameLauncher(isolatedMapper);

    const rom: DiscoveredRom = {
      fileName: "Game.nes",
      filePath: "C:\\roms\\nes\\Game.nes",
      systemId: "nes",
      systemName: "Nintendo Entertainment System",
      sizeBytes: 1024,
    };

    // Use a path with no emulator executables
    const result = isolatedLauncher.launch(rom, TEST_DIR);
    expect(result.success).toBe(false);
    expect(result.error).toContain("No emulator found");
    expect(result.romPath).toBe(rom.filePath);
  });
});
