/**
 * NexusFriends — the profile "Amigos" tab, wired to the real social backend.
 * Signed-out → email sign-in/up panel. Signed-in → your friend code, add-by-code,
 * incoming/outgoing requests, and the friends list with live presence
 * (online / "jugando a X").
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSocial } from "../../social/SocialContext";
import type { FriendEdge, Profile } from "../../social/socialTypes";
import { initialsOf } from "./nexusProfileData";
import { CheckIcon, CloseIcon, PlayIcon, EyeIcon, EyeOffIcon } from "../NexusIcons";
import { NexusRegisterModal } from "./NexusRegisterModal";

export function NexusFriends({
  onViewProfile,
}: {
  /** Open another user's public profile (from a friend row). */
  onViewProfile?: (userId: string) => void;
} = {}) {
  const social = useSocial();

  if (!social.configured) {
    return (
      <div className="pf-empty">
        <div className="pf-empty-title">Social no configurado</div>
        <div className="pf-empty-sub">Falta la conexión con el servidor (Supabase).</div>
      </div>
    );
  }
  if (social.loading) {
    return <div className="pf-empty"><div className="pf-empty-sub">Cargando…</div></div>;
  }
  if (!social.user) return <SignInPanel />;
  return <FriendsBody onViewProfile={onViewProfile} />;
}

function SignInPanel() {
  const social = useSocial();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [forgot, setForgot] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await social.signIn(identifier, password);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (forgot) return <ForgotPasswordPanel initialId={identifier} onBack={() => setForgot(false)} />;

  return (
    <div className="fr-auth">
      <div className="fr-auth-head">
        <h3>Inicia sesión</h3>
        <p>Conecta tu cuenta EmuraOS para añadir amigos y ver quién está en línea.</p>
      </div>
      <form className="fr-auth-form" onSubmit={submit}>
        <input
          className="ct-input"
          type="text"
          placeholder="Usuario o email"
          value={identifier}
          autoComplete="username"
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <div className="fr-pw">
          <input
            className="ct-input fr-pw-input"
            type={showPw ? "text" : "password"}
            placeholder="Contraseña"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="fr-pw-eye"
            onClick={() => setShowPw((s) => !s)}
            aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPw ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
          </button>
        </div>
        <button className="pf-act-btn primary" type="submit" disabled={busy}>
          {busy ? "…" : "Entrar"}
        </button>
      </form>
      {msg && <div className="fr-auth-msg">{msg}</div>}
      <button className="fr-auth-link" onClick={() => setForgot(true)}>
        ¿Olvidaste tu contraseña?
      </button>
      <button className="fr-auth-switch" onClick={() => setRegistering(true)}>
        ¿No tienes cuenta? Regístrate
      </button>

      {registering && (
        <NexusRegisterModal
          onClose={() => setRegistering(false)}
          onSwitchToSignIn={() => setRegistering(false)}
        />
      )}
    </div>
  );
}

function ForgotPasswordPanel({ initialId, onBack }: { initialId: string; onBack: () => void }) {
  const social = useSocial();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [identifier, setIdentifier] = useState(initialId);
  const [otp, setOtp] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await social.requestPasswordReset(identifier.trim());
      setStep("verify");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length < 6) {
      setMsg("Introduce el código de 6 dígitos del correo.");
      return;
    }
    if (newPw.length < 8) {
      setMsg("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      // On success the user ends up signed in → NexusFriends swaps to FriendsBody.
      await social.resetPassword(identifier.trim(), otp.trim(), newPw);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fr-auth">
      <div className="fr-auth-head">
        <h3>Recuperar contraseña</h3>
        <p>
          {step === "request"
            ? "Te enviaremos un código de 6 dígitos a tu correo para restablecerla."
            : "Revisa tu correo e introduce el código junto con tu nueva contraseña."}
        </p>
      </div>

      {step === "request" ? (
        <form className="fr-auth-form" onSubmit={request}>
          <input
            className="ct-input"
            type="text"
            placeholder="Usuario o email"
            value={identifier}
            autoComplete="username"
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
          <button className="pf-act-btn primary" type="submit" disabled={busy}>
            {busy ? "…" : "Enviar código"}
          </button>
        </form>
      ) : (
        <form className="fr-auth-form" onSubmit={verify}>
          <input
            className="ct-input mono"
            type="text"
            inputMode="numeric"
            placeholder="Código de 6 dígitos"
            value={otp}
            maxLength={6}
            autoComplete="one-time-code"
            onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            required
          />
          <div className="fr-pw">
            <input
              className="ct-input fr-pw-input"
              type={showPw ? "text" : "password"}
              placeholder="Nueva contraseña (mín. 8)"
              value={newPw}
              autoComplete="new-password"
              onChange={(e) => setNewPw(e.target.value)}
              required
            />
            <button
              type="button"
              className="fr-pw-eye"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPw ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
            </button>
          </div>
          <button className="pf-act-btn primary" type="submit" disabled={busy}>
            {busy ? "…" : "Cambiar contraseña"}
          </button>
          <button
            type="button"
            className="fr-auth-link"
            onClick={() => void request({ preventDefault: () => {} } as React.FormEvent)}
            disabled={busy}
          >
            Reenviar código
          </button>
        </form>
      )}

      {msg && <div className="fr-auth-msg">{msg}</div>}
      <button className="fr-auth-switch" onClick={onBack}>
        ← Volver a iniciar sesión
      </button>
    </div>
  );
}

