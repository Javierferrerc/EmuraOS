/** Shared game-active flag — used by index.ts and emulator-overlay.ts */

let gameActive = false;

export function isGameActive(): boolean {
  return gameActive;
}

export function setGameActive(active: boolean): void {
  gameActive = active;
}
