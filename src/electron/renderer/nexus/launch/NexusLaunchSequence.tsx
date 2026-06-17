/**
 * NexusLaunchSequence — the "Ignición" full-screen launch animation, played
 * every time a game is launched in NEXUS. Ported 1:1 from the handoff
 * (launch-anim.jsx / launch-anim.css). Colors come from the launching game's
 * console (its tint → hue), so each console ignites in its own color. Portaled
 * to <body> so it covers the whole window; self-contained CSS tokens.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NexusGame } from "../nexusModel";
import { NexusCover } from "../NexusCover";
import { NexusLaunchGlyph, type GlyphShape } from "./NexusLaunchGlyph";
import { playLaunch } from "./nexusLaunchSound";
import "./nexus-launch-anim.css";

const PHASES = [
  { id: "intro", end: 0.12 },
  { id: "charge", end: 0.66 },
  { id: "climax", end: 0.8 },
  { id: "entry", end: 1.0 },
] as const;
const STATUS: Record<string, string> = { intro: "Preparando", charge: "Cargando", climax: "¡Encendido!", entry: "" };
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
function field<T>(n: number, fn: (i: number, n: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => fn(i, n));
}

/** Hue (0..360) from a #rrggbb color — used so the animation matches the
 *  console's existing tint color. */
export function hexToHue(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 224;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 224;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  return (h + 360) % 360;
}

/** Manufacturer → glyph shape (Nintendo circle, Sony hex, Sega tri, MS/Atari
 *  square). Inferred from the systemId so the glyph reads as the platform. */
const GLYPH_BY_SYSTEM: Record<string, GlyphShape> = {
  nes: "circle", snes: "circle", n64: "circle", gamecube: "circle", gc: "circle",
  wii: "circle", wiiu: "circle", switch: "circle", gb: "circle", gbc: "circle",
  gba: "circle", nds: "circle", ds: "circle", "3ds": "circle",
  psx: "hex", ps1: "hex", ps2: "hex", ps3: "hex", ps4: "hex", psp: "hex", vita: "hex",
  genesis: "tri", megadrive: "tri", mastersystem: "tri", sms: "tri", dreamcast: "tri",
  saturn: "tri", gamegear: "tri", segacd: "tri", "32x": "tri",
  xbox: "square", xbox360: "square",
  atari2600: "square", atari7800: "square", lynx: "square", jaguar: "square",
};

/** Glyph shape for a system (Nintendo circle, Sony hex, Sega tri, MS/Atari
 *  square), defaulting to circle. Shared with the session/pause screen. */
export function glyphForSystem(systemId: string): GlyphShape {
  return GLYPH_BY_SYSTEM[systemId] ?? "circle";
}

interface Family {
  hue: number;
  tint: string;
  name: string;
  glyph: GlyphShape;
}
function familyForGame(game: NexusGame): Family {
  return {
    hue: hexToHue(game.tint),
    tint: game.tint,
    name: game.systemName,
    glyph: GLYPH_BY_SYSTEM[game.systemId] ?? "circle",
  };
}

