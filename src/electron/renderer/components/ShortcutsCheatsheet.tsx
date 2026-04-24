/**
 * Shortcuts cheatsheet — Phase 20 slice 5.
 *
 * Overlay triggered by pressing `?` anywhere in the app (unless focus is
 * inside a text input, where `?` is a literal character). Groups the
 * known shortcuts by intent so users can scan the list without reading
 * it top to bottom.
 *
 * The content is a static data structure — no dynamic wiring. When new
 * shortcuts land, the list is updated here by hand rather than derived
 * from the handlers (deriving would add indirection for no real payoff
 * since the handler map already lives in different files).
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";

type Entry = { keys: string[]; label: string };
type Section = { title: string; entries: Entry[] };

const SECTIONS: Section[] = [
  {
    title: "Navegación",
    entries: [
      { keys: ["↑", "↓", "←", "→"], label: "Mover foco" },
      { keys: ["Enter"], label: "Abrir / lanzar" },
      { keys: ["Esc"], label: "Volver / cerrar" },
      { keys: ["F11"], label: "Alternar pantalla completa" },
      { keys: ["Tab"], label: "Pasar a la siguiente región" },
    ],
  },
  {
    title: "Búsqueda",
    entries: [
      { keys: ["Ctrl", "K"], label: "Quick Launch / Command Palette" },
      { keys: ["?"], label: "Mostrar este panel" },
    ],
  },
  {
    title: "Biblioteca",
    entries: [
      { keys: ["Doble click"], label: "Lanzar juego" },
      { keys: ["Click derecho"], label: "Menú contextual del juego" },
      { keys: ["I"], label: "Ver ficha del juego enfocado (XMB)" },
      { keys: ["Drag & drop"], label: "Añadir ROMs soltando archivos" },
    ],
  },
  {
    title: "Gamepad",
    entries: [
      { keys: ["A"], label: "Confirmar / lanzar" },
      { keys: ["B"], label: "Volver / cerrar" },
      { keys: ["Y"], label: "Favorito" },
      { keys: ["X"], label: "Ficha del juego" },
      { keys: ["LB", "RB"], label: "Cambiar sistema / categoría" },
      { keys: ["Start"], label: "Ajustes" },
    ],
  },
];

export interface ShortcutsCheatsheetProps {
  onClose: () => void;
}

export function ShortcutsCheatsheet({ onClose }: ShortcutsCheatsheetProps) {
  // Close on Escape or any click on the backdrop. Keydown attached at
  // document level so the overlay catches Escape even if nothing inside
  // is focused (it renders through a portal with no tabindex).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-8"
      style={{ background: "rgba(0, 0, 0, 0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl"
        style={{ background: "var(--color-surface-1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-primary">Atajos de teclado</h2>
          <button
            className="rounded px-2 py-1 text-sm text-muted transition-colors hover:bg-white/10"
            onClick={onClose}
            type="button"
          >
            Esc
          </button>
        </div>
        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.entries.map((entry, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-secondary">{entry.label}</span>
                    <span className="flex items-center gap-1">
                      {entry.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="inline-flex items-center rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
