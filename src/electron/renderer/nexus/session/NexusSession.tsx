/**
 * NexusSession — NEXUS in-game session screen with the "guide" pause menu.
 * Replaces GameModeView while a game runs in the NEXUS theme. Visual design
 * ported from the handoff (session.css / Sesión en Curso.html, proposal "pausa").
 *
 * Real integration: the emulator runs EMBEDDED (native Win32 child window)
 * positioned via setGameAreaBounds. There is no HTML frame-grab, so the "live"
 * feed IS the real emulator window — full-screen while playing, and resized to
 * the on-screen LIVE box while the pause menu is open. The blurred full-bleed
 * background while paused is the game's cover (the native window can't be
 * CSS-blurred). Per the README the base state is VISIBLE (no opacity gating);
 * only transforms animate the pause overlay in.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../context/AppContext";
import { systemTint } from "../nexusPlatforms";
import { hexToHue, glyphForSystem } from "../launch/NexusLaunchSequence";
import { NexusLaunchGlyph } from "../launch/NexusLaunchGlyph";
import {
  PlayIcon,
  DownloadIcon,
  CameraIcon,
  TrophyIcon,
  DotsIcon,
  CloseIcon,
  CheckIcon,
} from "../NexusIcons";
import "./nexus-session.css";

function metaKey(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i > 0 ? fileName.substring(0, i) : fileName;
}
function fmtTimer(sec: number) {
  const p = (n: number) => String(n).padStart(2, "0");
  return { h: p(Math.floor(sec / 3600)), m: p(Math.floor((sec % 3600) / 60)), s: p(sec % 60) };
}

type ToastIcon = "check" | "camera" | "trophy";

export function NexusSession() {
  const app = useApp();
  const game = app.currentGame; // GameSessionEvent | null
  const [paused, setPaused] = useState(false);
  const [sec, setSec] = useState(0);
  const [toast, setToast] = useState<{ icon: ToastIcon; text: string; k: number } | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [ach, setAch] = useState<{ u: number; t: number } | null>(null);

  const fullRef = useRef<HTMLDivElement>(null); // full-screen game area (playing)
  const boxRef = useRef<HTMLDivElement>(null); // LIVE box (paused)
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const systemId = game?.rom.systemId ?? "";
  const fileName = game?.rom.fileName ?? "";
  const meta = game ? app.getMetadataForRom(systemId, fileName) : null;
  const title = meta?.title?.trim() || (fileName ? metaKey(fileName) : "Juego");
  const systemName = game?.rom.systemName ?? "";
  const tint = systemTint(systemId, app.config?.customSystemColors);
  const hue = hexToHue(tint);
  const glyph = glyphForSystem(systemId);

  // ── Live session timer (from the real session start) ──────────────────
  useEffect(() => {
    if (!game) return;
    const startedAt = game.sessionStartedAt ?? Date.now();
    const tick = () => setSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [game?.sessionStartedAt, game]);

  // Cover for the blurred background + summary shot.
  useEffect(() => {
    let cancelled = false;
    setCoverUrl(null);
    if (meta?.coverPath) {
      window.electronAPI
        .readCoverDataUrl(meta.coverPath)
        .then((u) => !cancelled && setCoverUrl(u ?? null))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [meta?.coverPath]);

  // Achievement count (best-effort; RA may be off).
  useEffect(() => {
    let cancelled = false;
    if (!game) return;
    app
      .getAchievementsForRom(game.rom)
      .then((res) => {
        if (cancelled) return;
        if (res.status === "ok") setAch({ u: res.progress.numAwarded, t: res.progress.numAchievements });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.rom.systemId, game?.rom.fileName]);

  // ── Position the embedded emulator: full-screen while playing, in the LIVE
  // box while paused. ───────────────────────────────────────────────────
  const sendBounds = useCallback(() => {
    const el = pausedRef.current ? boxRef.current : fullRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    void window.electronAPI.setGameAreaBounds({
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    });
  }, []);

  useEffect(() => {
    sendBounds();
    const ro = new ResizeObserver(() => sendBounds());
    if (fullRef.current) ro.observe(fullRef.current);
    if (boxRef.current) ro.observe(boxRef.current);
    window.addEventListener("resize", sendBounds);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sendBounds);
    };
  }, [sendBounds, paused]);

  // Esc / M (when NEXUS has focus) and F10 (global, even from inside the game,
  // bridged from main) toggle the guide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key.toLowerCase() === "m") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    window.electronAPI.onNexusTogglePause(() => setPaused((p) => !p));
    return () => {
      window.removeEventListener("keydown", onKey);
      window.electronAPI.removeNexusTogglePauseListener();
    };
  }, []);

  const fireToast = (icon: ToastIcon, text: string) => setToast({ icon, text, k: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const exitGame = useCallback(() => void app.stopGame(), [app]);

  const t = fmtTimer(sec);

  const MENU = useMemo(
    () => [
      { id: "resume", icon: <PlayIcon size={19} />, title: "Reanudar", sub: "Volver a la partida", key: "Esc", primary: true, act: () => setPaused(false) },
      { id: "save", icon: <DownloadIcon size={19} />, title: "Guardar estado rápido", sub: "Slot 1 · sobrescribir", key: "Y", act: () => fireToast("check", "Estado guardado en el Slot 1") },
      { id: "shot", icon: <CameraIcon size={19} />, title: "Captura de pantalla", sub: "Guardar en tu galería", key: "X", act: () => fireToast("camera", "Captura guardada en tu galería") },
      { id: "ach", icon: <TrophyIcon size={19} />, title: "Logros", sub: ach ? `${ach.u}/${ach.t} desbloqueados` : "RetroAchievements", key: "", act: () => fireToast("trophy", "Abriendo logros…") },
      { id: "cfg", icon: <DotsIcon size={19} />, title: "Opciones del juego", sub: "Vídeo · mando · core", key: "", act: () => fireToast("check", "Abriendo opciones…") },
      { id: "exit", icon: <CloseIcon size={19} />, title: "Salir del juego", sub: "Cierra el emulador", key: "B", danger: true, act: exitGame },
    ],
    [ach, exitGame]
  );

  if (!game) return null;

  return (
    <div
      className={`nx-session${paused ? " paused" : ""}`}
      style={{ ["--tint" as string]: tint, ["--hue" as string]: hue }}
    >
      {/* full-bleed running game — the embedded emulator covers fullRef while
          playing; when paused it moves to the box and this shows the blurred
          cover instead. */}
      <div className="seP-live" ref={fullRef}>
        {coverUrl && <img className="seP-live-cover" src={coverUrl} alt="" />}
      </div>

      {!paused && (
        <>
          <div className="seP-hint">
            <button className="seP-menubtn" onClick={() => setPaused(true)}>
              <DotsIcon size={16} /> Menú <kbd>Esc</kbd>
            </button>
          </div>
          <div className="seP-hud">
            <span className="se-live">
              <span className="dot" /> En curso
            </span>
            <span className="se-timer">
              {t.h}
              <span className="u">:</span>
              {t.m}
              <span className="u">:</span>
              {t.s}
            </span>
          </div>
        </>
      )}

      {paused && (
        <div className="seP-overlay">
          <div className="seP-bar">
            <span className="seP-bar-glyph">
              <NexusLaunchGlyph glyph={glyph} />
            </span>
            <span className="seP-bar-txt">
              <span className="seP-bar-kicker">Menú de pausa</span>
              <span className="seP-bar-title">{title}</span>
            </span>
          </div>

          <div className="seP-main">
            {/* LIVE box — the real emulator window is positioned over boxRef. */}
            <div className="seP-frame">
              <div className="seP-frame-live" ref={boxRef} />
              <div className="seP-frame-ring" />
              <div className="seP-live-tag">
                <span className="dot" /> En vivo
              </div>
              <div className="seP-frame-foot">
                <div className="seP-frame-meta">
                  <span className="seP-frame-game">{title}</span>
                  <span className="seP-frame-sys">
                    <span className="nx-mini-glyph" style={{ width: 13, height: 13 }}>
                      <NexusLaunchGlyph glyph={glyph} />
                    </span>{" "}
                    {systemName}
                  </span>
                </div>
                <div className="seP-frame-timer">
                  <span className="se-timer">
                    {t.h}
                    <span className="u">:</span>
                    {t.m}
                    <span className="u">:</span>
                    {t.s}
                  </span>
                  <span className="seP-frame-sub">Sesión</span>
                </div>
              </div>
            </div>

            <div className="seP-menu">
              {MENU.map((m) => (
                <button
                  key={m.id}
                  className={`seP-item${m.primary ? " primary" : ""}${m.danger ? " danger" : ""}`}
                  onClick={m.act}
                >
                  <span className="seP-item-ico">{m.icon}</span>
                  <span className="seP-item-txt">
                    <b>{m.title}</b>
                    <span>{m.sub}</span>
                  </span>
                  {m.key && <span className="seP-item-key">{m.key}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="seP-footer">
            <span className="seP-foot-hint">
              <kbd>Esc</kbd> Reanudar
            </span>
            <span className="seP-foot-hint">
              <kbd>↑</kbd>
              <kbd>↓</kbd> Navegar
            </span>
            <span className="seP-foot-hint">
              <kbd>A</kbd> Seleccionar
            </span>
          </div>
        </div>
      )}

      {toast && (
        <div className="seP-toast" key={toast.k}>
          <span className="seP-toast-ico">
            {toast.icon === "camera" ? <CameraIcon size={15} /> : toast.icon === "trophy" ? <TrophyIcon size={15} /> : <CheckIcon size={15} />}
          </span>
          {toast.text}
        </div>
      )}
    </div>
  );
}
