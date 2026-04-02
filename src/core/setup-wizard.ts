import chalk from "chalk";
import Enquirer from "enquirer";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { ConfigManager } from "./config-manager.js";
import type { EmulatorDetector } from "./emulator-detector.js";
import type { SystemsRegistry } from "./systems-registry.js";
import type { DetectionResult } from "./types.js";

// @ts-expect-error — enquirer CJS default export
const { Input } = Enquirer;

export class SetupWizard {
  private configManager: ConfigManager;
  private detector: EmulatorDetector;
  private registry: SystemsRegistry;

  constructor(
    configManager: ConfigManager,
    detector: EmulatorDetector,
    registry: SystemsRegistry
  ) {
    this.configManager = configManager;
    this.detector = detector;
    this.registry = registry;
  }

  async run(): Promise<void> {
    this.printWelcome();

    const romsPath = await this.askRomsPath();
    const emulatorsPath = await this.askEmulatorsPath();

    this.configManager.update({ romsPath, emulatorsPath });
    this.configManager.save();
    this.configManager.ensureDirectories();

    console.log(chalk.green("\n  Configuration saved.\n"));

    const detection = this.detector.detect(
      this.configManager.getEmulatorsPath()
    );

    // Create ROM directories for each system supported by detected emulators
    const detectedSystemIds = new Set(
      detection.detected.flatMap((emu) => emu.systems)
    );
    const resolvedRomsPath = this.configManager.getRomsPath();
    for (const systemId of detectedSystemIds) {
      const system = this.registry.getById(systemId);
      if (system) {
        mkdirSync(resolve(resolvedRomsPath, system.romFolder), {
          recursive: true,
        });
      }
    }

    this.printDetectionResults(detection);

    this.printComplete();
  }

  private printWelcome(): void {
    console.log(
      chalk.cyan("\n  ===================================")
    );
    console.log(
      chalk.cyan("   Retro Launcher — Setup Wizard")
    );
    console.log(
      chalk.cyan("  ===================================\n")
    );
    console.log(
      chalk.gray("  Configure your retro gaming setup.\n")
    );
  }

  private async askRomsPath(): Promise<string> {
    const prompt = new Input({
      message: "ROMs directory path",
      initial: "./roms",
    });
    return prompt.run() as Promise<string>;
  }

  private async askEmulatorsPath(): Promise<string> {
    const prompt = new Input({
      message: "Emulators directory path",
      initial: "./emulators",
    });
    return prompt.run() as Promise<string>;
  }

  printDetectionResults(detection: DetectionResult): void {
    console.log(
      chalk.cyan("  Emulator Detection Results\n")
    );

    if (detection.detected.length > 0) {
      for (const emu of detection.detected) {
        console.log(
          chalk.green(`  [FOUND] ${emu.name}`) +
            chalk.gray(` — ${emu.executablePath}`)
        );
        console.log(
          chalk.gray(`          Systems: ${emu.systems.join(", ")}`)
        );
      }
      console.log();
    }

    if (detection.notFound.length > 0) {
      console.log(
        chalk.yellow(
          `  Not found: ${detection.notFound.join(", ")}`
        )
      );
      console.log();
    }

    console.log(
      chalk.gray(
        `  Checked ${detection.totalChecked} emulator${detection.totalChecked !== 1 ? "s" : ""}, found ${detection.detected.length}.\n`
      )
    );
  }

  private printComplete(): void {
    console.log(chalk.cyan("  Setup complete! Next steps:\n"));
    console.log(
      chalk.white("    1. Add ROM files to your ROMs directory")
    );
    console.log(
      chalk.white("    2. Run ") +
        chalk.green("retro-launcher scan") +
        chalk.white(" to detect games")
    );
    console.log(
      chalk.white("    3. Run ") +
        chalk.green("retro-launcher launch <rom>") +
        chalk.white(" to play\n")
    );
  }
}
