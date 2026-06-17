/**
 * bootSound — EMURA startup chime + "enter the app" whoosh, synchronized to the
 * boot timeline. WebAudio generated live (no files). Ported 1:1 from the handoff
 * `boot-sound.jsx` (source of truth). Exposes `playBoot(opts)` and
 * `playEnter(opts)` as module functions (the handoff used window globals).
 */

export interface PlayBootOpts {
  duration?: number;
  intensity?: number;
  enabled?: boolean;
}

export interface PlayEnterOpts {
  intensity?: number;
  enabled?: boolean;
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

export function playBoot(opts?: PlayBootOpts): void {
  const o = opts || {};
  if (!o.enabled) return;
  const c = ac();
  if (!c) return;
  const D = o.duration || 4.2;
  const I = Math.max(0.4, Math.min(1.5, o.intensity || 1));
  const t0 = c.currentTime + 0.04;
  const master = c.createGain();
  master.gain.value = 0.9 * Math.min(1.15, I);
  master.connect(c.destination);

  // phase anchors
  const tSwell = t0 + 0.06 * D;
  const tForm = t0 + 0.3 * D;
  const tPower = t0 + 0.56 * D; // logo "snaps" / ring burst
  const tTail = t0 + 0.7 * D;

  // ── deep sub swell ──
  const sub = c.createOscillator();
  const subG = c.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(46, tSwell);
  sub.frequency.exponentialRampToValueAtTime(82, tPower);
  subG.gain.setValueAtTime(0.0001, tSwell);
  subG.gain.exponentialRampToValueAtTime(0.5 * I, tPower - 0.05);
  subG.gain.exponentialRampToValueAtTime(0.0001, tPower + 0.5);
  sub.connect(subG).connect(master);
  sub.start(tSwell);
  sub.stop(tPower + 0.6);

  // ── rising shimmer (filtered noise) during formation ──
  const ns = c.createBufferSource();
  ns.buffer = noise(c);
  ns.loop = true;
  const nf = c.createBiquadFilter();
  nf.type = "bandpass";
  nf.Q.value = 0.9;
  nf.frequency.setValueAtTime(300, tForm);
  nf.frequency.exponentialRampToValueAtTime(5200, tPower);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, tForm);
  ng.gain.exponentialRampToValueAtTime(0.12 * I, tPower - 0.06);
  ng.gain.exponentialRampToValueAtTime(0.0001, tPower + 0.18);
  ns.connect(nf).connect(ng).connect(master);
  ns.start(tForm);
  ns.stop(tPower + 0.3);

  // ── POWER-ON bright triad (EMURA chord: root + 5th + octave-ish) ──
  const freqs = [392, 587.3, 784, 1046.5]; // G4 D5 G5 C6
  freqs.forEach((f, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = i < 2 ? "triangle" : "sine";
    osc.frequency.setValueAtTime(f, tPower);
    const peak = (i === 0 ? 0.16 : i === 1 ? 0.12 : 0.09) * I;
    const st = tPower + i * 0.035;
    g.gain.setValueAtTime(0.0001, st);
    g.gain.exponentialRampToValueAtTime(peak, st + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 1.1);
    osc.connect(g).connect(master);
    osc.start(st);
    osc.stop(st + 1.2);
  });

  // ── impact noise burst at power-on ──
  const bn = c.createBufferSource();
  bn.buffer = noise(c);
  const bnf = c.createBiquadFilter();
  bnf.type = "lowpass";
  bnf.frequency.value = 3200;
  const bng = c.createGain();
  bng.gain.setValueAtTime(0.26 * I, tPower);
  bng.gain.exponentialRampToValueAtTime(0.0001, tPower + 0.3);
  bn.connect(bnf).connect(bng).connect(master);
  bn.start(tPower);
  bn.stop(tPower + 0.4);

  // ── soft high tail (sparkle) ──
  const sp = c.createOscillator();
  const spG = c.createGain();
  sp.type = "sine";
  sp.frequency.setValueAtTime(1568, tTail);
  sp.frequency.exponentialRampToValueAtTime(2093, tTail + 0.4);
  spG.gain.setValueAtTime(0.0001, tTail);
  spG.gain.exponentialRampToValueAtTime(0.05 * I, tTail + 0.08);
  spG.gain.exponentialRampToValueAtTime(0.0001, t0 + D);
  sp.connect(spG).connect(master);
  sp.start(tTail);
  sp.stop(t0 + D + 0.2);
}

/** quick "enter the app" whoosh + bright pop */
export function playEnter(opts?: PlayEnterOpts): void {
  const o = opts || {};
  if (!o.enabled) return;
  const c = ac();
  if (!c) return;
  const I = Math.max(0.4, Math.min(1.5, o.intensity || 1));
  const t0 = c.currentTime + 0.01;
  const master = c.createGain();
  master.gain.value = 0.9 * Math.min(1.15, I);
  master.connect(c.destination);

  // rising whoosh
  const ns = c.createBufferSource();
  ns.buffer = noise(c);
  ns.loop = true;
  const nf = c.createBiquadFilter();
  nf.type = "bandpass";
  nf.Q.value = 0.9;
  nf.frequency.setValueAtTime(400, t0);
  nf.frequency.exponentialRampToValueAtTime(6000, t0 + 0.45);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.16 * I, t0 + 0.4);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.62);
  ns.connect(nf).connect(ng).connect(master);
  ns.start(t0);
  ns.stop(t0 + 0.7);

  // bright pop
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(523, t0 + 0.38);
  osc.frequency.exponentialRampToValueAtTime(1046, t0 + 0.5);
  g.gain.setValueAtTime(0.0001, t0 + 0.38);
  g.gain.exponentialRampToValueAtTime(0.16 * I, t0 + 0.42);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
  osc.connect(g).connect(master);
  osc.start(t0 + 0.38);
  osc.stop(t0 + 0.85);

  // sub thump
  const sub = c.createOscillator();
  const sg = c.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(120, t0 + 0.4);
  sub.frequency.exponentialRampToValueAtTime(48, t0 + 0.7);
  sg.gain.setValueAtTime(0.0001, t0 + 0.4);
  sg.gain.exponentialRampToValueAtTime(0.4 * I, t0 + 0.44);
  sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.78);
  sub.connect(sg).connect(master);
  sub.start(t0 + 0.4);
  sub.stop(t0 + 0.85);
}
