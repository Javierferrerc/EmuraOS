/**
 * NexusUserProfile — ANOTHER user's profile, rendered with the exact same
 * layout / pf-* classes as the own profile (NexusProfile) so both look alike:
 * showcase header (portada + avatar + nivel/XP), stat cards and the game
 * shelves (fijados, biblioteca, me gusta) plus capturas. It replaces the own
 * column inside NexusProfile, keeping the friends sidebar.
 *
 * Everything comes from SECURITY DEFINER RPCs that already apply the owner's
 * privacy settings (get_public_profile + get_profile_showcase), so a hidden
 * section simply arrives as "not visible" and shows a private notice.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getProfileShowcase, getPublicProfile } from "../../social/socialApi";
import { useSocial } from "../../social/SocialContext";
import type { Profile, ProfileShowcase } from "../../social/socialTypes";
import { remoteGame, type NexusGame } from "../nexusModel";
import { NexusProfileShots } from "./NexusProfileShots";
import { PlayingNow } from "./PlayingNow";
import { GameShelf, PrivateSection, StatCard } from "./profileParts";
import { initialsOf } from "./nexusProfileData";
import {
  BackIcon,
  CheckIcon,
  ClockIcon,
  DotsIcon,
  GridIcon,
  HeartIcon,
  LockIcon,
  PlayIcon,
  SparkIcon,
} from "../NexusIcons";

const XP_PER_LEVEL = 1000;

type Relation = "friends" | "outgoing" | "incoming" | "blocked" | "none";

// Cards for someone else's games: same visuals, no interaction.
const noop = () => {};
const readOnlyCard = () => ({
  readOnly: true,
  isFavorite: false,
  onOpen: noop,
  onLaunch: noop,
  onToggleFavorite: noop,
});

export function NexusUserProfile({ userId, onBack }: { userId: string; onBack: () => void }) {
  const social = useSocial();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showcase, setShowcase] = useState<ProfileShowcase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      getPublicProfile(userId),
      // A backend without migration 0014 has no showcase RPC: keep the
      // profile working and just show library / likes as not shared.
      getProfileShowcase(userId).catch((e) => {
        console.warn("[profile] showcase unavailable:", e);
        return null;
      }),
    ]);
    return { p, s };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMenuOpen(false);
    setActionMsg(null);
    void load()
      .then(({ p, s }) => {
        if (cancelled) return;
        if (!p) setError("No se pudo cargar este perfil.");
        setProfile(p);
        setShowcase(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar el perfil.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Friendship changes (add / accept / block) can change what we may see —
  // re-fetch the filtered data when the relation with this user changes.
  const edge = social.friends.find((f) => f.profile.id === userId);
  const relationKey = edge ? `${edge.status}:${edge.direction}` : "none";
  useEffect(() => {
    if (loading) return;
    void load()
      .then(({ p, s }) => {
        if (p) setProfile(p);
        setShowcase(s);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationKey]);

  // Esc: close the menu first, then go back to the own profile.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (menuOpen) setMenuOpen(false);
      else onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, onBack]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".pf-cover-menu")) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const relation: Relation = edge
    ? edge.status === "accepted"
      ? "friends"
      : edge.status === "blocked"
        ? edge.direction === "outgoing"
          ? "blocked"
          : "none" // they blocked me — treat as no relation here
        : edge.direction === "outgoing"
          ? "outgoing"
          : "incoming"
    : "none";

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setActionMsg(null);
    try {
      const msg = await fn();
      if (msg) setActionMsg(msg);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };
  const sendRequest = () =>
    run(async () => (profile ? (await social.addFriendProfile(profile)).message : undefined));
  const acceptRequest = () =>
    run(async () => {
      if (edge) await social.respondRequest(edge.friendship.id, true);
    });
  const block = () =>
    run(async () => {
      await social.blockUser(userId);
      return "Usuario bloqueado.";
    });
  const unblock = () =>
    run(async () => {
      await social.unblockUser(userId);
      return "Usuario desbloqueado.";
    });
  const submitReport = () =>
    run(async () => {
      await social.reportUser(userId, reportReason);
      setReportOpen(false);
      setReportReason("");
      return "Gracias, hemos recibido tu reporte.";
    });

  const name = profile?.display_name || "Jugador";
  const stats = profile?.stats ?? {};
  const level = stats.level ?? 1;
  const xpInto = (stats.xp ?? 0) % XP_PER_LEVEL;
  const playSeconds = stats.play_seconds ?? 0;
  const hours = Math.floor(playSeconds / 3600);
  const minutes = Math.floor((playSeconds % 3600) / 60);
  const livePresence = social.presence.get(userId);

  const pinnedGames = useMemo<NexusGame[]>(
    () =>
      (profile?.pinned ?? []).map((p, i) =>
        remoteGame({ title: p.title, systemName: p.system, cover: p.cover_url }, i)
      ),
    [profile?.pinned]
  );
  const toGames = (list: ProfileShowcase["library"]["games"] | undefined) =>
    (list ?? []).map((g, i) =>
      remoteGame({ title: g.title, systemId: g.system_id, systemName: g.system, cover: g.cover }, i)
    );
  const libraryGames = useMemo(() => toGames(showcase?.library.games), [showcase]);
  const likedGames = useMemo(() => toGames(showcase?.favorites.games), [showcase]);
  const bannerCover = pinnedGames[0]?.coverUrl ?? libraryGames.find((g) => g.coverUrl)?.coverUrl ?? null;

  const libVisible = !!showcase?.library.visible;
  const favVisible = !!showcase?.favorites.visible;
  // Older backends (no 0014 yet) return no showcase: pinned stays as before.
  const pinVisible = showcase ? showcase.pinned.visible : true;

  return (
    <div className="pf-col">
      <div className="pf-topbar">
        <button className="pf-back" onClick={onBack}>
          <BackIcon size={17} /> Mi perfil
        </button>
        <div className="pf-topbar-spacer" />
      </div>

      <div className="pf-scroll">
        <div className="pf-wrap">
          {loading ? (
            <div className="pf-empty pf-user-state">Cargando perfil…</div>
          ) : error || !profile ? (
            <div className="pf-empty pf-user-state">{error ?? "No se pudo cargar este perfil."}</div>
          ) : (
            <>
              {/* ── Showcase header (same markup as the own profile) ── */}
              <div className="pf-head showcase">
                <div className="pf-cover">
                  <div className="pf-cover-art">
                    {profile.banner_url ? (
                      <img className="pf-cover-img" src={profile.banner_url} alt="" />
                    ) : bannerCover ? (
                      <img className="pf-cover-img" src={bannerCover} alt="" />
                    ) : null}
                  </div>
                  <div className="pf-cover-scrim" />

                  {relation === "none" && (
                    <button className="pf-cover-edit primary" disabled={busy} onClick={() => void sendRequest()}>
                      {busy ? "…" : "Añadir amigo"}
                    </button>
                  )}
                  {relation === "incoming" && (
                    <button className="pf-cover-edit primary" disabled={busy} onClick={() => void acceptRequest()}>
                      {busy ? "…" : "Aceptar solicitud"}
                    </button>
                  )}
                  {relation === "outgoing" && (
                    <button className="pf-cover-edit" disabled>
                      Solicitud enviada
                    </button>
                  )}
                  {relation === "friends" && (
                    <button className="pf-cover-edit" disabled>
                      <CheckIcon size={16} /> Amigos
                    </button>
                  )}
                  {relation === "blocked" && (
                    <button className="pf-cover-edit" disabled={busy} onClick={() => void unblock()}>
                      {busy ? "…" : "Desbloquear"}
                    </button>
                  )}

                  <div className="pf-cover-menu">
                    <button
                      className="pf-cover-menu-btn"
                      onClick={() => setMenuOpen((o) => !o)}
                      aria-label="Más opciones"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                    >
                      <DotsIcon size={18} />
                    </button>
                    {menuOpen && (
                      <div className="pf-account-pop" role="menu">
                        {reportOpen ? (
                          <div className="pf-report">
                            <div className="pf-account-pop-name">Reportar a {name}</div>
                            <textarea
                              className="pf-report-input"
                              placeholder="Motivo del reporte (opcional)…"
                              value={reportReason}
                              onChange={(e) => setReportReason(e.target.value)}
                              rows={3}
                            />
                            <div className="pf-report-actions">
                              <button className="pf-act-btn" disabled={busy} onClick={() => setReportOpen(false)}>
                                Cancelar
                              </button>
                              <button className="pf-act-btn primary" disabled={busy} onClick={() => void submitReport()}>
                                {busy ? "…" : "Enviar"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {relation !== "blocked" && (
                              <button
                                className="pf-account-pop-item"
                                role="menuitem"
                                disabled={busy}
                                onClick={() => {
                                  setMenuOpen(false);
                                  void block();
                                }}
                              >
                                Bloquear
                              </button>
                            )}
                            <button
                              className="pf-account-pop-item danger"
                              role="menuitem"
                              onClick={() => setReportOpen(true)}
                            >
                              Reportar
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {actionMsg && <div className="pf-action-msg">{actionMsg}</div>}
                </div>

                <div className="pf-id">
                  <div className="pf-avatar-ring">
                    <div className="pf-avatar">
                      {profile.avatar_url ? (
                        <img className="pf-avatar-img" src={profile.avatar_url} alt="" />
                      ) : (
                        <div
                          className="pf-avatar-fallback"
                          style={{ background: "linear-gradient(135deg, #3b82f6, #a855f7)" }}
                        >
                          {initialsOf(name)}
                        </div>
                      )}
                    </div>
                    <span className="pf-lvl-badge">{level}</span>
                  </div>
                  <div className="pf-id-main">
                    <div className="pf-name-row">
                      <h1 className="pf-name">{name}</h1>
                      {profile.username && (
                        <span className="pf-handle">
                          {profile.username}
                          {profile.user_tag && <span className="pf-tag">#{profile.user_tag}</span>}
                        </span>
                      )}
                    </div>
                    {livePresence?.playing ? (
                      <div className="pf-status">
                        <PlayingNow
                          title={livePresence.playing_title || livePresence.playing}
                          since={livePresence.playing_since}
                        />
                      </div>
                    ) : profile.status ? (
                      <div className="pf-status">
                        <span className="q">“</span>
                        {profile.status}
                        <span className="q">”</span>
                      </div>
                    ) : null}
                    <div className="pf-xp">
                      <div className="pf-xp-top">
                        <span className="pf-xp-lvl">Nivel {level}</span>
                        <span className="pf-xp-num">
                          {xpInto.toLocaleString("es")} / {XP_PER_LEVEL.toLocaleString("es")} XP
                        </span>
                      </div>
                      <div className="pf-xp-bar">
                        <div className="pf-xp-fill" style={{ width: `${Math.round((xpInto / XP_PER_LEVEL) * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pf-section">
                <div className="pf-stats">
                  <StatCard icon={<ClockIcon size={18} />} label="Tiempo jugado">
                    {hours > 0 ? (
                      <>
                        {hours}
                        <small> h {minutes}m</small>
                      </>
                    ) : (
                      <>
                        {minutes}
                        <small> m</small>
                      </>
                    )}
                  </StatCard>
                  <StatCard icon={<PlayIcon size={18} />} label="Juegos jugados">
                    {stats.games ?? 0}
                  </StatCard>
                  <StatCard icon={<GridIcon size={18} />} label="En biblioteca">
                    {libVisible ? libraryGames.length : <LockIcon size={20} />}
                  </StatCard>
                  <StatCard icon={<HeartIcon size={18} />} label="Me gusta">
                    {favVisible ? likedGames.length : <LockIcon size={20} />}
                  </StatCard>
                  <StatCard icon={<SparkIcon size={18} />} label="Nivel">
                    {level}
                  </StatCard>
                </div>
              </div>

              {pinVisible ? (
                <GameShelf
                  title="Juegos fijados"
                  games={pinnedGames}
                  empty={<div className="pf-empty small">{name} no ha fijado juegos.</div>}
                  cardProps={readOnlyCard}
                />
              ) : (
                <HiddenShelf title="Juegos fijados" text={`${name} no comparte sus juegos fijados contigo.`} />
              )}

              {libVisible ? (
                <GameShelf
                  title="Biblioteca"
                  games={libraryGames}
                  empty={<div className="pf-empty small">La biblioteca de {name} está vacía.</div>}
                  cardProps={readOnlyCard}
                />
              ) : (
                <HiddenShelf title="Biblioteca" text={`${name} no comparte su biblioteca contigo.`} />
              )}

              {favVisible ? (
                <GameShelf
                  title="Me gusta"
                  games={likedGames}
                  empty={<div className="pf-empty small">{name} aún no tiene juegos que le gusten.</div>}
                  cardProps={readOnlyCard}
                />
              ) : (
                <HiddenShelf title="Me gusta" text={`${name} no comparte sus me gusta contigo.`} />
              )}

              <div className="pf-section">
                <NexusProfileShots userId={userId} readOnly />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HiddenShelf({ title, text }: { title: string; text: string }) {
  return (
    <div className="pf-section">
      <div className="pf-section-head">
        <h2>{title}</h2>
      </div>
      <PrivateSection text={text} />
    </div>
  );
}
