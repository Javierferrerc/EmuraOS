import type { SettingsSection } from "../../../schemas/settings-schema-types";

export const bibliotecaSection: SettingsSection = {
  id: "biblioteca",
  path: "/settings/biblioteca",
  label: "Biblioteca",
  icon: "📚",
  groups: [
    {
      id: "bib-stats",
      title: "Estadísticas",
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
    {
      id: "bib-actions",
      title: "Acciones",
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
};
