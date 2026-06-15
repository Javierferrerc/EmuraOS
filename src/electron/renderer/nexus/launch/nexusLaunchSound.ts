/**
 * nexusLaunchSound — synchronized "ignition" launch sounds with 6 selectable
 * signatures. WebAudio generated live (no files). Ported 1:1 from the handoff
 * (launch-sound.jsx, the source of truth). Exposes `playLaunch(opts)` and
 * `LAUNCH_SOUNDS`.
 */

export interface LaunchSound {
  id: string;
  name: string;
  desc: string;
}

export interface PlayLaunchOpts {
  duration?: number;
  intensity?: number;
  hue?: number;
  enabled?: boolean;
  profile?: string;
}

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === "suspended") void ctx.resume();
  return ctx;
}
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const n = c.sampleRate * 2;
  noiseBuf = c.createBuffer(1, n, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
const hueFreq = (hue: number) => 180 + ((hue % 120) / 120) * 120; // 180..300
const semi = (base: number, n: number) => base * Math.pow(2, n / 12);

// ── tiny synth helpers ──────────────────────────────────────
function osc(
  c: AudioContext,
  dest: AudioNode,
  {
    type = "sine",
    f0,
    f1,
    t,
    dur,
    peak,
    atk = 0.012,
  }: { type?: OscillatorType; f0: number; f1?: number; t: number; dur: number; peak: number; atk?: number }
) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function nz(
  c: AudioContext,
  dest: AudioNode,
  buf: AudioBuffer,
  {
    type = "bandpass",
    f0,
    f1,
    q = 1,
    t,
    dur,
    peak,
  }: { type?: BiquadFilterType; f0: number; f1?: number; q?: number; t: number; dur: number; peak: number }
) {
  const s = c.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(Math.max(20, f0), t);
  if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.06, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t);
  s.stop(t + dur + 0.05);
}
function blip(
  c: AudioContext,
  dest: AudioNode,
  { type = "square", f, t, dur = 0.09, peak = 0.12 }: { type?: OscillatorType; f: number; t: number; dur?: number; peak?: number }
) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

interface ProfileParams {
  I: number;
  hz: number;
  t0: number;
  D: number;
  tCharge: number;
  tImpact: number;
  tEntry: number;
  master: GainNode;
  buf: AudioBuffer;
}