function FriendsBody({ onViewProfile }: { onViewProfile?: (userId: string) => void }) {
  const social = useSocial();
  const [code, setCode] = useState("");
  const [addMsg, setAddMsg] = useState<string | null>(null);
  // Search results for the "Buscar usuario" box (exact handle/code → one row;
  // partial name → a list). Any user, friend or not.
  const [results, setResults] = useState<Profile[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  // Friend pending removal — non-null shows the confirmation dialog.
  const [pendingRemove, setPendingRemove] = useState<FriendEdge | null>(null);
  const [removing, setRemoving] = useState(false);

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    setRemoving(true);
    try {
      await social.removeFriend(pendingRemove.friendship.id);
    } finally {
      setRemoving(false);
      setPendingRemove(null);
    }
  };

  const incoming = social.friends.filter((f) => f.status === "pending" && f.direction === "incoming");
  const outgoing = social.friends.filter((f) => f.status === "pending" && f.direction === "outgoing");
  const accepted = social.friends.filter((f) => f.status === "accepted");
  // Users I've blocked (I'm the requester of the 'blocked' row).
  const blocked = social.friends.filter((f) => f.status === "blocked" && f.direction === "outgoing");

  // Search: exact (usuario#TAG or NX-code) resolves a single profile; anything
  // else is a partial-name lookup that returns a list.
  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = code.trim();
    if (!raw) return;
    setSearching(true);
    setAddMsg(null);
    setResults([]);
    try {
      const isExact = raw.includes("#") || /^nx-/i.test(raw);
      if (isExact) {
        const res = await social.findProfile(raw);
        if (res.ok && res.profile) setResults([res.profile]);
        else setAddMsg(res.message);
      } else {
        const list = await social.searchProfiles(raw);
        setResults(list);
        if (list.length === 0) setAddMsg("No se encontró a nadie con ese nombre.");
      }
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSearched(true);
      setSearching(false);
    }
  };

  const online = accepted.filter((f) => social.presence.has(f.profile.id));
  const offline = accepted.filter((f) => !social.presence.has(f.profile.id));
  const requestCount = incoming.length + outgoing.length;

  return (
    <div className="fr-grid">
      {/* ── Left: friends list (online / offline) ─────────────── */}
      <div className="fr-col-main">
        {accepted.length === 0 ? (
          <div className="fr-empty-list">Aún no tienes ningún amigo agregado</div>
        ) : (
          <>
            {online.length > 0 && (
              <FriendGroup label="En línea" count={online.length}>
                {online.map((f) => {
                  const pres = social.presence.get(f.profile.id);
                  return (
                    <FriendRow
                      key={f.friendship.id}
                      edge={f}
                      online
                      away={pres?.status === "away"}
                      playing={pres?.playing ?? null}
                      onOpen={onViewProfile ? () => onViewProfile(f.profile.id) : undefined}
                    >
                      <button
                        className="fr-mini no"
                        title="Eliminar amigo"
                        onClick={() => setPendingRemove(f)}
                      >
                        <CloseIcon size={16} />
                      </button>
                    </FriendRow>
                  );
                })}
              </FriendGroup>
            )}
            {offline.length > 0 && (
              <FriendGroup label="Desconectados" count={offline.length}>
                {offline.map((f) => (
                  <FriendRow
                    key={f.friendship.id}
                    edge={f}
                    online={false}
                    onOpen={onViewProfile ? () => onViewProfile(f.profile.id) : undefined}
                  >
                    <button
                      className="fr-mini no"
                      title="Eliminar amigo"
                      onClick={() => setPendingRemove(f)}
                    >
                      <CloseIcon size={16} />
                    </button>
                  </FriendRow>
                ))}
              </FriendGroup>
            )}
          </>
        )}

        {blocked.length > 0 && (
          <FriendGroup label="Bloqueados" count={blocked.length}>
            {blocked.map((f) => (
              <FriendRow
                key={f.friendship.id}
                edge={f}
                onOpen={onViewProfile ? () => onViewProfile(f.profile.id) : undefined}
              >
                <button
                  type="button"
                  title="Desbloquear"
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                  }}
                  onClick={() => void social.unblockUser(f.profile.id)}
                >
                  Desbloquear
                </button>
              </FriendRow>
            ))}
          </FriendGroup>
        )}
      </div>

      {/* ── Right: requests + add friend (always visible) ─────── */}
      <div className="fr-col-side">
        <div className="fr-panel">
          <div className="fr-panel-head">
            Solicitudes
            {requestCount > 0 && <span className="fr-panel-count">{requestCount}</span>}
          </div>
          {requestCount === 0 ? (
            <div className="pf-empty small">No tienes solicitudes pendientes.</div>
          ) : (
            <div className="fr-list">
              {incoming.map((f) => (
                <FriendRow
                  key={f.friendship.id}
                  edge={f}
                  compact
                  onOpen={onViewProfile ? () => onViewProfile(f.profile.id) : undefined}
                >
                  <button
                    className="fr-mini ok"
                    title="Aceptar"
                    onClick={() => void social.respondRequest(f.friendship.id, true)}
                  >
                    <CheckIcon size={16} />
                  </button>
                  <button
                    className="fr-mini no"
                    title="Rechazar"
                    onClick={() => void social.respondRequest(f.friendship.id, false)}
                  >
                    <CloseIcon size={16} />
                  </button>
                </FriendRow>
              ))}
              {outgoing.map((f) => (
                <FriendRow
                  key={f.friendship.id}
                  edge={f}
                  compact
                  subOverride="Solicitud enviada · pendiente"
                  onOpen={onViewProfile ? () => onViewProfile(f.profile.id) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <div className="fr-panel">
          <div className="fr-panel-head">Buscar usuario</div>
          <form className="fr-add" onSubmit={runSearch}>
            <input
              className="ct-input mono"
              placeholder="nombre, usuario#ID o NX-0000-0000"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (results.length) setResults([]);
                if (searched) setSearched(false);
              }}
            />
            <button className="pf-act-btn primary" type="submit" disabled={searching}>
              {searching ? "…" : "Buscar"}
            </button>
          </form>
          <div className="fr-add-hint">
            Busca por <b>nombre</b>, por <b>usuario#ID</b> (p. ej. alex#AX12) o por código de
            amigo para ver su perfil o añadirlo.
          </div>
          {addMsg && <div className="fr-add-msg">{addMsg}</div>}

          {results.length > 0 && (
            <div
              className="fr-results"
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {results.map((p) => (
                <FriendSearchResult key={p.id} profile={p} onView={onViewProfile} />
              ))}
            </div>
          )}
        </div>
      </div>

      {pendingRemove && (
        <ConfirmRemoveDialog
          name={pendingRemove.profile.display_name}
          busy={removing}
          onCancel={() => {
            if (!removing) setPendingRemove(null);
          }}
          onConfirm={() => void confirmRemove()}
        />
      )}
    </div>
  );
}

// A single search result (handle/code/name). Lets you view the public profile
// or add the user, with relationship-aware button state.
function FriendSearchResult({
  profile,
  onView,
}: {
  profile: Profile;
  onView?: (userId: string) => void;
}) {
  const social = useSocial();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const edge = social.friends.find((f) => f.profile.id === profile.id);
  const relation: "friends" | "outgoing" | "incoming" | "blocked" | "none" = edge
    ? edge.status === "accepted"
      ? "friends"
      : edge.status === "blocked"
        ? "blocked"
        : edge.direction === "outgoing"
          ? "outgoing"
          : "incoming"
    : "none";

  const add = async () => {
    setBusy(true);
    setMsg(null);
    const res = await social.addFriendProfile(profile);
    setMsg(res.message);
    setBusy(false);
  };

  return (
    <div className="fr-result">
      <div className="fr-row compact">
        <span
          className="fr-ava"
          onClick={onView ? () => onView(profile.id) : undefined}
          style={{
            ...(profile.avatar_url
              ? {}
              : { background: "linear-gradient(140deg,#3b82f6,#a855f7)" }),
            ...(onView ? { cursor: "pointer" } : {}),
          }}
        >
          {profile.avatar_url ? (
            <img className="fr-ava-img" src={profile.avatar_url} alt="" />
          ) : (
            initialsOf(profile.display_name)
          )}
        </span>
        <span
          className="fr-info"
          onClick={onView ? () => onView(profile.id) : undefined}
          style={onView ? { cursor: "pointer" } : undefined}
        >
          <span className="fr-name-row">
            <span className="fr-name">{profile.display_name}</span>
            {profile.username && (
              <span className="fr-handle">
                {profile.username}
                {profile.user_tag && <span className="fr-tag">#{profile.user_tag}</span>}
              </span>
            )}
          </span>
          <span className="fr-sub">{profile.status || "Sin estado"}</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          className="pf-act-btn"
          type="button"
          style={{ flex: 1 }}
          onClick={() => onView?.(profile.id)}
        >
          Ver perfil
        </button>
        {relation === "none" && (
          <button
            className="pf-act-btn primary"
            type="button"
            style={{ flex: 1 }}
            disabled={busy}
            onClick={() => void add()}
          >
            {busy ? "…" : "Añadir"}
          </button>
        )}
        {relation === "outgoing" && (
          <button className="pf-act-btn" type="button" style={{ flex: 1 }} disabled>
            Enviada
          </button>
        )}
        {relation === "incoming" && (
          <button className="pf-act-btn" type="button" style={{ flex: 1 }} disabled>
            Te ha enviado
          </button>
        )}
        {relation === "friends" && (
          <button className="pf-act-btn" type="button" style={{ flex: 1 }} disabled>
            Amigos
          </button>
        )}
        {relation === "blocked" && (
          <button className="pf-act-btn" type="button" style={{ flex: 1 }} disabled>
            Bloqueado
          </button>
        )}
      </div>
      {msg && (
        <div className="fr-add-msg" style={{ marginTop: 6 }}>
          {msg}
        </div>
      )}
    </div>
  );
}

function ConfirmRemoveDialog({
  name,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Esc cancels (matches the register modal's behaviour).
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return createPortal(
    <div className="nexus-confirm">
      <div
        className="cf-stage"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div className="cf-modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-title">
          <div className="cf-icon">
            <CloseIcon size={24} />
          </div>
          <h2 id="cf-title" className="cf-title">
            ¿Eliminar amigo?
          </h2>
          <p className="cf-text">
            Vas a eliminar a <b>{name}</b> de tu lista de amigos. Esta acción no se puede deshacer.
          </p>
          <div className="cf-actions">
            <button className="cf-btn" onClick={onCancel} disabled={busy}>
              Cancelar
            </button>
            <button className="cf-btn danger" onClick={onConfirm} disabled={busy} autoFocus>
              {busy ? "Eliminando…" : "Eliminar"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function FriendGroup({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div className="fr-group">
      <div className="fr-group-label">
        {label} <span className="count">{count}</span>
      </div>
      <div className="fr-list">{children}</div>
    </div>
  );
}

function FriendRow({
  edge,
  online,
  away,
  playing,
  compact,
  subOverride,
  onOpen,
  children,
}: {
  edge: FriendEdge;
  online?: boolean;
  /** Present but idle → amber dot + "Ausente". */
  away?: boolean;
  playing?: string | null;
  /** Tighter row for the requests panel (smaller avatar, no presence dot). */
  compact?: boolean;
  /** Force the subtitle text (used for outgoing requests). */
  subOverride?: string;
  /** Open this user's public profile (avatar/info become clickable). */
  onOpen?: () => void;
  children?: React.ReactNode;
}) {
  const p = edge.profile;
  return (
    <div className={`fr-row${online === false ? " offline" : ""}${compact ? " compact" : ""}`}>
      <span
        className="fr-ava"
        onClick={onOpen}
        style={{
          ...(p.avatar_url ? {} : { background: "linear-gradient(140deg,#3b82f6,#a855f7)" }),
          ...(onOpen ? { cursor: "pointer" } : {}),
        }}
      >
        {p.avatar_url ? (
          <img className="fr-ava-img" src={p.avatar_url} alt="" />
        ) : (
          initialsOf(p.display_name)
        )}
        {online !== undefined && (
          <span
            className="fr-pres"
            style={{ background: online ? (away ? "#fbbf24" : "#4ade80") : "#6b7280" }}
          />
        )}
      </span>
      <span className="fr-info" onClick={onOpen} style={onOpen ? { cursor: "pointer" } : undefined}>
        <span className="fr-name-row">
          <span className="fr-name">{p.display_name}</span>
          {p.username && (
            <span className="fr-handle">
              {p.username}
              {p.user_tag && <span className="fr-tag">#{p.user_tag}</span>}
            </span>
          )}
        </span>
        <span className="fr-sub">
          {subOverride ? (
            subOverride
          ) : playing ? (
            <>
              <PlayIcon size={11} /> <span className="playing">{playing}</span>
            </>
          ) : away ? (
            "Ausente"
          ) : online ? (
            "En línea"
          ) : online === false ? (
            "Desconectado"
          ) : (
            ""
          )}
        </span>
      </span>
      <span className="fr-acts">{children}</span>
    </div>
  );
}
