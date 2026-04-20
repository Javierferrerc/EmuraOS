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
