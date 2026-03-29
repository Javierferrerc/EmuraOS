import type { Command } from "commander";
import {
  ConfigManager,
  EmulatorMapper,
  EmulatorDetector,
  SetupWizard,
} from "../../core/index.js";

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Run the interactive setup wizard")
    .action(async () => {
      const config = new ConfigManager();
      const mapper = new EmulatorMapper();
      const detector = new EmulatorDetector(mapper);
      const wizard = new SetupWizard(config, detector);

      await wizard.run();
    });
}
