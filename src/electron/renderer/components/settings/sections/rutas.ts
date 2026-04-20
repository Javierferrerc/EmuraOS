import type { SettingsSection } from "../../../schemas/settings-schema-types";

export const rutasSection: SettingsSection = {
  id: "rutas",
  path: "/settings/rutas",
  label: "Rutas",
  icon: "\uD83D\uDCC1",
  groups: [
    {
      id: "rutas-main",
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
          hint: (ctx) => ctx.resolvedPaths?.romsPath,
          openable: true,
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
          hint: (ctx) => ctx.resolvedPaths?.emulatorsPath,
          openable: true,
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
  ],
};
