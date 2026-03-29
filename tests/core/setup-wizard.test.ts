import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ConfigManager } from "../../src/core/config-manager.js";
import { EmulatorMapper } from "../../src/core/emulator-mapper.js";
import { EmulatorDetector } from "../../src/core/emulator-detector.js";
import { SetupWizard } from "../../src/core/setup-wizard.js";
import type { DetectionResult } from "../../src/core/types.js";

// Mock enquirer — Input prompt returns its initial value without user interaction
vi.mock("enquirer", () => {
  class Input {
    private initial: string;
    constructor(opts: { initial: string }) {
      this.initial = opts.initial;
    }
    run() {
      return Promise.resolve(this.initial);
    }
  }
  return { default: { Input }, Input };
});

const TEST_DIR = resolve(import.meta.dirname, "__test_wizard__");

describe("SetupWizard", () => {
  let configManager: ConfigManager;
  let detector: EmulatorDetector;
  let wizard: SetupWizard;

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    configManager = new ConfigManager(TEST_DIR);
    const mapper = new EmulatorMapper();
    detector = new EmulatorDetector(mapper);
    wizard = new SetupWizard(configManager, detector);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("should save config after running wizard", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await wizard.run();

    expect(existsSync(configManager.getConfigFilePath())).toBe(true);
    const config = configManager.get();
    expect(config.romsPath).toBe("./roms");
    expect(config.emulatorsPath).toBe("./emulators");

    consoleSpy.mockRestore();
  });

  it("should print found emulators in detection results", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const detection: DetectionResult = {
      detected: [
        {
          id: "retroarch",
          name: "RetroArch",
          executablePath: "C:\\RetroArch\\retroarch.exe",
          systems: ["nes", "snes"],
          source: "defaultPath",
        },
      ],
      notFound: ["snes9x"],
      totalChecked: 2,
    };

    wizard.printDetectionResults(detection);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("RetroArch");
    expect(output).toContain("[FOUND]");
    expect(output).toContain("snes9x");

    consoleSpy.mockRestore();
  });

  it("should handle empty detection results", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const detection: DetectionResult = {
      detected: [],
      notFound: ["retroarch", "snes9x"],
      totalChecked: 2,
    };

    wizard.printDetectionResults(detection);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Not found");
    expect(output).toContain("found 0");

    consoleSpy.mockRestore();
  });

  it("should print complete message after setup", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await wizard.run();

    const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Setup complete");
    expect(output).toContain("retro-launcher scan");

    consoleSpy.mockRestore();
  });
});
