import { useEffect, useRef, useCallback } from "react";
import navigateSound from "../assets/sounds/navigate.wav";
import selectSound from "../assets/sounds/select.wav";

// ── Tuning ──────────────────────────────────────────
const NAV_VOLUME = 0.3;
const NAV_FADE_OUT_MS = 120; // fade-out when a new navigate interrupts
const SELECT_VOLUME = 0.4;
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

export function useNavigationSounds(): {
  playNavigate: () => void;
  playSelect: () => void;
} {
  const ctxRef = useRef<AudioContext | null>(null);
  const navBufferRef = useRef<AudioBuffer | null>(null);
  const selBufferRef = useRef<AudioBuffer | null>(null);
  const activeNavRef = useRef<{
    source: AudioBufferSourceNode;
    gain: GainNode;
  } | null>(null);

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
    gain.gain.value = NAV_VOLUME;
    source.connect(gain).connect(ctx.destination);
    source.start();

    source.onended = () => {
      if (activeNavRef.current?.source === source) activeNavRef.current = null;
    };

    activeNavRef.current = { source, gain };
  }, []);

  const playSelect = useCallback(() => {
    const ctx = ctxRef.current;
    const buffer = selBufferRef.current;
    if (!ctx || !buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = SELECT_VOLUME;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }, []);

  return { playNavigate, playSelect };
}
