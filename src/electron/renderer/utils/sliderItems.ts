import type { SystemDefinition } from "../../../core/types";
import { SYSTEM_GROUPS, getGroupForSystem } from "./systemGroups";

import nesIcon from "../assets/icons/consoles/nes.svg";
import snesIcon from "../assets/icons/consoles/snes.svg";
import n64Icon from "../assets/icons/consoles/n64.svg";
import gbaIcon from "../assets/icons/consoles/gba.svg";
import wiiIcon from "../assets/icons/consoles/wii.svg";
import wiiuIcon from "../assets/icons/consoles/wiiu.svg";
import gamecubeIcon from "../assets/icons/consoles/gamecube.svg";
import ndsIcon from "../assets/icons/consoles/nds.svg";
// JS identifiers can't start with a digit, so the "3ds" icon is imported
// under the name `threedsIcon` even though the file and system id are "3ds".
import threedsIcon from "../assets/icons/consoles/3ds.svg";
import switchIcon from "../assets/icons/consoles/switch.svg";
import playstationIcon from "../assets/icons/consoles/playstation.svg";
import pspIcon from "../assets/icons/consoles/psp.svg";
import mastersystemIcon from "../assets/icons/consoles/mastersystem.svg";
import libraryIcon from "../assets/icons/consoles/library.svg";

export interface SliderItem {
  key: string;
  // May be a real systemId (e.g. "nes") or a virtual group id (e.g. "gameboy").
  // null = "All".
  systemId: string | null;
  label: string;
  shortLabel: string;
  color: string;     // bright hex
  darkColor: string; // dark hex
  iconColor: string; // intense color for icon
  icon: string | null; // URL or null
}

const SYSTEM_COLORS: Record<string, { color: string; darkColor: string; iconColor: string }> = {
  nes:          { color: "#e53e3e", darkColor: "#7b1a1a", iconColor: "#ff5555" },
  snes:         { color: "#c53030", darkColor: "#63171b", iconColor: "#ef4444" },
  n64:          { color: "#1CEA61", darkColor: "#108436", iconColor: "#34ff7a" },
  gb:           { color: "#68d391", darkColor: "#276749", iconColor: "#86efac" },
  gbc:          { color: "#b794f4", darkColor: "#553c9a", iconColor: "#d4b5ff" },
  gba:          { color: "#7f9cf5", darkColor: "#3c4f8a", iconColor: "#a5b8ff" },
  nds:          { color: "#a0aec0", darkColor: "#4a5568", iconColor: "#cbd5e1" },
  gamecube:     { color: "#9f7aea", darkColor: "#553c9a", iconColor: "#c4a5ff" },
  wii:          { color: "#63b3ed", darkColor: "#2a5a8a", iconColor: "#8ed1ff" },
  megadrive:    { color: "#4299e1", darkColor: "#1a3a5c", iconColor: "#6bb5ff" },
  mastersystem: { color: "#3182ce", darkColor: "#1a3a6e", iconColor: "#5a9eff" },
  dreamcast:    { color: "#63b3ed", darkColor: "#2a5a8a", iconColor: "#8ed1ff" },
  psx:          { color: "#a0aec0", darkColor: "#4a5568", iconColor: "#cbd5e1" },
  ps2:          { color: "#4299e1", darkColor: "#1a365d", iconColor: "#6bb5ff" },
  psp:          { color: "#a0aec0", darkColor: "#4a5568", iconColor: "#cbd5e1" },
};

const SYSTEM_ICONS: Record<string, string> = {
  nes: nesIcon,
  snes: snesIcon,
  n64: n64Icon,
  gba: gbaIcon,
  wii: wiiIcon,
  wiiu: wiiuIcon,
  gamecube: gamecubeIcon,
  nds: ndsIcon,
  "3ds": threedsIcon,
  switch: switchIcon,
  // Both PlayStation generations share the same PS logo.
  psx: playstationIcon,
  ps2: playstationIcon,
  psp: pspIcon,
  mastersystem: mastersystemIcon,
};

const SHORT_LABELS: Record<string, string> = {
  nes: "NES",
  snes: "SNES",
  n64: "N64",
  gb: "GB",
  gbc: "GBC",
  gba: "GBA",
  nds: "NDS",
  gamecube: "GCN",
  wii: "WII",
  megadrive: "GEN",
  mastersystem: "SMS",
  dreamcast: "DC",
  psx: "PSX",
  ps2: "PS2",
  psp: "PSP",
};

export function buildSliderItems(
  systemsWithRoms: SystemDefinition[]
): SliderItem[] {
  const items: SliderItem[] = [
    {
      key: "all",
      systemId: null,
      label: "All Systems",
      shortLabel: "ALL",
      color: "#FFFFFF",
      darkColor: "#999999",
      iconColor: "#FFFFFF",
      icon: libraryIcon,
    },
  ];

  // Track which groups we've already emitted so we only add one chip per group
  // even if multiple members are present.
  const emittedGroups = new Set<string>();

  for (const sys of systemsWithRoms) {
    const group = getGroupForSystem(sys.id);

    if (group) {
      if (emittedGroups.has(group.id)) continue;
      emittedGroups.add(group.id);

      // Reuse the primary member's colors/icon as the group's visual identity.
      // Falls back to sys.id if the primary isn't in the SYSTEM_COLORS table.
      const colors =
        SYSTEM_COLORS[group.primaryMember] ??
        SYSTEM_COLORS[sys.id] ?? { color: "#718096", darkColor: "#4a5568", iconColor: "#cbd5e1" };
      const icon = SYSTEM_ICONS[group.primaryMember] ?? SYSTEM_ICONS[sys.id] ?? null;

      items.push({
        key: `group-${group.id}`,
        systemId: group.id,
        label: group.name,
        shortLabel: group.shortLabel,
        color: colors.color,
        darkColor: colors.darkColor,
        iconColor: colors.iconColor,
        icon,
      });
      continue;
    }

    const colors = SYSTEM_COLORS[sys.id] ?? { color: "#718096", darkColor: "#4a5568", iconColor: "#cbd5e1" };
    items.push({
      key: `sys-${sys.id}`,
      systemId: sys.id,
      label: sys.name,
      shortLabel: SHORT_LABELS[sys.id] ?? sys.id.toUpperCase().slice(0, 3),
      color: colors.color,
      darkColor: colors.darkColor,
      iconColor: colors.iconColor,
      icon: SYSTEM_ICONS[sys.id] ?? null,
    });
  }

  return items;
}

// Re-export so consumers can import from a single place.
export { SYSTEM_GROUPS };