// ── profiles ────────────────────────────────────────────────
const PROFILES: Record<string, (c: AudioContext, P: ProfileParams) => void> = {
  impact(c, P) {
    const { I, hz, t0, tCharge, tImpact, tEntry, D, master, buf } = P;
    osc(c, master, { type: "sine", f0: hz / 3, f1: hz / 3, t: t0, dur: tImpact - t0, peak: 0.05 * I, atk: tCharge - t0 });
    nz(c, master, buf, { type: "bandpass", q: 0.8, f0: 180, f1: 4200, t: tCharge, dur: tImpact - tCharge, peak: 0.16 * I });
    osc(c, master, { type: "sawtooth", f0: hz * 0.5, f1: hz * 2.2, t: tCharge, dur: tImpact - tCharge, peak: 0.07 * I });
    osc(c, master, { type: "sine", f0: 150, f1: 38, t: tImpact, dur: 0.7, peak: 0.6 * I, atk: 0.012 });
    nz(c, master, buf, { type: "lowpass", f0: 2600, f1: 2600, t: tImpact, dur: 0.32, peak: 0.35 * I });
    osc(c, master, { type: "triangle", f0: hz * 3, f1: hz * 5, t: tImpact + 0.02, dur: 0.5, peak: 0.12 * I });
    nz(c, master, buf, { type: "highpass", f0: 5000, f1: 5000, t: tEntry, dur: (1 - 0.8) * D + 0.3, peak: 0.1 * I });
  },
  cinematic(c, P) {
    const { I, hz, tCharge, tImpact, tEntry, D, master, buf } = P;
    const root = hz * 0.75;
    const chord = [1, 6 / 5, 3 / 2, 2];
    chord.forEach((r, i) =>
      osc(c, master, { type: "sine", f0: root * r * 0.97, f1: root * r, t: tCharge, dur: tImpact - tCharge, peak: (0.06 - i * 0.008) * I, atk: (tImpact - tCharge) * 0.6 })
    );
    nz(c, master, buf, { type: "bandpass", q: 1.4, f0: 300, f1: 5000, t: tImpact - 1.0, dur: 1.0, peak: 0.14 * I });
    osc(c, master, { type: "sine", f0: 96, f1: 50, t: tImpact, dur: 0.95, peak: 0.55 * I, atk: 0.01 });
    osc(c, master, { type: "sawtooth", f0: root, f1: root, t: tImpact, dur: 0.35, peak: 0.12 * I });
    osc(c, master, { type: "sawtooth", f0: root * 1.5, f1: root * 1.5, t: tImpact, dur: 0.35, peak: 0.09 * I });
    nz(c, master, buf, { type: "highpass", f0: 6000, f1: 9000, t: tImpact, dur: 0.8, peak: 0.18 * I });
    [1, 1.5, 2].forEach((r, i) =>
      osc(c, master, { type: "sine", f0: root * 2 * r, f1: root * 2 * r, t: tEntry, dur: (1 - 0.8) * D + 0.5, peak: (0.05 - i * 0.012) * I, atk: 0.25 })
    );
  },
  arcade(c, P) {
    const { I, hz, tCharge, tImpact, tEntry, master } = P;
    const base = hz * 0.5;
    const steps = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];
    const span = tImpact - tCharge;
    steps.forEach((s, i) => blip(c, master, { type: "square", f: semi(base, s), t: tCharge + span * (i / steps.length), dur: 0.1, peak: 0.08 * I }));
    for (let i = 0; i < 6; i++) blip(c, master, { type: "square", f: base / 2, t: tCharge + span * (i / 6), dur: 0.12, peak: 0.05 * I });
    [0, 4, 7, 12, 16].forEach((s, i) => blip(c, master, { type: "square", f: semi(base * 2, s), t: tImpact + i * 0.05, dur: 0.09, peak: 0.12 * I }));
    [12, 16, 19].forEach((s) => blip(c, master, { type: "square", f: semi(base * 2, s), t: tImpact + 0.28, dur: 0.22, peak: 0.07 * I }));
    blip(c, master, { type: "square", f: semi(base * 4, 0), t: tImpact + 0.02, dur: 0.06, peak: 0.1 * I });
    blip(c, master, { type: "square", f: semi(base * 4, 7), t: tImpact + 0.09, dur: 0.14, peak: 0.1 * I });
    [24, 19, 16, 12].forEach((s, i) => blip(c, master, { type: "triangle", f: semi(base * 2, s), t: tEntry + i * 0.07, dur: 0.12, peak: 0.06 * I }));
  },
  synthwave(c, P) {
    const { I, hz, tCharge, tImpact, tEntry, D, master, buf } = P;
    const det = [0.99, 1, 1.01];
    det.forEach((d) => {
      const o = c.createOscillator();
      const g = c.createGain();
      const lp = c.createBiquadFilter();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(hz * 0.5 * d, tCharge);
      o.frequency.exponentialRampToValueAtTime(hz * 1.5 * d, tImpact);
      lp.type = "lowpass";
      lp.Q.value = 6;
      lp.frequency.setValueAtTime(300, tCharge);
      lp.frequency.exponentialRampToValueAtTime(2600, tImpact);
      g.gain.setValueAtTime(0.0001, tCharge);
      g.gain.exponentialRampToValueAtTime(0.05 * I, tImpact - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, tImpact + 0.05);
      o.connect(lp).connect(g).connect(master);
      o.start(tCharge);
      o.stop(tImpact + 0.1);
    });
    nz(c, master, buf, { type: "bandpass", q: 0.7, f0: 200, f1: 3000, t: tCharge, dur: tImpact - tCharge, peak: 0.08 * I });
    [0, 0.16, 0.32].forEach((dly, i) => osc(c, master, { type: "sawtooth", f0: hz * 2, f1: hz * 0.8, t: tImpact + dly, dur: 0.2, peak: (0.18 - i * 0.06) * I }));
    osc(c, master, { type: "sine", f0: 110, f1: 44, t: tImpact, dur: 0.6, peak: 0.4 * I });
    [1, 1.5].forEach((r) => osc(c, master, { type: "sine", f0: hz * r, f1: hz * r, t: tEntry, dur: (1 - 0.8) * D + 0.4, peak: 0.04 * I, atk: 0.3 }));
    nz(c, master, buf, { type: "highpass", f0: 5500, f1: 5500, t: tEntry, dur: (1 - 0.8) * D + 0.3, peak: 0.06 * I });
  },
  electric(c, P) {
    const { I, hz, tCharge, tImpact, tEntry, master, buf } = P;
    osc(c, master, { type: "sine", f0: 420, f1: 3000, t: tCharge, dur: tImpact - tCharge, peak: 0.05 * I, atk: 0.2 });
    osc(c, master, { type: "triangle", f0: 210, f1: 1500, t: tCharge, dur: tImpact - tCharge, peak: 0.03 * I, atk: 0.2 });
    const span = tImpact - tCharge;
    for (let i = 0; i < 10; i++)
      nz(c, master, buf, { type: "highpass", f0: 4000, f1: 4000, t: tCharge + span * (0.2 + 0.8 * (i / 10)) + (i % 3) * 0.01, dur: 0.05, peak: 0.07 * I });
    nz(c, master, buf, { type: "lowpass", f0: 1800, f1: 600, t: tImpact, dur: 0.5, peak: 0.5 * I });
    osc(c, master, { type: "sine", f0: 120, f1: 35, t: tImpact, dur: 0.7, peak: 0.45 * I });
    osc(c, master, { type: "sawtooth", f0: 1200, f1: 200, t: tImpact, dur: 0.18, peak: 0.16 * I });
    for (let i = 0; i < 6; i++) nz(c, master, buf, { type: "highpass", f0: 5000, f1: 5000, t: tEntry + i * 0.06, dur: 0.05, peak: 0.05 * I });
  },
  minimal(c, P) {
    const { I, hz, tCharge, tImpact, tEntry, D, master } = P;
    osc(c, master, { type: "sine", f0: hz * 0.99, f1: hz, t: tCharge, dur: tImpact - tCharge, peak: 0.05 * I, atk: (tImpact - tCharge) * 0.7 });
    osc(c, master, { type: "sine", f0: hz / 2, f1: hz / 2, t: tCharge, dur: tImpact - tCharge, peak: 0.03 * I, atk: (tImpact - tCharge) * 0.7 });
    osc(c, master, { type: "sine", f0: hz * 2, f1: hz * 2, t: tImpact, dur: 1.3, peak: 0.2 * I, atk: 0.01 });
    osc(c, master, { type: "sine", f0: hz * 3, f1: hz * 3, t: tImpact, dur: 0.7, peak: 0.06 * I, atk: 0.01 });
    osc(c, master, { type: "sine", f0: 90, f1: 60, t: tImpact, dur: 0.4, peak: 0.18 * I });
    osc(c, master, { type: "sine", f0: hz * 4, f1: hz * 4, t: tEntry, dur: (1 - 0.8) * D + 0.4, peak: 0.04 * I, atk: 0.25 });
  },
};

