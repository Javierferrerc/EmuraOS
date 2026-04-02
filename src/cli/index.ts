#!/usr/bin/env node

import { Command } from "commander";
import {
  ConfigManager,
  SystemsRegistry,
  EmulatorMapper,
  EmulatorDetector,
  SetupWizard,
} from "../core/index.js";
import { registerScanCommand } from "./commands/scan.js";
import { registerListCommand } from "./commands/list.js";
import { registerLaunchCommand } from "./commands/launch.js";
import { registerSetupCommand } from "./commands/setup.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerScrapeCommand } from "./commands/scrape.js";

const program = new Command();

program
  .name("retro-launcher")
  .description(
    "Open-source retro gaming frontend — detect ROMs, map emulators, launch games"
  )
  .version("0.1.0");

registerScanCommand(program);
registerListCommand(program);
registerLaunchCommand(program);
registerSetupCommand(program);
registerConfigCommand(program);
registerScrapeCommand(program);

// First-run check: if no config file and no subcommand, launch wizard
const config = new ConfigManager();
if (!config.exists() && process.argv.length <= 2) {
  const registry = new SystemsRegistry();
  const mapper = new EmulatorMapper();
  const detector = new EmulatorDetector(mapper);
  const wizard = new SetupWizard(config, detector, registry);
  wizard.run().then(() => program.parse());
} else {
  program.parse();
}
