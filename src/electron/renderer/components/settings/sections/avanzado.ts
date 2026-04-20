import type { SettingsSection } from "../../../schemas/settings-schema-types";

export const avanzadoSection: SettingsSection = {
  id: "avanzado",
  path: "/settings/avanzado",
  label: "Avanzado",
  icon: "🔧",
  tabs: [
    {
      id: "adv-general",
      label: "General",
      groups: [
        {
          id: "adv-dev",
          title: "Desarrollo",
          rows: [
            {
              id: "adv.dev-mode",
              kind: "toggle",
              label: "Modo desarrollador",
              description: "Muestra información adicional de depuración.",
              get: (ctx) => ctx.config?.devMode ?? false,
              set: async (value, ctx) => {
                await ctx.updateConfig({ devMode: value });
              },
            },
          ],
        },
        {
          id: "adv-about",
          title: "Acerca de",
          rows: [
            {
              id: "adv.version",
              kind: "info",
              label: "Versión",
              value: () => "EmuraOS",
              tone: "default",
            },
          ],
        },
        {
          id: "adv-gamepad",
          title: "Mando",
          rows: [
            {
              id: "adv.gamepad-status",
              kind: "info",
              label: "Mando conectado",
              value: (ctx) => (ctx.gamepadConnected ? "Sí" : "No"),
              tone: "default",
            },
            {
              id: "adv.remap-placeholder",
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
    {
      id: "adv-diagnostics",
      label: "Diagnóstico",
      groups: [
        {
          id: "adv-diagnostics-g",
          rows: [
            {
              id: "adv.open-logs",
              kind: "button",
              label: "Abrir carpeta de logs",
              variant: "ghost",
              run: async () => {
                await window.electronAPI.openLogsFolder();
              },
            },
            {
              id: "adv.export-diag",
              kind: "button",
              label: "Exportar diagnóstico",
              description:
                "Genera un archivo con la configuración, biblioteca y versiones para soporte.",
              variant: "ghost",
              run: async () => {
                await window.electronAPI.exportDiagnosticBundle();
              },
            },
            {
              id: "adv.open-config",
              kind: "button",
              label: "Abrir archivo de configuración",
              variant: "ghost",
              run: async () => {
                await window.electronAPI.openAppConfigFile();
              },
            },
          ],
        },
      ],
    },
    {
      id: "adv-reset",
      label: "Restablecer",
      groups: [
        {
          id: "adv-reset-g",
          rows: [
            {
              id: "adv.reset-config",
              kind: "button",
              label: "Restablecer configuración",
              description:
                "Elimina el archivo de configuración y restaura los valores por defecto. La aplicación se recargará.",
              variant: "danger",
              confirmLabel: "¿Restablecer configuración?",
              run: async () => {
                await window.electronAPI.resetConfig();
                window.location.reload();
              },
            },
          ],
        },
      ],
    },
  ],
};
