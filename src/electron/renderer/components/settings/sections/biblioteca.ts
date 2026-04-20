import type { SettingsSection } from "../../../schemas/settings-schema-types";

export const bibliotecaSection: SettingsSection = {
  id: "biblioteca",
  path: "/settings/biblioteca",
  label: "Biblioteca",
  icon: "📚",
  tabs: [
    {
      id: "bib-sorting",
      label: "Ordenación",
      groups: [
        {
          id: "bib-sorting-games",
          title: "Juegos",
          rows: [
            {
              id: "bib.game-sort",
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
          id: "bib-sorting-systems",
          title: "Consolas",
          rows: [
            {
              id: "bib.system-sort",
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
      id: "bib-stats",
      label: "Estadísticas",
      groups: [
        {
          id: "bib-stats-g",
          rows: [
            {
              id: "bib.favorites-count",
              kind: "info",
              label: "Favoritos",
              value: (ctx) => `${ctx.favorites.size}`,
              tone: "default",
            },
            {
              id: "bib.recents-count",
              kind: "info",
              label: "Jugados recientemente",
              value: (ctx) => `${ctx.recentlyPlayed.length}`,
              tone: "default",
            },
            {
              id: "bib.total-playtime",
              kind: "info",
              label: "Partidas totales",
              value: (ctx) => {
                const total = Object.values(ctx.playHistory).reduce(
                  (sum, r) => sum + r.playCount,
                  0
                );
                return `${total}`;
              },
              tone: "default",
            },
            {
              id: "bib.collections-count",
              kind: "info",
              label: "Colecciones",
              value: (ctx) => `${ctx.collections.length}`,
              tone: "default",
            },
          ],
        },
      ],
    },
    {
      id: "bib-actions",
      label: "Acciones",
      groups: [
        {
          id: "bib-actions-g",
          rows: [
            {
              id: "bib.force-rescan",
              kind: "button",
              label: "Re-escanear biblioteca",
              description: "Volver a escanear todos los directorios de ROMs.",
              variant: "primary",
              run: async (ctx) => {
                await ctx.refreshScan();
              },
              status: (ctx) => (ctx.isLoading ? "Escaneando..." : null),
            },
            {
              id: "bib.reset-history",
              kind: "button",
              label: "Borrar historial de juego",
              description:
                "Elimina la lista de recientes y los contadores de partidas. Los favoritos y colecciones se mantienen.",
              variant: "danger",
              confirmLabel: "¿Borrar historial?",
              run: async () => {
                await window.electronAPI.resetPlayHistory();
              },
            },
            {
              id: "bib.clear-metadata",
              kind: "button",
              label: "Limpiar caché de metadatos",
              description: "Elimina metadatos y carátulas descargadas.",
              variant: "danger",
              confirmLabel: "¿Eliminar caché?",
              run: async () => {
                await window.electronAPI.clearMetadataCache();
              },
            },
            {
              id: "bib.export-library",
              kind: "button",
              label: "Exportar biblioteca",
              description:
                "Exporta favoritos, colecciones e historial a un archivo JSON.",
              variant: "ghost",
              run: async () => {
                await window.electronAPI.exportUserLibrary();
              },
            },
          ],
        },
      ],
    },
  ],
};
