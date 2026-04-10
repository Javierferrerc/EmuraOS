import { useEffect, useRef, useCallback } from "react";
import navigateSound from "../assets/sounds/navigate.wav";
import selectSound from "../assets/sounds/select.wav";

// ── Tuning ──────────────────────────────────────────
const BASE_NAV_VOLUME = 0.3;
const NAV_FADE_OUT_MS = 120; // fade-out when a new navigate interrupts
const BASE_SELECT_VOLUME = 0.4;

// Virtual keyboard click feedback. Reuses the navigate sample so the
// keyboard feels consistent with the rest of the app's audio, applying
// playback-rate and volume variations so different interactions still
// feel distinct.
const KB_NAV_RATIO = 0.22 / 0.3; // relative to nav volume
const KB_NAV_RATE = 1.15; // slightly brighter tick while moving cursor
const KB_PRESS_RATIO = 0.35 / 0.3;
const KB_PRESS_RATE = 1.0; // base click for char/space/backspace
const KB_SHIFT_RATE = 1.2; // higher pitch for modifier toggles
const KB_CONFIRM_RATE = 0.85; // deeper thunk for the Done key
// ────────────────────────────────────────────────────

async function loadAudioBuffer(
  ctx: AudioContext,
  url: string
): Promise<AudioBuffer> {
  const res = await fetch(url);
  const arrayBuf = await res.arrayBuffer();
  return ctx.decodeAudioData(arrayBuf);
}

function fadeOutAndStop(
  gain: GainNode,
  source: AudioBufferSourceNode,
  fadeMs: number
) {
  const now = gain.context.currentTime;
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
  source.stop(now + fadeMs / 1000);
}

export type KeyboardSoundKind = "nav" | "press" | "shift" | "confirm";

interface NavigationSoundsOptions {
  enabled?: boolean;
  /** Volume 0–100 (from config). Default 70. */
  volume?: number;
}

export function useNavigationSounds(options?: NavigationSoundsOptions): {
  playNavigate: () => void;
  playSelect: () => void;
  playKeyboardSound: (kind: KeyboardSoundKind) => void;
} {
  const enabled = options?.enabled ?? true;
  // Convert 0–100 config value to a 0–1 multiplier
  const volumeMultiplier = (options?.volume ?? 70) / 100;

  const ctxRef = useRef<AudioContext | null>(null);
  const navBufferRef = useRef<AudioBuffer | null>(null);
  const selBufferRef = useRef<AudioBuffer | null>(null);
  const activeNavRef = useRef<{
    source: AudioBufferSourceNode;
    gain: GainNode;
  } | null>(null);

  // Keep latest values in refs so callbacks don't need to be recreated
  const enabledRef = useRef(enabled);
  const volumeRef = useRef(volumeMultiplier);
  useEffect(() => {
    enabledRef.current = enabled;
    volumeRef.current = volumeMultiplier;
  }, [enabled, volumeMultiplier]);

  useEffect(() => {
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    loadAudioBuffer(ctx, navigateSound).then((b) => (navBufferRef.current = b));
    loadAudioBuffer(ctx, selectSound).then((b) => (selBufferRef.current = b));
    return () => {
      ctx.close();
    };
  }, []);

  const playNavigate = useCallback(() => {
    if (!enabledRef.current) return;
    const ctx = ctxRef.current;
    const buffer = navBufferRef.current;
    if (!ctx || !buffer) return;

    // Fade out previous navigate sound instead of hard-cutting
    if (activeNavRef.current) {
      const { source, gain } = activeNavRef.current;
      fadeOutAndStop(gain, source, NAV_FADE_OUT_MS);
      activeNavRef.current = null;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = BASE_NAV_VOLUME * volumeRef.current;
    source.connect(gain).connect(ctx.destination);
    source.start();

    source.onended = () => {
      if (activeNavRef.current?.source === source) activeNavRef.current = null;
    };

    activeNavRef.current = { source, gain };
  }, []);

  const playSelect = useCallback(() => {
    if (!enabledRef.current) return;
    const ctx = ctxRef.current;
    const buffer = selBufferRef.current;
    if (!ctx || !buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = BASE_SELECT_VOLUME * volumeRef.current;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }, []);

  const playKeyboardSound = useCallback((kind: KeyboardSoundKind) => {
    if (!enabledRef.current) return;
    const ctx = ctxRef.current;
    // Reuse the navigate buffer so the virtual keyboard shares the same
    // base click sample as the rest of the app's navigation feedback.
    const buffer = navBufferRef.current;
    if (!ctx || !buffer) return;

    let ratio: number;
    let rate: number;
    switch (kind) {
      case "nav":
        ratio = KB_NAV_RATIO;
        rate = KB_NAV_RATE;
        break;
      case "shift":
        ratio = KB_PRESS_RATIO;
        rate = KB_SHIFT_RATE;
        break;
      case "confirm":
        ratio = KB_PRESS_RATIO;
        rate = KB_CONFIRM_RATE;
        break;
      case "press":
      default:
        ratio = KB_PRESS_RATIO;
        rate = KB_PRESS_RATE;
        break;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = BASE_NAV_VOLUME * ratio * volumeRef.current;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }, []);

  return { playNavigate, playSelect, playKeyboardSound };
}
