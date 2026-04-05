/**
 * Static registry of the Phase 13 route tree.
 *
 * PR1 only exposes the metadata — actual component mounting is handled by
 * `App.tsx` (library / game) and `SettingsRoot.tsx` (settings subtree).
 * PR2 extends this with per-route metadata consumed by the StatusBar and
 * future deep-link features.
 */

export interface RouteInfo {
  path: string;
  /** Human-readable label, used for breadcrumbs. */
  label: string;
  /** True when this path should be owned by the Settings subtree. */
  isSettings: boolean;
}

/**
 * Prefix-based dispatch used by `App.tsx` in PR1 to decide which root to mount.
 * PR2 replaces this with a richer routing table.
 */
export function routeRootFor(path: string): "library" | "settings" | "game" {
  if (path.startsWith("/settings")) return "settings";
  if (path === "/game" || path.startsWith("/game/")) return "game";
  return "library";
}

export const KNOWN_ROUTES: RouteInfo[] = [
  { path: "/library", label: "Biblioteca", isSettings: false },
  { path: "/game", label: "Juego", isSettings: false },
  { path: "/settings", label: "Ajustes", isSettings: true },
  { path: "/settings/general", label: "General", isSettings: true },
  { path: "/settings/rutas", label: "Rutas", isSettings: true },
  { path: "/settings/emuladores", label: "Emuladores", isSettings: true },
  { path: "/settings/biblioteca", label: "Biblioteca", isSettings: true },
  { path: "/settings/cover-art", label: "Cover Art", isSettings: true },
  { path: "/settings/controles", label: "Controles", isSettings: true },
  { path: "/settings/avanzado", label: "Avanzado", isSettings: true },
];
