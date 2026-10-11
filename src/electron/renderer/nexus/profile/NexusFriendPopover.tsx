/**
 * NexusFriendPopover — quick preview card shown when a friend row in the social
 * sidebar is clicked, before opening the full profile. Anchored next to the row
 * (flips to the other side near the screen edge). "Ver perfil" opens the full
 * public profile; "Comparar" opens a head-to-head stats overlay. Both render
 * through a portal (like the confirm dialog) so they float above everything and
 * carry their own token scope outside `.nexus-root`.
 *
 * All data is real: the friend card comes from the already-loaded FriendEdge
 * profile (get_public_profiles returns stats/pinned/banner), and the comparison
 * pits the signed-in user's derived stats against the friend's synced stats.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Profile, PresenceState } from "../../social/socialTypes";
import type { NexusProfileStats } from "./nexusProfileData";
import { initialsOf } from "./nexusProfileData";
import { PlayingNow } from "./PlayingNow";
import { CloseIcon, GamepadIcon } from "../NexusIcons";

const AVATAR_FALLBACK = "linear-gradient(140deg,#3b82f6,#a855f7)";

/** Signed-in user summary passed down for the compare overlay. */
export interface MeSummary {
  stats: NexusProfileStats;
  name: string;
  avatarUrl: string | null;
}

function presenceColor(pres: PresenceState | undefined): string {
  if (!pres) return "#6b7280";
  return pres.status === "away" ? "#fbbf24" : "#4ade80";
}

function presenceLabel(pres: PresenceState | undefined): string {
  if (!pres) return "Desconectado";
  return pres.status === "away" ? "Ausente" : "En línea";
}

