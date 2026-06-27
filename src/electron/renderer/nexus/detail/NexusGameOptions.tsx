/**
 * NexusGameOptions — EMURA "Opciones del juego" modal (handoff redesign), opened
 * from the game detail. Game-scoped: choose the emulator for THIS game + real
 * actions (favorite, pin, open ROM location, reset play time). Visuals are a
 * 1:1 port of handoff_opciones_juego; wiring is our real config / library / FS.
 */

import { useEffect, useRef, useState } from "react";
import type { NexusGame } from "../nexusModel";
import { useApp } from "../../context/AppContext";
import { NexusCover } from "../NexusCover";
import { ChangeCoverModal, type CoverItem } from "../NexusCoverGallery";
import "./nexus-game-options.css";

/** Metadata is keyed by the file name without its extension. */
function metaKey(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i > 0 ? fileName.substring(0, i) : fileName;
}

interface EmuOption {
  emulatorId: string;
  emulatorName: string;
}

// Functional glyphs ported verbatim from the handoff's icons.jsx, so they match
// the reference exactly.
type IconName = "close" | "check" | "heart" | "pin" | "folder" | "external" | "trash" | "image";
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const c = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const s = { width: size, height: size, display: "block" as const };
  const v = "0 0 24 24";
  switch (name) {
    case "close":
      return <svg style={s} viewBox={v}><path d="M6 6l12 12M18 6L6 18" {...c} /></svg>;
    case "check":
      return <svg style={s} viewBox={v}><path d="M5 12.5l4.5 4.5L19 7" {...c} /></svg>;
    case "heart":
      return (
        <svg style={s} viewBox={v}>
          <path d="M12 20s-7-4.4-7-9.3A3.7 3.7 0 0 1 12 7a3.7 3.7 0 0 1 7 3.7C19 15.6 12 20 12 20z" {...c} />
        </svg>
      );
    case "pin":
      return (
        <svg style={s} viewBox={v}>
          <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" {...c} />
          <path d="M12 14v7" {...c} />
        </svg>
      );
    case "folder":
      return (
        <svg style={s} viewBox={v}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" {...c} />
        </svg>
      );
    case "external":
      return (
        <svg style={s} viewBox={v}>
          <path d="M14 5h5v5M19 5l-8 8M11 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" {...c} />
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
    case "trash":
      return (
        <svg style={s} viewBox={v}>
          <path d="M4 7h16" {...c} />
          <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" {...c} />
          <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" {...c} />
          <path d="M10 11v6M14 11v6" {...c} />
        </svg>
      );
    default:
      return null;
  }
}

