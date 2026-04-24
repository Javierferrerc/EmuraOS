/**
 * Helpers for the "Nuevo" badge that highlights recently-added roms.
 *
 * `romAddedDates` is populated by `RomScanner.scan()` on the main side
 * — every rom seen for the first time gets the current ISO date. A rom
 * is considered "new" if BOTH conditions hold:
 *
 *   • It was added within the window below.
 *   • It has never been played (playCount === 0).
 *
 * The "never played" gate is important: once the user launches a rom
 * the novelty is gone, so we stop advertising it even if the 2-day
 * window hasn't elapsed yet.
 */

import type { PlayRecord } from "../../../core/types";

const NEW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export function isRomNew(
  romAddedDates: Record<string, string>,
  playHistory: Record<string, PlayRecord>,
  systemId: string,
  fileName: string,
  now: number = Date.now()
): boolean {
  const key = `${systemId}:${fileName}`;
  if ((playHistory[key]?.playCount ?? 0) > 0) return false;
  const iso = romAddedDates[key];
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return now - t < NEW_WINDOW_MS;
}