export function FriendPopover({
  profile,
  anchor,
  presence,
  onClose,
  onOpenFull,
  onCompare,
}: {
  profile: Profile;
  anchor: DOMRect;
  presence: PresenceState | undefined;
  onClose: () => void;
  onOpenFull: (userId: string) => void;
  onCompare: (profile: Profile) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  // Anchor to the right of the row; flip to the left when it would overflow the
  // viewport (the sidebar sits at the right edge, so it usually opens leftward).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Gap between the popover and the anchoring row / social panel edge.
    const GAP = 22;
    let left = anchor.right + GAP;
    if (left + w > window.innerWidth - 16) left = anchor.left - w - GAP;
    if (left < 16) left = 16;
    let top = anchor.top;
    if (top + h > window.innerHeight - 16) top = window.innerHeight - h - 16;
    if (top < 76) top = 76;
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stats = profile.stats ?? {};
  const hours = Math.floor((stats.play_seconds ?? 0) / 3600);
  const handle =
    profile.username && profile.user_tag
      ? `${profile.username}#${profile.user_tag}`
      : profile.username ?? "";

  return createPortal(
    <div className="nexus-social-pop">
      <div className="fr-pop-back" onClick={onClose} />
      <div className="fr-pop" ref={ref} style={{ left: pos.left, top: pos.top }}>
        <div className="fr-pop-cover">
          {profile.banner_url ? (
            <img src={profile.banner_url} alt="" />
          ) : (
            <div className="fr-pop-cover-fill" />
          )}
        </div>
        <div className="fr-pop-top">
          <div
            className="fr-pop-ava"
            style={profile.avatar_url ? undefined : { background: AVATAR_FALLBACK }}
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" />
            ) : (
              initialsOf(profile.display_name)
            )}
          </div>
          <div className="fr-pop-name">{profile.display_name}</div>
          {handle && <div className="fr-pop-handle">{handle}</div>}
          <div className="fr-pop-pres">
            <span className="dot" style={{ background: presenceColor(presence) }} />
            {presence?.playing ? (
              <PlayingNow
                title={presence.playing_title || presence.playing}
                since={presence.playing_since}
              />
            ) : (
              presenceLabel(presence)
            )}
          </div>
        </div>
        <div className="fr-pop-stats">
          <div className="fr-pop-stat">
            <b>{stats.level ?? 1}</b>
            <span>Nivel</span>
          </div>
          <div className="fr-pop-stat">
            <b>{stats.games ?? 0}</b>
            <span>Juegos</span>
          </div>
          <div className="fr-pop-stat">
            <b>
              {hours}
              <small> h</small>
            </b>
            <span>Jugadas</span>
          </div>
        </div>
        <div className="fr-pop-acts">
          <button className="pf-act-btn primary" onClick={() => onOpenFull(profile.id)}>
            Ver perfil
          </button>
          <button className="pf-act-btn" onClick={() => onCompare(profile)}>
            Comparar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function FriendCompare({
  me,
  them,
  onClose,
}: {
  me: MeSummary;
  them: Profile;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const t = them.stats ?? {};
  const rows: { lbl: string; a: number; b: number }[] = [
    { lbl: "Nivel", a: me.stats.level, b: t.level ?? 1 },
    {
      lbl: "Horas jugadas",
      a: Math.floor(me.stats.totalSeconds / 3600),
      b: Math.floor((t.play_seconds ?? 0) / 3600),
    },
    { lbl: "Juegos", a: me.stats.playedGames, b: t.games ?? 0 },
    { lbl: "XP", a: me.stats.xpTotal, b: t.xp ?? 0 },
  ];
  const pins = them.pinned ?? [];
  const firstName = them.display_name.split(" ")[0];

  return createPortal(
    <div
      className="nexus-social-pop cmp"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmp-panel">
        <div className="cmp-head">
          <div className="cmp-vs">
            <div className="cmp-who">
              <div
                className="a"
                style={me.avatarUrl ? undefined : { background: "linear-gradient(135deg,#3b82f6,#a855f7)" }}
              >
                {me.avatarUrl ? <img src={me.avatarUrl} alt="" /> : initialsOf(me.name)}
              </div>
              <div>
                <div className="cmp-who-name">Tú</div>
                <div className="cmp-who-lvl">Nivel {me.stats.level}</div>
              </div>
            </div>
            <span className="cmp-vs-badge">VS</span>
            <div className="cmp-who">
              <div
                className="a"
                style={them.avatar_url ? undefined : { background: AVATAR_FALLBACK }}
              >
                {them.avatar_url ? (
                  <img src={them.avatar_url} alt="" />
                ) : (
                  initialsOf(them.display_name)
                )}
              </div>
              <div>
                <div className="cmp-who-name">{them.display_name}</div>
                <div className="cmp-who-lvl">Nivel {t.level ?? 1}</div>
              </div>
            </div>
          </div>
          <button className="cmp-close" onClick={onClose} aria-label="Cerrar">
            <CloseIcon size={20} />
          </button>
        </div>
        <div className="cmp-body">
          {rows.map((r) => {
            const max = Math.max(r.a, r.b) || 1;
            return (
              <div className="cmp-row" key={r.lbl}>
                <div className={"cmp-val me" + (r.a >= r.b ? " win" : "")}>
                  {r.a.toLocaleString("es")}
                </div>
                <div className="cmp-lbl">{r.lbl}</div>
                <div className={"cmp-val them" + (r.b >= r.a ? " win" : "")}>
                  {r.b.toLocaleString("es")}
                </div>
                <div className="cmp-bar">
                  <div className="b me">
                    <i style={{ width: (r.a / max) * 100 + "%" }} />
                  </div>
                  <div className="b them">
                    <i style={{ width: (r.b / max) * 100 + "%" }} />
                  </div>
                </div>
              </div>
            );
          })}
          {pins.length > 0 && (
            <div className="cmp-shared">
              <h4>Destacados de {firstName}</h4>
              <div className="cmp-shared-row">
                {pins.map((g, i) => (
                  <div className="cmp-pin" key={`${g.title}:${i}`}>
                    <div className="cmp-pin-art">
                      {g.cover_url ? <img src={g.cover_url} alt="" /> : <GamepadIcon size={20} />}
                    </div>
                    <span>{g.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
