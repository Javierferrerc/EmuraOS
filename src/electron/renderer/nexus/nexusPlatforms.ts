/**
 * NEXUS platform model — two-level hierarchy ported from the updated design:
 * FAMILY (manufacturer) → SYSTEMS (consoles). Selecting a family shows all its
 * systems' games; selecting a system narrows to that one; "all" = everything.
 *
 * Built from the real SystemDefinition list (each has a `manufacturer`),
 * reusing the existing per-system colours, icons and short labels.
 */

import type { SystemDefinition } from "../../../core/types";
import { SYSTEM_COLORS, SYSTEM_ICONS, SHORT_LABELS } from "../utils/sliderItems";

export interface NexusSystemNode {
  id: string; // real systemId
  name: string;
  short: string;
  year?: number;
  tint: string;
  icon: string | null;
}

export interface NexusFamily {
  id: string; // "fam:<manufacturer>"
  manufacturer: string;
  name: string;
  tint: string;
  systems: NexusSystemNode[];
}

export const ALL_PLATFORM = "all";
export const FAMILY_PREFIX = "fam:";

/** Known release years — factual, used only for the chip subtitle. */
const SYSTEM_YEAR: Record<string, number> = {
  nes: 1983,
  snes: 1990,
  n64: 1996,
  gb: 1989,
  gbc: 1998,
  gba: 2001,
  nds: 2004,
  "3ds": 2011,
  gamecube: 2001,
  wii: 2006,
  wiiu: 2012,
  switch: 2017,
  megadrive: 1988,
  mastersystem: 1985,
  dreamcast: 1998,
  psx: 1994,
  ps2: 2000,
  ps3: 2006,
  psp: 2004,
};

/** Brand-ish accent per manufacturer; falls back to the first member's tint. */
const MANUFACTURER_TINT: Record<string, string> = {
  Nintendo: "#e4000f",
  Sony: "#2e6cf6",
  Sega: "#16b7d6",
  Atari: "#e07b1f",
  Microsoft: "#107c10",
};

function systemTint(id: string, customColors?: Record<string, string>): string {
  return customColors?.[id] ?? SYSTEM_COLORS[id]?.iconColor ?? "#9aa6c0";
}

/** Group the present systems by manufacturer into ordered families. */
export function buildFamilies(
  present: SystemDefinition[],
  customColors?: Record<string, string>
): NexusFamily[] {
  const byMfr = new Map<string, NexusSystemNode[]>();
  for (const sys of present) {
    const node: NexusSystemNode = {
      id: sys.id,
      name: sys.name,
      short: SHORT_LABELS[sys.id] ?? sys.id.toUpperCase().slice(0, 4),
      year: SYSTEM_YEAR[sys.id],
      tint: systemTint(sys.id, customColors),
      icon: SYSTEM_ICONS[sys.id] ?? null,
    };
    const arr = byMfr.get(sys.manufacturer) ?? [];
    arr.push(node);
    byMfr.set(sys.manufacturer, arr);
  }
  const families: NexusFamily[] = [];
  for (const [mfr, systems] of byMfr) {
    systems.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.name.localeCompare(b.name));
    families.push({
      id: FAMILY_PREFIX + mfr,
      manufacturer: mfr,
      name: mfr,
      tint: MANUFACTURER_TINT[mfr] ?? systems[0]?.tint ?? "#9aa6c0",
      systems,
    });
  }
  families.sort((a, b) => a.name.localeCompare(b.name));
  return families;
}

/** Flat ordered list of selectable node ids (all → fam → its systems → …).
 *  Drives keyboard/gamepad left/right traversal of the rail. */
export function selectableOrder(families: NexusFamily[]): string[] {
  const ids: string[] = [ALL_PLATFORM];
  for (const fam of families) {
    ids.push(fam.id);
    for (const s of fam.systems) ids.push(s.id);
  }
  return ids;
}

/** Resolve a platform selection to the set of systemIds it covers.
 *  Returns null for "all" (no filtering). */
export function platformSystemIds(platform: string, families: NexusFamily[]): Set<string> | null {
  if (platform === ALL_PLATFORM) return null;
  if (platform.startsWith(FAMILY_PREFIX)) {
    const fam = families.find((f) => f.id === platform);
    return new Set(fam ? fam.systems.map((s) => s.id) : []);
  }
  return new Set([platform]);
}

/** Human label for the current selection (status bar / grid head / empty state). */
export function platformLabel(platform: string, families: NexusFamily[]): string {
  if (platform === ALL_PLATFORM) return "Toda la biblioteca";
  if (platform.startsWith(FAMILY_PREFIX)) {
    return families.find((f) => f.id === platform)?.name ?? "Biblioteca";
  }
  for (const fam of families) {
    const sys = fam.systems.find((s) => s.id === platform);
    if (sys) return sys.name;
  }
  return "Biblioteca";
}
