// sound-engine.jsx — subtle WebAudio navigation blips. Exposes window.useSound().
// Lazily creates an AudioContext on first use (autoplay policy friendly).

(function () {
  let ctx = null;
  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // tone: {f, f2?, dur, type, gain, slideTo?}
  function blip({ f = 660, dur = 0.06, type = "sine", gain = 0.05, slideTo = null }) {
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

  const SOUNDS = {
    move:    () => blip({ f: 520, dur: 0.045, type: "triangle", gain: 0.035 }),
    select:  () => { blip({ f: 480, slideTo: 760, dur: 0.10, type: "sine", gain: 0.06 }); },
    open:    () => { blip({ f: 380, slideTo: 620, dur: 0.13, type: "sine", gain: 0.055 });
                     setTimeout(() => blip({ f: 720, dur: 0.07, type: "triangle", gain: 0.03 }), 60); },
    back:    () => blip({ f: 540, slideTo: 320, dur: 0.10, type: "sine", gain: 0.045 }),
    switch:  () => { blip({ f: 300, slideTo: 540, dur: 0.09, type: "sawtooth", gain: 0.03 }); },
    launch:  () => { blip({ f: 320, slideTo: 880, dur: 0.22, type: "sine", gain: 0.07 });
                     setTimeout(() => blip({ f: 880, slideTo: 1320, dur: 0.16, type: "triangle", gain: 0.04 }), 120); },
    toggle:  () => blip({ f: 640, dur: 0.05, type: "square", gain: 0.025 }),
  };

  // Hook: returns a play(name) fn that respects the enabled flag.
  function useSound(enabled) {
    const ref = React.useRef(enabled);
    ref.current = enabled;
    return React.useCallback((name) => {
      if (!ref.current) return;
      const fn = SOUNDS[name];
      if (fn) try { fn(); } catch (e) {}
    }, []);
  }

  window.useSound = useSound;
})();
