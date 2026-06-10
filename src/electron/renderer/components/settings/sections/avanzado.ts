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
        {
          id: "adv-launch-scripts",
          title: "Scripts de lanzamiento",
          description:
            "Ejecuta un script antes/después de cada juego. Recibe EMURA_SYSTEM, EMURA_ROM_PATH, EMURA_TITLE, EMURA_EMULATOR_ID como variables de entorno. .ps1 corre con PowerShell, .bat/.cmd con cmd, .sh con sh; otros se ejecutan directamente.",
          rows: [
            {
              id: "adv.pre-launch-script",
              kind: "path",
              label: "Script pre-lanzamiento",
              description:
                "Ruta absoluta. Vacío = sin hook. Timeout de 5s para no bloquear el juego si cuelga.",
              get: (ctx) => ctx.config?.preLaunchScript ?? "",
              set: async (value, ctx) => {
                await ctx.updateConfig({ preLaunchScript: value });
              },
            },
            {
              id: "adv.post-launch-script",
              kind: "path",
              label: "Script post-cierre",
              description:
                "Ruta absoluta. Solo dispara para sesiones embebidas (cuando el launcher detecta el cierre del emulador). Recibe además EMURA_EXIT_CODE.",
              get: (ctx) => ctx.config?.postLaunchScript ?? "",
              set: async (value, ctx) => {
                await ctx.updateConfig({ postLaunchScript: value });
              },
            },
            {
              id: "adv.pre-launch-countdown",
              kind: "toggle",
              label: "Cuenta atrás de pre-lanzamiento",
              description:
                "Muestra 3-2-1 con la portada antes de abrir el emulador. Útil para dar tiempo al mando a conectarse. Respeta prefers-reduced-motion.",
              get: (ctx) => ctx.config?.preLaunchCountdownEnabled ?? false,
              set: async (value, ctx) => {
                await ctx.updateConfig({ preLaunchCountdownEnabled: value });
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
