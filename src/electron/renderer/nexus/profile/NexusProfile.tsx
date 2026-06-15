/**
 * NexusProfile — full-screen own profile, opened from the status-bar avatar.
 * Showcase header (cover banner + identity + XP) with inline editing, internal
 * tabs (Resumen / Amigos / Actividad). Backed by real library data; the social
 * tabs are deferred (no friends backend in this local launcher) and show a
 * "próximamente" state. Ported from the design's ProfileView.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../context/AppContext";
import { useSocial } from "../../social/SocialContext";
import type { NexusGame } from "../nexusModel";
import type { SgdbCandidate } from "../../../../core/types";
import { NexusCover } from "../NexusCover";
import { NexusGameCard } from "../NexusGameCard";
import { NexusFriends } from "./NexusFriends";
import {
  buildProfileStats,
  loadProfileEdit,
  saveProfileEdit,
  initialsOf,
  MAX_PINNED,
  type NexusProfileEdit,
} from "./nexusProfileData";
import {
  BackIcon,
  EditIcon,
  DotsIcon,
  CopyIcon,
  CheckIcon,
  CloseIcon,
  SearchIcon,
  ClockIcon,
  PlayIcon,
  GridIcon,
  HeartIcon,
  LibraryIcon,
  SparkIcon,
  UploadIcon,
  PaletteIcon,
  CameraIcon,
  TrashIcon,
  ImageIcon,
} from "../NexusIcons";
import "./nexus-profile.css";

interface NexusProfileProps {
  onBack: () => void;
  allGames: NexusGame[];
  isFavorite: (game: NexusGame) => boolean;
  onOpen: (game: NexusGame) => void;
  onLaunch: (game: NexusGame) => void;
  onToggleFavorite: (game: NexusGame) => void;
}

type Tab = "resumen" | "amigos" | "actividad";

export function NexusProfile({
  onBack,
  allGames,
  isFavorite,
  onOpen,
  onLaunch,
  onToggleFavorite,
}: NexusProfileProps) {
  const app = useApp();
  const social = useSocial();
  const gamesByKey = useMemo(() => new Map(allGames.map((g) => [g.key, g])), [allGames]);

  // Identity is tied to the signed-in account when there is one: the name and
  // status come from the social profile (and editing them updates the account).
  // Signed out, they fall back to the locally-persisted layer / RA username.
  const signedIn = social.configured && !!social.user;
  const accountName = social.profile?.display_name?.trim() ?? "";
  const accountStatus = (social.profile?.status ?? "").trim();
  const fallbackName = accountName || app.raStatus?.username || "Jugador";

  // Persisted local layer — pinned games always; name/status only matter signed out.
  const [local, setLocal] = useState<NexusProfileEdit>(() => loadProfileEdit(fallbackName));
  const [draft, setDraft] = useState<NexusProfileEdit>(local);
  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [tab, setTab] = useState<Tab>("resumen");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false); // "Editar perfil" modal (nombre + estado)

  // Current (non-editing) identity, account-first.
  const current: NexusProfileEdit = {
    name: signedIn ? accountName || fallbackName : local.name || fallbackName,
    status: signedIn ? accountStatus : local.status,
    pinned: local.pinned,
    bannerUrl: local.bannerUrl ?? null,
    avatarUrl: local.avatarUrl ?? null,
  };

  // Account handle / code shown in the banner options menu (signed in only).
  const accountTag = social.profile?.user_tag;
  const accountHandle =
    social.profile?.username && accountTag ? `${social.profile.username}#${accountTag}` : null;
  const accountCode = social.profile?.friend_code ?? null;

  const copyCode = useCallback(() => {
    if (!accountCode) return;
    void navigator.clipboard?.writeText(accountCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [accountCode]);

  const stats = useMemo(
    () =>
      buildProfileStats({
        playHistory: app.playHistory,
        ownedGames: allGames.length,
        favorites: app.favorites.size,
        collections: app.collections.length,
      }),
    [app.playHistory, allGames.length, app.favorites.size, app.collections.length]
  );

  // Esc closes the profile (but not while editing — there Esc would be the
  // user dismissing an input). If the options menu is open, Esc closes it first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || editing || pickerOpen) return;
      e.preventDefault();
      if (menuOpen) setMenuOpen(false);
      else onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, editing, pickerOpen, menuOpen]);

  // Close the options menu on any outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".pf-cover-menu")) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const view = editing ? draft : current;
  const name = view.name || fallbackName;
  const initials = initialsOf(name);

  const pinnedGames = useMemo(
    () => view.pinned.map((k) => gamesByKey.get(k)).filter((g): g is NexusGame => !!g),
    [view.pinned, gamesByKey]
  );
  const bannerGame = pinnedGames[0] ?? allGames[0] ?? null;

  const startEdit = useCallback(() => {
    setDraft(current);
    setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.name, current.status, current.pinned]);
  const cancelEdit = useCallback(() => setEditing(false), []);
  const saveEdit = useCallback(async () => {
    const next: NexusProfileEdit = {
      name: draft.name.trim() || fallbackName,
      status: draft.status.trim(),
      pinned: draft.pinned.slice(0, MAX_PINNED),
      bannerUrl: draft.bannerUrl ?? null,
      avatarUrl: draft.avatarUrl ?? null,
    };
    // Pinned (and a local cache of name/status) always persist locally.
    setLocal(next);
    saveProfileEdit(next);
    // When signed in, the name/status belong to the account — sync them.
    if (signedIn) {
      setSavingProfile(true);
      try {
        await social.updateProfile({ display_name: next.name, status: next.status });
      } catch (err) {
        console.warn("[profile] updateProfile failed:", err);
      } finally {
        setSavingProfile(false);
      }
    }
    setEditing(false);
  }, [draft, fallbackName, signedIn, social]);
  // Save handler for the "Editar perfil" modal (name + status only; pins are
  // managed separately on the page). Mirrors saveEdit's persistence logic.
  const saveInfo = useCallback(
    async (next: {
      name: string;
      status: string;
      bannerUrl: string | null;
      avatarUrl: string | null;
    }) => {
      const name = next.name.trim() || fallbackName;
      const status = next.status.trim();
      const merged: NexusProfileEdit = {
        name,
        status,
        pinned: local.pinned,
        bannerUrl: next.bannerUrl,
        avatarUrl: next.avatarUrl,
      };
      setLocal(merged);
      saveProfileEdit(merged);
      if (signedIn) {
        setSavingProfile(true);
        try {
          await social.updateProfile({ display_name: name, status });
        } catch (err) {
          console.warn("[profile] updateProfile failed:", err);
        } finally {
          setSavingProfile(false);
        }
      }
      setInfoOpen(false);
    },
    [local.pinned, fallbackName, signedIn, social]
  );

  const removePin = (key: string) =>
    setDraft((d) => ({ ...d, pinned: d.pinned.filter((k) => k !== key) }));
  const addPin = (key: string) =>
    setDraft((d) =>
      d.pinned.includes(key) || d.pinned.length >= MAX_PINNED
        ? d
        : { ...d, pinned: [...d.pinned, key] }
    );

  return (
    <div className="profile">
      <div className="pf-topbar">
        <button className="pf-back" onClick={onBack}>
          <BackIcon size={17} /> Biblioteca
        </button>
        <div className="pf-topbar-spacer" />
      </div>

      <div className="pf-scroll">
        <div className="pf-wrap">
          {/* ── Showcase header ──────────────────────────────── */}
          <div className="pf-head showcase">
            <div className="pf-cover">
              <div className="pf-cover-art">
                {view.bannerUrl ? (
                  <img className="pf-cover-img" src={view.bannerUrl} alt="" />
                ) : bannerGame ? (
                  <NexusCover game={bannerGame} rounded={0} />
                ) : null}
              </div>
              <div className="pf-cover-scrim" />
              {!editing && (
                <button className="pf-cover-edit" onClick={() => setInfoOpen(true)}>
                  <EditIcon size={16} /> Editar perfil
                </button>
              )}
              {!editing && signedIn && (
                <div className="pf-cover-menu">
                  <button
                    className="pf-cover-menu-btn"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-label="Opciones de cuenta"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                  >
                    <DotsIcon size={18} />
                  </button>
                  {menuOpen && (
                    <div className="pf-account-pop" role="menu">
                      <div className="pf-account-pop-head">
                        <div className="pf-account-pop-name">{accountName || fallbackName}</div>
                        {accountHandle && (
                          <div className="pf-account-pop-row">
                            <span>Usuario</span>
                            <b>{accountHandle}</b>
                          </div>
                        )}
                        {accountCode && (
                          <div className="pf-account-pop-row">
                            <span>Código de amigo</span>
                            <span className="pf-account-pop-val">
                              <b>{accountCode}</b>
                              <button
                                className="pf-account-copy"
                                onClick={copyCode}
                                title="Copiar código"
                                aria-label="Copiar código de amigo"
                              >
                                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                              </button>
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        className="pf-account-pop-item"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          void social.signOut();
                        }}
                      >
                        Cerrar sesión
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="pf-id">
              <div className="pf-avatar-ring">
                <div className="pf-avatar">
                  {view.avatarUrl ? (
                    <img className="pf-avatar-img" src={view.avatarUrl} alt="" />
                  ) : (
                    <div
                      className="pf-avatar-fallback"
                      style={{ background: "linear-gradient(135deg, #3b82f6, #a855f7)" }}
                    >
                      {initials}
                    </div>
                  )}
                </div>
                <span className="pf-lvl-badge">{stats.level}</span>
              </div>
              <div className="pf-id-main">
                <div className="pf-name-row">
                  <h1 className="pf-name">{name}</h1>
                  {signedIn && social.profile?.username && (
                    <span className="pf-handle">
                      {social.profile.username}
                      {social.profile.user_tag && (
                        <span className="pf-tag">#{social.profile.user_tag}</span>
                      )}
                    </span>
                  )}
                </div>
                {view.status ? (
                  <div className="pf-status">
                    <span className="q">“</span>
                    {view.status}
                    <span className="q">”</span>
                  </div>
                ) : null}
                <div className="pf-xp">
                  <div className="pf-xp-top">
                    <span className="pf-xp-lvl">Nivel {stats.level}</span>
                    <span className="pf-xp-num">
                      {stats.xpIntoLevel.toLocaleString("es")} / {stats.xpPerLevel.toLocaleString("es")} XP
                    </span>
                  </div>
                  <div className="pf-xp-bar">
                    <div
                      className="pf-xp-fill"
                      style={{ width: `${Math.round((stats.xpIntoLevel / stats.xpPerLevel) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Tabs ─────────────────────────────────────────── */}
          <div className="pf-tabs">
            <button
              className={`pf-tab${tab === "resumen" ? " active" : ""}`}
              onClick={() => setTab("resumen")}
            >
              Resumen
            </button>
            <button
              className={`pf-tab${tab === "amigos" ? " active" : ""}`}
              onClick={() => setTab("amigos")}
            >
              Amigos
            </button>
            <button
              className={`pf-tab${tab === "actividad" ? " active" : ""}`}
              onClick={() => setTab("actividad")}
            >
              Actividad
            </button>
          </div>

          {tab === "resumen" && (
            <>
              <div className="pf-section">
                <div className="pf-stats">
                  <StatCard icon={<ClockIcon size={18} />} label="Tiempo jugado">
                    {stats.hours > 0 ? (
                      <>
                        {stats.hours}
                        <small> h {stats.minutes}m</small>
                      </>
                    ) : (
                      <>
                        {stats.minutes}
                        <small> m</small>
                      </>
                    )}
                  </StatCard>
                  <StatCard icon={<PlayIcon size={18} />} label="Juegos jugados">
                    {stats.playedGames}
                  </StatCard>
                  <StatCard icon={<GridIcon size={18} />} label="En biblioteca">
                    {stats.ownedGames}
                  </StatCard>
                  <StatCard icon={<HeartIcon size={18} />} label="Favoritos">
                    {stats.favorites}
                  </StatCard>
                  <StatCard icon={<LibraryIcon size={18} />} label="Colecciones">
                    {stats.collections}
                  </StatCard>
                </div>
              </div>

              <div className="pf-section">
                <div className="pf-section-head">
                  <h2>Juegos fijados</h2>
                  <span className="count">{pinnedGames.length}</span>
                  <div className="pf-section-spacer" />
                  {editing ? (
                    <div className="pf-pin-edit-actions">
                      <button className="pf-act-btn" onClick={cancelEdit} disabled={savingProfile}>
                        Cancelar
                      </button>
                      <button
                        className="pf-act-btn primary"
                        onClick={() => void saveEdit()}
                        disabled={savingProfile}
                      >
                        <CheckIcon size={15} /> Listo
                      </button>
                    </div>
                  ) : (
                    <button className="pf-section-edit" onClick={startEdit}>
                      <EditIcon size={14} /> Editar
                    </button>
                  )}
                </div>
                {pinnedGames.length === 0 && !editing ? (
                  <div className="pf-empty small">
                    No has fijado juegos. Pulsa <b>Editar</b> para destacar tus favoritos.
                  </div>
                ) : (
                  <div className="pf-pinned">
                    {pinnedGames.map((g) => (
                      <div key={g.key} className="pf-pin">
                        {editing && (
                          <button className="pf-pin-remove" onClick={() => removePin(g.key)}>
                            <CloseIcon size={15} />
                          </button>
                        )}
                        <NexusGameCard
                          game={g}
                          showFooter
                          isFavorite={isFavorite(g)}
                          onOpen={onOpen}
                          onLaunch={onLaunch}
                          onToggleFavorite={onToggleFavorite}
                        />
                      </div>
                    ))}
                    {editing && view.pinned.length < MAX_PINNED && (
                      <button className="pf-pin-add" onClick={() => setPickerOpen(true)}>
                        <GridIcon size={22} />
                        <span>Fijar juego</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "amigos" && (
            <div className="pf-section">
              <NexusFriends />
            </div>
          )}

          {tab === "actividad" && (
            <div className="pf-section">
              <div className="pf-empty">
                <SparkIcon size={28} />
                <div className="pf-empty-title">Actividad · Próximamente</div>
                <div className="pf-empty-sub">
                  El feed de actividad de amigos llega en la siguiente fase (tras presencia y
                  amigos).
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {pickerOpen && (
        <PinPicker
          games={allGames}
          excluded={new Set(draft.pinned)}
          onPick={(key) => {
            addPin(key);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {infoOpen && (
        <EditProfileModal
          initialName={current.name}
          initialStatus={current.status}
          initialBannerUrl={current.bannerUrl ?? null}
          initialAvatarUrl={current.avatarUrl ?? null}
          saving={savingProfile}
          onCancel={() => {
            if (!savingProfile) setInfoOpen(false);
          }}
          onSave={(vals) => void saveInfo(vals)}
        />
      )}
    </div>
  );
}

/**
 * Resize a user-picked / dropped image to a compact JPEG data URL in the
 * renderer (works for both <input type=file> and drag&drop, which only give a
 * File — no path for the main-process resizer). Keeps localStorage small and
 * renders directly via <img> under the 'self'/data: CSP.
 */
async function fileToImageDataUrl(
  file: File,
  mode: "avatar" | "cover"
): Promise<string | null> {
  if (!file || !file.type.startsWith("image/")) return null;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return null;
  }
  if (mode === "avatar") {
    const S = 256; // square, center-cropped
    canvas.width = S;
    canvas.height = S;
    const scale = Math.max(S / bitmap.width, S / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (S - w) / 2, (S - h) / 2, w, h);
  } else {
    const maxW = 1280; // downscale wide, preserve aspect
    const scale = Math.min(1, maxW / bitmap.width);
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Modal to edit the profile's info (avatar + cover + name + status). Redesigned
 * per the "Editar perfil" handoff: a combined live preview (wide cover with an
 * overlapping avatar), glass toolbar, camera badge, wrapping actions and
 * drag&drop. Rendered inside .profile like PinPicker (absolute overlay). */
function EditProfileModal({
  initialName,
  initialStatus,
  initialBannerUrl,
  initialAvatarUrl,
  saving,
  onCancel,
  onSave,
}: {
  initialName: string;
  initialStatus: string;
  initialBannerUrl: string | null;
  initialAvatarUrl: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (vals: {
    name: string;
    status: string;
    bannerUrl: string | null;
    avatarUrl: string | null;
  }) => void;
}) {
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState(initialStatus);
  const [bannerUrl, setBannerUrl] = useState<string | null>(initialBannerUrl);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [picker, setPicker] = useState<null | "banner" | "avatar">(null);
  const [dragOver, setDragOver] = useState<null | "banner" | "avatar">(null);
  const [avatarMenu, setAvatarMenu] = useState(false);

  const avatarFile = useRef<HTMLInputElement>(null);
  const coverFile = useRef<HTMLInputElement>(null);

  // Esc closes (ignored while a picker is open — it owns Esc then).
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const pickerOpenRef = useRef(picker);
  pickerOpenRef.current = picker;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pickerOpenRef.current) cancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setImage = (kind: "banner" | "avatar", url: string | null) =>
    (kind === "avatar" ? setAvatarUrl : setBannerUrl)(url);

  const loadFile = async (kind: "banner" | "avatar", file?: File | null) => {
    if (!file) return;
    const url = await fileToImageDataUrl(file, kind === "avatar" ? "avatar" : "cover");
    if (url) setImage(kind, url);
  };

  const onDrop = (kind: "banner" | "avatar") => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    void loadFile(kind, e.dataTransfer.files?.[0]);
  };
  const allowDrop = (kind: "banner" | "avatar") => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(kind);
  };

  const STATUS_MAX = 70;
  const overWarn = status.length > STATUS_MAX - 10;

  return (
    <div
      className="ep-stage"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !picker) onCancel();
      }}
    >
      <div className="ep-modal" role="dialog" aria-label="Editar perfil">
        <div className="ep-head">
          <div className="ep-mark">
            <PaletteIcon size={19} />
          </div>
          <div className="ep-head-txt">
            <h1>Editar perfil</h1>
            <p>Cambia tu foto, tu portada, tu nombre y tu frase de estado.</p>
          </div>
          <button type="button" className="ep-close" onClick={onCancel} aria-label="Cerrar">
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="ep-body">
          {/* ── Imágenes: live preview (cover + overlapping avatar) ── */}
          <div className="ep-section">
            <div className="ep-sec-label">
              Imágenes <span className="muted">· arrastra una imagen o usa los botones</span>
            </div>

            <div className="ep-preview">
              <div
                className={`ep-cover${dragOver === "banner" ? " drag" : ""}`}
                onDragOver={allowDrop("banner")}
                onDragLeave={() => setDragOver(null)}
                onDrop={onDrop("banner")}
              >
                {bannerUrl ? (
                  <>
                    <div className="ep-cover-media">
                      <img src={bannerUrl} alt="" />
                    </div>
                    <div className="ep-cover-scrim" />
                  </>
                ) : (
                  <div className="ep-cover-empty">
                    <ImageIcon size={26} />
                    <span>Arrastra una portada aquí</span>
                  </div>
                )}
                <div className="ep-tools ep-cover-tools">
                  <button
                    type="button"
                    className="ep-tool"
                    title="Buscar en SteamGridDB"
                    onClick={() => setPicker("banner")}
                  >
                    <SearchIcon size={17} />
                  </button>
                  <button
                    type="button"
                    className="ep-tool"
                    title="Subir desde archivo"
                    onClick={() => coverFile.current?.click()}
                  >
                    <UploadIcon size={17} />
                  </button>
                  <button
                    type="button"
                    className="ep-tool danger"
                    title="Quitar portada"
                    disabled={!bannerUrl}
                    onClick={() => setBannerUrl(null)}
                  >
                    <TrashIcon size={17} />
                  </button>
                </div>
              </div>

              <div className="ep-avatar-wrap">
                <div
                  className={`ep-avatar${dragOver === "avatar" ? " drag" : ""}`}
                  onDragOver={allowDrop("avatar")}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={onDrop("avatar")}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" />
                  ) : (
                    <div className="ep-avatar-initials">{initialsOf(name)}</div>
                  )}
                </div>
                <button
                  type="button"
                  className="ep-avatar-cam"
                  title="Cambiar foto"
                  aria-haspopup="menu"
                  aria-expanded={avatarMenu}
                  onClick={() => setAvatarMenu((v) => !v)}
                >
                  <CameraIcon size={16} />
                </button>
                {avatarMenu && (
                  <>
                    <div
                      className="ep-menu-backdrop"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setAvatarMenu(false);
                      }}
                    />
                    <div className="ep-avatar-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAvatarMenu(false);
                          setPicker("avatar");
                        }}
                      >
                        <SearchIcon size={15} /> Buscar en SteamGridDB
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAvatarMenu(false);
                          avatarFile.current?.click();
                        }}
                      >
                        <UploadIcon size={15} /> Subir desde archivo
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!avatarUrl}
                        onClick={() => {
                          setAvatarMenu(false);
                          setAvatarUrl(null);
                        }}
                      >
                        <TrashIcon size={15} /> Quitar foto
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* avatar actions — compact, wrap, never overflow */}
            <div className="ep-photo-row">
              <div className="ep-srcs">
                <button type="button" className="ep-src primary" onClick={() => setPicker("avatar")}>
                  <SearchIcon size={15} /> SteamGridDB
                </button>
                <button
                  type="button"
                  className="ep-src"
                  onClick={() => avatarFile.current?.click()}
                >
                  <UploadIcon size={15} /> Subir
                </button>
                <button
                  type="button"
                  className="ep-src danger"
                  disabled={!avatarUrl}
                  onClick={() => setAvatarUrl(null)}
                >
                  <TrashIcon size={15} /> Quitar
                </button>
              </div>
            </div>
          </div>

          {/* ── Nombre ── */}
          <div className="ep-field">
            <div className="ep-label">
              <b>Nombre</b>
            </div>
            <input
              className="ep-input"
              value={name}
              maxLength={32}
              placeholder="Tu nombre visible"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* ── Frase de estado ── */}
          <div className="ep-field">
            <div className="ep-label">
              <b>Frase de estado</b>
              <span className={`ep-count${overWarn ? " warn" : ""}`}>
                {status.length}/{STATUS_MAX}
              </span>
            </div>
            <input
              className="ep-input"
              value={status}
              maxLength={STATUS_MAX}
              placeholder="Una frase que te represente…"
              onChange={(e) => setStatus(e.target.value)}
            />
          </div>
        </div>

        <div className="ep-foot">
          <button type="button" className="ep-btn ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="ep-btn primary"
            disabled={saving}
            onClick={() => onSave({ name, status, bannerUrl, avatarUrl })}
          >
            <CheckIcon size={18} /> {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>

        {/* hidden file inputs (cover + avatar) */}
        <input
          ref={avatarFile}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            void loadFile("avatar", e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={coverFile}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            void loadFile("banner", e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {picker === "banner" && (
        <NexusImagePicker
          title="Elegir portada"
          subtitle="Busca un juego y elige una imagen ancha de SteamGridDB."
          defaultFilter="all"
          onPick={(url) => {
            setBannerUrl(url);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "avatar" && (
        <NexusImagePicker
          title="Elegir foto de perfil"
          subtitle="Busca un juego y elige una imagen cuadrada de SteamGridDB."
          defaultFilter="512x512"
          onPick={(url) => {
            setAvatarUrl(url);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

/** Dimension/type filters for the image picker. `key` matches the IPC
 * handler's allowlist ("all" | "hero" | a specific grid size). */
const BANNER_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "hero", label: "Banner" },
  { key: "920x430", label: "920×430" },
  { key: "460x215", label: "460×215" },
  { key: "600x900", label: "600×900" },
  { key: "342x482", label: "342×482" },
  { key: "1024x1024", label: "1024×1024" },
  { key: "512x512", label: "512×512" },
];

function NexusImagePicker({
  title,
  subtitle,
  defaultFilter = "all",
  onPick,
  onClose,
}: {
  title: string;
  subtitle: string;
  defaultFilter?: string;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  // Always start blank — never carry over a previous/suggested search.
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>(defaultFilter);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SgdbCandidate[]>([]);
  const [searched, setSearched] = useState(false);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runSearch = useCallback(async (q: string, f: string) => {
    const term = q.trim();
    if (!term) return;
    setBusy(true);
    setMsg(null);
    setSearched(true);
    try {
      const res = await window.electronAPI.searchSteamGridDbImages(term, f);
      if (!res.success) {
        setCandidates([]);
        setMsg(res.error ?? "No se pudo buscar.");
      } else {
        setCandidates(res.candidates);
        if (res.candidates.length === 0) setMsg(res.error ?? "Sin resultados.");
      }
    } catch (err) {
      setCandidates([]);
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(query, filter);
  };

  // Picking a dimension filter re-runs the current search immediately.
  const pickFilter = (f: string) => {
    setFilter(f);
    if (query.trim()) void runSearch(query, f);
  };

  return (
    <div
      className="pf-banner-picker"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pf-bp-panel">
        <div className="pf-bp-head">
          <div className="pf-edit-head-txt">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="pf-edit-close" onClick={onClose} aria-label="Cerrar">
            <CloseIcon size={18} />
          </button>
        </div>
        <form className="pf-bp-search" onSubmit={submit}>
          <SearchIcon size={18} />
          <input
            className="pf-bp-input"
            value={query}
            placeholder="Busca un juego (p. ej. Hollow Knight)…"
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="pf-act-btn primary" type="submit" disabled={busy}>
            {busy ? "…" : "Buscar"}
          </button>
        </form>
        <div className="pf-bp-filters">
          {BANNER_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`pf-bp-chip${filter === f.key ? " active" : ""}`}
              onClick={() => pickFilter(f.key)}
              disabled={busy}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="pf-bp-results">
          {busy ? (
            <div className="pf-bp-state">Buscando…</div>
          ) : candidates.length > 0 ? (
            <div className="pf-bp-grid">
              {candidates.map((c, i) => (
                <button
                  key={`${c.gridId}-${i}`}
                  type="button"
                  className="pf-bp-item"
                  title={`${c.width}×${c.height}`}
                  onClick={() => onPick(c.fullUrl)}
                >
                  <img src={c.thumbnailUrl} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          ) : (
            <div className="pf-bp-state">
              {searched ? msg ?? "Sin resultados." : "Busca un juego para ver portadas."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pf-stat">
      <span className="pf-stat-ico">{icon}</span>
      <span className="pf-stat-val">{children}</span>
      <span className="pf-stat-lbl">{label}</span>
    </div>
  );
}

/** Lightweight searchable game picker for "Fijar juego". */
function PinPicker({
  games,
  excluded,
  onPick,
  onClose,
}: {
  games: NexusGame[];
  excluded: Set<string>;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return games
      .filter((g) => !excluded.has(g.key))
      .filter((g) => !term || `${g.title} ${g.systemName}`.toLowerCase().includes(term))
      .slice(0, 60);
  }, [q, games, excluded]);
  return (
    <div className="pf-picker" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pf-picker-panel">
        <div className="pf-picker-bar">
          <SearchIcon size={20} />
          <input
            className="pf-picker-input"
            autoFocus
            placeholder="Buscar juego para fijar…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="pf-act-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="pf-picker-grid">
          {results.map((g) => (
            <button key={g.key} className="pf-picker-item" onClick={() => onPick(g.key)}>
              <div className="pf-picker-cover">
                <NexusCover game={g} showMeta titleSize={13} />
              </div>
              <span className="pf-picker-name">{g.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
