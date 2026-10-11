/**
 * NexusFriendsSidebar — Discord-style right column for the own-profile view.
 * Relocates the friends experience that used to live behind the "Amigos" /
 * "Actividad" tabs into a persistent side panel: search, add-by-code, incoming
 * requests, a collapsible activity section, and the live On-line / Off-line
 * lists. It doesn't rewrite the social behaviour — it reads the same `useSocial`
 * state and calls the same actions; clicking a friend opens their full public
 * profile via `onOpenFriend` (the launcher has no quick popover).
 *
 * Signed out / not configured / loading reuse the existing NexusFriends panel
 * (sign-in · register · recovery) so the sidebar is still the way in.
 */

import { useState } from "react";
import { useSocial } from "../../social/SocialContext";
import type { Profile } from "../../social/socialTypes";
import { initialsOf } from "./nexusProfileData";
import { NexusFriends } from "./NexusFriends";
import { PlayingNow } from "./PlayingNow";
import { FriendPopover, FriendCompare, type MeSummary } from "./NexusFriendPopover";
import { SearchIcon, CheckIcon, CloseIcon, ChevronRightIcon } from "../NexusIcons";

const AVATAR_FALLBACK = "linear-gradient(140deg,#3b82f6,#a855f7)";

/** Small "add friend" glyph (a person with a +), local to the sidebar. */
const UserPlusIcon = ({ size = 16, className }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="22" y1="11" x2="16" y2="11" />
  </svg>
);

export function NexusFriendsSidebar({
  onOpenFriend,
  me,
}: {
  /** Open a friend's full public profile. */
  onOpenFriend: (userId: string) => void;
  /** Signed-in user summary, for the compare overlay. */
  me: MeSummary;
}) {
  const social = useSocial();

  // Signed out / not configured / loading → reuse the existing auth + status
  // panel (sign-in, register, recovery). Only the signed-in state gets the
  // compact friends body.
  if (!social.user) {
    return (
      <aside className="pf-social pf-social-auth">
        <div className="sb-authwrap">
          <NexusFriends onViewProfile={onOpenFriend} />
        </div>
      </aside>
    );
  }

  return <SidebarBody onOpenFriend={onOpenFriend} me={me} />;
}

