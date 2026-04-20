import type { SettingsSection } from "../../../schemas/settings-schema-types";

export const generalSection: SettingsSection = {
  id: "general",
  path: "/settings/general",
  label: "General",
  icon: "\u2699",
  groups: [
    {
      id: "general-core",
      rows: [
        {
          id: "gen.theme",
          kind: "dropdown",
          label: "Tema",
          description: "Apariencia visual de la interfaz.",
          options: [
            { value: "dark", label: "Oscuro" },
            { value: "light", label: "Claro" },
            { value: "retro-crt", label: "Retro CRT" },
          ],
          get: (ctx) => ctx.config?.theme ?? "dark",
          set: async (value, ctx) => {
            await ctx.updateConfig({ theme: value as "dark" | "light" | "retro-crt" });
          },
        },
        {
          id: "gen.language",
          kind: "dropdown",
          label: "Idioma",
          description: "Idioma de la interfaz.",
          options: [
            { value: "es", label: "Español" },
            { value: "en", label: "English" },
          ],
          get: (ctx) => ctx.config?.language ?? "es",
          set: async (value, ctx) => {
            await ctx.updateConfig({ language: value as "es" | "en" });
          },
        },
        {
          id: "gen.fullscreen-on-start",
          kind: "toggle",
          label: "Pantalla completa al iniciar",
          description: "Abrir la aplicación en pantalla completa.",
          get: (ctx) => ctx.config?.fullscreenOnStart ?? false,
          set: async (value, ctx) => {
            await ctx.updateConfig({ fullscreenOnStart: value });
          },
        },
        {
          id: "gen.auto-scan",
          kind: "toggle",
          label: "Escanear ROMs al iniciar",
          description: "Buscar nuevas ROMs automáticamente al abrir la app.",
          get: (ctx) => ctx.config?.autoScanOnStartup ?? true,
          set: async (value, ctx) => {
            await ctx.updateConfig({ autoScanOnStartup: value });
          },
        },
      ],
    },
  ],
};
