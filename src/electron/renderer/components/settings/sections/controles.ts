import type { SettingsSection } from "../../../schemas/settings-schema-types";

export const controlesSection: SettingsSection = {
  id: "controles",
  path: "/settings/controles",
  label: "Controles",
  icon: "🎛",
  tabs: [
    {
      id: "ctrl-general",
      label: "General",
      groups: [
        {
          id: "ctrl-status",
          title: "Estado del mando",
          rows: [
            {
              id: "ctrl.gamepad-status",
              kind: "info",
              label: "Mando conectado",
              value: (ctx) => (ctx.gamepadConnected ? "Sí" : "No"),
              tone: "default",
            },
          ],
        },
        {
          id: "ctrl-nav",
          title: "Navegación",
          rows: [
            {
              id: "ctrl.nav-sound",
              kind: "toggle",
              label: "Sonido de navegación",
              description: "Reproducir un sonido al navegar con el mando.",
              get: (ctx) => ctx.config?.navSoundEnabled ?? true,
              set: async (value, ctx) => {
                await ctx.updateConfig({ navSoundEnabled: value });
              },
            },
          ],
        },
      ],
    },
    {
      id: "ctrl-advanced",
      label: "Avanzado",
      groups: [
        {
          id: "ctrl-advanced-g",
          description: "Más opciones de control estarán disponibles próximamente.",
          rows: [
            {
              id: "ctrl.remap-placeholder",
              kind: "button",
              label: "Remapear controles",
              description: "Próximamente.",
              variant: "ghost",
              disabled: true,
              run: () => {
                /* placeholder — not implemented yet */
              },
            },
          ],
        },
      ],
    },
  ],
};
