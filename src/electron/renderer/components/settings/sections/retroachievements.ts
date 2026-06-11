import type { SettingsSection } from "../../../schemas/settings-schema-types";

/**
 * Phase 23 — RetroAchievements account section.
 *
 * Declarative like the other sections. The connect flow stores username +
 * password (to derive the token) + the web API key into config, then calls
 * ctx.raLogin which persists the derived token in main and refreshes status.
 * `connectFeedback` is a module-level transient used only for the button's
 * inline status text; ctx state changes from raLogin trigger the re-render
 * that re-reads it.
 */

let connectFeedback: string | null = null;

export const retroachievementsSection: SettingsSection = {
  id: "retroachievements",
  path: "/settings/retroachievements",
  label: "RetroAchievements",
  icon: "🏆",
  groups: [
    {
      id: "ra-account",
      title: "Cuenta",
      description:
        "Conecta tu cuenta de retroachievements.org para desbloquear logros en los emuladores compatibles y ver tu progreso por juego.",
      rows: [
        {
          id: "ra.status",
          kind: "info",
          label: "Estado",
          value: (ctx) =>
            ctx.raStatus?.connected
              ? `✓ Conectado como ${ctx.raStatus.username}`
              : "○ No conectado",
        },
        {
          id: "ra.username",
          kind: "path",
          label: "Usuario",
          get: (ctx) => ctx.config?.retroAchievementsUsername ?? "",
          set: async (value, ctx) => {
            await ctx.updateConfig({ retroAchievementsUsername: value });
          },
        },
        {
          id: "ra.password",
          kind: "path",
          secret: true,
          label: "Contraseña",
          description:
            "Solo se usa una vez para obtener tu token; no se inyecta en ningún emulador.",
          get: (ctx) => ctx.config?.retroAchievementsPassword ?? "",
          set: async (value, ctx) => {
            await ctx.updateConfig({ retroAchievementsPassword: value });
          },
        },
        {
          id: "ra.webapikey",
          kind: "path",
          secret: true,
          label: "Web API Key",
          description:
            "retroachievements.org → Settings → Keys. Necesaria para ver los logros en la ficha del juego.",
          get: (ctx) => ctx.config?.retroAchievementsWebApiKey ?? "",
          set: async (value, ctx) => {
            await ctx.updateConfig({ retroAchievementsWebApiKey: value });
          },
        },
        {
          id: "ra.connect",
          kind: "button",
          label: "Conectar",
          variant: "primary",
          disabled: (ctx) => Boolean(ctx.raStatus?.connected),
          status: () => connectFeedback,
          run: async (ctx) => {
            const username = ctx.config?.retroAchievementsUsername ?? "";
            const password = ctx.config?.retroAchievementsPassword ?? "";
            const webApiKey =
              ctx.config?.retroAchievementsWebApiKey || undefined;
            if (!username || !password) {
              connectFeedback = "Introduce usuario y contraseña.";
              return;
            }
            connectFeedback = "Conectando…";
            const res = await ctx.raLogin(username, password, webApiKey);
            connectFeedback = res.success
              ? `✓ Conectado como ${res.username ?? username}`
              : `✗ ${res.error ?? "No se pudo conectar"}`;
          },
        },
        {
          id: "ra.disconnect",
          kind: "button",
          label: "Desconectar",
          variant: "danger",
          disabled: (ctx) => !ctx.raStatus?.connected,
          run: async (ctx) => {
            connectFeedback = null;
            await ctx.raLogout();
          },
        },
      ],
    },
    {
      id: "ra-options",
      title: "Opciones",
      rows: [
        {
          id: "ra.enabled",
          kind: "toggle",
          label: "Activar RetroAchievements",
          description:
            "Inyecta tus credenciales en RetroArch, Dolphin y DuckStation al lanzar un juego.",
          get: (ctx) => ctx.config?.retroAchievementsEnabled ?? false,
          set: async (value, ctx) => {
            await ctx.updateConfig({ retroAchievementsEnabled: value });
          },
        },
        {
          id: "ra.hardcore",
          kind: "toggle",
          label: "Modo hardcore",
          description:
            "Sin save states ni trucos — la forma 'oficial' de ganar logros. Se aplica al inyectar en el emulador.",
          get: (ctx) => ctx.config?.retroAchievementsHardcore ?? false,
          set: async (value, ctx) => {
            await ctx.updateConfig({ retroAchievementsHardcore: value });
          },
        },
      ],
    },
    {
      id: "ra-compat",
      title: "Compatibilidad",
      rows: [
        {
          id: "ra.note",
          kind: "info",
          label: "Login automático",
          column: true,
          tone: "warn",
          value: () =>
            "RetroArch, Dolphin y DuckStation reciben tus credenciales automáticamente. PCSX2 y PPSSPP guardan el token en el almacenamiento seguro del sistema, así que tendrás que iniciar sesión una vez dentro de cada uno.",
        },
      ],
    },
  ],
};
