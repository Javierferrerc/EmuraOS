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
            {
              id: "gen.card-tilt",
              kind: "toggle",
              label: "Efecto 3D en tarjetas",
              description:
                "Inclinar las tarjetas de juego con reflejo de cristal al pasar el cursor o enfocar con el mando.",
              get: (ctx) => ctx.config?.cardTiltEnabled ?? true,
              set: async (value, ctx) => {
                await ctx.updateConfig({ cardTiltEnabled: value });
              },
            },
            {
              id: "gen.game-loading-overlay",
              kind: "toggle",
              label: "Pantalla de carga al abrir un juego",
              description:
                "Mostrar un cubo 3D con la portada del juego mientras se lanza el emulador.",
              get: (ctx) => ctx.config?.gameLoadingOverlayEnabled ?? true,
              set: async (value, ctx) => {
                await ctx.updateConfig({ gameLoadingOverlayEnabled: value });
              },
            },
            {
              id: "gen.system-slider-magnification",
              kind: "toggle",
              label: "Efecto dock en el slider de consolas",
              description:
                "Aumentar el tamaño de los iconos del slider horizontal al pasar el cursor.",
              get: (ctx) => ctx.config?.systemSliderMagnificationEnabled ?? true,
              set: async (value, ctx) => {
                await ctx.updateConfig({ systemSliderMagnificationEnabled: value });
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
