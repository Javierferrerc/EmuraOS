/**
 * Navigation stack type definitions for the Phase 13 router.
 *
 * Known routes (consumed by route-registry + SettingsRoot in PR1; extended in PR2):
 *
 *   /library
 *   /game
 *   /settings
 *   /settings/general
 *   /settings/rutas
 *   /settings/emuladores
 *   /settings/emuladores/:emulatorId
 *   /settings/emuladores/:emulatorId/estado
 *   /settings/emuladores/:emulatorId/configuracion
 *   /settings/emuladores/:emulatorId/descarga
 *   /settings/emuladores/:emulatorId/avanzado
 *   /settings/apariencia
 *   /settings/biblioteca
 *   /settings/portadas
 *   /settings/avanzado
 */

export type NavigationPath = string;

export interface NavigationEntryMemo {
  /** Scroll offset of the list view when the user navigated away. */
  scrollTop?: number;
  /** Stable row id (matches `Setting.id`) to restore focus to. */
  focusedRowId?: string;
}

export interface NavigationEntry {
  path: NavigationPath;
  memo?: NavigationEntryMemo;
}

export interface NavigationState {
  stack: NavigationEntry[];
}

export interface NavigationApi {
  state: NavigationState;
  /** Convenience accessor — equals `state.stack[state.stack.length - 1].path`. */
  currentPath: NavigationPath;
  /** Push a new entry onto the stack. */
  navigateTo: (path: NavigationPath, memo?: NavigationEntryMemo) => void;
  /** Replace the top of the stack without pushing a new entry. */
  replace: (path: NavigationPath) => void;
  /** Pop one entry. Returns `true` if a pop happened, `false` at stack depth 1. */
  goBack: () => boolean;
  /** `true` when `state.stack.length > 1`. */
  canGoBack: () => boolean;
  /** Clear the stack and seed it with a single entry. */
  reset: (path: NavigationPath) => void;
  /**
   * Match `currentPath` against a pattern like `/settings/emuladores/:id`.
   * Returns the captured params on success, or `null` on mismatch.
   * Trailing slashes are normalized out. Extra segments fail the match.
   */
  match: (pattern: string) => Record<string, string> | null;
  /** Merge a memo into the current top entry (used for scroll/focus restore). */
  updateMemo: (memo: NavigationEntryMemo) => void;
}
