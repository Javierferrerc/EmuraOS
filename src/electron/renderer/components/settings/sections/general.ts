import type { SettingsSection } from "../../../schemas/settings-schema-types";

export const generalSection: SettingsSection = {
  id: "general",
  path: "/settings/general",
  label: "General",
  icon: "⚙",
  tabs: [
    {
      id: "general-preferences",
      label: "Preferencias",
      groups: [
        {
          id: "general-preferences-g",
          rows: [
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
    },
    {
      id: "general-sound",
      label: "Sonidos",
      groups: [
        {
          id: "general-sound-g",
          rows: [
            {
              id: "gen.nav-sound",
              kind: "toggle",
              label: "Sonido de navegación",
              description: "Reproducir un sonido al navegar con el mando.",
              get: (ctx) => ctx.config?.navSoundEnabled ?? true,
              set: async (value, ctx) => {
                await ctx.updateConfig({ navSoundEnabled: value });
              },
            },
            {
              id: "gen.nav-volume",
              kind: "slider",
              label: "Volumen",
              min: 0,
              max: 100,
              step: 5,
              get: (ctx) => ctx.config?.navSoundVolume ?? 70,
              set: async (value, ctx) => {
                await ctx.updateConfig({ navSoundVolume: value });
              },
            },
          ],
        },
      ],
    },
  ],
};
