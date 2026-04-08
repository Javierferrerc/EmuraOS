import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { EmulatorMapper } from "../../src/core/emulator-mapper.js";

const TEST_DIR = resolve(import.meta.dirname, "__test_emulators__");

describe("EmulatorMapper", () => {
  let mapper: EmulatorMapper;

  beforeEach(() => {
    mapper = new EmulatorMapper();
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("should load emulators from JSON", () => {
    const all = mapper.getAll();
    expect(all.length).toBe(16);
  });

  it("should get emulator by id", () => {
    const retroarch = mapper.getById("retroarch");
    expect(retroarch).toBeDefined();
    expect(retroarch!.name).toBe("RetroArch");
    expect(retroarch!.systems).toContain("nes");
  });

  it("should return undefined for unknown id", () => {
    const unknown = mapper.getById("nonexistent");
    expect(unknown).toBeUndefined();
  });

  it("should get emulators for a system", () => {
    const snesEmulators = mapper.getForSystem("snes");
    expect(snesEmulators.length).toBeGreaterThanOrEqual(2);

    const ids = snesEmulators.map((e) => e.id);
    expect(ids).toContain("retroarch");
    expect(ids).toContain("snes9x");
  });

  it("should return empty array for unknown system", () => {
    const emulators = mapper.getForSystem("atari2600");
    expect(emulators).toHaveLength(0);
  });

  it("should resolve emulator when executable exists in emulatorsPath", () => {
    // Use isolated mapper so defaultPaths don't find real system emulators
    const customData = [
      {
        id: "snes9x",
        name: "Snes9x",
        executable: "snes9x-x64.exe",
        defaultPaths: [],
        systems: ["snes"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
    ];
    const customPath = resolve(TEST_DIR, "resolve-emulators.json");
    writeFileSync(customPath, JSON.stringify(customData));
    const isolatedMapper = new EmulatorMapper(customPath);

    const emuDir = resolve(TEST_DIR, "snes9x");
    mkdirSync(emuDir, { recursive: true });
    writeFileSync(resolve(emuDir, "snes9x-x64.exe"), "fake-exe");

    const resolved = isolatedMapper.resolve("snes", TEST_DIR);
    expect(resolved).not.toBeNull();
    expect(resolved!.definition.id).toBe("snes9x");
    expect(resolved!.systemId).toBe("snes");
    expect(resolved!.executablePath).toContain("snes9x-x64.exe");
  });

  it("should return null when no emulator executable is found", () => {
    // Use isolated mapper so defaultPaths don't find real system emulators
    const customData = [
      {
        id: "snes9x",
        name: "Snes9x",
        executable: "snes9x-x64.exe",
        defaultPaths: [],
        systems: ["snes"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
    ];
    const customPath = resolve(TEST_DIR, "null-emulators.json");
    writeFileSync(customPath, JSON.stringify(customData));
    const isolatedMapper = new EmulatorMapper(customPath);

    const resolved = isolatedMapper.resolve("snes", TEST_DIR);
    expect(resolved).toBeNull();
  });

  it("should resolve emulator from flat emulatorsPath", () => {
    // Use isolated mapper so defaultPaths don't find real system emulators
    const customData = [
      {
        id: "mgba",
        name: "mGBA",
        executable: "mGBA.exe",
        defaultPaths: [],
        systems: ["gba"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
    ];
    const customPath = resolve(TEST_DIR, "flat-emulators.json");
    writeFileSync(customPath, JSON.stringify(customData));
    const isolatedMapper = new EmulatorMapper(customPath);

    writeFileSync(resolve(TEST_DIR, "mGBA.exe"), "fake-exe");

    const resolved = isolatedMapper.resolve("gba", TEST_DIR);
    expect(resolved).not.toBeNull();
    expect(resolved!.definition.id).toBe("mgba");
  });

  it("should load from custom JSON path", () => {
    const customData = [
      {
        id: "test-emu",
        name: "Test Emulator",
        executable: "test.exe",
        defaultPaths: [],
        systems: ["nes"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
    ];
    const customPath = resolve(TEST_DIR, "custom-emulators.json");
    writeFileSync(customPath, JSON.stringify(customData));

    const customMapper = new EmulatorMapper(customPath);
    expect(customMapper.getAll()).toHaveLength(1);
    expect(customMapper.getById("test-emu")).toBeDefined();
  });
});
