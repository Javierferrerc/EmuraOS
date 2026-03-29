import chalk from "chalk";
import type { Command } from "commander";
import { ConfigManager, SystemsRegistry, RomScanner } from "../../core/index.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Scan roms/ folder and list detected games by system")
    .option("-p, --path <path>", "Custom ROMs directory path")
    .action((options: { path?: string }) => {
      const config = new ConfigManager();
      const registry = new SystemsRegistry();
      const scanner = new RomScanner(registry);

      const romsPath = options.path ?? config.getRomsPath();

      console.log(chalk.cyan("\n  Retro Launcher — ROM Scanner\n"));
      console.log(chalk.gray(`  Scanning: ${romsPath}\n`));

      const result = scanner.scan(romsPath);

      if (result.totalRoms === 0) {
        console.log(
          chalk.yellow("  No ROMs found. Add ROM files to the roms/ subfolders.\n")
        );
        console.log(chalk.gray("  Scanning path: " + romsPath + "\n"));
        console.log(chalk.gray("  Expected folder structure:"));
        console.log(chalk.gray("    roms/"));
        console.log(chalk.gray("      nes/       → .nes, .unf"));
        console.log(chalk.gray("      snes/      → .sfc, .smc"));
        console.log(chalk.gray("      n64/       → .n64, .z64, .v64"));
        console.log(chalk.gray("      gb/        → .gb"));
        console.log(chalk.gray("      gba/       → .gba"));
        console.log(chalk.gray("      psx/       → .bin, .cue, .iso"));
        console.log(chalk.gray("      ...and more\n"));
        console.log(
          chalk.gray(
            "  To change ROM path: retro-launcher config set romsPath <path>\n"
          )
        );
        return;
      }

      for (const system of result.systems) {
        console.log(
          chalk.green(`  ${system.systemName}`) +
            chalk.gray(` (${system.roms.length} ROM${system.roms.length > 1 ? "s" : ""})`)
        );

        for (const rom of system.roms) {
          console.log(
            chalk.white(`    - ${rom.fileName}`) +
              chalk.gray(` [${formatBytes(rom.sizeBytes)}]`)
          );
        }
        console.log();
      }

      console.log(
        chalk.cyan(
          `  Total: ${result.totalRoms} ROM${result.totalRoms > 1 ? "s" : ""} across ${result.systems.length} system${result.systems.length > 1 ? "s" : ""}\n`
        )
      );
    });
}
