import chalk from "chalk";
import type { Command } from "commander";
import {
  ConfigManager,
  SystemsRegistry,
  RomScanner,
} from "../../core/index.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List detected ROMs, optionally filtered by system")
    .option("-s, --system <system>", "Filter by system ID (e.g. snes, nes)")
    .option("-p, --path <path>", "Custom ROMs directory path")
    .action((options: { system?: string; path?: string }) => {
      const config = new ConfigManager();
      const registry = new SystemsRegistry();
      const scanner = new RomScanner(registry);

      const romsPath = options.path ?? config.getRomsPath();

      console.log(chalk.cyan("\n  Retro Launcher — ROM List\n"));

      const result = scanner.scan(romsPath);

      if (result.totalRoms === 0) {
        console.log(
          chalk.yellow(
            "  No ROMs found. Run 'retro-launcher scan' to check your setup."
          )
        );
        console.log();
        return;
      }

      let filteredSystems = result.systems;
      if (options.system) {
        filteredSystems = result.systems.filter(
          (s) => s.systemId === options.system
        );
        if (filteredSystems.length === 0) {
          console.log(
            chalk.yellow(
              `  No ROMs found for system "${options.system}".`
            )
          );
          console.log(
            chalk.gray(
              `  Available systems: ${result.systems.map((s) => s.systemId).join(", ")}`
            )
          );
          console.log();
          return;
        }
      }

      let globalIndex = 1;
      for (const system of filteredSystems) {
        console.log(
          chalk.green(`  ${system.systemName}`) +
            chalk.gray(
              ` (${system.roms.length} ROM${system.roms.length > 1 ? "s" : ""})`
            )
        );

        for (const rom of system.roms) {
          console.log(
            chalk.gray(`    ${String(globalIndex).padStart(3)}.`) +
              chalk.white(` ${rom.fileName}`) +
              chalk.gray(` [${formatBytes(rom.sizeBytes)}]`)
          );
          globalIndex++;
        }
        console.log();
      }

      const totalFiltered = filteredSystems.reduce(
        (sum, s) => sum + s.roms.length,
        0
      );
      console.log(
        chalk.cyan(
          `  Total: ${totalFiltered} ROM${totalFiltered > 1 ? "s" : ""} across ${filteredSystems.length} system${filteredSystems.length > 1 ? "s" : ""}\n`
        )
      );
    });
}
