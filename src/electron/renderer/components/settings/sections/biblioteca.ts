import type {
  SettingsSection,
  SettingsContext,
  InfoSetting,
} from "../../../schemas/settings-schema-types";
import { formatPlayTime } from "../../../utils/formatPlayTime";

/**
 * Helper: parse "systemId:fileName" key and return the rom display name
 * (strip extension) and systemId.
 */
function parsePlayKey(key: string): { systemId: string; name: string } {
  const idx = key.indexOf(":");
  const systemId = key.slice(0, idx);
  const fileName = key.slice(idx + 1);
  const lastDot = fileName.lastIndexOf(".");
  const name = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
  return { systemId, name };
}

function buildTopTimeRows(): InfoSetting[] {
  return Array.from({ length: 5 }, (_, i): InfoSetting => ({
    id: `bib.top-time-${i}`,
    kind: "info",
    label: `#${i + 1}`,
    value: (ctx: SettingsContext) => {
      const entries = Object.entries(ctx.playHistory)
        .filter(([, r]) => (r.totalPlayTime ?? 0) > 0)
        .sort((a, b) => (b[1].totalPlayTime ?? 0) - (a[1].totalPlayTime ?? 0));
      const entry = entries[i];
      if (!entry) return "---";
      const { name } = parsePlayKey(entry[0]);
      return `${name} — ${formatPlayTime(entry[1].totalPlayTime ?? 0)}`;
    },
    tone: "default",
  }));
}

function buildTopSessionRows(): InfoSetting[] {
  return Array.from({ length: 5 }, (_, i): InfoSetting => ({
    id: `bib.top-sessions-${i}`,
    kind: "info",
    label: `#${i + 1}`,
    value: (ctx: SettingsContext) => {
      const entries = Object.entries(ctx.playHistory)
        .filter(([, r]) => r.playCount > 0)
        .sort((a, b) => b[1].playCount - a[1].playCount);
      const entry = entries[i];
      if (!entry) return "---";
      const { name } = parsePlayKey(entry[0]);
      return `${name} — ${entry[1].playCount} ${entry[1].playCount === 1 ? "partida" : "partidas"}`;
    },
    tone: "default",
  }));
}

