import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { EmulatorMapper } from "../../src/core/emulator-mapper.js";
import { EmulatorDetector } from "../../src/core/emulator-detector.js";

const TEST_DIR = resolve(import.meta.dirname, "__test_detector__");

function createCustomMapper(emulators: object[]): EmulatorMapper {
  const jsonPath = resolve(TEST_DIR, "emulators.json");
  writeFileSync(jsonPath, JSON.stringify(emulators));
  return new EmulatorMapper(jsonPath);
}

describe("EmulatorDetector", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("should return empty detected array when no emulators are found", () => {
    const mapper = createCustomMapper([
      {
        id: "test-emu",
        name: "Test",
        executable: "test.exe",
        defaultPaths: [],
        systems: ["nes"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
    ]);
    const detector = new EmulatorDetector(mapper);
    const result = detector.detect(TEST_DIR);

    expect(result.detected).toHaveLength(0);
    expect(result.notFound).toContain("test-emu");
  });

  it("should report totalChecked equal to number of emulators", () => {
    const mapper = createCustomMapper([
      {
        id: "emu1",
        name: "Emu1",
        executable: "emu1.exe",
        defaultPaths: [],
        systems: ["nes"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
      {
        id: "emu2",
        name: "Emu2",
        executable: "emu2.exe",
        defaultPaths: [],
        systems: ["snes"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
    ]);
    const detector = new EmulatorDetector(mapper);
    const result = detector.detect(TEST_DIR);

    expect(result.totalChecked).toBe(2);
  });

  it("should detect emulator in nested path (emulatorsPath/<id>/<exe>)", () => {
    const mapper = createCustomMapper([
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
    ]);

    const nestedDir = resolve(TEST_DIR, "snes9x");
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(resolve(nestedDir, "snes9x-x64.exe"), "fake");

    const detector = new EmulatorDetector(mapper);
    const result = detector.detect(TEST_DIR);

    expect(result.detected).toHaveLength(1);
    expect(result.detected[0].id).toBe("snes9x");
  });

  it("should detect emulator in flat path (emulatorsPath/<exe>)", () => {
    const mapper = createCustomMapper([
      {
        id: "mgba",
        name: "mGBA",
        executable: "mGBA.exe",
        defaultPaths: [],
        systems: ["gb", "gbc", "gba"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
    ]);

    writeFileSync(resolve(TEST_DIR, "mGBA.exe"), "fake");

    const detector = new EmulatorDetector(mapper);
    const result = detector.detect(TEST_DIR);

    expect(result.detected).toHaveLength(1);
    expect(result.detected[0].id).toBe("mgba");
  });

  it("should set source to 'emulatorsPath' when found in emulators directory", () => {
    const mapper = createCustomMapper([
      {
        id: "test-emu",
        name: "Test",
        executable: "test.exe",
        defaultPaths: [],
        systems: ["nes"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
    ]);

    writeFileSync(resolve(TEST_DIR, "test.exe"), "fake");

    const detector = new EmulatorDetector(mapper);
    const result = detector.detect(TEST_DIR);

    expect(result.detected[0].source).toBe("emulatorsPath");
  });

  it("should include systems in detected emulator", () => {
    const mapper = createCustomMapper([
      {
        id: "multi-emu",
        name: "Multi",
        executable: "multi.exe",
        defaultPaths: [],
        systems: ["nes", "snes", "gb"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
    ]);

    writeFileSync(resolve(TEST_DIR, "multi.exe"), "fake");

    const detector = new EmulatorDetector(mapper);
    const result = detector.detect(TEST_DIR);

    expect(result.detected[0].systems).toEqual(["nes", "snes", "gb"]);
  });

  it("should detect multiple emulators", () => {
    const mapper = createCustomMapper([
      {
        id: "emu1",
        name: "Emu1",
        executable: "emu1.exe",
        defaultPaths: [],
        systems: ["nes"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
      {
        id: "emu2",
        name: "Emu2",
        executable: "emu2.exe",
        defaultPaths: [],
        systems: ["snes"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
    ]);

    writeFileSync(resolve(TEST_DIR, "emu1.exe"), "fake");
    writeFileSync(resolve(TEST_DIR, "emu2.exe"), "fake");

    const detector = new EmulatorDetector(mapper);
    const result = detector.detect(TEST_DIR);

    expect(result.detected).toHaveLength(2);
    expect(result.notFound).toHaveLength(0);
  });

  it("should add missing emulators to notFound", () => {
    const mapper = createCustomMapper([
      {
        id: "found-emu",
        name: "Found",
        executable: "found.exe",
        defaultPaths: [],
        systems: ["nes"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
      {
        id: "missing-emu",
        name: "Missing",
        executable: "missing.exe",
        defaultPaths: [],
        systems: ["snes"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
    ]);

    writeFileSync(resolve(TEST_DIR, "found.exe"), "fake");

    const detector = new EmulatorDetector(mapper);
    const result = detector.detect(TEST_DIR);

    expect(result.detected).toHaveLength(1);
    expect(result.notFound).toEqual(["missing-emu"]);
  });

  it("should detect emulator from defaultPaths", () => {
    const defaultDir = resolve(TEST_DIR, "default-location");
    mkdirSync(defaultDir, { recursive: true });
    writeFileSync(resolve(defaultDir, "retroarch.exe"), "fake");

    const mapper = createCustomMapper([
      {
        id: "retroarch",
        name: "RetroArch",
        executable: "retroarch.exe",
        defaultPaths: [defaultDir],
        systems: ["nes", "snes"],
        launchTemplate: "\"{executable}\" \"{romPath}\"",
        args: {},
        defaultArgs: "",
      },
    ]);

    const detector = new EmulatorDetector(mapper);
    // Detect without emulatorsPath to test defaultPaths
    const result = detector.detect();

    expect(result.detected).toHaveLength(1);
    expect(result.detected[0].source).toBe("defaultPath");
    expect(result.detected[0].executablePath).toContain("retroarch.exe");
  });
});
