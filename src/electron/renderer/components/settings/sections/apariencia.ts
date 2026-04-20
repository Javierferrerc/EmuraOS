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
    id: `ap.color.${systemId}`,
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

export const aparienciaSection: SettingsSection = {
  id: "apariencia",
  path: "/settings/apariencia",
  label: "Apariencia",
  icon: "\uD83C\uDFA8",
  tabs: [
    {
      id: "ap-effects",
      label: "Efectos",
      groups: [
        {
          id: "ap-effects-g",
          rows: [
            {
              id: "ap.card-tilt",
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
              id: "ap.game-loading-overlay",
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
              id: "ap.system-slider-magnification",
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
      id: "ap-background",
      label: "Fondo",
      groups: [
        {
          id: "ap-background-g",
          rows: [
            {
              id: "ap.bg-pick",
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
              id: "ap.bg-remove",
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
              id: "ap.bg-brightness",
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
              id: "ap.bg-blur",
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
              id: "ap.bg-opacity",
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
      id: "ap-colors",
      label: "Colores",
      groups: [
        {
          id: "ap-colors-systems",
          title: "Consolas",
          description: "Personaliza el color de cada consola en el slider y las tarjetas.",
          rows: generateSystemColorRows(),
        },
      ],
    },
    {
      id: "ap-sounds",
      label: "Sonidos",
      groups: [
        {
          id: "ap-sounds-g",
          rows: [
            {
              id: "ap.nav-sound",
              kind: "toggle",
              label: "Sonido de navegación",
              description: "Reproducir un sonido al navegar con el mando.",
              get: (ctx) => ctx.config?.navSoundEnabled ?? true,
              set: async (value, ctx) => {
                await ctx.updateConfig({ navSoundEnabled: value });
              },
            },
            {
              id: "ap.nav-volume",
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
