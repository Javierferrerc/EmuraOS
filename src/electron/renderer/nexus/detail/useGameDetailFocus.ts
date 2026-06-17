/**
 * useGameDetailFocus — geometric "spatial" focus for the ficha, ported from the
 * design's `useGamepadFocus`.
 *
 * Arrow keys move focus to the nearest `[data-foc]` element in that direction,
 * Enter activates it, and mouse hover takes over focus. The focus ring is drawn
 * via `.focused::after` (see the CSS). The container is scrolled manually when
 * the focused element nears an edge — never `scrollIntoView` (which would also
 * scroll ancestor scroll containers and fight the shell).
 *
 * It also exposes an imperative handle so the app's unified gamepad layer
 * (which emits FocusActions, not key events) can drive the same focus model
 * while the ficha is open.
 */

import { useEffect } from "react";
import type { DependencyList, MutableRefObject, RefObject } from "react";

export type FocusDir = "up" | "down" | "left" | "right";

export interface GameDetailFocusHandle {
  move(dir: FocusDir): void;
  activate(): void;
}

export function useGameDetailFocus(
  rootRef: RefObject<HTMLElement | null>,
  handleRef: MutableRefObject<GameDetailFocusHandle | null>,
  deps: DependencyList
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const els = () => Array.from(root.querySelectorAll<HTMLElement>("[data-foc]"));
    let current: HTMLElement | null = null;

    const setFocus = (el: HTMLElement | null) => {
      if (!el) return;
      if (current) current.classList.remove("focused");
      current = el;
      el.classList.add("focused");
      // Keyboard/gamepad focus → show the focus ring.
      root.classList.add("kbd-focus");
      const r = el.getBoundingClientRect();
      if (r.top < 90 || r.bottom > window.innerHeight - 30) {
        root.scrollBy({
          top: r.top < 90 ? r.top - 130 : r.bottom - window.innerHeight + 60,
          behavior: "smooth",
        });
      }
    };

    const nearest = (dir: FocusDir): HTMLElement | null => {
      const list = els();
      if (!current || !list.includes(current)) return list[0] ?? null;
      const cr = current.getBoundingClientRect();
      const cx = cr.left + cr.width / 2;
      const cy = cr.top + cr.height / 2;
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      list.forEach((el) => {
        if (el === current) return;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const dx = x - cx;
        const dy = y - cy;
        const ok =
          dir === "right" ? dx > 8 : dir === "left" ? dx < -8 : dir === "down" ? dy > 8 : dy < -8;
        if (!ok) return;
        const along = dir === "left" || dir === "right" ? Math.abs(dx) : Math.abs(dy);
        const across = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
        const score = along + across * 2.2;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      });
      return best;
    };

    const move = (dir: FocusDir) => {
      if (!current) {
        setFocus(els()[0] ?? null);
        return;
      }
      const n = nearest(dir);
      if (n) setFocus(n);
    };

    const activate = () => {
      if (current) current.click();
    };

    const onKey = (e: KeyboardEvent) => {
      const tag = ((e.target as HTMLElement)?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const map: Record<string, FocusDir> = {
        ArrowRight: "right",
        ArrowLeft: "left",
        ArrowDown: "down",
        ArrowUp: "up",
      };
      if (map[e.key]) {
        e.preventDefault();
        e.stopPropagation();
        move(map[e.key]);
      } else if (e.key === "Enter") {
        e.preventDefault();
        activate();
      }
    };

    const onOver = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.("[data-foc]") as HTMLElement | null;
      if (el && root.contains(el)) {
        if (current) current.classList.remove("focused");
        current = el;
        el.classList.add("focused");
        // Mouse hover takes over focus but must NOT show the keyboard focus
        // ring — only the design's :hover state. Drop the kbd-focus marker.
        root.classList.remove("kbd-focus");
      }
    };

    handleRef.current = { move, activate };
    window.addEventListener("keydown", onKey);
    root.addEventListener("mousemove", onOver, true);
    return () => {
      handleRef.current = null;
      window.removeEventListener("keydown", onKey);
      root.removeEventListener("mousemove", onOver, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
