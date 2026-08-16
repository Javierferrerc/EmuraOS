/**
 * NexusProfileSelect — EMURA profile selector (PS5-style "¿Quién está
 * jugando?"). Ported 1:1 from the design handoff (`profile-select.jsx` +
 * `profile-select.css`) to our React + TypeScript stack, keeping the JSX
 * structure and exact visuals. Shown after the boot screen and before the
 * library; picking a profile plays the "Hola, {nombre}" welcome (~1.9s) and
 * then calls `onEnter(profile)`.
 *
 * Adaptations to production:
 *  - SEED_PROFILES → real persisted profiles (localStorage, see
 *    nexusProfileSelectData). Always seeded with at least one local profile.
 *  - "Cuenta EMURA" mode → real backend login (Supabase) via socialApi.
 *    The session persists, so the in-app SocialProvider picks it up later.
 *  - "Gestionar" → opens our editor for that profile (rename / avatar / delete).
 *  - The demo's "Volver al selector" button is omitted (per the handoff).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSocialConfigured } from "../../social/supabaseClient";
import {
  signInWithIdentifier,
  getMyProfile,
  signOut,
  restoreSession,
  forgetRememberedSession,
  updateMyProfile,
  resolveProfileImageUrl,
} from "../../social/socialApi";
import { loadProfileEdit, mergeProfileImage } from "../profile/nexusProfileData";
import { NexusRegisterModal } from "../profile/NexusRegisterModal";
import { SocialProvider } from "../../social/SocialContext";
import { makePsSound, type PsSoundKind } from "./psSound";
import {
  loadProfiles,
  saveProfiles,
  loadActiveId,
  saveActiveId,
  newProfileId,
  type NexusProfileEntry,
} from "./nexusProfileSelectData";
import emuraMark from "../../assets/emura-mark.png";
import "./nexus-profile-select.css";

type Layout = "carousel" | "row" | "grid";

// ── helpers ───────────────────────────────────────────────────
function psOrb(hue: number): React.CSSProperties {
  return {
    background: `radial-gradient(circle at 34% 28%, oklch(0.88 0.10 ${hue}), oklch(0.64 0.20 ${hue}) 46%, oklch(0.34 0.12 ${hue}) 100%)`,
  };
}
function psTint(hue: number): string {
  return `oklch(0.66 0.19 ${hue})`;
}
const PS_HUES = Array.from({ length: 24 }, (_, i) => Math.round((i * 360) / 24));

/** Stable hue (0..359) derived from a string, so an account always gets the
 * same orb color across launches. */
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Avatar URLs the renderer CSP allows for <img>: data: URLs, the SteamGridDB
 * CDN, and Supabase Storage (img-src includes https://*.supabase.co). Anything
 * else (e.g. an unknown host) is dropped so the tile falls back to the orb. */
function cspSafeAvatar(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return /^(data:|https:\/\/cdn2\.steamgriddb\.com|https:\/\/[a-z0-9-]+\.supabase\.co\/)/i.test(url)
    ? url
    : undefined;
}

// ── icons (ported from the handoff's icons.jsx, only what's used here) ──
type IconName =
  | "user-plus" | "settings" | "power" | "palette" | "image" | "upload"
  | "trash" | "check" | "close" | "chevron-left" | "chevron-right" | "dots" | "heart";

function Icon({ name, size = 18, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  const s: React.CSSProperties = { width: size, height: size, display: "block" };
  const c = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const v = "0 0 24 24";
  switch (name) {
    case "chevron-right":
      return <svg style={s} viewBox={v}><path d="M9 6l6 6-6 6" {...c} /></svg>;
    case "chevron-left":
      return <svg style={s} viewBox={v}><path d="M15 6l-6 6 6 6" {...c} /></svg>;
    case "close":
      return <svg style={s} viewBox={v}><path d="M6 6l12 12M18 6L6 18" {...c} /></svg>;
    case "dots":
      return (
        <svg style={s} viewBox={v}>
          <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "settings":
      return (
        <svg style={s} viewBox={v}>
          <circle cx="12" cy="12" r="3.2" {...c} />
          <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a7.5 7.5 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 1.7-1l2.3 1 2-3.4z" {...c} />
        </svg>
      );
    case "user-plus":
      return (
        <svg style={s} viewBox={v}>
          <circle cx="9.5" cy="8" r="3.6" {...c} />
          <path d="M3.5 20a6 6 0 0 1 12 0" {...c} />
          <path d="M18.5 8.5v5M16 11h5" {...c} />
        </svg>
      );
    case "power":
      return (
        <svg style={s} viewBox={v}>
          <path d="M12 3.5v8" {...c} />
          <path d="M7.5 6.5a7 7 0 1 0 9 0" {...c} />
        </svg>
      );
    case "palette":
      return (
        <svg style={s} viewBox={v}>
          <path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-1.8 0-.6-.4-1-.4-1.6 0-.7.6-1.2 1.3-1.2H16a5 5 0 0 0 5-5c0-4.4-4-8.4-9-8.4z" {...c} />
          <circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="11" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "image":
      return (
        <svg style={s} viewBox={v}>
          <rect x="4" y="5" width="16" height="14" rx="2.5" {...c} />
          <circle cx="9" cy="10" r="1.6" {...c} />
          <path d="M5 16l4-3 3 2 3-3 4 4" {...c} />
        </svg>
      );
    case "upload":
      return (
        <svg style={s} viewBox={v}>
          <path d="M12 16V5m0 0l-4 4m4-4l4 4" {...c} />
          <path d="M5 19h14" {...c} />
        </svg>
      );
    case "trash":
      return (
        <svg style={s} viewBox={v}>
          <path d="M4 7h16" {...c} />
          <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" {...c} />
          <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" {...c} />
          <path d="M10 11v6M14 11v6" {...c} />
        </svg>
      );
    case "check":
      return <svg style={s} viewBox={v}><path d="M5 12.5l4.5 4.5L19 7" {...c} /></svg>;
    case "heart":
      return <svg style={s} viewBox={v}><path d="M12 20s-7-4.4-7-9.3A3.7 3.7 0 0 1 12 7a3.7 3.7 0 0 1 7 3.7C19 15.6 12 20 12 20z" {...c} /></svg>;
    default:
      return null;
  }
}

type PlaySound = (kind: PsSoundKind) => void;

// ── avatar ─────────────────────────────────────────────────────
function Avatar({ p, children }: { p: NexusProfileEntry; children?: React.ReactNode }) {
  if (p.avatar) return <img src={p.avatar} alt={p.name} />;
  if (p.hue != null) return <div className="ps-ava-orb" style={psOrb(p.hue)}>{children}</div>;
  return <div className="ps-ava-initials">{(p.name || "?").slice(0, 1).toUpperCase()}</div>;
}

// ── add / login / edit modal ───────────────────────────────────
function AddUserModal({
  edit,
  loginOnly,
  initialName,
  onClose,
  onCreate,
  onCreateAccount,
  onUpdate,
  onDelete,
  canDelete,
  playSound,
}: {
  edit?: NexusProfileEntry;
  /** Re-autenticación para entrar en una cuenta tras cerrar sesión: fuerza el
   *  modo "Cuenta EMURA" y pide solo correo + contraseña (sin avatar/nombre). */
  loginOnly?: boolean;
  initialName?: string;
  onClose: () => void;
  onCreate: (p: NexusProfileEntry) => void;
  /** Abre el registro de cuenta EMURA (modal completo) desde el modo "Cuenta". */
  onCreateAccount?: () => void;
  onUpdate?: (p: NexusProfileEntry) => void;
  onDelete?: () => void;
  canDelete?: boolean;
  playSound: PlaySound;
}) {
  const editing = !!edit;
  const [mode, setMode] = useState<"simple" | "account">(loginOnly ? "account" : "simple"); // simple | account
  const [name, setName] = useState(edit?.name ?? initialName ?? "");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [hue, setHue] = useState(edit?.hue ?? 258);
  const [avaMode, setAvaMode] = useState<"color" | "image">(edit?.avatar ? "image" : "color");
  const [image, setImage] = useState<string | null>(edit?.avatar ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const readImage = (file?: File | null) => {
    if (!file || !/^image\//.test(file.type)) return;
    const r = new FileReader();
    r.onload = () => {
      setImage(typeof r.result === "string" ? r.result : null);
      setAvaMode("image");
      playSound("toggle");
    };
    r.readAsDataURL(file);
  };

  const valid =
    mode === "simple"
      ? name.trim().length >= 2
      : (loginOnly || name.trim().length >= 2) &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
        pass.length >= 6;

  const submit = async () => {
    if (!valid || busy) return;

    // Edit mode: update the existing profile (no account flow here).
    if (editing && edit && onUpdate) {
      playSound("select");
      const next: NexusProfileEntry = {
        ...edit,
        name: name.trim(),
        hue,
        avatar: avaMode === "image" && image ? image : undefined,
      };
      onUpdate(next);
      return;
    }

    // Account mode: authenticate against the real backend first, then key the
    // profile by the real account id so it reconciles (no duplicate) next launch.
    if (mode === "account") {
      if (!isSocialConfigured()) {
        setErr("Las cuentas EMURA no están configuradas en este equipo.");
        return;
      }
      setBusy(true);
      setErr(null);
      let accountId = newProfileId();
      let accountName = name.trim();
      try {
        await signInWithIdentifier(email.trim(), pass);
        const prof = await getMyProfile();
        if (prof) {
          accountId = prof.id;
          if (!accountName) accountName = prof.display_name?.trim() || prof.username?.trim() || "";
        }
      } catch (e) {
        setBusy(false);
        setErr(e instanceof Error ? e.message : "No se pudo iniciar sesión.");
        return;
      }
      setBusy(false);
      playSound("select");
      const p: NexusProfileEntry = {
        id: accountId,
        name: accountName || "Jugador",
        hue,
        online: true,
        level: 1,
        xp: 0.05,
        last: "Ahora",
        kind: "adult",
        account: true,
      };
      if (avaMode === "image" && image) p.avatar = image;
      onCreate(p);
      return;
    }

    playSound("select");
    const p: NexusProfileEntry = {
      id: newProfileId(),
      name: name.trim(),
      hue,
      online: true,
      level: 1,
      xp: 0.05,
      last: "Ahora",
      kind: "adult",
    };
    if (avaMode === "image" && image) p.avatar = image;
    onCreate(p);
  };

  return (
    <div
      className="ps-modal-stage"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ps-modal" role="dialog" aria-label={editing ? "Editar perfil" : "Añadir usuario"}>
        <div className="ps-modal-head">
          <span className="ic">
            <Icon name={editing ? "settings" : "user-plus"} size={20} />
          </span>
          <div>
            <h2>{editing ? "Editar perfil" : loginOnly ? "Iniciar sesión" : "Añadir usuario"}</h2>
            <p>
              {editing
                ? "Cambia el nombre y el avatar de este perfil."
                : loginOnly
                  ? `Inicia sesión en tu cuenta EMURA para entrar${initialName ? " en " + initialName : ""}.`
                  : "Crea un perfil nuevo o inicia sesión en tu cuenta EMURA."}
            </p>
          </div>
          <button className="ps-modal-close" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={19} />
          </button>
        </div>

        <div className="ps-modal-body">
          {err && (
            <div className="ps-modal-err">
              <Icon name="close" size={15} /> {err}
            </div>
          )}

          {!editing && !loginOnly && (
            <div className="ps-seg">
              <button className={mode === "simple" ? "on" : ""} onClick={() => setMode("simple")}>
                Perfil local
              </button>
              <button className={mode === "account" ? "on" : ""} onClick={() => setMode("account")}>
                Cuenta EMURA
              </button>
            </div>
          )}

          <div className="ps-orbpick" style={{ display: loginOnly ? "none" : undefined }}>
            <div className="ps-orbpick-head">
              <span className="ps-orbpick-lbl">Avatar</span>
              <div className="ps-avatabs">
                <button className={avaMode === "color" ? "on" : ""} onClick={() => setAvaMode("color")}>
                  <Icon name="palette" size={14} /> Color
                </button>
                <button
                  className={avaMode === "image" ? "on" : ""}
                  onClick={() => {
                    setAvaMode("image");
                    if (!image) fileRef.current?.click();
                  }}
                >
                  <Icon name="image" size={14} /> Imagen
                </button>
              </div>
            </div>
            <div className="ps-orbpick-preview">
              <div className="ps-orbpick-big">
                {avaMode === "image" && image ? (
                  <img src={image} alt="" />
                ) : (
                  <div className="ps-ava-orb" style={psOrb(hue)} />
                )}
              </div>
              {avaMode === "color" ? (
                <div className="ps-orbpick-row">
                  {PS_HUES.filter((_, i) => i % 2 === 0).map((h) => (
                    <button
                      key={h}
                      className={"ps-orb-opt" + (h === hue ? " on" : "")}
                      onClick={() => setHue(h)}
                      aria-label={"Color " + h}
                    >
                      <div className="ps-ava-orb" style={psOrb(h)} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="ps-imgpick">
                  <button className="ps-imgpick-btn" onClick={() => fileRef.current?.click()}>
                    <Icon name="upload" size={16} /> {image ? "Cambiar imagen" : "Subir imagen"}
                  </button>
                  {image && (
                    <button
                      className="ps-imgpick-clear"
                      onClick={() => {
                        setImage(null);
                        setAvaMode("color");
                      }}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                  <span className="ps-imgpick-hint">JPG · PNG · WebP</span>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                readImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          <div className="ps-field" style={{ display: loginOnly ? "none" : undefined }}>
            <label>Nombre</label>
            <input
              className="ps-input"
              value={name}
              maxLength={20}
              placeholder="¿Cómo te llamas?"
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {!editing && mode === "account" && (
            <>
              <div className="ps-field">
                <label>Correo electrónico</label>
                <input
                  className="ps-input"
                  type="email"
                  value={email}
                  placeholder="tu@correo.com"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="ps-field">
                <label>Contraseña</label>
                <input
                  className="ps-input"
                  type="password"
                  value={pass}
                  placeholder="Mínimo 6 caracteres"
                  onChange={(e) => setPass(e.target.value)}
                />
              </div>
              {!loginOnly && onCreateAccount && (
                <button type="button" className="ps-altlink" onClick={onCreateAccount}>
                  ¿No tienes cuenta? <b>Crear cuenta</b>
                </button>
              )}
            </>
          )}
        </div>

        <div className="ps-modal-foot">
          {editing && onDelete && (
            <button
              className="ps-btn danger ps-foot-del"
              disabled={!canDelete}
              title={canDelete ? "Eliminar perfil" : "No puedes eliminar el único perfil"}
              onClick={onDelete}
            >
              <Icon name="trash" size={17} /> Eliminar
            </button>
          )}
          <button className="ps-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="ps-btn primary" disabled={!valid || busy} onClick={() => void submit()}>
            <Icon name="check" size={18} />{" "}
            {busy ? "Conectando…" : editing ? "Guardar" : mode === "account" ? "Iniciar sesión" : "Crear perfil"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── profile slot ───────────────────────────────────────────────
function ProfileSlot({
  p,
  cls,
  showMeta,
  manage,
  onSelect,
}: {
  p: NexusProfileEntry;
  cls: string;
  showMeta: boolean;
  manage: boolean;
  onSelect: (p: NexusProfileEntry) => void;
}) {
  return (
    <div
      className={"ps-prof " + cls + (manage ? " manage" : "")}
      style={{ ["--pcolor" as string]: psTint(p.hue != null ? p.hue : 224) }}
      onClick={() => onSelect(p)}
    >
      <div className="ps-ava-wrap">
        <div className="ps-ava">
          <Avatar p={p} />
          <span className="ps-manage-ico"><Icon name="dots" size={26} /></span>
        </div>
        <span className="ps-ring" />
        {showMeta && <span className={"ps-presence " + (p.online ? "online" : "offline")} />}
      </div>
      <div className="ps-name">{p.name}</div>
      {showMeta ? (
        <div className="ps-meta">
          {p.kind === "kid" && (
            <span className="ps-badge kid">
              <Icon name="heart" size={12} /> Infantil
            </span>
          )}
          <div className="ps-enter-hint">
            <kbd>A</kbd> {manage ? "Editar" : "Entrar"}
          </div>
        </div>
      ) : (
        <div className="ps-meta">
          <div className="ps-enter-hint">
            <kbd>A</kbd> {manage ? "Editar" : "Entrar"}
          </div>
        </div>
      )}
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────
export interface NexusProfileSelectProps {
  layout?: Layout;
  showMeta?: boolean;
  welcome?: boolean;
  bgAnim?: boolean;
  accentHue?: number;
  soundEnabled?: boolean;
  onEnter: (profile: NexusProfileEntry) => void;
}

export function NexusProfileSelect({
  layout = "row",
  showMeta = false,
  welcome = true,
  bgAnim = true,
  accentHue = 224,
  soundEnabled = true,
  onEnter,
}: NexusProfileSelectProps) {
  const playSound = useMemo<PlaySound>(() => makePsSound(soundEnabled), [soundEnabled]);

  const [profiles, setProfiles] = useState<NexusProfileEntry[]>(() => loadProfiles());
  const [idx, setIdx] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editTarget, setEditTarget] = useState<NexusProfileEntry | null>(null);
  const [manage, setManage] = useState(false);
  const [welcomeP, setWelcomeP] = useState<NexusProfileEntry | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  // Profile to highlight on open: last used by default, overridden by the
  // signed-in EMURA account once reconciled.
  const [focusId, setFocusId] = useState<string | null>(() => loadActiveId());
  // Ids the user deleted this session. The async account-reconcile below can
  // resolve *after* a delete and would otherwise re-add the just-removed
  // account profile; this guards against that race.
  const deletedIdsRef = useRef<Set<string>>(new Set());
  // Id of the account whose Supabase session is currently live (null = signed
  // out). Account profiles can only be entered while their session is active.
  const [sessionAccountId, setSessionAccountId] = useState<string | null>(null);
  // Account profile the user is trying to enter while signed out → shows the
  // re-login modal; entering happens once login succeeds.
  const [loginTarget, setLoginTarget] = useState<NexusProfileEntry | null>(null);
  // Modal de registro de cuenta EMURA (alta nueva) abierto desde "Añadir usuario".
  const [registerOpen, setRegisterOpen] = useState(false);

  // Persist whenever the list changes.
  useEffect(() => {
    saveProfiles(profiles);
  }, [profiles]);

  // When a photo is chosen for a profile in the selector, propagate it to the
  // single source of truth so every surface shows it:
  //  - account (signed in): upload any data: image to Supabase Storage + set
  //    `profiles.avatar_url`, then mirror the cloud URL into the local layer and
  //    the tile (drops the heavy data: URL).
  //  - local profile: mirror into its own local edit layer so the in-app profile
  //    (which reads that layer) shows the same avatar.
  const persistProfileImage = useCallback(async (p: NexusProfileEntry) => {
    const img = p.avatar;
    if (!img) return;
    const isData = img.startsWith("data:");
    if (p.account && isSocialConfigured() && isData) {
      try {
        // Only touch the cloud when THIS account's session is the live one —
        // otherwise updateMyProfile would overwrite whichever account is signed
        // in (e.g. editing an account tile while another is active).
        const me = await getMyProfile();
        if (me && me.id === p.id) {
          const cloud = await resolveProfileImageUrl("avatars", img);
          if (cloud) {
            await updateMyProfile({ avatar_url: cloud });
            mergeProfileImage(p.id, p.name, { avatarUrl: cloud });
            setProfiles((list) => list.map((x) => (x.id === p.id ? { ...x, avatar: cloud } : x)));
            return;
          }
        }
      } catch (e) {
        // Non-fatal: keep the local image on the tile and mirror it below so at
        // least the in-app profile matches; the next cloud sync can retry.
        console.warn("[selector] avatar cloud sync failed:", e);
      }
    }
    mergeProfileImage(p.id, p.name, { avatarUrl: img });
  }, []);

  // Reflect a signed-in EMURA account in the selector. The Supabase session
  // persists across launches, so if the user was already signed in, surface
  // their account as a profile (name from the account, avatar from the local
  // profile layer) and highlight it.
  useEffect(() => {
    if (!isSocialConfigured()) return;
    let cancelled = false;
    void (async () => {
      try {
        const prof = await getMyProfile();
        if (cancelled || !prof) return;
        // The user deleted this account profile this session — don't resurrect
        // it from the still-active session.
        if (deletedIdsRef.current.has(prof.id)) return;
        const name = prof.display_name?.trim() || prof.username?.trim() || "Jugador";
        // This account's OWN edit layer (keyed by its id) — not the global/active
        // one, which would copy one profile's avatar onto every tile.
        const edit = loadProfileEdit(name, prof.id);
        // Cloud-first: Supabase `profiles.avatar_url` is the source of truth for
        // an account, so a photo set in the in-app profile (or on another device)
        // shows on this tile. Fall back to the local layer when the cloud has none.
        const accountEntry: NexusProfileEntry = {
          id: prof.id,
          name,
          hue: hueFromString(prof.id),
          avatar: cspSafeAvatar(prof.avatar_url ?? edit.avatarUrl),
          online: true,
          level: 1,
          xp: 0.05,
          last: "Ahora",
          kind: "adult",
          account: true,
        };
        setProfiles((list) => {
          // Replace the lone default "Jugador" seed with the real account.
          const isDefaultOnly =
            list.length === 1 && list[0].id === "local" && !list[0].avatar && list[0].name === "Jugador";
          if (isDefaultOnly) return [accountEntry];
          const i = list.findIndex((p) => p.id === accountEntry.id);
          if (i === -1) return [...list, accountEntry];
          const next = list.slice();
          // Refresh name from the account, but keep any avatar/hue the user
          // already chose for this profile if the account brings none.
          next[i] = {
            ...next[i],
            ...accountEntry,
            avatar: accountEntry.avatar ?? next[i].avatar,
            hue: next[i].avatar || next[i].account ? next[i].hue : accountEntry.hue,
          };
          return next;
        });
        if (!cancelled) {
          setSessionAccountId(prof.id);
          setFocusId(prof.id);
        }
      } catch (e) {
        console.warn("[profile-select] account reconcile failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Move the highlight to the focused profile (last used / signed-in account)
  // once it exists in the list.
  useEffect(() => {
    if (!focusId) return;
    const i = profiles.findIndex((p) => p.id === focusId);
    if (i >= 0) setIdx(i);
  }, [focusId, profiles]);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const move = useCallback(
    (dir: number) => {
      setIdx((i) => {
        const n = Math.max(0, Math.min(profiles.length - 1, i + dir));
        if (n !== i) playSound("move");
        return n;
      });
    },
    [profiles.length, playSound]
  );

  const enterProfile = useCallback(
    (p: NexusProfileEntry) => {
      playSound("launch");
      saveActiveId(p.id);
      if (welcome) {
        setWelcomeP(p);
        setTimeout(() => onEnter(p), 1900);
      } else {
        onEnter(p);
      }
    },
    [welcome, onEnter, playSound]
  );

  const choose = useCallback(
    (p: NexusProfileEntry) => {
      if (manage) {
        playSound("open");
        setEditTarget(p);
        return;
      }
      // EMURA accounts require a live session to enter. If we signed out (or
      // this is a different account), ask the user to log in first. We confirm
      // with the backend in case the session was still resolving on mount.
      if (p.account && isSocialConfigured() && sessionAccountId !== p.id) {
        void (async () => {
          // Is this account already the live Supabase session?
          try {
            const prof = await getMyProfile();
            if (prof && prof.id === p.id) {
              setSessionAccountId(p.id);
              enterProfile(p);
              return;
            }
          } catch {
            /* fall through to restore / login */
          }
          // A remembered session for THIS account → restore it (no password).
          try {
            const restored = await restoreSession(p.id);
            if (restored && restored.id === p.id) {
              setSessionAccountId(p.id);
              enterProfile(p);
              return;
            }
          } catch {
            /* fall through to login */
          }
          // No stored session (or it expired) → ask for the password.
          playSound("open");
          setLoginTarget(p);
        })();
        return;
      }
      enterProfile(p);
    },
    [manage, sessionAccountId, enterProfile, playSound]
  );

  // keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (adding || editTarget || welcomeP || loginTarget || registerOpen) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIdx((i) => Math.min(profiles.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(profiles[idx]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adding, editTarget, welcomeP, loginTarget, registerOpen, choose, profiles, idx]);

  useEffect(() => {
    if (idx > profiles.length - 1) setIdx(Math.max(0, profiles.length - 1));
  }, [profiles.length, idx]);

  const hh = now ? String(now.getHours()).padStart(2, "0") : "--";
  const mm = now ? String(now.getMinutes()).padStart(2, "0") : "--";

  const slotClass = (i: number) => {
    if (layout !== "carousel") return i === idx ? "active" : "";
    const d = i - idx;
    if (d === 0) return "active";
    if (Math.abs(d) === 1) return "side";
    if (Math.abs(d) === 2) return "far";
    return "hidden";
  };

  const activeColor = psTint(profiles[idx] ? profiles[idx].hue : accentHue);

  return (
    <div className={"ps" + (bgAnim ? "" : " no-anim")} style={{ ["--abg" as string]: activeColor }}>
      <div className="ps-aurora" />
      <div className="ps-dust" />

      <div className="ps-top">
        <div className="ps-brand">
          <img src={emuraMark} alt="" />
          <span className="ps-brand-name">EMURA</span>
        </div>
        <div className="ps-clock">
          {hh}:{mm}
        </div>
      </div>

      <div className="ps-head">
        <div className="ps-kicker">{manage ? "Gestionar perfiles" : "Bienvenido"}</div>
        <h1>{manage ? "Elige un perfil para editar" : "¿Quién está jugando?"}</h1>
      </div>

      <div className="ps-stage">
        <button className="ps-arrow l" onClick={() => move(-1)} disabled={idx === 0} aria-label="Anterior">
          <Icon name="chevron-left" size={26} />
        </button>
        <div className={"ps-carousel " + layout + (layout === "carousel" ? " gap" : "")}>
          {profiles.map((p, i) => (
            <ProfileSlot
              key={p.id}
              p={p}
              cls={slotClass(i)}
              showMeta={showMeta}
              manage={manage}
              onSelect={(pp) => {
                if (layout === "carousel" && i !== idx) setIdx(i);
                else {
                  setIdx(i);
                  choose(pp);
                }
              }}
            />
          ))}
        </div>
        <button
          className="ps-arrow r"
          onClick={() => move(1)}
          disabled={idx === profiles.length - 1}
          aria-label="Siguiente"
        >
          <Icon name="chevron-right" size={26} />
        </button>
      </div>

      {layout === "carousel" && (
        <div className="ps-dots">
          {profiles.map((p, i) => (
            <span key={p.id} className={"ps-dot" + (i === idx ? " on" : "")} />
          ))}
        </div>
      )}

      <div className="ps-actions">
        <button
          className="ps-act add"
          onClick={() => {
            playSound("open");
            setAdding(true);
          }}
        >
          <span className="ps-act-ico"><Icon name="user-plus" size={24} /></span>
          <span className="ps-act-lbl">Añadir usuario</span>
        </button>
        <button
          className={"ps-act" + (manage ? " on" : "")}
          onClick={() => {
            playSound("toggle");
            setManage((m) => !m);
          }}
        >
          <span className="ps-act-ico"><Icon name="settings" size={22} /></span>
          <span className="ps-act-lbl">{manage ? "Listo" : "Gestionar"}</span>
        </button>
        <button
          className="ps-act danger"
          onClick={() => {
            playSound("back");
            setTimeout(() => window.close(), 160);
          }}
        >
          <span className="ps-act-ico"><Icon name="power" size={22} /></span>
          <span className="ps-act-lbl">Apagar</span>
        </button>
      </div>

      {adding && (
        <AddUserModal
          playSound={playSound}
          onClose={() => setAdding(false)}
          onCreate={(p) => {
            setProfiles((list) => {
              // Dedup by id: signing into an account that already has a tile must
              // refresh it in place, never append a duplicate.
              const i = list.findIndex((x) => x.id === p.id);
              if (i !== -1) {
                const next = list.slice();
                next[i] = { ...next[i], ...p };
                return next;
              }
              // An EMURA account entering as the only profile replaces the lone
              // default "Jugador" seed instead of sitting next to it.
              const isDefaultOnly =
                p.account &&
                list.length === 1 &&
                list[0].id === "local" &&
                !list[0].avatar &&
                list[0].name === "Jugador";
              return isDefaultOnly ? [p] : [...list, p];
            });
            setAdding(false);
            // Highlight the new/updated profile once it's in the list.
            setFocusId(p.id);
            // Propagate the chosen photo to the cloud (accounts) + local layer so
            // it shows in the in-app profile and survives reconcile.
            void persistProfileImage(p);
          }}
          onCreateAccount={() => {
            setAdding(false);
            setRegisterOpen(true);
          }}
        />
      )}

      {registerOpen && (
        <SocialProvider>
          <NexusRegisterModal
            onClose={() => setRegisterOpen(false)}
            onSwitchToSignIn={() => {
              setRegisterOpen(false);
              setAdding(true);
            }}
            onRegistered={(acct) => {
              // Añade la cuenta recién creada como perfil para no obligar a
              // iniciar sesión a mano. Si Supabase devolvió sesión activa
              // (auto-confirm), queda lista para entrar; si requiere verificar
              // el correo, el tile aparece y pedirá login al entrar.
              const entry: NexusProfileEntry = {
                id: acct.userId,
                name: acct.fullName || acct.username || "Jugador",
                hue: hueFromString(acct.userId),
                online: true,
                level: 1,
                xp: 0.05,
                last: "Ahora",
                kind: "adult",
                account: true,
              };
              setProfiles((list) => {
                const i = list.findIndex((x) => x.id === entry.id);
                if (i === -1) return [...list, entry];
                const next = list.slice();
                next[i] = { ...next[i], ...entry };
                return next;
              });
              if (acct.hasSession) {
                setSessionAccountId(acct.userId);
                saveActiveId(acct.userId);
              }
              setFocusId(acct.userId);
            }}
          />
        </SocialProvider>
      )}

      {editTarget && (
        <AddUserModal
          edit={editTarget}
          playSound={playSound}
          canDelete={profiles.length > 1}
          onClose={() => setEditTarget(null)}
          onCreate={() => {}}
          onUpdate={(p) => {
            setProfiles((list) => list.map((x) => (x.id === p.id ? p : x)));
            setEditTarget(null);
            // Same propagation on edit: keep cloud + local + tile in sync.
            void persistProfileImage(p);
          }}
          onDelete={() => {
            const target = editTarget;
            deletedIdsRef.current.add(target.id);
            setProfiles((list) => list.filter((x) => x.id !== target.id));
            // Forget it as the "last used" profile so it isn't re-highlighted.
            if (loadActiveId() === target.id) saveActiveId(null);
            // Account profiles are re-derived from the persisted Supabase
            // session on every selector mount; drop this account's remembered
            // session and sign out so the deletion sticks across remounts
            // ("Cambiar de usuario") and app restarts.
            if (target.account) {
              forgetRememberedSession(target.id);
              void signOut().catch(() => {});
            }
            setEditTarget(null);
            playSound("back");
          }}
        />
      )}

      {loginTarget && (
        <AddUserModal
          loginOnly
          initialName={loginTarget.name}
          playSound={playSound}
          onClose={() => setLoginTarget(null)}
          onCreate={(acct) => {
            // Sesión iniciada: marca la cuenta como activa, reconcilia la ficha
            // (conservando avatar/hue/nombre del tile existente) y entra.
            setSessionAccountId(acct.id);
            const existing = profiles.find((x) => x.id === acct.id);
            setProfiles((list) => {
              const i = list.findIndex((x) => x.id === acct.id);
              if (i === -1) return [...list, acct];
              const next = list.slice();
              next[i] = { ...next[i], account: true };
              return next;
            });
            const entry: NexusProfileEntry = existing
              ? { ...existing, account: true }
              : acct;
            setLoginTarget(null);
            enterProfile(entry);
          }}
        />
      )}

      <div
        className={"ps-welcome" + (welcomeP ? " show" : "")}
        style={{ ["--pcolor" as string]: welcomeP ? psTint(welcomeP.hue) : activeColor }}
      >
        {welcomeP && (
          <div className="ps-welcome-inner">
            <div className="ps-welcome-ava">
              <Avatar p={welcomeP} />
            </div>
            <div className="ps-welcome-txt">
              Hola, <b>{welcomeP.name}</b>
            </div>
            <div className="ps-welcome-sub">Cargando tu biblioteca…</div>
          </div>
        )}
      </div>
    </div>
  );
}
