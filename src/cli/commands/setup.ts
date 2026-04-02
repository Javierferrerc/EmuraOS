import type { Command } from "commander";
import {
  ConfigManager,
  SystemsRegistry,
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
      const registry = new SystemsRegistry();
      const mapper = new EmulatorMapper();
      const detector = new EmulatorDetector(mapper);
      const wizard = new SetupWizard(config, detector, registry);

      await wizard.run();
    });
}
