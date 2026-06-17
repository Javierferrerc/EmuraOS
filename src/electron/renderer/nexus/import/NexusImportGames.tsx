/**
 * NexusImportGames — EMURA "Importar juegos" modal, ported 1:1 from the design
 * handoff (import-games.jsx + import-games.css) to our React + TS stack and
 * wired to the REAL launcher backend:
 *
 *  - Single selector: a clickable dropzone + "Examinar…" opens the native ROM
 *    picker (window.electronAPI.pickRomFiles); drag-drop accepts files, folders
 *    (recursive) and archives — all funnelled through `scanImportPaths`, which
 *    autodetects each file's system by extension (SystemsRegistry).
 *  - Phases: idle → scanning (live feed) → review (editable system, dedup, size,
 *    cover placeholder) → done / empty.
 *  - Dedup is checked against the real library (passed in as `existing`).
 *  - onConfirm(items) copies the selected ROMs into the library (real addRoms).
 *
 * The design's EXT_SYS/detectFile/cleanTitle mocks are replaced by the real
 * detector; the procedural CoverArt is replaced by a system-tinted placeholder.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SystemDefinition } from "../../../../core/types";
import { systemDisplayName, tintForSystem } from "../nexusModel";
import { makePsSound, type PsSoundKind } from "../profileselect/psSound";
import "./nexus-import-games.css";

// ── icons (ported from the handoff icons.jsx — only what's used) ──
type IconName =
  | "download" | "upload" | "close" | "alert" | "check" | "grid" | "image"
  | "trash" | "search" | "back" | "chevron-right" | "dots" | "plus" | "user-plus";

function Icon({ name, size = 18, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  const s: React.CSSProperties = { width: size, height: size, display: "block" };
  const c = { fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const v = "0 0 24 24";
  switch (name) {
    case "download":
      return <svg style={s} viewBox={v}><path d="M12 4v10m0 0l4-4m-4 4l-4-4" {...c} /><path d="M5 19h14" {...c} /></svg>;
    case "upload":
      return <svg style={s} viewBox={v}><path d="M12 16V5m0 0l-4 4m4-4l4 4" {...c} /><path d="M5 19h14" {...c} /></svg>;
    case "close":
      return <svg style={s} viewBox={v}><path d="M6 6l12 12M18 6L6 18" {...c} /></svg>;
    case "alert":
      return <svg style={s} viewBox={v}><path d="M12 4 2.5 20.5h19L12 4z" {...c} /><path d="M12 10v4.5" {...c} /><circle cx="12" cy="17.6" r="0.4" fill="currentColor" stroke="currentColor" /></svg>;
    case "check":
      return <svg style={s} viewBox={v}><path d="M5 12.5l4.5 4.5L19 7" {...c} /></svg>;
    case "grid":
      return <svg style={s} viewBox={v}><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" {...c} /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" {...c} /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" {...c} /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" {...c} /></svg>;
    case "image":
      return <svg style={s} viewBox={v}><rect x="4" y="5" width="16" height="14" rx="2.5" {...c} /><circle cx="9" cy="10" r="1.6" {...c} /><path d="M5 16l4-3 3 2 3-3 4 4" {...c} /></svg>;
    case "trash":
      return <svg style={s} viewBox={v}><path d="M4 7h16" {...c} /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" {...c} /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" {...c} /><path d="M10 11v6M14 11v6" {...c} /></svg>;
    case "search":
      return <svg style={s} viewBox={v}><circle cx="11" cy="11" r="7" {...c} /><line x1="16.5" y1="16.5" x2="21" y2="21" {...c} /></svg>;
    case "back":
      return <svg style={s} viewBox={v}><path d="M11 5l-7 7 7 7M4 12h16" {...c} /></svg>;
    case "chevron-right":
      return <svg style={s} viewBox={v}><path d="M9 6l6 6-6 6" {...c} /></svg>;
    case "dots":
      return <svg style={s} viewBox={v}><circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>;
    case "plus":
      return <svg style={s} viewBox={v}><path d="M12 5v14M5 12h14" {...c} /></svg>;
    case "user-plus":
      return <svg style={s} viewBox={v}><circle cx="9.5" cy="8" r="3.6" {...c} /><path d="M3.5 20a6 6 0 0 1 12 0" {...c} /><path d="M18.5 8.5v5M16 11h5" {...c} /></svg>;
    default:
      return null;
  }
}

// ── helpers ───────────────────────────────────────────────────
function extOf(name: string): string {
  const m = name.match(/\.([^.]+)$/);
  return m ? m[1].toLowerCase() : "";
}
function cleanTitle(filename: string): string {
  let n = filename.replace(/\.[^.]+$/, "");
  n = n.replace(/[._]+/g, " ");
  n = n.replace(/\((USA|EUR|JPN|Japan|Europe|World|En|Es|Fr|De|It|Rev \d|v\d[\d.]*)\)/gi, "");
  n = n.replace(/\[[^\]]*\]/g, "");
  n = n.replace(/\s{2,}/g, " ").trim();
  n = n.replace(/\b\w/g, (ch) => ch.toUpperCase());
  return n || filename;
}
function fmtSize(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return n.toFixed(n >= 10 || i === 0 ? 0 : 1) + " " + u[i];
}
function shortOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 3).toUpperCase() || "?";
}

type Status = "ok" | "dupe" | "unknown";
export interface ImportItem {
  id: string;
  filePath: string;
  file: string;
  ext: string;
  title: string;
  size: number;
  system: string | null;
  systems: { id: string; name: string }[];
  status: Status;
  include: boolean;
}

type Scanned = { filePath: string; fileName: string; sizeBytes: number; systems: { id: string; name: string }[] };

type PlaySound = (k: PsSoundKind) => void;

export interface WatchedFolder {
  path: string;
  count: number;
}

export interface NexusImportGamesProps {
  onClose: () => void;
  /** Copies the selected items into the library (real addRoms). */
  onConfirm: (items: ImportItem[]) => Promise<void>;
  systems: SystemDefinition[];
  /** Dedup keys already in the library: `${systemId}::${fileName.toLowerCase()}`. */
  existing: Set<string>;
  watched?: WatchedFolder[];
  /** Paths to auto-scan when the modal opens (from a global drag-drop). */
  initialPaths?: string[];
  density?: "normal" | "dense";
  reviewView?: "list" | "grid";
  matchCovers?: boolean;
  cleanNames?: boolean;
  soundEnabled?: boolean;
}