function SidebarBody({
  onOpenFriend,
  me,
}: {
  onOpenFriend: (userId: string) => void;
  me: MeSummary;
}) {
  const social = useSocial();
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [code, setCode] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [actOpen, setActOpen] = useState(true);
  // Clicking a friend opens a quick preview popover first (anchored to the row).
  // "Ver perfil" then opens the full profile; "Comparar" opens the versus view.
  const [pop, setPop] = useState<{ profile: Profile; anchor: DOMRect } | null>(null);
  const [compareWith, setCompareWith] = useState<Profile | null>(null);

  const accepted = social.friends.filter((f) => f.status === "accepted");
  const incoming = social.friends.filter(
    (f) => f.status === "pending" && f.direction === "incoming"
  );

  const term = q.trim().toLowerCase();
  const match = (name: string, handle: string | null) =>
    !term || name.toLowerCase().includes(term) || (handle ?? "").toLowerCase().includes(term);
  const filtered = accepted.filter((f) => match(f.profile.display_name, f.profile.username));
  const online = filtered.filter((f) => social.presence.has(f.profile.id));
  const offline = filtered.filter((f) => !social.presence.has(f.profile.id));

  // Add by exact handle (usuario#TAG) or friend code (NX-…): resolve the
  // profile, then send the request — same two-step flow as the friends tab.
  const sendCode = async () => {
    const raw = code.trim();
    if (!raw || adding) return;
    setAdding(true);
    setAddMsg("");
    try {
      const res = await social.findProfile(raw);
      if (res.ok && res.profile) {
        const add = await social.addFriendProfile(res.profile);
        setAddMsg(add.message);
        if (add.ok) setCode("");
      } else {
        setAddMsg(res.message);
      }
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const renderRow = (f: (typeof accepted)[number]) => {
    const p = f.profile;
    const pres = social.presence.get(p.id);
    const isOnline = !!pres;
    const away = pres?.status === "away";
    const playing = pres?.playing ?? null;
    return (
      <button
        key={f.friendship.id}
        className={"sb-fr" + (isOnline ? "" : " off")}
        onClick={(e) => setPop({ profile: p, anchor: e.currentTarget.getBoundingClientRect() })}
      >
        <span
          className="sb-fr-ava"
          style={p.avatar_url ? undefined : { background: AVATAR_FALLBACK }}
        >
          {p.avatar_url ? <img src={p.avatar_url} alt="" /> : initialsOf(p.display_name)}
          <span
            className="sb-fr-pres"
            style={{ background: isOnline ? (away ? "#fbbf24" : "#4ade80") : "#6b7280" }}
          />
        </span>
        <span className="sb-fr-txt">
          <span className="sb-fr-name">{p.display_name}</span>
          <span className="sb-fr-sub">
            {playing ? (
              <PlayingNow title={pres?.playing_title || playing} since={pres?.playing_since} />
            ) : away ? (
              "Ausente"
            ) : isOnline ? (
              "En línea"
            ) : (
              "Desconectado"
            )}
          </span>
        </span>
      </button>
    );
  };

  return (
    <aside className="pf-social">
      <div className="sb-top">
        <div className="sb-search">
          <SearchIcon size={15} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar amigos"
          />
        </div>
        <button
          className={"sb-addbtn" + (showAdd ? " on" : "")}
          title="Añadir amigo"
          onClick={() => setShowAdd((v) => !v)}
        >
          <UserPlusIcon size={16} />
        </button>
      </div>

      {showAdd && (
        <div className="sb-add">
          <div className="sb-add-field">
            <input
              value={code}
              placeholder="usuario#ID o NX-0000-0000"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void sendCode();
              }}
            />
            <button onClick={() => void sendCode()} disabled={adding}>
              {adding ? "…" : "Enviar"}
            </button>
          </div>
          {addMsg ? (
            <div className="sb-add-msg">{addMsg}</div>
          ) : (
            <div className="sb-hint">
              Tu código: <b>{social.profile?.friend_code ?? "—"}</b>
            </div>
          )}
        </div>
      )}

      <div className="sb-scroll">
        {incoming.length > 0 && (
          <section className="sb-sec">
            <div className="sb-sec-head">
              Solicitudes <span className="n">{incoming.length}</span>
            </div>
            {incoming.map((f) => (
              <div key={f.friendship.id} className="sb-req">
                <span
                  className="sb-fr-ava"
                  style={f.profile.avatar_url ? undefined : { background: AVATAR_FALLBACK }}
                >
                  {f.profile.avatar_url ? (
                    <img src={f.profile.avatar_url} alt="" />
                  ) : (
                    initialsOf(f.profile.display_name)
                  )}
                </span>
                <span className="sb-fr-txt">
                  <span className="sb-fr-name">{f.profile.display_name}</span>
                  <span className="sb-fr-sub">Quiere ser tu amigo</span>
                </span>
                <span className="sb-req-acts">
                  <button
                    className="sb-mini ok"
                    title="Aceptar"
                    onClick={() => void social.respondRequest(f.friendship.id, true)}
                  >
                    <CheckIcon size={14} />
                  </button>
                  <button
                    className="sb-mini no"
                    title="Rechazar"
                    onClick={() => void social.respondRequest(f.friendship.id, false)}
                  >
                    <CloseIcon size={14} />
                  </button>
                </span>
              </div>
            ))}
          </section>
        )}

        <section className="sb-sec">
          <button className="sb-sec-head btn" onClick={() => setActOpen((v) => !v)}>
            Actividad
            <span className={"sb-chev" + (actOpen ? " open" : "")}>
              <ChevronRightIcon size={14} />
            </span>
          </button>
          {actOpen && (
            <div className="sb-hint pad">El feed de actividad de amigos llega próximamente.</div>
          )}
        </section>

        <section className="sb-sec">
          <div className="sb-sec-head">
            En línea <span className="n">{online.length}</span>
          </div>
          {online.length ? (
            <div className="sb-list">{online.map(renderRow)}</div>
          ) : (
            <div className="sb-hint pad">Ninguno en línea.</div>
          )}
        </section>

        {offline.length > 0 && (
          <section className="sb-sec">
            <div className="sb-sec-head">
              Desconectados <span className="n">{offline.length}</span>
            </div>
            <div className="sb-list">{offline.map(renderRow)}</div>
          </section>
        )}

        {accepted.length === 0 && (
          <div className="sb-hint pad">
            Aún no tienes amigos. Añádelos con el botón <b>+</b> por su código.
          </div>
        )}
        {filtered.length === 0 && accepted.length > 0 && term && (
          <div className="sb-hint pad">Sin resultados para “{q}”.</div>
        )}
      </div>

      {pop && (
        <FriendPopover
          profile={pop.profile}
          anchor={pop.anchor}
          presence={social.presence.get(pop.profile.id)}
          onClose={() => setPop(null)}
          onOpenFull={(id) => {
            setPop(null);
            onOpenFriend(id);
          }}
          onCompare={(profile) => {
            setPop(null);
            setCompareWith(profile);
          }}
        />
      )}
      {compareWith && (
        <FriendCompare me={me} them={compareWith} onClose={() => setCompareWith(null)} />
      )}
    </aside>
  );
}
