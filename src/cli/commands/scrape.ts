import chalk from "chalk";
import type { Command } from "commander";
import {
  ConfigManager,
  SystemsRegistry,
  RomScanner,
  MetadataCache,
  MetadataScraper,
  LibretroThumbnails,
} from "../../core/index.js";
import type { ScrapeProgress, CoverFetchProgress } from "../../core/types.js";

export function registerScrapeCommand(program: Command): void {
  program
    .command("scrape")
    .description("Scrape metadata and cover art from ScreenScraper")
    .option("-s, --system <id>", "Scrape only a specific system")
    .option("--force", "Re-scrape even if cached", false)
    .option("--no-covers", "Skip downloading cover art")
    .option(
      "--covers-only",
      "Download covers from Libretro Thumbnails only (no credentials needed)",
      false
    )
    .action(
      async (options: {
        system?: string;
        force?: boolean;
        covers?: boolean;
        coversOnly?: boolean;
      }) => {
        const config = new ConfigManager();
        const appConfig = config.get();

        // --covers-only: download covers from Libretro Thumbnails (no credentials needed)
        if (options.coversOnly) {
          const registry = new SystemsRegistry();
          const scanner = new RomScanner(registry);
          const scanResult = scanner.scan(config.getRomsPath());

          let systems = scanResult.systems;
          if (options.system) {
            systems = systems.filter((s) => s.systemId === options.system);
            if (systems.length === 0) {
              console.log(
                chalk.red(
                  `\n  No ROMs found for system "${options.system}"\n`
                )
              );
              return;
            }
          }

          const totalRoms = systems.reduce(
            (sum, s) => sum + s.roms.length,
            0
          );
          if (totalRoms === 0) {
            console.log(chalk.yellow("\n  No ROMs found.\n"));
            return;
          }

          console.log(
            chalk.cyan(
              `\n  Fetching covers for ${totalRoms} ROM(s) from Libretro Thumbnails...\n`
            )
          );

          const cache = new MetadataCache();
          const thumbs = new LibretroThumbnails(cache);

          const onCoverProgress = (progress: CoverFetchProgress) => {
            const pct = Math.round(
              (progress.current / progress.total) * 100
            );
            const statusColor =
              progress.status === "found"
                ? chalk.green
                : progress.status === "already_cached"
                  ? chalk.blue
                  : progress.status === "not_found"
                    ? chalk.yellow
                    : chalk.red;

            process.stdout.write(
              `\r  [${pct}%] ${progress.current}/${progress.total} — ${statusColor(progress.status)} ${chalk.gray(progress.romFileName)}  `
            );
          };

          const result = await thumbs.fetchAllCovers(systems, onCoverProgress);

          console.log("\n");
          console.log(chalk.cyan("  Cover Fetch Complete\n"));
          console.log(
            chalk.white("  Processed: ") +
              chalk.bold(String(result.totalProcessed))
          );
          console.log(
            chalk.green("  Found:     ") +
              chalk.bold(String(result.totalFound))
          );
          console.log(
            chalk.yellow("  Not Found: ") +
              chalk.bold(String(result.totalNotFound))
          );
          if (result.totalErrors > 0) {
            console.log(
              chalk.red("  Errors:    ") +
                chalk.bold(String(result.totalErrors))
            );
          }
          console.log();
          return;
        }

        const devId = appConfig.screenScraperDevId;
        const devPassword = appConfig.screenScraperDevPassword;

        if (!devId || !devPassword) {
          console.log(
            chalk.red(
              "\n  ScreenScraper credentials not configured.\n"
            )
          );
          console.log(
            chalk.gray(
              "  Set them with:\n" +
                "    retro-launcher config set screenScraperDevId <your_id>\n" +
                "    retro-launcher config set screenScraperDevPassword <your_password>\n"
            )
          );
          return;
        }

        const registry = new SystemsRegistry();
        const scanner = new RomScanner(registry);
        const scanResult = scanner.scan(config.getRomsPath());

        let systems = scanResult.systems;
        if (options.system) {
          systems = systems.filter((s) => s.systemId === options.system);
          if (systems.length === 0) {
            console.log(
              chalk.red(
                `\n  No ROMs found for system "${options.system}"\n`
              )
            );
            return;
          }
        }

        const totalRoms = systems.reduce(
          (sum, s) => sum + s.roms.length,
          0
        );
        if (totalRoms === 0) {
          console.log(chalk.yellow("\n  No ROMs found to scrape.\n"));
          return;
        }

        console.log(
          chalk.cyan(
            `\n  Scraping metadata for ${totalRoms} ROM(s) across ${systems.length} system(s)...\n`
          )
        );

        const cache = new MetadataCache();
        const scraper = new MetadataScraper(
          {
            devId,
            devPassword,
            softName: "retro-launcher",
            ssId: appConfig.screenScraperUserId,
            ssPassword: appConfig.screenScraperUserPassword,
          },
          cache,
          { downloadCovers: options.covers !== false }
        );

        const onProgress = (progress: ScrapeProgress) => {
          const pct = Math.round(
            (progress.current / progress.total) * 100
          );
          const statusColor =
            progress.status === "found"
              ? chalk.green
              : progress.status === "cached"
                ? chalk.blue
                : progress.status === "not_found"
                  ? chalk.yellow
                  : chalk.red;

          process.stdout.write(
            `\r  [${pct}%] ${progress.current}/${progress.total} — ${statusColor(progress.status)} ${chalk.gray(progress.romFileName)}  `
          );
        };

        const result = await scraper.scrapeAll(systems, onProgress);

        console.log("\n");
        console.log(
          chalk.cyan("  Scraping Complete\n")
        );
        console.log(
          chalk.white("  Processed: ") +
            chalk.bold(String(result.totalProcessed))
        );
        console.log(
          chalk.green("  Found:     ") +
            chalk.bold(String(result.totalFound))
        );
        console.log(
          chalk.yellow("  Not Found: ") +
            chalk.bold(String(result.totalNotFound))
        );
        if (result.totalErrors > 0) {
          console.log(
            chalk.red("  Errors:    ") +
              chalk.bold(String(result.totalErrors))
          );
          for (const err of result.errors.slice(0, 5)) {
            console.log(
              chalk.red(`    - ${err.romFileName}: ${err.error}`)
            );
          }
        }
        console.log();
      }
    );
}