export function NexusLaunchSequence({
  game,
  soundProfile = "minimal",
  soundEnabled = true,
  duration = 4.5,
  intensity = 1,
  onDone,
}: {
  game: NexusGame;
  soundProfile?: string;
  soundEnabled?: boolean;
  duration?: number;
  intensity?: number;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<string>("intro");
  const [pct, setPct] = useState(0);
  const ringRef = useRef<SVGCircleElement>(null);
  const rafRef = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const family = useMemo(() => familyForGame(game), [game]);
  const I = intensity;
  const D = duration;
  const RING_C = 2 * Math.PI * 132;

  const particles = useMemo(
    () =>
      field(Math.round(46 * I), (i, n) => ({
        ang: (360 / n) * i + (i % 3) * 7,
        orb: 150 + ((i * 53) % 120),
        sz: 2 + ((i * 17) % 5),
        d: ((i * 13) % 40) / 100,
        far: 60 + ((i * 37) % 160),
      })),
    [I]
  );
  const streaks = useMemo(
    () => field(Math.round(26 * I), (i, n) => ({ ang: (360 / n) * i + (i % 2) * 6, d: ((i * 11) % 30) / 100 })),
    [I]
  );
  const shocks = [0, 0.08, 0.16];

  // Timeline: phases via setTimeout (reliable even when rAF is throttled);
  // percent via interval + rAF for smoothness. Always completes.
  useEffect(() => {
    const start = performance.now();
    const Dms = D * 1000;
    playLaunch({ duration: D, intensity: I, hue: family.hue, enabled: soundEnabled, profile: soundProfile });

    const timers: number[] = [];
    PHASES.forEach((p, idx) => {
      if (p.id === "intro") return;
      timers.push(window.setTimeout(() => setPhase(p.id), Dms * PHASES[idx - 1].end));
    });
    const doneTimer = window.setTimeout(() => onDoneRef.current(), Dms + 150);

    const writePct = () => {
      const t = clamp01((performance.now() - start) / Dms);
      const lt = clamp01((t - 0.12) / (0.66 - 0.12));
      const p = Math.round(easeOut(lt) * 100);
      setPct(p);
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING_C * (1 - p / 100));
      return t;
    };
    const interval = window.setInterval(writePct, 60);
    const tick = () => {
      const t = writePct();
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(doneTimer);
      clearInterval(interval);
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc skips the animation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDoneRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const stageStyle = {
    ["--hue" as string]: family.hue,
    ["--intensity" as string]: I,
    ["--dur" as string]: D + "s",
  };

  return createPortal(
    <div className="nx-launch">
      <div className="lx-stage" data-phase={phase} style={stageStyle}>
        <div className="lx-bg" />
        <div className="lx-stars" />

        <div className="lx-warp">
          {streaks.map((s, i) => (
            <span key={i} className="lx-streak" style={{ ["--ang" as string]: s.ang + "deg", ["--d" as string]: s.d + "s" }} />
          ))}
        </div>

        {shocks.map((sd, i) => (
          <span key={i} className="lx-shock" style={{ ["--sd" as string]: sd + "s" }} />
        ))}

        <div className="lx-particles">
          {particles.map((p, i) => (
            <span
              key={i}
              className="lx-particle"
              style={{
                ["--ang" as string]: p.ang + "deg",
                ["--orb" as string]: p.orb + "px",
                ["--sz" as string]: p.sz + "px",
                ["--d" as string]: p.d + "s",
                ["--far" as string]: p.far + "px",
              }}
            />
          ))}
        </div>

        <div className="lx-core">
          <div className="lx-glyph">
            <NexusLaunchGlyph glyph={family.glyph} />
          </div>
          <svg className="lx-ring" viewBox="0 0 280 280">
            <circle className="lx-ring-track" cx="140" cy="140" r="132" strokeWidth="3" />
            <circle
              ref={ringRef}
              className="lx-ring-bar"
              cx="140"
              cy="140"
              r="132"
              strokeWidth="4"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C}
            />
          </svg>
          <div className="lx-cover">
            <NexusCover game={game} rounded={16} />
            <div className="lx-cover-sheen" />
          </div>
        </div>

        <div className="lx-flash" />
        <div className="lx-game">
          <div className="lx-game-bg">
            <NexusCover game={game} rounded={0} />
          </div>
          <div className="lx-game-scrim" />
          <div className="lx-game-hud">
            <div className="lx-game-top">
              <span className="lx-mini-glyph" style={{ color: family.tint, width: 18, height: 18 }}>
                <NexusLaunchGlyph glyph={family.glyph} />
              </span>
              <span className="lx-game-brand">NEXUS · {family.name}</span>
            </div>
            <div className="lx-game-center">
              <div className="lx-game-name">{game.title}</div>
              <div className="lx-press">
                <kbd>A</kbd> Pulsa para comenzar
              </div>
            </div>
          </div>
        </div>

        <div className="lx-vignette" />

        <div className="lx-hud">
          <div className="lx-pct">
            {pct}
            <sup>%</sup>
          </div>
          <div className="lx-titles">
            <div className="lx-game-title">{game.title}</div>
            <div className="lx-game-sys">
              <span className="lx-mini-glyph" style={{ width: 14, height: 14 }}>
                <NexusLaunchGlyph glyph={family.glyph} />
              </span>{" "}
              {family.name}
            </div>
          </div>
          <div className="lx-status">{STATUS[phase]}</div>
        </div>

        <div className="lx-skip">
          <kbd>Esc</kbd> Saltar
        </div>
      </div>
    </div>,
    document.body
  );
}
