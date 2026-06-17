/**
 * BootGamer — EMURA "gamer" boot screen (console power-on). Full-screen overlay
 * shown once at app startup. Pixel-faithful TS/React port of the handoff
 * `boot-gamer.jsx` (source of truth) with the delivered defaults: solid button,
 * warp enter transition, centered emura-mark logo, "EMURA" title in Space
 * Grotesk, no tagline, no retro filter.
 *
 * Phases (data-phase on .bg): ignite → build → slam → charge → start → ready.
 * Robustness preserved from the handoff: phase changes use setTimeout (not just
 * rAF) and the final title/button use stateful transitions, so the sequence
 * always reaches "ready" even if the tab loses focus. Pressing Empezar (or
 * A/Enter/click) plays the warp exit (~880ms) then calls onEnter().
 *
 * Demo-only bits (Repetir button, "entered" stub, Tweaks panel) are omitted in
 * production per the handoff README.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayIcon } from "../nexus/NexusIcons";
import { playBoot, playEnter } from "./bootSound";
import emuraMark from "../assets/emura-mark.png";
import "./boot-gamer.css";

type Phase = "ignite" | "build" | "slam" | "charge" | "start" | "ready";
type StartStyle = "solid" | "neon" | "arcade" | "gamepad" | "glass";
type EnterStyle = "warp" | "sweep" | "iris" | "glitch";

const BG_PHASES: { id: Phase; end: number }[] = [
  { id: "ignite", end: 0.12 },
  { id: "build", end: 0.4 },
  { id: "slam", end: 0.52 },
  { id: "charge", end: 0.8 },
  { id: "start", end: 0.92 },
  { id: "ready", end: 1.0 },
];
const BOOT_LINES = [
  "INICIANDO NÚCLEO EMURA",
  "MONTANDO SISTEMAS · 16",
  "CARGANDO BIBLIOTECA",
  "VERIFICANDO MANDOS",
  "SINCRONIZANDO PERFIL",
  "ENCENDIDO COMPLETO",
];
const LINE_COLORS = ["var(--brand-2)", "var(--cyan)", "var(--mag)", "var(--hot)"];

function bgField<T>(n: number, fn: (i: number, n: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => fn(i, n));
}

// ── Start button proposals (default: solid) ──────────────────
function StartButton({ style, onClick }: { style: StartStyle; onClick: () => void }) {
  if (style === "arcade") {
    return (
      <button className="st st-arcade" onClick={onClick}>
        <span className="st-arcade-txt">PRESS START</span>
        <span className="st-arcade-caret">▸</span>
      </button>
    );
  }
  if (style === "solid") {
    return (
      <button className="st st-solid" onClick={onClick}>
        <PlayIcon size={18} /> Empezar
        <span className="st-solid-shine" />
      </button>
    );
  }
  if (style === "gamepad") {
    return (
      <button className="st st-pad" onClick={onClick}>
        <span className="st-pad-btn">A</span>
        <span className="st-pad-label">Pulsa para entrar</span>
      </button>
    );
  }
  if (style === "glass") {
    return (
      <button className="st st-glass" onClick={onClick}>
        <kbd>A</kbd> Press Start
      </button>
    );
  }
  // neon — animated traveling border
  return (
    <button className="st st-neon" onClick={onClick}>
      <span className="st-neon-border" />
      <span className="st-neon-inner">
        <kbd>A</kbd> Press Start
      </span>
    </button>
  );
}

interface BootGamerProps {
  duration?: number;
  intensity?: number;
  sound?: boolean;
  logoSrc?: string;
  version?: string;
  startStyle?: StartStyle;
  enterStyle?: EnterStyle;
  onEnter?: () => void;
}

export function BootGamer({
  duration = 4.6,
  intensity = 1,
  sound = true,
  logoSrc = emuraMark,
  version = "v3.0",
  startStyle = "solid",
  enterStyle = "warp",
  onEnter,
}: BootGamerProps) {
  const [phase, setPhase] = useState<Phase>("ignite");
  const [ready, setReady] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [bootIdx, setBootIdx] = useState(0);
  const [pct, setPct] = useState(0);
  const barRef = useRef<HTMLElement | null>(null);

  const RING_C = 2 * Math.PI * 92;

  const lines = useMemo(
    () =>
      bgField(Math.round(34 * intensity), (i, n) => ({
        a: (360 / n) * i + (i % 5) * 4,
        d: ((i * 17) % 60) / 100,
        lc: LINE_COLORS[i % LINE_COLORS.length],
      })),
    [intensity]
  );
  const shocks = [
    { sd: 0, lc: "var(--cyan)" },
    { sd: 0.08, lc: "var(--brand-2)" },
    { sd: 0.16, lc: "var(--mag)" },
  ];

  useEffect(() => {
    const Dms = duration * 1000;
    const start = performance.now();
    if (sound) playBoot({ duration, intensity, enabled: true });

    const timers: ReturnType<typeof setTimeout>[] = [];
    BG_PHASES.forEach((p, idx) => {
      if (idx === 0) return;
      timers.push(setTimeout(() => setPhase(p.id), Dms * BG_PHASES[idx - 1].end));
    });
    timers.push(setTimeout(() => setReady(true), Dms));

    // boot-line ticker through the build/charge phases
    const lineTimers = BOOT_LINES.map((_, i) =>
      setTimeout(() => setBootIdx(i), (0.06 + i * 0.13) * Dms)
    );

    const writeBar = () => {
      const t = Math.min(1, (performance.now() - start) / Dms);
      const lt = Math.max(0, Math.min(1, t / 0.8));
      const p = Math.round((1 - Math.pow(1 - lt, 2)) * 100);
      setPct(p);
      if (barRef.current) barRef.current.style.width = p + "%";
    };
    const interval = setInterval(writeBar, 50);
    let raf = requestAnimationFrame(function tick() {
      writeBar();
      if (performance.now() - start < Dms) raf = requestAnimationFrame(tick);
    });

    return () => {
      timers.forEach(clearTimeout);
      lineTimers.forEach(clearTimeout);
      clearInterval(interval);
      cancelAnimationFrame(raf);
    };
  }, [duration, intensity, sound]);

  const enter = useCallback(() => {
    if (!ready || exiting) return;
    if (sound) playEnter({ enabled: true, intensity });
    setExiting(true);
    setTimeout(() => onEnter?.(), 880);
  }, [ready, exiting, onEnter, sound, intensity]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && ready) {
        e.preventDefault();
        enter();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, enter]);

  return (
    <div
      className={"bg" + (exiting ? " exit exit-" + enterStyle : "")}
      data-phase={phase}
      style={{ "--dur": duration + "s", "--intensity": intensity } as React.CSSProperties}
      onClick={ready ? enter : undefined}
    >
      <div className="bg-screen">
        <div className="bg-wash" />
        <div className="bg-hex" />

        <div className="bg-speed">
          {lines.map((l, i) => (
            <span
              key={i}
              className="bg-line"
              style={
                { "--a": l.a + "deg", "--d": l.d + "s", "--lc": l.lc } as React.CSSProperties
              }
            />
          ))}
        </div>

        <div className="bg-flash" />
        {shocks.map((s, i) => (
          <span
            key={i}
            className="bg-shock"
            style={{ "--sd": s.sd + "s", "--lc": s.lc } as React.CSSProperties}
          />
        ))}

        <div className="bg-core">
          <svg className="bg-ring" viewBox="0 0 200 200">
            <circle className="bg-ring-trk" cx="100" cy="100" r="92" strokeWidth="3" />
            <circle
              className="bg-ring-bar"
              cx="100"
              cy="100"
              r="92"
              strokeWidth="4"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - pct / 100)}
            />
          </svg>
          <div className="bg-logo-wrap">
            <div className="bg-logo-ghost r">
              <img src={logoSrc} alt="" />
            </div>
            <div className="bg-logo-ghost b">
              <img src={logoSrc} alt="" />
            </div>
            <img className="bg-logo" src={logoSrc} alt="EMURA" draggable={false} />
            <div className="bg-sheen" />
          </div>
          <div className="bg-title">EMURA</div>
        </div>

        <div className="bg-ticker">
          <div className="bg-bar">
            <i ref={barRef as React.RefObject<HTMLElement>} />
            <span className="bg-bar-glow" />
          </div>
          <div className="bg-boot-line">
            <b>›</b> {BOOT_LINES[bootIdx]} <span className="bg-pct">· {pct}%</span>
          </div>
        </div>

        <div className="bg-start">
          <StartButton style={startStyle} onClick={enter} />
        </div>

        <span className="bg-corner tl" />
        <span className="bg-corner tr" />
        <span className="bg-corner bl" />
        <span className="bg-corner br" />
        <span className="bg-ver">EMURA OS · {version}</span>

        {/* exit / enter-the-app transition layers */}
        <div className="bg-iris" />
        <div className="bg-wipe" />
        <div className="bg-exit-flash" />
      </div>
    </div>
  );
}
