import chalk from "chalk";
import type { Command } from "commander";
import { UserLibrary } from "../../core/index.js";

export function registerRecentCommand(program: Command): void {
  program
    .command("recent")
    .description("Show recently played games")
    .option("-n, --count <number>", "Number of recent games to show", "10")
    .action((options: { count: string }) => {
      const lib = new UserLibrary();
      const limit = parseInt(options.count, 10) || 10;
      const recent = lib.getRecentlyPlayed(limit);

      console.log(chalk.cyan("\n  Retro Launcher — Recently Played\n"));

      if (recent.length === 0) {
        console.log(
          chalk.gray("  No recently played games yet. Launch a game to start tracking.\n")
        );
        return;
      }

      for (let i = 0; i < recent.length; i++) {
        const { systemId, fileName } = UserLibrary.parseKey(recent[i]);
        const record = lib.getPlayRecord(systemId, fileName);
        const plays = record ? ` (${record.playCount}x)` : "";
        console.log(
          chalk.white(`  ${i + 1}. ${fileName}`) +
            chalk.gray(` [${systemId}]`) +
            chalk.yellow(plays)
        );
      }
      console.log();
    });
}
