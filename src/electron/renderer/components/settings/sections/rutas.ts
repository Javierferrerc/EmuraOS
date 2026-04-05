import type { SettingsSection } from "../../../schemas/settings-schema-types";

export const rutasSection: SettingsSection = {
  id: "rutas",
  path: "/settings/rutas",
  label: "Rutas",
  icon: "📁",
  groups: [
    {
      id: "rutas-main",
      title: "Directorios principales",
      rows: [
        {
          id: "rut.roms-path",
          kind: "folder",
          label: "Directorio de ROMs",
          description: "Carpeta raíz donde se buscan las ROMs.",
          get: (ctx) => ctx.config?.romsPath ?? "./roms",
          set: async (value, ctx) => {
            await ctx.updateConfig({ romsPath: value });
          },
        },
        {
          id: "rut.emulators-path",
          kind: "folder",
          label: "Directorio de emuladores",
          description: "Carpeta donde se buscan/instalan emuladores.",
          get: (ctx) => ctx.config?.emulatorsPath ?? "./emulators",
          set: async (value, ctx) => {
            await ctx.updateConfig({ emulatorsPath: value });
          },
        },
        {
          id: "rut.metadata-path",
          kind: "folder",
          label: "Directorio de metadatos",
          description: "Carpeta para metadatos y carátulas descargadas.",
          get: (ctx) => ctx.config?.metadataPath ?? "",
          set: async (value, ctx) => {
            await ctx.updateConfig({ metadataPath: value });
          },
        },
        {
          id: "rut.saves-path",
          kind: "folder",
          label: "Directorio de guardados",
          description: "Carpeta donde se almacenan las partidas guardadas.",
          get: (ctx) => ctx.config?.savesPath ?? "",
          set: async (value, ctx) => {
            await ctx.updateConfig({ savesPath: value });
          },
        },
      ],
    },
    {
      id: "rutas-actions",
      title: "Acciones",
      rows: [
        {
          id: "rut.rescan",
          kind: "button",
          label: "Re-escanear ROMs",
          description: "Buscar nuevas ROMs en el directorio configurado.",
          variant: "primary",
          run: async (ctx) => {
            await ctx.refreshScan();
          },
          status: (ctx) => (ctx.isLoading ? "Escaneando..." : null),
        },
        {
          id: "rut.clear-metadata",
          kind: "button",
          label: "Limpiar caché de metadatos",
          description:
            "Elimina las carátulas y metadatos descargados. Se pueden volver a descargar.",
          variant: "danger",
          confirmLabel: "¿Eliminar caché?",
          run: async () => {
            await window.electronAPI.clearMetadataCache();
          },
        },
      ],
    },
  ],
};
