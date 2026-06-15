/**
 * NexusCoverGallery — cover gallery + "Cambiar portada" modal for the NEXUS
 * theme. Rendered as the "Galería" sub-tab inside Settings → Portadas (so it's
 * visible within the settings UI; pass `embedded`). Visual design ported 1:1
 * from the handoff (handoff_galeria_portadas); the LOGIC is copied verbatim from
 * the working main-theme implementation (PortadasView + CoverSourcePicker) —
 * same real sources (Libretro / SteamGridDB / Imagen personalizada), same
 * on-disk cover store + metadata refresh. Self-contained: derives the game list
 * from AppContext, so it needs no props beyond the optional `embedded` flag.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import { systemTint } from "./nexusPlatforms";
import type { SgdbCandidate } from "../../../core/types";
import {
  BackIcon,
  SearchIcon,
  CloseIcon,
  CheckIcon,
  ImageIcon,
  UploadIcon,
  GamepadIcon,
  StarIcon,
  ChevronRightIcon,
} from "./NexusIcons";
import "./nexus-cover-gallery.css";

/** Metadata key for a ROM filename (strip extension), matching the cache. */
function metaKey(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i > 0 ? fileName.substring(0, i) : fileName;
}

type CoverSrc = "libretro" | "screenscraper" | "steamgriddb" | "custom" | undefined;

interface CoverItem {
  key: string; // systemId:fileName
  systemId: string;
  fileName: string;
  title: string;
  systemName: string;
  coverPath: string | null;
  coverSource: CoverSrc;
  tint: string;
}

