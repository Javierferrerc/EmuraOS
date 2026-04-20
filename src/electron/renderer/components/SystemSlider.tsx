import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SliderItem } from "../utils/sliderItems";
import "./SystemSlider.css";

interface SystemSliderProps {
  items: SliderItem[];
  activeIndex: number;
  focusedIndex: number;
  focusActive: boolean;
  onSelect: (index: number) => void;
  magnificationEnabled?: boolean;
}

// Dock-style magnification constants. Tuned to the 114px base chip so the
// growth is noticeable but the vertical footprint of the slider stays
// compact — bigger magnifications force a taller container and eat into
// the grid below.
const BASE_SIZE = 114;
const MAGNIFICATION = 140;
const INFLUENCE_DISTANCE = 280;

export function SystemSlider({
  items,
  activeIndex,
  focusedIndex,
  focusActive,
  onSelect,
  magnificationEnabled = true,
}: SystemSliderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Direct refs into each button so the rAF-throttled magnification loop
  // can write width/height straight to the DOM without going through
  // React state (same pattern as the mouse tilt in GameCard.tsx).
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  // Cursor X in client coords; null means the mouse is not over the slider.
  const mouseXRef = useRef<number | null>(null);

  // Honor the user's motion preferences — magnification is pure eye-candy,
  // so users who opted out of animations see the flat 114px chips.
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  // Keep the refs array in sync with the item list so stale refs from a
  // previous render don't leak into the magnification loop.
  useEffect(() => {
    buttonRefs.current.length = items.length;
  }, [items.length]);

  // Auto-scroll focused item into view (gamepad navigation). Unchanged.
  useEffect(() => {
    if (focusedIndex < 0 || !focusActive) return;
    const el = scrollRef.current?.querySelector(
      `[data-slider-index="${focusedIndex}"]`
    );
    if (el) {
      el.scrollIntoView({ inline: "nearest", behavior: "smooth" });
    }
  }, [focusedIndex, focusActive]);

  // Core magnification loop. Runs inside requestAnimationFrame so DOM
  // writes are coalesced to one per vsync frame regardless of how fast
  // mousemove events fire.
  const applyMagnification = useCallback(() => {
    rafRef.current = null;
    const mouseX = mouseXRef.current;
    const buttons = buttonRefs.current;

    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      if (!btn) continue;

      if (mouseX === null) {
        // Mouse left the slider — clear inline sizes and let the CSS
        // transition animate each chip back to base.
        btn.style.width = "";
        btn.style.height = "";
        continue;
      }

      const rect = btn.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const absDist = Math.abs(mouseX - center);

      let size: number;
      if (absDist >= INFLUENCE_DISTANCE) {
        size = BASE_SIZE;
      } else {
        // Linear falloff from cursor center outward. The CSS transition
        // on width/height smooths frame-to-frame deltas into a springy
        // follow without needing an actual spring solver.
        const t = 1 - absDist / INFLUENCE_DISTANCE;
        size = BASE_SIZE + (MAGNIFICATION - BASE_SIZE) * t;
      }

      btn.style.width = `${size}px`;
      btn.style.height = `${size}px`;
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (prefersReducedMotion || !magnificationEnabled) return;
      mouseXRef.current = e.clientX;
      // Coalesce bursts of mousemove events into one update per frame.
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(applyMagnification);
    },
    [applyMagnification, prefersReducedMotion, magnificationEnabled]
  );

  const handleMouseLeave = useCallback(() => {
    if (prefersReducedMotion || !magnificationEnabled) return;
    mouseXRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Clear inline sizes synchronously so the CSS transition starts now
    // instead of waiting for the next frame.
    const buttons = buttonRefs.current;
    for (const btn of buttons) {
      if (!btn) continue;
      btn.style.width = "";
      btn.style.height = "";
    }
  }, [prefersReducedMotion, magnificationEnabled]);

  // Cancel any in-flight rAF on unmount so we don't write to a detached
  // node (mirrors the cleanup in GameCard.tsx).
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // When magnification is toggled off at runtime, clear any in-flight rAF
  // and reset inline sizes so buttons snap back to the base 114px via the
  // existing CSS transition. Without this, chips that were magnified at
  // the moment the user flipped the setting would stay stuck.
  useEffect(() => {
    if (magnificationEnabled) return;
    mouseXRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const buttons = buttonRefs.current;
    for (const btn of buttons) {
      if (!btn) continue;
      btn.style.width = "";
      btn.style.height = "";
    }
  }, [magnificationEnabled]);

  return (
    <div
      ref={scrollRef}
      className="slider-container hide-scrollbar flex overflow-x-auto py-3"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onWheel={(e) => {
        if (scrollRef.current && e.deltaY !== 0) {
          e.preventDefault();
          scrollRef.current.scrollLeft += e.deltaY;
        }
      }}
    >
      {items.map((item, idx) => {
        const isActive = idx === activeIndex;
        const isFocused = focusActive && focusedIndex === idx;

        return (
          <button
            key={item.key}
            ref={(el) => {
              buttonRefs.current[idx] = el;
            }}
            data-slider-index={idx}
            onClick={() => onSelect(idx)}
            className={`slider-btn flex items-center justify-center text-xs font-bold ${
              isFocused ? "ring-2 ring-focus scale-105" : ""
            } ${isActive ? "scale-105" : ""}`}
            style={{
              "--slider-color": item.color,
              "--slider-icon-color": item.iconColor,
              "--slider-color-bg": item.systemId === null ? `${item.color}33` : `${item.color}8c`,
              "--slider-dark": `${item.darkColor}00`,
              "--slider-border-start": `${item.color}d1`,
              "--slider-border-end": `${item.darkColor}00`,
            } as React.CSSProperties}
            title={item.label}
          >
            {item.icon ? (
              item.systemId === null ? (
                <img
                  src={item.icon}
                  alt={item.label}
                  className="slider-icon-img"
                />
              ) : (
                <div
                  className="slider-icon"
                  style={{ "--slider-icon": `url(${item.icon})` } as React.CSSProperties}
                />
              )
            ) : (
              item.shortLabel
            )}
          </button>
        );
      })}
    </div>
  );
}
