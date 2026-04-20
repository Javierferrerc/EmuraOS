import type { SystemDefinition } from "../../../core/types";
import { SYSTEM_GROUPS, getGroupForSystem } from "./systemGroups";
import { deriveSystemColors } from "./colorUtils";

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

type SystemColorEntry = { color: string; darkColor: string; iconColor: string };

export const SYSTEM_COLORS: Record<string, SystemColorEntry> = {
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

// Darker / more saturated palette that pops on a light background.
const SYSTEM_COLORS_LIGHT: Record<string, SystemColorEntry> = {
  nes:          { color: "#dc2626", darkColor: "#7f1d1d", iconColor: "#b91c1c" },
  snes:         { color: "#b91c1c", darkColor: "#641414", iconColor: "#991b1b" },
  n64:          { color: "#16a34a", darkColor: "#0d5c2a", iconColor: "#15803d" },
  gb:           { color: "#15803d", darkColor: "#0a4d24", iconColor: "#166534" },
  gbc:          { color: "#7c3aed", darkColor: "#4c1d95", iconColor: "#6d28d9" },
  gba:          { color: "#4f46e5", darkColor: "#312e81", iconColor: "#4338ca" },
  nds:          { color: "#64748b", darkColor: "#334155", iconColor: "#475569" },
  gamecube:     { color: "#7e22ce", darkColor: "#4a1576", iconColor: "#6b21a8" },
  wii:          { color: "#0891b2", darkColor: "#0e4f63", iconColor: "#0e7490" },
  megadrive:    { color: "#2563eb", darkColor: "#1e3a8a", iconColor: "#1d4ed8" },
  mastersystem: { color: "#1d4ed8", darkColor: "#1e3a7a", iconColor: "#1e40af" },
  dreamcast:    { color: "#0284c7", darkColor: "#0c4a6e", iconColor: "#0369a1" },
  psx:          { color: "#64748b", darkColor: "#334155", iconColor: "#475569" },
  ps2:          { color: "#1d4ed8", darkColor: "#1e3a5f", iconColor: "#1e40af" },
  psp:          { color: "#64748b", darkColor: "#334155", iconColor: "#475569" },
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
  systemsWithRoms: SystemDefinition[],
  theme: "dark" | "light" | "retro-crt" = "dark",
  customColors?: Record<string, string>
): SliderItem[] {
  const palette = theme === "light" ? SYSTEM_COLORS_LIGHT : SYSTEM_COLORS;
  const fallback: SystemColorEntry = theme === "light"
    ? { color: "#475569", darkColor: "#1e293b", iconColor: "#334155" }
    : { color: "#718096", darkColor: "#4a5568", iconColor: "#cbd5e1" };

  // "All" chip uses inverted colors on light theme for visibility
  const allColor = theme === "light" ? "#334155" : "#FFFFFF";
  const allDark = theme === "light" ? "#1e293b" : "#999999";
  const allIconColor = theme === "light" ? "#334155" : "#FFFFFF";

  const items: SliderItem[] = [
    {
      key: "all",
      systemId: null,
      label: "All Systems",
      shortLabel: "ALL",
      color: allColor,
      darkColor: allDark,
      iconColor: allIconColor,
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
      // Falls back to sys.id if the primary isn't in the palette table.
      const customHex = customColors?.[group.primaryMember] ?? customColors?.[sys.id];
      const colors = customHex
        ? deriveSystemColors(customHex)
        : palette[group.primaryMember] ?? palette[sys.id] ?? fallback;
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

    const customHex = customColors?.[sys.id];
    const colors = customHex
      ? deriveSystemColors(customHex)
      : palette[sys.id] ?? fallback;
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