export const LAUNCH_SOUNDS: LaunchSound[] = [
  { id: "impact", name: "Impacto", desc: "Whoosh + golpe grave + destello. Épico." },
  { id: "cinematic", name: "Cinemático", desc: "Acorde orquestal y timbal. Grande y heroico." },
  { id: "arcade", name: "Arcade", desc: "Arpegio chiptune y power-up retro." },
  { id: "synthwave", name: "Synthwave", desc: "Supersaw retrofuturista y zap con eco." },
  { id: "electric", name: "Sobrecarga", desc: "Zumbido eléctrico, chispazos y trueno." },
  { id: "minimal", name: "Mínimo", desc: "Suave y premium: campana cálida." },
];

export function playLaunch(opts: PlayLaunchOpts): void {
  if (!opts.enabled) return;
  const c = ac();
  if (!c) return;
  const D = opts.duration || 4.5;
  const I = Math.max(0.4, Math.min(1.6, opts.intensity || 1));
  const hz = hueFreq(opts.hue == null ? 220 : opts.hue);
  const t0 = c.currentTime + 0.02;
  const master = c.createGain();
  master.gain.value = 0.9 * Math.min(1.2, I);
  master.connect(c.destination);
  const P: ProfileParams = {
    I,
    hz,
    t0,
    D,
    tCharge: t0 + 0.12 * D,
    tImpact: t0 + 0.66 * D,
    tEntry: t0 + 0.8 * D,
    master,
    buf: noise(c),
  };
  const fn = PROFILES[opts.profile ?? ""] || PROFILES.impact;
  try {
    fn(c, P);
  } catch {
    /* ignore audio errors */
  }
}
