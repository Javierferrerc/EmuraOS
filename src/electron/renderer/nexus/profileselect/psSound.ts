/**
 * Subtle WebAudio navigation blips for the profile selector — ported from the
 * design's `sound-engine.jsx`. Lazily creates a single AudioContext on first
 * use (autoplay-policy friendly). `playPs(kind)` is a no-op when disabled.
 */

export type PsSoundKind =
  | "move"
  | "select"
  | "open"
  | "back"
  | "switch"
  | "launch"
  | "toggle";

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      ctx = Ctor ? new Ctor() : null;
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface Tone {
  f?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number | null;
}

function blip({ f = 660, dur = 0.06, type = "sine", gain = 0.05, slideTo = null }: Tone): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const SOUNDS: Record<PsSoundKind, () => void> = {
  move: () => blip({ f: 520, dur: 0.045, type: "triangle", gain: 0.035 }),
  select: () => blip({ f: 480, slideTo: 760, dur: 0.1, type: "sine", gain: 0.06 }),
  open: () => {
    blip({ f: 380, slideTo: 620, dur: 0.13, type: "sine", gain: 0.055 });
    setTimeout(() => blip({ f: 720, dur: 0.07, type: "triangle", gain: 0.03 }), 60);
  },
  back: () => blip({ f: 540, slideTo: 320, dur: 0.1, type: "sine", gain: 0.045 }),
  switch: () => blip({ f: 300, slideTo: 540, dur: 0.09, type: "sawtooth", gain: 0.03 }),
  launch: () => {
    blip({ f: 320, slideTo: 880, dur: 0.22, type: "sine", gain: 0.07 });
    setTimeout(() => blip({ f: 880, slideTo: 1320, dur: 0.16, type: "triangle", gain: 0.04 }), 120);
  },
  toggle: () => blip({ f: 640, dur: 0.05, type: "square", gain: 0.025 }),
};

/** Returns a play(kind) fn that respects the enabled flag. */
export function makePsSound(enabled: boolean): (kind: PsSoundKind) => void {
  return (kind: PsSoundKind) => {
    if (!enabled) return;
    try {
      SOUNDS[kind]?.();
    } catch {
      /* ignore */
    }
  };
}
