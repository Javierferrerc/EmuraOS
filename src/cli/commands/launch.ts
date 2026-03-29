import chalk from "chalk";
import type { Command } from "commander";
import {
  ConfigManager,
  SystemsRegistry,
  RomScanner,
  EmulatorMapper,
  GameLauncher,
} from "../../core/index.js";
import type { DiscoveredRom } from "../../core/index.js";

function findRom(
  query: string,
  systems: { systemId: string; systemName: string; roms: DiscoveredRom[] }[]
): DiscoveredRom | null {
  const lower = query.toLowerCase();

  // Exact filename match first
  for (const system of systems) {
    for (const rom of system.roms) {
      if (rom.fileName.toLowerCase() === lower) {
        return rom;
      }
    }
  }

  // Partial case-insensitive match
  const matches: DiscoveredRom[] = [];
  for (const system of systems) {
    for (const rom of system.roms) {
      if (rom.fileName.toLowerCase().includes(lower)) {
        matches.push(rom);
      }
    }
  }

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    console.log(chalk.yellow(`\n  Multiple ROMs match "${query}":\n`));
    for (const match of matches) {
      console.log(
        chalk.white(`    - ${match.fileName}`) +
          chalk.gray(` [${match.systemName}]`)
      );
    }
    console.log(
      chalk.gray("\n  Please use a more specific name.\n")
    );
    return null;
  }

  return null;
}

export function registerLaunchCommand(program: Command): void {
  program
    .command("launch <romName>")
    .description("Launch a ROM with the appropriate emulator")
    .option("-p, --path <path>", "Custom ROMs directory path")
    .option("-e, --emulators <path>", "Custom emulators directory path")
    .action(
      (romName: string, options: { path?: string; emulators?: string }) => {
        const config = new ConfigManager();
        const registry = new SystemsRegistry();
        const scanner = new RomScanner(registry);
        const mapper = new EmulatorMapper();
        const launcher = new GameLauncher(mapper);

        const romsPath = options.path ?? config.getRomsPath();
        const emulatorsPath = options.emulators ?? config.getEmulatorsPath();

        console.log(chalk.cyan("\n  Retro Launcher — Game Launcher\n"));

        // Scan for ROMs
        const result = scanner.scan(romsPath);

        if (result.totalRoms === 0) {
          console.log(
            chalk.yellow(
              "  No ROMs found. Run 'retro-launcher scan' to check your setup.\n"
            )
          );
          return;
        }

        // Find matching ROM
        const rom = findRom(romName, result.systems);

        if (!rom) {
          if (romName) {
            console.log(
              chalk.red(`\n  ROM not found: "${romName}"\n`)
            );
            console.log(
              chalk.gray(
                "  Use 'retro-launcher list' to see available ROMs.\n"
              )
            );
          }
          return;
        }

        console.log(
          chalk.white(`  ROM:      `) + chalk.green(rom.fileName)
        );
        console.log(
          chalk.white(`  System:   `) + chalk.green(rom.systemName)
        );

        // Launch
        const launchResult = launcher.launch(rom, emulatorsPath);

        if (!launchResult.success) {
          console.log(
            chalk.white(`  Emulator: `) +
              chalk.red("Not found")
          );
          console.log(
            chalk.red(`\n  Error: ${launchResult.error}\n`)
          );

          // Show compatible emulators for this system
          const compatible = mapper.getForSystem(rom.systemId);
          if (compatible.length > 0) {
            console.log(
              chalk.gray(`  Compatible emulators for ${rom.systemName}:`)
            );
            for (const emu of compatible) {
              console.log(
                chalk.gray(`    - ${emu.name} (${emu.executable})`)
              );
            }
            console.log();
          }

          console.log(
            chalk.gray(
              "  Run 'retro-launcher config --detect' to check installed emulators.\n"
            )
          );
          return;
        }

        console.log(
          chalk.white(`  Emulator: `) +
            chalk.green(launchResult.emulatorId)
        );
        console.log(
          chalk.white(`  Command:  `) +
            chalk.gray(launchResult.command)
        );
        console.log(
          chalk.white(`  PID:      `) +
            chalk.green(String(launchResult.pid ?? "N/A"))
        );
        console.log(
          chalk.green("\n  Game launched successfully!\n")
        );
      }
    );
}
