/** Shared game-active flag — used by index.ts and emulator-overlay.ts */

let gameActive = false;

export function isGameActive(): boolean {
  return gameActive;
}

export function setGameActive(active: boolean): void {
  gameActive = active;
}

// ── F10 debounce ───────────────────────────────────────────────────
// Both `index.ts` (globalShortcut) and `emulator-overlay.ts` (GetAsyncKeyState
// polling during a game session) can detect the same F10 press. The polling
// fallback exists because globalShortcut stops delivering WM_HOTKEY reliably
// when the embedded emulator window owns the foreground in fullscreen. If
// both paths fire for the same press, they cancel each other out. This shared
// timestamp lets whichever path sees the press first "claim" it.

let lastF10FireAt = 0;
const F10_DEBOUNCE_MS = 300;

/**
 * Returns true if enough time has elapsed since the last F10 fire to allow
 * a new toggle. Also stamps the current time, atomically, to reserve the slot.
 */
export function claimF10Fire(): boolean {
  const now = Date.now();
  if (now - lastF10FireAt < F10_DEBOUNCE_MS) return false;
  lastF10FireAt = now;
  return true;
}
