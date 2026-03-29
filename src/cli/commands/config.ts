import chalk from "chalk";
import type { Command } from "commander";
import {
  ConfigManager,
  EmulatorMapper,
  EmulatorDetector,
  SetupWizard,
} from "../../core/index.js";

const VALID_KEYS = ["romsPath", "emulatorsPath"] as const;
type ConfigKey = (typeof VALID_KEYS)[number];

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command("config")
    .description("View or modify configuration")
    .option("--detect", "Auto-detect installed emulators")
    .option("--wizard", "Re-run the setup wizard")
    .action(async (options: { detect?: boolean; wizard?: boolean }) => {
      const config = new ConfigManager();

      if (options.wizard) {
        const mapper = new EmulatorMapper();
        const detector = new EmulatorDetector(mapper);
        const wizard = new SetupWizard(config, detector);
        await wizard.run();
        return;
      }

      if (options.detect) {
        const mapper = new EmulatorMapper();
        const detector = new EmulatorDetector(mapper);
        const wizard = new SetupWizard(config, detector);
        const detection = detector.detect(config.getEmulatorsPath());

        console.log(chalk.cyan("\n  Retro Launcher — Emulator Detection\n"));
        wizard.printDetectionResults(detection);
        return;
      }

      // Default: show current config
      const appConfig = config.get();
      console.log(chalk.cyan("\n  Retro Launcher — Configuration\n"));
      console.log(
        chalk.white("  romsPath:      ") +
          chalk.green(appConfig.romsPath)
      );
      console.log(
        chalk.white("  emulatorsPath: ") +
          chalk.green(appConfig.emulatorsPath)
      );
      console.log(
        chalk.white("  configFile:    ") +
          chalk.gray(config.getConfigFilePath())
      );
      console.log();
    });

  configCmd
    .command("set <key> <value>")
    .description("Set a configuration value (romsPath, emulatorsPath)")
    .action((key: string, value: string) => {
      if (!VALID_KEYS.includes(key as ConfigKey)) {
        console.log(
          chalk.red(`\n  Invalid key: "${key}"`)
        );
        console.log(
          chalk.gray(
            `  Valid keys: ${VALID_KEYS.join(", ")}\n`
          )
        );
        return;
      }

      const config = new ConfigManager();
      config.update({ [key]: value });
      config.save();

      console.log(
        chalk.green(`\n  Updated ${key} = "${value}"`)
      );
      console.log(
        chalk.gray(`  Saved to ${config.getConfigFilePath()}\n`)
      );
    });
}