/** Extract unique genres from the metadataMap for dynamic dropdown options. */
function extractGenres(ctx: SettingsContext): string[] {
  const genres = new Set<string>();
  for (const systemGames of Object.values(ctx.metadataMap)) {
    for (const meta of Object.values(systemGames)) {
      if (meta.genre) {
        // Some entries have multiple genres separated by comma or /
        for (const g of meta.genre.split(/[,/]/).map((s: string) => s.trim())) {
          if (g) genres.add(g);
        }
      }
    }
  }
  return [...genres].sort((a, b) => a.localeCompare(b));
}

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
          id: "bib-sorting-interaction",
          title: "Interacción",
          rows: [
            {
              id: "bib.click-action",
              kind: "dropdown",
              label: "Acción al hacer doble clic",
              description: "Elegir si el doble clic en un juego lo lanza directamente o abre la ficha de detalle.",
              options: [
                { value: "launch", label: "Lanzar juego" },
                { value: "detail", label: "Abrir ficha del juego" },
              ],
              get: (ctx) => ctx.config?.cardClickAction ?? "launch",
              set: async (value, ctx) => {
                await ctx.updateConfig({ cardClickAction: value as "launch" | "detail" });
              },
            },
            {
              id: "bib.view-mode",
              kind: "dropdown",
              label: "Vista de biblioteca",
              description: "Cambiar entre cuadrícula, lista o vista compacta.",
              options: [
                { value: "grid", label: "Cuadrícula" },
                { value: "list", label: "Lista" },
                { value: "compact", label: "Compacta" },
              ],
              get: (ctx) => ctx.config?.libraryViewMode ?? "grid",
              set: async (value, ctx) => {
                await ctx.updateConfig({ libraryViewMode: value as "grid" | "list" | "compact" });
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
      id: "bib-filters",
      label: "Filtros",
      groups: [
        {
          id: "bib-filters-metadata",
          title: "Filtros de metadata",
          description: "Filtros persistentes que se aplican automáticamente a la biblioteca.",
          rows: [
            {
              id: "bib.filter-genre",
              kind: "dropdown",
              label: "Género",
              description: "Mostrar solo juegos de un género específico.",
              options: [
                { value: "", label: "Todos" },
              ],
              get: (ctx) => {
                // Dynamically inject genre options from metadata
                const setting = bibliotecaSection.tabs![1].groups[0].rows[0];
                if (setting.kind === "dropdown") {
                  const genres = extractGenres(ctx);
                  setting.options = [
                    { value: "", label: "Todos" },
                    ...genres.map((g) => ({ value: g.toLowerCase(), label: g })),
                  ];
                }
                return ctx.config?.libraryFilters?.genre ?? "";
              },
              set: async (value, ctx) => {
                const existing = ctx.config?.libraryFilters ?? {};
                await ctx.updateConfig({
                  libraryFilters: { ...existing, genre: value as string },
                });
              },
            },
            {
              id: "bib.filter-decade",
              kind: "dropdown",
              label: "Año / Década",
              description: "Filtrar juegos por década de lanzamiento.",
              options: [
                { value: "all", label: "Todos" },
                { value: "2020s", label: "2020s" },
                { value: "2010s", label: "2010s" },
                { value: "2000s", label: "2000s" },
                { value: "1990s", label: "1990s" },
                { value: "1980s", label: "1980s" },
                { value: "1970s", label: "1970s" },
              ],
              get: (ctx) => ctx.config?.libraryFilters?.decade ?? "all",
              set: async (value, ctx) => {
                const existing = ctx.config?.libraryFilters ?? {};
                await ctx.updateConfig({
                  libraryFilters: { ...existing, decade: value as string },
                });
              },
            },
            {
              id: "bib.filter-rating",
              kind: "dropdown",
              label: "Rating mínimo",
              description: "Mostrar solo juegos con rating igual o superior.",
              options: [
                { value: "0", label: "Sin filtro" },
                { value: "1", label: "1+" },
                { value: "2", label: "2+" },
                { value: "3", label: "3+" },
                { value: "4", label: "4+" },
              ],
              get: (ctx) => ctx.config?.libraryFilters?.minRating ?? "0",
              set: async (value, ctx) => {
                const existing = ctx.config?.libraryFilters ?? {};
                await ctx.updateConfig({
                  libraryFilters: { ...existing, minRating: value as string },
                });
              },
            },
            {
              id: "bib.filter-players",
              kind: "dropdown",
              label: "Jugadores",
              description: "Filtrar por número de jugadores.",
              options: [
                { value: "all", label: "Todos" },
                { value: "1", label: "1 jugador" },
                { value: "2", label: "2 jugadores" },
                { value: "multi", label: "Multijugador" },
              ],
              get: (ctx) => ctx.config?.libraryFilters?.players ?? "all",
              set: async (value, ctx) => {
                const existing = ctx.config?.libraryFilters ?? {};
                await ctx.updateConfig({
                  libraryFilters: { ...existing, players: value as string },
                });
              },
            },
            {
              id: "bib.filter-cover",
              kind: "dropdown",
              label: "Portada",
              description: "Filtrar por juegos con o sin portada.",
              options: [
                { value: "all", label: "Todos" },
                { value: "yes", label: "Solo con portada" },
                { value: "no", label: "Solo sin portada" },
              ],
              get: (ctx) => ctx.config?.libraryFilters?.hasCover ?? "all",
              set: async (value, ctx) => {
                const existing = ctx.config?.libraryFilters ?? {};
                await ctx.updateConfig({
                  libraryFilters: { ...existing, hasCover: value as string },
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
          id: "bib-stats-summary",
          title: "Resumen",
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
              id: "bib.total-sessions",
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
              id: "bib.total-playtime",
              kind: "info",
              label: "Tiempo total jugado",
              value: (ctx) => {
                const total = Object.values(ctx.playHistory).reduce(
                  (sum, r) => sum + (r.totalPlayTime ?? 0),
                  0
                );
                return formatPlayTime(total) || "0m";
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
          id: "bib-stats-top-time",
          title: "Top juegos (por tiempo)",
          collapsible: true,
          rows: buildTopTimeRows(),
        },
        {
          id: "bib-stats-top-sessions",
          title: "Top juegos (por partidas)",
          collapsible: true,
          rows: buildTopSessionRows(),
        },
        {
          id: "bib-stats-time-by-system",
          title: "Tiempo por consola",
          collapsible: true,
          rows: [
            {
              id: "bib.time-by-system",
              kind: "info",
              label: "Desglose",
              column: true,
              value: (ctx) => {
                const bySystem = new Map<string, number>();
                for (const [key, record] of Object.entries(ctx.playHistory)) {
                  const time = record.totalPlayTime ?? 0;
                  if (time <= 0) continue;
                  const { systemId } = parsePlayKey(key);
                  bySystem.set(systemId, (bySystem.get(systemId) ?? 0) + time);
                }
                if (bySystem.size === 0) return "Sin datos";
                // Sort by time descending
                const sorted = [...bySystem.entries()].sort(
                  (a, b) => b[1] - a[1]
                );
                return sorted
                  .map(
                    ([sysId, secs]) =>
                      `${sysId.toUpperCase()}: ${formatPlayTime(secs)}`
                  )
                  .join("\n");
              },
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
