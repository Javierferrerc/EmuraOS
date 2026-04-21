import type { DetectionResult } from "../../../core/types";

/**
 * True when `lastDetection` contains at least one emulator that declares
 * support for `systemId` in its `systems` array. Used by GameCard /
 * GameCardCompact / GameListRow to surface a warning badge when the user
 * couldn't possibly launch a rom because no emulator is installed or
 * detected for its system.
 *
 * Returns false when `lastDetection` is null (e.g. the first run, before
 * any scan) — the absence of detection data is treated the same as
 * "no emulator". Callers that want to distinguish those two cases should
 * check `lastDetection` separately.
 */
export function hasDetectedEmulatorForSystem(
  lastDetection: DetectionResult | null,
  systemId: string
): boolean {
  if (!lastDetection) return false;
  return lastDetection.detected.some((e) => e.systems.includes(systemId));
}
