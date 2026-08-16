/**
 * NexusPublicProfile — read-only view of ANOTHER user's profile, loaded from the
 * cloud (foto, portada, estado, showcase y capturas). Opened from the friends
 * list. All data comes from the public RPCs (get_public_profile +
 * list_public_screenshots), so it only exposes safe fields.
 */

import { useEffect, useState } from "react";
import {
  getPublicProfile,
  listScreenshots,
} from "../../social/socialApi";
import { useSocial } from "../../social/SocialContext";
import type { Profile, ProfileScreenshot } from "../../social/socialTypes";
import { initialsOf } from "./nexusProfileData";
import { PlayingNow } from "./PlayingNow";
import { BackIcon, ClockIcon, GridIcon, SparkIcon, CloseIcon, GamepadIcon, CheckIcon } from "../NexusIcons";
import "./nexus-public-profile.css";

function hoursLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h} h`;
  const m = Math.floor(seconds / 60);
  return `${m} min`;
}

export function NexusPublicProfile({
  userId,
  onBack,
}: {
  userId: string;
  onBack: () => void;
}) {
  const social = useSocial();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shots, setShots] = useState<ProfileScreenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ProfileScreenshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [p, s] = await Promise.all([getPublicProfile(userId), listScreenshots(userId)]);
        if (cancelled) return;
        if (!p) {
          setError("No se pudo cargar este perfil.");
        } else {
          setProfile(p);
          setShots(s);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar el perfil.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Esc closes (lightbox first, then the view).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (lightbox) setLightbox(null);
      else onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, onBack]);

  const name = profile?.display_name || "Jugador";
  const handle =
    profile?.username && profile?.user_tag ? `${profile.username}#${profile.user_tag}` : null;
  const stats = profile?.stats ?? {};
  const pinned = profile?.pinned ?? [];
  // Live game session (from the global presence lobby), if this user is playing.
  const livePresence = social.presence.get(userId);

  // Relationship with the viewer, to pick the right friend-action button.
  const edge = social.friends.find((f) => f.profile.id === userId);
  const relation: "self" | "friends" | "outgoing" | "incoming" | "blocked" | "none" =
    social.user?.id === userId
      ? "self"
      : edge
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

  const sendRequest = async () => {
    if (!profile) return;
    setBusy(true);
    setActionMsg(null);
    const res = await social.addFriendProfile(profile);
    setActionMsg(res.message);
    setBusy(false);
  };
  const acceptRequest = async () => {
    if (!edge) return;
    setBusy(true);
    setActionMsg(null);
    await social.respondRequest(edge.friendship.id, true);
    setBusy(false);
  };
  const block = async () => {
    setBusy(true);
    setActionMsg(null);
    try {
      await social.blockUser(userId);
      setActionMsg("Usuario bloqueado.");
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };
  const unblock = async () => {
    setBusy(true);
    setActionMsg(null);
    try {
      await social.unblockUser(userId);
      setActionMsg("Usuario desbloqueado.");
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };
  const submitReport = async () => {
    setBusy(true);
    setActionMsg(null);
    try {
      await social.reportUser(userId, reportReason);
      setReportOpen(false);
      setReportReason("");
      setActionMsg("Gracias, hemos recibido tu reporte.");
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <div className="pp" onMouseDown={(e) => { if (e.target === e.currentTarget) onBack(); }}>
      <div className="pp-panel">
        <button className="pp-back" onClick={onBack}>
          <BackIcon size={17} /> Volver
        </button>

        {loading ? (
          <div className="pp-state">Cargando perfil…</div>
        ) : error ? (
          <div className="pp-state pp-error">{error}</div>
        ) : (
          <div className="pp-scroll">
            {/* Header */}
            <div className="pp-head">
              <div className="pp-cover">
                {profile?.banner_url ? (
                  <img className="pp-cover-img" src={profile.banner_url} alt="" />
                ) : (
                  <div className="pp-cover-empty" />
                )}
                <div className="pp-cover-scrim" />
              </div>

              {/* Floating actions — top-right of the banner */}
              {relation !== "self" && (
                <div className="pp-actions">
                  <div className="pp-actions-row">
                    {relation === "none" && (
                      <button
                        className="pp-act primary"
                        type="button"
                        disabled={busy}
                        onClick={() => void sendRequest()}
                      >
                        {busy ? "…" : "Añadir amigo"}
                      </button>
                    )}
                    {relation === "incoming" && (
                      <button
                        className="pp-act primary"
                        type="button"
                        disabled={busy}
                        onClick={() => void acceptRequest()}
                      >
                        {busy ? "…" : "Aceptar"}
                      </button>
                    )}
                    {relation === "outgoing" && (
                      <button className="pp-act" type="button" disabled>
                        Solicitud enviada
                      </button>
                    )}
                    {relation === "friends" && (
                      <button className="pp-act" type="button" disabled>
                        <CheckIcon size={15} /> Amigos
                      </button>
                    )}
                    {relation === "blocked" && (
                      <button
                        className="pp-act"
                        type="button"
                        disabled={busy}
                        onClick={() => void unblock()}
                      >
                        {busy ? "…" : "Desbloquear"}
                      </button>
                    )}
                    {relation !== "blocked" && (
                      <button
                        className="pp-act"
                        type="button"
                        disabled={busy}
                        onClick={() => void block()}
                      >
                        Bloquear
                      </button>
                    )}
                    <button
                      className="pp-act danger"
                      type="button"
                      disabled={busy}
                      onClick={() => setReportOpen((o) => !o)}
                    >
                      Reportar
                    </button>
                  </div>

                  {reportOpen && (
                    <div className="pp-report-pop">
                      <textarea
                        className="ct-input"
                        placeholder="Motivo del reporte (opcional)…"
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        rows={3}
                        style={{ width: "100%", resize: "vertical" }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          className="pp-act primary"
                          type="button"
                          disabled={busy}
                          onClick={() => void submitReport()}
                        >
                          {busy ? "…" : "Enviar"}
                        </button>
                        <button
                          className="pp-act"
                          type="button"
                          disabled={busy}
                          onClick={() => setReportOpen(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {actionMsg && <span className="pp-action-msg">{actionMsg}</span>}
                </div>
              )}

              <div className="pp-id">
                <div className="pp-avatar">
                  {profile?.avatar_url ? (
                    <img className="pp-avatar-img" src={profile.avatar_url} alt="" />
                  ) : (
                    <div className="pp-avatar-fallback">{initialsOf(name)}</div>
                  )}
                  {!!stats.level && <span className="pp-lvl">{stats.level}</span>}
                </div>
                <div className="pp-id-main">
                  <h1 className="pp-name">{name}</h1>
                  {handle && <div className="pp-handle">{handle}</div>}
                  {livePresence?.playing ? (
                    <p className="pp-playing">
                      <PlayingNow
                        title={livePresence.playing_title || livePresence.playing}
                        since={livePresence.playing_since}
                      />
                    </p>
                  ) : profile?.status ? (
                    <p className="pp-status">{profile.status}</p>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="pp-stats">
              <div className="pp-stat">
                <ClockIcon size={18} />
                <b>{hoursLabel(stats.play_seconds ?? 0)}</b>
                <span>jugadas</span>
              </div>
              <div className="pp-stat">
                <GridIcon size={18} />
                <b>{stats.games ?? 0}</b>
                <span>juegos</span>
              </div>
              <div className="pp-stat">
                <SparkIcon size={18} />
                <b>{stats.level ?? 1}</b>
                <span>nivel</span>
              </div>
            </div>

            {/* Showcase */}
            <div className="pp-section">
              <div className="pp-sec-title">Destacados</div>
              {pinned.length > 0 ? (
                <div className="pp-pins">
                  {pinned.map((g, i) => (
                    <div className="pp-pin" key={`${g.title}:${i}`}>
                      <div className="pp-pin-art">
                        {g.cover_url ? <img src={g.cover_url} alt="" /> : <GamepadIcon size={22} />}
                      </div>
                      <div className="pp-pin-txt">
                        <b>{g.title}</b>
                        {g.system && <span>{g.system}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pp-empty">Sin juegos destacados</div>
              )}
            </div>

            {/* Screenshots */}
            <div className="pp-section">
              <div className="pp-sec-title">Capturas</div>
              {shots.length > 0 ? (
                <div className="pp-shots">
                  {shots.map((s) => (
                    <button className="pp-shot" key={s.id} onClick={() => setLightbox(s)}>
                      <img src={s.url} alt={s.caption ?? ""} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="pp-empty">Sin capturas</div>
              )}
            </div>
          </div>
        )}
      </div>

      {lightbox && (
        <div className="pp-lightbox" onMouseDown={() => setLightbox(null)}>
          <button className="pp-lightbox-close" aria-label="Cerrar">
            <CloseIcon size={22} />
          </button>
          <img src={lightbox.url} alt={lightbox.caption ?? ""} onMouseDown={(e) => e.stopPropagation()} />
          {lightbox.caption && <div className="pp-lightbox-cap">{lightbox.caption}</div>}
        </div>
      )}
    </div>
  );
}