// ──────────────────────────────────────────────────────────────────────────
//  Gallery
// ──────────────────────────────────────────────────────────────────────────
export function NexusCoverGallery({
  embedded = false,
  onBack,
}: {
  embedded?: boolean;
  onBack?: () => void;
}) {
  const app = useApp();
  const [covers, setCovers] = useState<Record<string, string | null>>({});
  const [q, setQ] = useState("");
  const [picker, setPicker] = useState<CoverItem | null>(null);
  const [savedKeys, setSavedKeys] = useState<Record<string, "saved" | "reset">>({});

  const metaMapRef = useRef(app.metadataMap);
  metaMapRef.current = app.metadataMap;

  // Build the item list from the real library (scanResult + metadata).
  const items = useMemo<CoverItem[]>(() => {
    const out: CoverItem[] = [];
    if (!app.scanResult) return out;
    const custom = app.config?.customSystemColors;
    for (const sys of app.scanResult.systems) {
      for (const rom of sys.roms) {
        const meta = app.metadataMap[rom.systemId]?.[metaKey(rom.fileName)];
        out.push({
          key: `${rom.systemId}:${rom.fileName}`,
          systemId: rom.systemId,
          fileName: rom.fileName,
          title: meta?.title?.trim() || metaKey(rom.fileName),
          systemName: rom.systemName,
          coverPath: meta?.coverPath || null,
          coverSource: meta?.coverSource as CoverSrc,
          tint: systemTint(rom.systemId, custom),
        });
      }
    }
    out.sort((a, b) => a.title.localeCompare(b.title));
    return out;
  }, [app.scanResult, app.metadataMap, app.config]);

  // Stable signature so covers reload only when the SET of ROMs changes.
  const setSignature = useMemo(() => items.map((it) => it.key).join("|"), [items]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result: Record<string, string | null> = {};
      for (const it of itemsRef.current) {
        if (cancelled) break;
        if (it.coverPath) {
          try {
            result[it.key] = await window.electronAPI.readCoverDataUrl(it.coverPath);
          } catch {
            result[it.key] = null;
          }
        } else {
          result[it.key] = null;
        }
      }
      if (!cancelled) setCovers(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [setSignature]);

  // Esc closes the overlay (only in standalone mode, and when no modal is open).
  useEffect(() => {
    if (embedded || !onBack) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !picker) onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [embedded, onBack, picker]);

  const flashBadge = useCallback((key: string, type: "saved" | "reset") => {
    setSavedKeys((prev) => ({ ...prev, [key]: type }));
    window.setTimeout(() => {
      setSavedKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 2000);
  }, []);

  const refreshCover = useCallback(async (it: CoverItem) => {
    const meta = metaMapRef.current[it.systemId]?.[metaKey(it.fileName)];
    if (meta?.coverPath) {
      try {
        const url = await window.electronAPI.readCoverDataUrl(meta.coverPath);
        setCovers((prev) => ({ ...prev, [it.key]: url }));
      } catch {
        /* silent */
      }
    }
  }, []);

  // Mirrors PortadasView.handlePickerApplied — refresh the card + bump version.
  const handleApplied = useCallback(
    async (
      it: CoverItem,
      result: { action: "libretro" | "steamgriddb" | "custom" | "reset"; coverPath?: string }
    ) => {
      if (result.action === "reset") {
        setCovers((prev) => ({ ...prev, [it.key]: null }));
        await app.startFetchingCovers();
        await app.loadAllMetadata();
        await refreshCover(it);
        app.bumpCoverVersion(it.systemId, it.fileName);
        flashBadge(it.key, "reset");
        return;
      }
      if (result.coverPath) {
        try {
          const url = await window.electronAPI.readCoverDataUrl(result.coverPath);
          setCovers((prev) => ({ ...prev, [it.key]: url }));
        } catch {
          /* silent */
        }
      }
      await app.loadAllMetadata();
      app.bumpCoverVersion(it.systemId, it.fileName);
      flashBadge(it.key, "saved");
    },
    [app, refreshCover, flashBadge]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (it) => it.title.toLowerCase().includes(s) || it.systemName.toLowerCase().includes(s)
    );
  }, [items, q]);

  const edited = useMemo(
    () => items.filter((it) => it.coverSource === "custom" || it.coverSource === "steamgriddb").length,
    [items]
  );

  return (
    <div className={`cg-page${embedded ? " embedded" : ""}`}>
      <div className="cg-head">
        {!embedded && onBack && (
          <button className="cg-back" onClick={onBack} aria-label="Volver">
            <BackIcon size={17} /> Biblioteca
          </button>
        )}
        <div className="cg-head-txt">
          <h1>Galería de portadas</h1>
          <p>Personaliza la carátula de cualquier juego de tu biblioteca.</p>
        </div>
        <span className="cg-count">
          {filtered.length} juegos{edited ? ` · ${edited} editadas` : ""}
        </span>
        <div className="cg-search">
          <SearchIcon size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar juego o sistema…"
          />
        </div>
      </div>

      <div className="cg-scroll">
        {items.length === 0 ? (
          <div className="cg-empty-state">No se encontraron juegos. Escanea tu biblioteca primero.</div>
        ) : (
          <div className="cg-grid">
            {filtered.map((it) => {
              const badge =
                it.coverSource === "custom" ? "Propia" : it.coverSource === "steamgriddb" ? "Editada" : null;
              const flash = savedKeys[it.key];
              const url = covers[it.key];
              return (
                <div key={it.key} className="cg-card">
                  <button
                    className="cg-thumb"
                    onClick={() => setPicker(it)}
                    aria-label={`Cambiar portada de ${it.title}`}
                  >
                    {url ? (
                      <img src={url} alt={it.title} draggable={false} />
                    ) : (
                      <span className="cg-thumb-empty">
                        <ImageIcon size={26} />
                      </span>
                    )}
                    {flash ? (
                      <span className={`cg-custom-dot${flash === "reset" ? " reset" : ""}`}>
                        <CheckIcon size={11} /> {flash === "saved" ? "Guardado" : "Restaurado"}
                      </span>
                    ) : (
                      badge && (
                        <span className="cg-custom-dot">
                          <CheckIcon size={11} /> {badge}
                        </span>
                      )
                    )}
                    <span className="cg-thumb-over">
                      <span className="cg-over-btn">
                        <ImageIcon size={15} /> Cambiar portada
                      </span>
                    </span>
                  </button>
                  <div className="cg-card-title">{it.title}</div>
                  <div className="cg-badge">
                    <span className="dot" style={{ background: it.tint, color: it.tint }} /> {it.systemName}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {picker && (
        <ChangeCoverModal
          item={picker}
          currentUrl={covers[picker.key] ?? null}
          onApplied={(result) => void handleApplied(picker, result)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  "Cambiar portada" modal — logic copied from CoverSourcePicker, design from
//  the handoff (cc-* classes). Portaled to <body> with self-contained tokens.
// ──────────────────────────────────────────────────────────────────────────
type Mode = "sources" | "sgdb" | "custom";
type Busy =
  | null
  | { kind: "libretro" | "custom" | "reset" | "sgdb-list" }
  | { kind: "sgdb-apply"; gridId: number };

function ChangeCoverModal({
  item,
  currentUrl,
  onApplied,
  onClose,
}: {
  item: CoverItem;
  currentUrl: string | null;
  onApplied: (result: {
    action: "libretro" | "steamgriddb" | "custom" | "reset";
    coverPath?: string;
  }) => void;
  onClose: () => void;
}) {
  const { systemId, fileName } = item;
  const hasCustomCover = item.coverSource === "custom";
  const [mode, setMode] = useState<Mode>("sources");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SgdbCandidate[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isBusy = busy !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || isBusy) return;
      if (mode !== "sources") {
        setMode("sources");
        setError(null);
      } else {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isBusy, mode, onClose]);

  const handleLibretro = useCallback(async () => {
    setBusy({ kind: "libretro" });
    setError(null);
    try {
      const res = await window.electronAPI.fetchCoverFromLibretro(systemId, fileName);
      if (!res.success) {
        setError(res.error ?? "No se pudo descargar de Libretro.");
        return;
      }
      onApplied({ action: "libretro", coverPath: res.coverPath });
      onClose();
    } finally {
      setBusy(null);
    }
  }, [systemId, fileName, onApplied, onClose]);

  const openSgdb = useCallback(async () => {
    setBusy({ kind: "sgdb-list" });
    setError(null);
    try {
      const res = await window.electronAPI.listSteamGridDbCandidates(systemId, fileName);
      if (!res.success && (!res.candidates || res.candidates.length === 0)) {
        setError(res.error ?? "No se pudieron obtener candidatos.");
        return;
      }
      setCandidates(res.candidates);
      setMode("sgdb");
      if (res.candidates.length === 0) setError(res.error ?? "Sin resultados en SteamGridDB.");
    } finally {
      setBusy(null);
    }
  }, [systemId, fileName]);

  const applyCandidate = useCallback(
    async (c: SgdbCandidate) => {
      setBusy({ kind: "sgdb-apply", gridId: c.gridId });
      setError(null);
      try {
        const res = await window.electronAPI.applySteamGridDbCandidate(systemId, fileName, c.fullUrl);
        if (!res.success) {
          setError(res.error ?? "No se pudo aplicar la portada.");
          return;
        }
        onApplied({ action: "steamgriddb", coverPath: res.coverPath });
        onClose();
      } finally {
        setBusy(null);
      }
    },
    [systemId, fileName, onApplied, onClose]
  );

  const applyCustomPath = useCallback(
    async (sourcePath: string) => {
      setBusy({ kind: "custom" });
      setError(null);
      try {
        const res = await window.electronAPI.setCustomCover(systemId, fileName, sourcePath);
        if (!res.success) {
          setError(res.error ?? "No se pudo guardar la imagen.");
          return;
        }
        onApplied({ action: "custom", coverPath: res.coverPath });
        onClose();
      } finally {
        setBusy(null);
      }
    },
    [systemId, fileName, onApplied, onClose]
  );

  const pickCustomFile = useCallback(async () => {
    const sourcePath = await window.electronAPI.pickFile([
      { name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] },
    ]);
    if (sourcePath) void applyCustomPath(sourcePath);
  }, [applyCustomPath]);

  const onDropFile = useCallback(
    (file: File | undefined) => {
      if (!file || !file.type.startsWith("image/")) return;
      try {
        const path = window.electronAPI.getPathForFile(file);
        if (path) void applyCustomPath(path);
      } catch {
        void pickCustomFile();
      }
    },
    [applyCustomPath, pickCustomFile]
  );

  const handleReset = useCallback(async () => {
    setBusy({ kind: "reset" });
    setError(null);
    try {
      const res = await window.electronAPI.resetCustomCover(systemId, fileName);
      if (!res.success) {
        setError(res.error ?? "No se pudo restablecer la portada.");
        return;
      }
      onApplied({ action: "reset" });
      onClose();
    } finally {
      setBusy(null);
    }
  }, [systemId, fileName, onApplied, onClose]);

  return createPortal(
    <div className="nexus-cg-portal">
      <div
        className="cc-stage"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !isBusy) onClose();
        }}
      >
        <div className="cc-modal" role="dialog" aria-label="Cambiar portada">
          {mode === "sources" && (
            <>
              <div className="cc-head">
                <div className="cc-head-thumb">
                  {currentUrl ? <img src={currentUrl} alt="" /> : <ImageIcon size={20} />}
                </div>
                <div className="cc-head-txt">
                  <h2>Cambiar portada</h2>
                  <p>
                    {item.title} · {item.systemName}
                  </p>
                </div>
                <button className="cc-close" onClick={onClose} disabled={isBusy} aria-label="Cerrar">
                  <CloseIcon size={20} />
                </button>
              </div>

              {error && <div className="cc-error">{error}</div>}

              <div className="cc-body">
                <button className="cc-src" disabled={isBusy} onClick={() => void handleLibretro()}>
                  <span className="cc-src-ico libretro">
                    <GamepadIcon size={22} />
                  </span>
                  <span className="cc-src-txt">
                    <b>Libretro</b>
                    <span>Cartas oficiales del proyecto libretro-thumbnails.</span>
                  </span>
                  <span className="cc-src-arrow">
                    {busy?.kind === "libretro" ? "…" : <ChevronRightIcon size={20} />}
                  </span>
                </button>
                <button className="cc-src" disabled={isBusy} onClick={() => void openSgdb()}>
                  <span className="cc-src-ico sgdb">
                    <StarIcon size={21} />
                  </span>
                  <span className="cc-src-txt">
                    <b>SteamGridDB</b>
                    <span>Elige entre varias portadas hechas por la comunidad.</span>
                  </span>
                  <span className="cc-src-arrow">
                    {busy?.kind === "sgdb-list" ? "…" : <ChevronRightIcon size={20} />}
                  </span>
                </button>
                <button className="cc-src" disabled={isBusy} onClick={() => setMode("custom")}>
                  <span className="cc-src-ico custom">
                    <ImageIcon size={21} />
                  </span>
                  <span className="cc-src-txt">
                    <b>Imagen personalizada</b>
                    <span>Carga un archivo desde tu equipo (jpg / png / webp).</span>
                  </span>
                  <span className="cc-src-arrow">
                    <ChevronRightIcon size={20} />
                  </span>
                </button>
              </div>

              <div className="cc-foot">
                {hasCustomCover && (
                  <button className="cc-foot-link" disabled={isBusy} onClick={() => void handleReset()}>
                    {busy?.kind === "reset" ? "Restableciendo…" : "Restablecer original"}
                  </button>
                )}
                <button className="cc-foot-link" disabled={isBusy} onClick={onClose}>
                  Cerrar
                </button>
              </div>
            </>
          )}

          {mode === "sgdb" && (
            <>
              <div className="cc-picker-head">
                <button
                  className="cc-back"
                  disabled={isBusy}
                  onClick={() => {
                    setMode("sources");
                    setError(null);
                  }}
                  aria-label="Volver"
                >
                  <BackIcon size={18} />
                </button>
                <div className="cc-picker-title">
                  <b>SteamGridDB</b>
                  <span>Portadas hechas por la comunidad</span>
                </div>
              </div>
              {error && <div className="cc-error">{error}</div>}
              {candidates.length === 0 && !error ? (
                <div className="cc-empty">Sin resultados.</div>
              ) : (
                <div className="cc-grid">
                  {candidates.map((c) => {
                    const applying = busy?.kind === "sgdb-apply" && busy.gridId === c.gridId;
                    return (
                      <button
                        key={c.gridId}
                        className={`cc-var${applying ? " applying" : ""}`}
                        disabled={isBusy}
                        title={`${c.width}×${c.height} · ${c.style}`}
                        onClick={() => void applyCandidate(c)}
                      >
                        <img src={c.thumbnailUrl} alt="" loading="lazy" draggable={false} />
                        {applying && <span className="cc-var-loading">Aplicando…</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {mode === "custom" && (
            <>
              <div className="cc-picker-head">
                <button
                  className="cc-back"
                  disabled={isBusy}
                  onClick={() => {
                    setMode("sources");
                    setError(null);
                  }}
                  aria-label="Volver"
                >
                  <BackIcon size={18} />
                </button>
                <div className="cc-picker-title">
                  <b>Imagen personalizada</b>
                  <span>Carga un archivo desde tu equipo (jpg / png / webp)</span>
                </div>
              </div>
              {error && <div className="cc-error">{error}</div>}
              <div className="cc-body">
                <div
                  className={`cc-drop${drag ? " drag" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    onDropFile(e.dataTransfer.files?.[0]);
                  }}
                >
                  <ImageIcon size={30} />
                  <b>Arrastra una imagen aquí</b>
                  <span>o selecciónala desde tu equipo · JPG · PNG · WebP</span>
                  <button className="cc-drop-btn" disabled={isBusy} onClick={() => void pickCustomFile()}>
                    <UploadIcon size={15} /> {busy?.kind === "custom" ? "Guardando…" : "Elegir archivo"}
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    onDropFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