// ── system selector (real systems grouped by manufacturer) ────
function SysSelect({
  value,
  families,
  onChange,
}: {
  value: string | null;
  families: [string, SystemDefinition[]][];
  onChange: (id: string | null) => void;
}) {
  return (
    <span className="ig-syssel">
      <select value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— Sin reconocer —</option>
        {families.map(([man, list]) => (
          <optgroup key={man} label={man}>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="chev">
        <Icon name="chevron-right" size={14} />
      </span>
    </span>
  );
}

function CoverFallback({ system, title }: { system: string | null; title: string }) {
  if (!system) {
    return (
      <span className="ig-cover-fallback" style={{ background: "var(--panel-3)", color: "var(--text-faint)" }}>
        <Icon name="image" size={16} />
      </span>
    );
  }
  const tint = tintForSystem(system);
  return (
    <span
      className="ig-cover-fallback"
      style={{ background: `linear-gradient(150deg, ${tint}, color-mix(in oklab, ${tint} 55%, #0a0c12))` }}
    >
      {shortOf(title)}
    </span>
  );
}

// ── main ──────────────────────────────────────────────────────
export function NexusImportGames({
  onClose,
  onConfirm,
  systems,
  existing,
  watched = [],
  initialPaths,
  density = "normal",
  reviewView = "list",
  matchCovers = true,
  cleanNames = true,
  soundEnabled = true,
}: NexusImportGamesProps) {
  const playSound = useMemo<PlaySound>(() => makePsSound(soundEnabled), [soundEnabled]);
  const beep = playSound;

  const [phase, setPhase] = useState<"idle" | "scanning" | "review" | "done" | "empty">("idle");
  const [drag, setDrag] = useState(false);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [feed, setFeed] = useState<(ImportItem & { k: string })[]>([]);
  const [progress, setProgress] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [view, setView] = useState<"list" | "grid">(reviewView);
  const [busy, setBusy] = useState(false);
  const [watch, setWatch] = useState(() => watched.map((w) => ({ ...w, on: true })));
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  const idSeq = useRef(0);

  const sysName = useCallback((id: string) => systemDisplayName(id, systems.find((s) => s.id === id)?.name), [systems]);

  const families = useMemo<[string, SystemDefinition[]][]>(() => {
    const byMan = new Map<string, SystemDefinition[]>();
    for (const s of systems) {
      const m = s.manufacturer || "Otros";
      const arr = byMan.get(m);
      if (arr) arr.push(s);
      else byMan.set(m, [s]);
    }
    return [...byMan.entries()];
  }, [systems]);

  const toItem = useCallback(
    (sc: Scanned): ImportItem => {
      const system = sc.systems[0]?.id ?? null;
      const dupe = !!system && existing.has(`${system}::${sc.fileName.toLowerCase()}`);
      const title = cleanNames ? cleanTitle(sc.fileName) : sc.fileName.replace(/\.[^.]+$/, "");
      const status: Status = system ? (dupe ? "dupe" : "ok") : "unknown";
      return {
        id: "imp-" + idSeq.current++,
        filePath: sc.filePath,
        file: sc.fileName,
        ext: extOf(sc.fileName),
        title,
        size: sc.sizeBytes,
        system,
        systems: sc.systems,
        status,
        include: !!system && !dupe,
      };
    },
    [existing, cleanNames]
  );

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  // Real scan of file/folder paths → staged live feed → review.
  const startScan = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;
      clearTimers();
      beep("open");
      setPhase("scanning");
      setItems([]);
      setFeed([]);
      setProgress(0);

      let scanned: Scanned[] = [];
      try {
        scanned = await window.electronAPI.scanImportPaths(paths);
      } catch (err) {
        console.warn("[import] scan failed:", err);
        scanned = [];
      }
      if (scanned.length === 0) {
        setPhase("empty");
        return;
      }
      setScanTotal(scanned.length);

      const detected: ImportItem[] = [];
      let i = 0;
      const step = () => {
        if (i >= scanned.length) {
          setItems(detected);
          const t = window.setTimeout(() => {
            setPhase(detected.length ? "review" : "empty");
            if (detected.length) beep("select");
          }, 320);
          timers.current.push(t);
          return;
        }
        const d = toItem(scanned[i]);
        detected.push(d);
        setProgress(Math.round(((i + 1) / scanned.length) * 100));
        setFeed((prev) => [{ ...d, k: d.id }, ...prev].slice(0, 7));
        beep("move");
        i++;
        const t = window.setTimeout(step, 70 + Math.random() * 80);
        timers.current.push(t);
      };
      step();
    },
    [beep, toItem]
  );

  // Auto-scan paths passed from a global drag-drop.
  useEffect(() => {
    if (initialPaths && initialPaths.length) void startScan(initialPaths);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearTimers(), []);

  const browse = useCallback(async () => {
    const paths = await window.electronAPI.pickRomFiles();
    if (paths && paths.length) void startScan(paths);
  }, [startScan]);

  const onDropIdle = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const paths: string[] = [];
    for (const f of Array.from(e.dataTransfer.files)) {
      const p = window.electronAPI.getPathForFile(f);
      if (p) paths.push(p);
    }
    if (paths.length) void startScan(paths);
  };

  // ── review derived counts ───────────────────────────────────
  const counts = useMemo(() => {
    const sel = items.filter((it) => it.include);
    return {
      total: items.length,
      selected: sel.length,
      unknown: items.filter((it) => it.status === "unknown").length,
      dupes: items.filter((it) => it.status === "dupe").length,
      systems: new Set(sel.map((it) => it.system)).size,
    };
  }, [items]);

  const setItem = (id: string, patch: Partial<ImportItem>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const toggle = (id: string) => {
    beep("toggle");
    setItems((list) => list.map((it) => (it.id === id ? { ...it, include: !it.include } : it)));
  };
  const changeSys = (id: string, system: string | null) =>
    setItem(id, { system, status: system ? "ok" : "unknown", include: !!system });
  const removeItem = (id: string) => setItems((list) => list.filter((it) => it.id !== id));
  const allOn = items.length > 0 && items.every((it) => it.include);
  const toggleAll = () => {
    beep("toggle");
    setItems((list) => list.map((it) => ({ ...it, include: !allOn && it.status !== "unknown" && it.status !== "dupe" })));
  };

  const confirm = async () => {
    const sel = items.filter((it) => it.include);
    if (!sel.length || busy) return;
    beep("launch");
    setBusy(true);
    try {
      await onConfirm(sel);
      setPhase("done");
    } catch (err) {
      console.warn("[import] add failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = { idle: 0, scanning: 1, review: 1, done: 2, empty: 1 }[phase];

  return (
    <div className="ig-stage" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className={"ig-panel " + (density === "dense" ? "dense" : "")}
        onDragOver={(e) => { if (phase === "idle") { e.preventDefault(); setDrag(true); } }}
        onDragLeave={() => setDrag(false)}
        onDrop={phase === "idle" ? onDropIdle : undefined}
      >
        <div className="ig-head">
          <span className="ig-head-ico"><Icon name="download" size={20} /></span>
          <div className="ig-head-txt">
            <h1>Importar juegos</h1>
            <p>Añade ROMs y juegos desde tus archivos o carpetas.</p>
          </div>
          <div className="ig-head-step">
            {["Origen", "Escaneo", "Listo"].map((label, i) => (
              <span key={label} className={"ig-step-dot" + (i === stepIndex ? " on" : i < stepIndex ? " done" : "")} />
            ))}
          </div>
          <button className="ig-close" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={19} /></button>
        </div>

        <div className="ig-body">
          {/* ── IDLE ── */}
          {phase === "idle" && (
            <>
              <div className={"ig-dropzone" + (drag ? " drag" : "")} onClick={() => void browse()}>
                <span className="ico"><Icon name="upload" size={30} /></span>
                <h2>Arrastra o elige tus juegos</h2>
                <p>Archivos sueltos, carpetas o comprimidos — EMURA detecta el sistema de cada juego automáticamente.</p>
                <div className="ig-pick">
                  <button className="ig-pickbtn" onClick={(e) => { e.stopPropagation(); void browse(); }}>
                    <Icon name="upload" size={18} /> Examinar…
                  </button>
                </div>
              </div>

              {watch.length > 0 && (
                <>
                  <div className="ig-section-lbl">Carpetas vigiladas</div>
                  <div className="ig-watched">
                    {watch.map((w, i) => (
                      <div key={w.path} className="ig-watch">
                        <span className="ig-watch-ico"><Icon name="grid" size={17} /></span>
                        <span className="ig-watch-txt">
                          <span className="ig-watch-path">{w.path}</span>
                          <span className="ig-watch-meta">{w.count} juegos · auto-importa nuevos</span>
                        </span>
                        <button
                          className={"ig-watch-toggle" + (w.on ? " on" : "")}
                          onClick={() => { beep("toggle"); setWatch((list) => list.map((x, j) => (j === i ? { ...x, on: !x.on } : x))); }}
                        >
                          <i />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── SCANNING ── */}
          {phase === "scanning" && (
            <>
              <div className="ig-scan-head">
                <span className="ig-scan-spin">
                  <svg viewBox="0 0 50 50">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4" />
                    <circle cx="25" cy="25" r="20" fill="none" stroke="var(--accent-2)" strokeWidth="4" strokeLinecap="round" strokeDasharray="90 60" />
                  </svg>
                </span>
                <div className="ig-scan-txt"><h2>Escaneando…</h2><p>Detectando el sistema de cada juego.</p></div>
                <div className="ig-scan-count">{Math.round((progress / 100) * scanTotal)}<span> / {scanTotal}</span></div>
              </div>
              <div className="ig-progress"><i style={{ width: progress + "%" }} /></div>
              <div className="ig-progress-lbl"><span>{progress}%</span><span>{scanTotal} archivos</span></div>
              <div className="ig-feed">
                {feed.map((d) => (
                  <div key={d.k} className="ig-feed-item">
                    <span className="ig-feed-ico" style={{ background: d.system ? tintForSystem(d.system) : "var(--warn)" }}>
                      {d.system ? shortOf(sysName(d.system)) : "?"}
                    </span>
                    <span className="ig-feed-name">{d.title}</span>
                    {d.status === "unknown" ? (
                      <span className="ig-feed-flag"><Icon name="alert" size={16} /></span>
                    ) : (
                      <span className="ig-feed-sys">{d.system ? sysName(d.system) : ""}</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── REVIEW ── */}
          {phase === "review" && (
            <>
              <div className="ig-review-bar">
                <div className="ig-summary">
                  <div className="ig-sum good"><b>{counts.selected}</b><span>a importar</span></div>
                  <div className="ig-sum"><b>{counts.systems}</b><span>sistemas</span></div>
                  {counts.unknown > 0 && <div className="ig-sum warn"><b>{counts.unknown}</b><span>sin reconocer</span></div>}
                  {counts.dupes > 0 && <div className="ig-sum bad"><b>{counts.dupes}</b><span>duplicados</span></div>}
                </div>
                <div className="ig-review-tools">
                  <button className="ig-selectall" onClick={toggleAll}>{allOn ? "Quitar todo" : "Seleccionar todo"}</button>
                  <div className="ig-viewtoggle">
                    <button className={view === "list" ? "on" : ""} onClick={() => setView("list")} aria-label="Lista"><Icon name="dots" size={16} /></button>
                    <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")} aria-label="Cuadrícula"><Icon name="grid" size={15} /></button>
                  </div>
                </div>
              </div>

              {(counts.unknown > 0 || counts.dupes > 0) && (
                <div className="ig-warns">
                  {counts.unknown > 0 && (
                    <div className="ig-warn-row warn">
                      <span className="ico"><Icon name="alert" size={17} /></span>
                      <span><b>{counts.unknown} sin reconocer.</b> Asigna su sistema manualmente o se omitirán.</span>
                    </div>
                  )}
                  {counts.dupes > 0 && (
                    <div className="ig-warn-row bad">
                      <span className="ico"><Icon name="check" size={17} /></span>
                      <span><b>{counts.dupes} ya en tu biblioteca.</b> Se omiten para no duplicar.</span>
                    </div>
                  )}
                </div>
              )}

              {view === "list" ? (
                <div className="ig-items">
                  {items.map((it) => (
                    <div key={it.id} className={"ig-item" + (it.status === "unknown" ? " warn" : "") + (it.status === "dupe" ? " dupe" : "") + (!it.include ? " off" : "")}>
                      <button className={"ig-check" + (it.include ? " on" : "")} onClick={() => toggle(it.id)} disabled={it.status === "dupe"}>
                        <Icon name="check" size={14} />
                      </button>
                      <span className={"ig-item-cover" + (it.system && matchCovers ? "" : " placeholder")}>
                        {it.system && matchCovers ? <CoverFallback system={it.system} title={it.title} /> : <Icon name="image" size={16} />}
                      </span>
                      <div className="ig-item-main">
                        <div className="ig-item-title">{it.title}</div>
                        <div className="ig-item-sub">
                          <span className="ig-item-file">{it.file}</span>
                          <span>· {fmtSize(it.size)}</span>
                          {it.status === "dupe" && <span className="ig-badge dupe"><Icon name="check" size={11} /> En biblioteca</span>}
                          {it.status === "ok" && matchCovers && <span className="ig-badge cover"><Icon name="image" size={11} /> Carátula</span>}
                          {it.status === "unknown" && (
                            <span className="ig-badge" style={{ background: "color-mix(in oklab, var(--warn) 16%, transparent)", color: "var(--warn)" }}>
                              <Icon name="alert" size={11} /> Revisar
                            </span>
                          )}
                        </div>
                      </div>
                      <SysSelect value={it.system} families={families} onChange={(sys) => changeSys(it.id, sys)} />
                      <button className="ig-item-del" onClick={() => removeItem(it.id)} aria-label="Quitar"><Icon name="trash" size={16} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ig-grid">
                  {items.map((it) => (
                    <div key={it.id} className={"ig-gcard" + (it.status === "unknown" ? " warn" : "") + (it.status === "dupe" ? " dupe" : "") + (!it.include ? " off" : "")}>
                      <div className={"ig-gcard-cover" + (!(it.system && matchCovers) ? " placeholder" : "")}>
                        {it.system && matchCovers ? <CoverFallback system={it.system} title={it.title} /> : <Icon name="image" size={22} />}
                        <button className={"ig-gcard-check" + (it.include ? " on" : "")} onClick={() => toggle(it.id)}><Icon name="check" size={14} /></button>
                        {it.status === "unknown" && <span className="ig-gcard-flag"><Icon name="alert" size={14} /></span>}
                      </div>
                      <div className="ig-gcard-body">
                        <div className="ig-gcard-title">{it.title}</div>
                        <div className="ig-gcard-sys">{it.system ? sysName(it.system) : "Sin reconocer"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── DONE ── */}
          {phase === "done" && (
            <div className="ig-state done">
              <span className="ico"><Icon name="check" size={38} /></span>
              <h2>¡Listo!</h2>
              <div className="ig-done-stats">
                <div className="s"><b>{counts.selected}</b><span>juegos añadidos</span></div>
                <div className="s"><b>{counts.systems}</b><span>sistemas</span></div>
              </div>
              <p>Tus juegos ya están en la biblioteca. Las carátulas se pueden ajustar en la Galería de portadas.</p>
            </div>
          )}

          {/* ── EMPTY ── */}
          {phase === "empty" && (
            <div className="ig-state empty">
              <span className="ico"><Icon name="search" size={34} /></span>
              <h2>No se encontró nada</h2>
              <p>No reconocimos juegos en lo que soltaste. Prueba con archivos de ROM, una carpeta o un comprimido.</p>
              <button className="ig-btn ghost" onClick={() => setPhase("idle")}><Icon name="back" size={17} /> Volver a intentar</button>
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        {phase === "review" && (
          <div className="ig-foot">
            <span className="ig-foot-info"><b>{counts.selected}</b> de {counts.total} seleccionados · {counts.systems} sistemas</span>
            <div className="ig-foot-actions">
              <button className="ig-btn ghost" onClick={() => setPhase("idle")} disabled={busy}>Cancelar</button>
              <button className="ig-btn primary" disabled={counts.selected === 0 || busy} onClick={() => void confirm()}>
                <Icon name="download" size={18} /> {busy ? "Importando…" : `Importar ${counts.selected} juego${counts.selected === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}
        {phase === "done" && (
          <div className="ig-foot">
            <div className="ig-foot-actions" style={{ marginLeft: "auto" }}>
              <button className="ig-btn ghost" onClick={() => { setItems([]); setFeed([]); setPhase("idle"); }}>
                <Icon name="download" size={17} /> Importar más
              </button>
              <button className="ig-btn primary" onClick={onClose}>
                <Icon name="check" size={18} /> Ir a la biblioteca
              </button>
            </div>
          </div>
        )}

        {/* hidden input (multi-file fallback; the native picker is primary) */}
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const paths: string[] = [];
            for (const f of Array.from(e.target.files ?? [])) {
              const p = window.electronAPI.getPathForFile(f);
              if (p) paths.push(p);
            }
            if (paths.length) void startScan(paths);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
