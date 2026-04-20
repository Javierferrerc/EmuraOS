import type { ColorSetting, SettingsSection } from "../../../schemas/settings-schema-types";
import { SYSTEM_COLORS } from "../../../utils/sliderItems";

const SYSTEM_DISPLAY_NAMES: Record<string, string> = {
  nes: "NES",
  snes: "SNES",
  n64: "Nintendo 64",
  gb: "Game Boy",
  gbc: "Game Boy Color",
  gba: "Game Boy Advance",
  nds: "Nintendo DS",
  gamecube: "GameCube",
  wii: "Wii",
  megadrive: "Mega Drive",
  mastersystem: "Master System",
  dreamcast: "Dreamcast",
  psx: "PlayStation",
  ps2: "PlayStation 2",
  psp: "PSP",
};

function generateSystemColorRows(): ColorSetting[] {
  return Object.keys(SYSTEM_COLORS).map((systemId) => ({
    id: `gen.color.${systemId}`,
    kind: "color" as const,
    label: SYSTEM_DISPLAY_NAMES[systemId] ?? systemId.toUpperCase(),
    description: "Color del slider y tarjetas de esta consola.",
    get: (ctx) => ctx.config?.customSystemColors?.[systemId] ?? SYSTEM_COLORS[systemId].color,
    set: async (value, ctx) => {
      const current = ctx.config?.customSystemColors ?? {};
      await ctx.updateConfig({
        customSystemColors: { ...current, [systemId]: value },
      });
    },
    defaultValue: SYSTEM_COLORS[systemId].color,
  }));
}

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
      id: "general-sorting",
      label: "Ordenación",
      groups: [
        {
          id: "general-sorting-games",
          title: "Juegos",
          rows: [
            {
              id: "gen.game-sort",
              kind: "dropdown",
              label: "Orden de juegos",
              description: "Criterio de ordenación de los juegos en la cuadrícula.",
              options: [
                { value: "alpha-asc", label: "Alfabético A→Z" },
                { value: "alpha-desc", label: "Alfabético Z→A" },
                { value: "recent", label: "Últimos jugados" },
                { value: "added", label: "Últimos añadidos" },
              ],
              get: (ctx) => ctx.config?.gameSortOrder ?? "alpha-asc",
              set: async (value, ctx) => {
                await ctx.updateConfig({
                  gameSortOrder: value as "alpha-asc" | "alpha-desc" | "recent" | "added",
                });
              },
            },
          ],
        },
        {
          id: "general-sorting-systems",
          title: "Consolas",
          rows: [
            {
              id: "gen.system-sort",
              kind: "dropdown",
              label: "Orden de consolas",
              description: "Criterio de ordenación de las consolas en el slider.",
              options: [
                { value: "default", label: "Por defecto" },
                { value: "recent", label: "Recientes primero" },
              ],
              get: (ctx) => ctx.config?.systemSortOrder ?? "default",
              set: async (value, ctx) => {
                await ctx.updateConfig({
                  systemSortOrder: value as "default" | "recent" | "custom",
                });
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
    {
      id: "general-background",
      label: "Fondo",
      groups: [
        {
          id: "general-background-g",
          rows: [
            {
              id: "gen.bg-pick",
              kind: "button",
              label: "Elegir imagen",
              description: "Selecciona una imagen de fondo para la pantalla principal (JPG, PNG, WebP).",
              run: async (ctx) => {
                const update = ctx.liveUpdateConfig ?? ctx.updateConfig;
                const filePath = await window.electronAPI.pickFile([
                  { name: "Imágenes", extensions: ["jpg", "jpeg", "png", "webp"] },
                ]);
                if (filePath) {
                  await update({ backgroundImage: filePath });
                }
              },
            },
            {
              id: "gen.bg-remove",
              kind: "button",
              variant: "danger",
              label: "Quitar imagen",
              description: "Eliminar la imagen de fondo y volver al degradado por defecto.",
              hidden: false,
              disabled: (ctx) => !ctx.config?.backgroundImage,
              run: async (ctx) => {
                const update = ctx.liveUpdateConfig ?? ctx.updateConfig;
                await update({
                  backgroundImage: "",
                  backgroundBrightness: 100,
                  backgroundBlur: 0,
                  backgroundOpacity: 30,
                });
              },
            },
            {
              id: "gen.bg-brightness",
              kind: "slider",
              label: "Brillo",
              description: "Ajusta el brillo de la imagen de fondo (100 = normal).",
              min: 0,
              max: 200,
              step: 5,
              get: (ctx) => ctx.config?.backgroundBrightness ?? 100,
              set: async (value, ctx) => {
                const update = ctx.liveUpdateConfig ?? ctx.updateConfig;
                await update({ backgroundBrightness: value });
              },
            },
            {
              id: "gen.bg-blur",
              kind: "slider",
              label: "Desenfoque",
              description: "Nivel de desenfoque de la imagen de fondo (px).",
              min: 0,
              max: 20,
              step: 1,
              get: (ctx) => ctx.config?.backgroundBlur ?? 0,
              set: async (value, ctx) => {
                const update = ctx.liveUpdateConfig ?? ctx.updateConfig;
                await update({ backgroundBlur: value });
              },
            },
            {
              id: "gen.bg-opacity",
              kind: "slider",
              label: "Opacidad",
              description: "Opacidad de la imagen de fondo (%).",
              min: 0,
              max: 100,
              step: 5,
              get: (ctx) => ctx.config?.backgroundOpacity ?? 30,
              set: async (value, ctx) => {
                const update = ctx.liveUpdateConfig ?? ctx.updateConfig;
                await update({ backgroundOpacity: value });
              },
            },
          ],
        },
      ],
    },
    {
      id: "general-colors",
      label: "Colores",
      groups: [
        {
          id: "general-colors-systems",
          title: "Consolas",
          description: "Personaliza el color de cada consola en el slider y las tarjetas.",
          rows: generateSystemColorRows(),
        },
      ],
    },
  ],
};
