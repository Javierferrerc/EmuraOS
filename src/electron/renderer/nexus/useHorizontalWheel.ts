import { useEffect, useRef } from "react";

/**
 * Translate a vertical mouse wheel into horizontal scrolling for carousels with
 * hidden scrollbars (the platform switcher and the game rows). Without this, a
 * standard wheel can't reach systems/games that overflow the width — there's no
 * visible scrollbar and the wheel only scrolls vertically by default.
 *
 * Returns a ref to attach to the scrollable track. Uses a non-passive native
 * listener so we can preventDefault and stop the wheel from also scrolling an
 * ancestor (e.g. the vertical content container) at the same time.
 */
export function useHorizontalWheel<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Nothing to scroll horizontally — let the event bubble (page/vertical).
      if (el.scrollWidth <= el.clientWidth) return;
      // Trackpads already emit horizontal deltas; only remap vertical intent.
      if (e.deltaY === 0) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      // At an edge moving further out — release to the ancestor so the page
      // can still scroll vertically instead of getting stuck.
      if ((atStart && e.deltaY < 0) || (atEnd && e.deltaY > 0)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  return ref;
}
