import type { SettingsSection } from "../../../schemas/settings-schema-types";

export const coverArtSection: SettingsSection = {
  id: "cover-art",
  path: "/settings/cover-art",
  label: "Cover Art",
  icon: "🖼",
  groups: [
    {
      id: "cover-source",
      title: "Fuentes de carátulas",
      rows: [
        {
          id: "cov.libretro-enabled",
          kind: "toggle",
          label: "Libretro Thumbnails",
          description:
            "Descargar carátulas automáticamente desde Libretro (sin credenciales).",
          get: (ctx) => ctx.config?.libretroCoversEnabled ?? true,
          set: async (value, ctx) => {
            await ctx.updateConfig({ libretroCoversEnabled: value });
          },
        },
        {
          id: "cov.source-priority",
          kind: "dropdown",
          label: "Prioridad de fuentes",
          description: "Orden en que se consultan las fuentes de carátulas.",
          options: [
            { value: "libretro-first", label: "Libretro primero" },
            { value: "sgdb-first", label: "SteamGridDB primero" },
            { value: "libretro-only", label: "Solo Libretro" },
            { value: "sgdb-only", label: "Solo SteamGridDB" },
          ],
          get: (ctx) => ctx.config?.coverSourcePriority ?? "libretro-first",
          set: async (value, ctx) => {
            await ctx.updateConfig({
              coverSourcePriority: value as
                | "libretro-first"
                | "sgdb-first"
                | "libretro-only"
                | "sgdb-only",
            });
          },
        },
      ],
    },
    {
      id: "cover-sgdb",
      title: "SteamGridDB",
      description:
        "Fuente de respaldo para carátulas de Switch y sistemas modernos. Requiere API key gratuita.",
      rows: [
        {
          id: "cov.sgdb-key",
          kind: "path",
          label: "SteamGridDB API Key",
          description:
            "Obtén tu key en steamgriddb.com/profile/preferences/api",
          secret: true,
          get: (ctx) => ctx.config?.steamGridDbApiKey ?? "",
          set: async (value, ctx) => {
            await ctx.updateConfig({
              steamGridDbApiKey: value || undefined,
            });
          },
        },
      ],
    },
    {
      id: "cover-screenscraper",
      title: "ScreenScraper",
      description:
        "Descarga descripciones, géneros, años y carátulas adicionales. Requiere credenciales.",
      rows: [
        {
          id: "cov.ss-dev-id",
          kind: "path",
          label: "ScreenScraper Dev ID",
          get: (ctx) => ctx.config?.screenScraperDevId ?? "",
          set: async (value, ctx) => {
            await ctx.updateConfig({
              screenScraperDevId: value || undefined,
            });
          },
        },
        {
          id: "cov.ss-dev-pass",
          kind: "path",
          label: "ScreenScraper Dev Password",
          secret: true,
          get: (ctx) => ctx.config?.screenScraperDevPassword ?? "",
          set: async (value, ctx) => {
            await ctx.updateConfig({
              screenScraperDevPassword: value || undefined,
            });
          },
        },
        {
          id: "cov.ss-user-id",
          kind: "path",
          label: "ScreenScraper User ID",
          description: "Opcional.",
          get: (ctx) => ctx.config?.screenScraperUserId ?? "",
          set: async (value, ctx) => {
            await ctx.updateConfig({
              screenScraperUserId: value || undefined,
            });
          },
        },
        {
          id: "cov.ss-user-pass",
          kind: "path",
          label: "ScreenScraper User Password",
          description: "Opcional.",
          secret: true,
          get: (ctx) => ctx.config?.screenScraperUserPassword ?? "",
          set: async (value, ctx) => {
            await ctx.updateConfig({
              screenScraperUserPassword: value || undefined,
            });
          },
        },
      ],
    },
    {
      id: "cover-actions",
      title: "Acciones",
      rows: [
        {
          id: "cov.fetch-covers",
          kind: "button",
          label: "Descargar carátulas",
          description: "Descargar carátulas faltantes de todas las ROMs.",
          variant: "primary",
          run: async (ctx) => {
            await ctx.startFetchingCovers();
          },
          status: (ctx) => {
            if (ctx.isFetchingCovers && ctx.coverFetchProgress) {
              return `${ctx.coverFetchProgress.current}/${ctx.coverFetchProgress.total}`;
            }
            if (ctx.lastCoverFetchResult && !ctx.isFetchingCovers) {
              return `${ctx.lastCoverFetchResult.totalFound} encontradas`;
            }
            return null;
          },
        },
        {
          id: "cov.scrape-metadata",
          kind: "button",
          label: "Scrape metadatos completos",
          description:
            "Descargar descripciones y datos extra desde ScreenScraper.",
          variant: "primary",
          disabled: (ctx) =>
            ctx.isScraping ||
            !ctx.config?.screenScraperDevId ||
            !ctx.config?.screenScraperDevPassword,
          run: async (ctx) => {
            await ctx.startScraping();
          },
          status: (ctx) => {
            if (ctx.isScraping && ctx.scrapeProgress) {
              return `${ctx.scrapeProgress.current}/${ctx.scrapeProgress.total}`;
            }
            if (ctx.lastScrapeResult && !ctx.isScraping) {
              return `${ctx.lastScrapeResult.totalFound} encontrados`;
            }
            return null;
          },
        },
      ],
    },
  ],
};
