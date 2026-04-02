import chalk from "chalk";
import type { Command } from "commander";
import { UserLibrary } from "../../core/index.js";

export function registerFavoritesCommand(program: Command): void {
  const favCmd = program
    .command("favorites")
    .description("Manage favorite ROMs");

  favCmd
    .command("list", { isDefault: true })
    .description("List all favorites")
    .action(() => {
      const lib = new UserLibrary();
      const favorites = lib.getFavorites();

      console.log(chalk.cyan("\n  Retro Launcher — Favorites\n"));

      if (favorites.length === 0) {
        console.log(chalk.gray("  No favorites yet. Add one with:"));
        console.log(
          chalk.gray("    retro-launcher favorites add <systemId> <romFileName>\n")
        );
        return;
      }

      for (const key of favorites) {
        const { systemId, fileName } = UserLibrary.parseKey(key);
        console.log(
          chalk.white(`    ${fileName}`) +
            chalk.gray(` [${systemId}]`)
        );
      }
      console.log(
        chalk.cyan(
          `\n  Total: ${favorites.length} favorite${favorites.length > 1 ? "s" : ""}\n`
        )
      );
    });

  favCmd
    .command("add <systemId> <romFileName>")
    .description("Add a ROM to favorites")
    .action((systemId: string, romFileName: string) => {
      const lib = new UserLibrary();
      if (lib.isFavorite(systemId, romFileName)) {
        console.log(chalk.yellow(`\n  Already a favorite: ${romFileName}\n`));
        return;
      }
      lib.toggleFavorite(systemId, romFileName);
      console.log(chalk.green(`\n  Added to favorites: ${romFileName}\n`));
    });

  favCmd
    .command("remove <systemId> <romFileName>")
    .description("Remove a ROM from favorites")
    .action((systemId: string, romFileName: string) => {
      const lib = new UserLibrary();
      if (!lib.isFavorite(systemId, romFileName)) {
        console.log(chalk.yellow(`\n  Not a favorite: ${romFileName}\n`));
        return;
      }
      lib.toggleFavorite(systemId, romFileName);
      console.log(chalk.green(`\n  Removed from favorites: ${romFileName}\n`));
    });
}
