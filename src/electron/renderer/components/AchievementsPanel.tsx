import type { RaAchievement, RaAchievementsResult } from "../../../core/types";

/**
 * Phase 23 — renders the RetroAchievements progress for one game inside the
 * detail modal. Driven entirely by the discriminated `RaAchievementsResult`
 * so every dead-end (unhashable system, game not in the DB, etc.) gets a
 * precise, friendly hint instead of an empty void.
 */

interface Props {
  loading: boolean;
  result: RaAchievementsResult | null;
}

const HINTS: Record<string, string> = {
  "not-configured":
    "Conecta tu cuenta y añade tu Web API Key en Ajustes → RetroAchievements.",
  disabled: "RetroAchievements está desactivado en Ajustes.",
  unhashable:
    "Este sistema todavía no admite identificación local de la ROM (formatos de disco). Próximamente.",
  "not-found":
    "Esta ROM no coincide con ningún juego del set de RetroAchievements.",
};

export function AchievementsPanel({ loading, result }: Props) {
  if (loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-secondary">
        Cargando logros…
      </div>
    );
  }
  if (!result) return null;

  if (result.status === "error") {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
        No se pudieron cargar los logros: {result.message}
      </div>
    );
  }

  if (result.status !== "ok") {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-secondary">
        {HINTS[result.status] ?? "Sin información de logros."}
      </div>
    );
  }

  const { progress } = result;
  const total = progress.numAchievements || progress.achievements.length;
  const earned = progress.numAwarded;
  const pct = total > 0 ? Math.round((earned / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      {/* Header: game icon + completion summary */}
      <div className="mb-3 flex items-center gap-3">
        {progress.iconUrl && (
          <img
            src={progress.iconUrl}
            alt=""
            className="h-10 w-10 rounded"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-primary">
            {progress.title || "Juego"}
          </div>
          <div className="text-xs text-secondary">
            {earned} / {total} logros · {progress.userCompletion}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-yellow-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {total === 0 ? (
        <div className="text-xs text-secondary">
          Este juego aún no tiene logros publicados.
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
          {progress.achievements.map((a) => (
            <Badge key={a.id} achievement={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ achievement }: { achievement: RaAchievement }) {
  const earned = Boolean(
    achievement.dateEarned || achievement.dateEarnedHardcore
  );
  const date = achievement.dateEarnedHardcore ?? achievement.dateEarned;
  const tooltip =
    `${achievement.title} (${achievement.points})\n${achievement.description}` +
    (earned && date ? `\nDesbloqueado: ${date}` : "");
  return (
    <img
      src={earned ? achievement.badgeUrl : achievement.badgeUrlLocked}
      alt={achievement.title}
      title={tooltip}
      loading="lazy"
      className={
        "aspect-square w-full rounded " +
        (earned ? "" : "opacity-40 grayscale")
      }
    />
  );
}