export function NexusGameOptions({
  game,
  isFavorite,
  pinned,
  onToggleFavorite,
  onTogglePin,
  onClose,
  onChanged,
}: {
  game: NexusGame;
  isFavorite: boolean;
  pinned: boolean;
  onToggleFavorite: () => void;
  onTogglePin: () => void;
  onClose: () => void;
  /** Fired when the per-game emulator override changes (refreshes the ficha's Core). */
  onChanged?: () => void;
}) {
  const app = useApp();
  const sys = game.rom.systemId;
  const file = game.rom.fileName;
  const key = `${sys}:${file}`;

  const [emus, setEmus] = useState<EmuOption[]>([]);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState<{ text: string; k: number } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);

  const fire = (text: string) => {
    setToast({ text, k: Date.now() });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1900);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [overrides, list] = await Promise.all([
          window.electronAPI.getGameOverrides(),
          window.electronAPI.getEmulatorsForSystem(sys),
        ]);
        if (cancelled) return;
        setEmus(list);
        setOverrideId(overrides[key]?.emulatorId ?? null);
      } catch (e) {
        console.warn("[game-options] load failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, sys]);

  // Current cover preview (managed directly so it refreshes after a change —
  // the NEXUS cover layer doesn't react to cover-version bumps).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!game.coverPath) {
        if (!cancelled) setCoverUrl(null);
        return;
      }
      try {
        const url = await window.electronAPI.readCoverDataUrl(game.coverPath);
        if (!cancelled) setCoverUrl(url ?? null);
      } catch {
        if (!cancelled) setCoverUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game.coverPath]);

  // Esc / click-outside close (Esc captured so it doesn't bubble to the ficha).
  // The cover picker (a portal) owns Esc while it's open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (coverPickerOpen) return;
        e.stopPropagation();
        if (confirmReset) setConfirmReset(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, confirmReset, coverPickerOpen]);

  const coverItem: CoverItem = {
    key,
    systemId: sys,
    fileName: file,
    title: game.title,
    systemName: game.systemName,
    coverPath: game.coverPath,
    coverSource: app.metadataMap[sys]?.[metaKey(file)]?.coverSource as CoverItem["coverSource"],
    tint: game.tint,
  };

  const onCoverApplied = async (result: {
    action: "libretro" | "steamgriddb" | "custom" | "reset";
    coverPath?: string;
  }) => {
    setCoverPickerOpen(false);
    try {
      if (result.action === "reset") {
        setCoverUrl(null);
        await app.startFetchingCovers();
      }
      if (result.coverPath) {
        try {
          setCoverUrl(await window.electronAPI.readCoverDataUrl(result.coverPath));
        } catch {
          /* keep previous preview */
        }
      }
      await app.loadAllMetadata();
      app.bumpCoverVersion(sys, file);
      onChanged?.();
      fire(result.action === "reset" ? "Carátula restablecida" : "Carátula actualizada");
    } catch (e) {
      console.warn("[game-options] cover apply failed:", e);
    }
  };

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    []
  );

  const defaultEmu = emus[0];

  const chooseEmu = async (id: string | null) => {
    if (busy || id === overrideId) return;
    setBusy(true);
    try {
      await window.electronAPI.setEmulatorOverride(sys, file, id);
      setOverrideId(id);
      onChanged?.();
    } catch (e) {
      console.warn("[game-options] set emulator failed:", e);
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setBusy(true);
    try {
      await window.electronAPI.resetGamePlay(sys, file);
      await app.reloadUserLibrary();
      setConfirmReset(false);
      fire("Tiempo jugado restablecido");
    } catch (e) {
      console.warn("[game-options] reset failed:", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="go-stage"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="go-modal" role="dialog" aria-label="Opciones del juego">
        <div className="go-head">
          <span className="go-cover">
            {coverUrl ? <img src={coverUrl} alt="" /> : <NexusCover game={game} rounded={0} />}
          </span>
          <div className="go-head-txt">
            <h2>Opciones del juego</h2>
            <p>
              {game.title}
              {game.systemName ? " · " + game.systemName : ""}
            </p>
          </div>
          <button className="go-close" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={19} />
          </button>
        </div>

        <div className="go-body">
          {/* ── Emulador ─────────────────────────────────────── */}
          <div>
            <div className="go-group-lbl">Emulador para este juego</div>
            <div className="go-emu">
              <button
                className={"go-emu-opt" + (overrideId === null ? " on" : "")}
                disabled={busy}
                onClick={() => void chooseEmu(null)}
              >
                <span className="go-emu-bar" />
                <span className="go-emu-radio">
                  <i />
                </span>
                <span className="go-emu-txt">
                  <b>Predeterminado</b>
                  <span>{defaultEmu ? defaultEmu.emulatorName : "Emulador del sistema"}</span>
                </span>
                <span className="go-emu-tag">Recomendado</span>
              </button>
              {emus.map((e) => (
                <button
                  key={e.emulatorId}
                  className={"go-emu-opt" + (overrideId === e.emulatorId ? " on" : "")}
                  disabled={busy}
                  onClick={() => void chooseEmu(e.emulatorId)}
                >
                  <span className="go-emu-bar" />
                  <span className="go-emu-radio">
                    <i />
                  </span>
                  <span className="go-emu-txt">
                    <b>{e.emulatorName}</b>
                    <span>{e.emulatorId}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Acciones ─────────────────────────────────────── */}
          <div>
            <div className="go-group-lbl">Acciones</div>
            <div className="go-actions">
              <button className="go-act" onClick={() => setCoverPickerOpen(true)}>
                <span className="go-act-ico">
                  <Icon name="image" size={18} />
                </span>
                <span className="go-act-lbl">
                  Cambiar carátula
                  <span>SteamGridDB, Libretro o una imagen propia</span>
                </span>
                <span className="go-act-chev">
                  <Icon name="external" size={16} />
                </span>
              </button>
              <button
                className={"go-act" + (isFavorite ? " on" : "")}
                onClick={onToggleFavorite}
              >
                <span className="go-act-ico">
                  <Icon name="heart" size={18} />
                </span>
                <span className="go-act-lbl">Favorito</span>
                <span className="go-act-state">{isFavorite ? "Añadido" : ""}</span>
              </button>
              <button className={"go-act" + (pinned ? " on" : "")} onClick={onTogglePin}>
                <span className="go-act-ico">
                  <Icon name="pin" size={18} />
                </span>
                <span className="go-act-lbl">Fijar en el perfil</span>
                <span className="go-act-state">{pinned ? "Fijado" : ""}</span>
              </button>

              <div className="go-divider" />

              <button
                className="go-act"
                onClick={() => {
                  void window.electronAPI.showInExplorer(game.rom.filePath);
                  fire("Abriendo ubicación del ROM…");
                }}
              >
                <span className="go-act-ico">
                  <Icon name="folder" size={18} />
                </span>
                <span className="go-act-lbl">
                  Abrir ubicación del ROM
                  <span>{game.rom.filePath}</span>
                </span>
                <span className="go-act-chev">
                  <Icon name="external" size={16} />
                </span>
              </button>
              <button className="go-act danger" disabled={busy} onClick={() => setConfirmReset(true)}>
                <span className="go-act-ico">
                  <Icon name="trash" size={18} />
                </span>
                <span className="go-act-lbl">Restablecer tiempo jugado</span>
              </button>
            </div>
          </div>

          <div className="go-foot" />
        </div>

        {confirmReset && (
          <div
            className="go-confirm"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setConfirmReset(false);
            }}
          >
            <div className="go-confirm-card" role="alertdialog" aria-modal="true">
              <div className="go-cf-ic">
                <Icon name="trash" size={22} />
              </div>
              <b>¿Restablecer el tiempo jugado?</b>
              <p>Se borrará el tiempo y las sesiones de este juego. No se puede deshacer.</p>
              <div className="go-confirm-acts">
                <button className="go-cbtn" disabled={busy} onClick={() => setConfirmReset(false)}>
                  Cancelar
                </button>
                <button className="go-cbtn danger" disabled={busy} onClick={() => void doReset()}>
                  Restablecer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {coverPickerOpen && (
        <ChangeCoverModal
          item={coverItem}
          currentUrl={coverUrl}
          onApplied={(r) => void onCoverApplied(r)}
          onClose={() => setCoverPickerOpen(false)}
        />
      )}

      {toast && (
        <div className="go-toast" key={toast.k}>
          <span className="ic">
            <Icon name="check" size={14} />
          </span>{" "}
          {toast.text}
        </div>
      )}
    </div>
  );
}
