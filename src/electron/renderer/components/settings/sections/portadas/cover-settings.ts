import type { SettingsGroup } from "../../../../schemas/settings-schema-types";

export const coverSourcesGroups: SettingsGroup[] = [
  {
    id: "cover-source",
    rows: [
      {
        id: "cov.libretro-enabled",
        kind: "toggle",
        glass: true,
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
        variant: "selector",
        glass: true,
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
];

export const coverCredentialsGroups: SettingsGroup[] = [
  {
    id: "cover-sgdb",
    title: "SteamGridDB",
    description:
      "Fuente de carátulas para Switch, sistemas modernos y más. Requiere una API key gratuita.\n\nCómo obtener tu API Key:\n1. Crea una cuenta en steamgriddb.com\n2. Ve a Preferencias > API\n3. Copia tu API Key y pégala aquí abajo",
    rows: [
      {
        id: "cov.sgdb-key",
        kind: "path",
        label: "SteamGridDB API Key",
        description:
          "Pega aquí la API Key obtenida desde tu perfil de SteamGridDB.",
        secret: true,
        get: (ctx) => ctx.config?.steamGridDbApiKey ?? "",
        set: async (value, ctx) => {
          await ctx.updateConfig({
            steamGridDbApiKey: value || undefined,
          });
        },
      },
      {
        id: "cov.sgdb-open-site",
        kind: "button",
        label: "Abrir SteamGridDB",
        description:
          "Abre steamgriddb.com en tu navegador para crear tu cuenta y obtener la API Key.",
        variant: "ghost",
        run: async (_ctx) => {
          await window.electronAPI.openExternal(
            "https://www.steamgriddb.com/profile/preferences/api"
          );
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
];

export const coverActionsGroups: SettingsGroup[] = [
  {
    id: "cover-actions-g",
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
];
