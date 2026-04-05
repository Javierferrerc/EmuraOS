/**
 * System grouping for the slider UI. ROMs keep their real systemId
 * (`gb`, `gbc`, `gba`), but the slider shows one virtual entry per group.
 * When the user selects a group, the grid filters by all member systems.
 *
 * This is a UI-only concept — favorites, recently played, metadata cache
 * and ROM scanning all continue to use the real per-system IDs.
 */

export interface SystemGroup {
  /** Virtual systemId used in the slider + ActiveFilter */
  id: string;
  /** Display name (e.g. "Game Boy") */
  name: string;
  /** Short label for the slider chip */
  shortLabel: string;
  /** Real systemIds that belong to this group */
  members: string[];
  /** Which member's icon/colors to reuse as the group's visual identity */
  primaryMember: string;
}

export const SYSTEM_GROUPS: SystemGroup[] = [
  {
    id: "gameboy",
    name: "Game Boy",
    shortLabel: "GB",
    members: ["gb", "gbc", "gba"],
    primaryMember: "gba",
  },
];

/** Map from real systemId → group it belongs to (if any). */
const MEMBER_TO_GROUP = new Map<string, SystemGroup>();
for (const group of SYSTEM_GROUPS) {
  for (const member of group.members) {
    MEMBER_TO_GROUP.set(member, group);
  }
}

/** Map from virtual group id → group. */
const GROUP_BY_ID = new Map<string, SystemGroup>(
  SYSTEM_GROUPS.map((g) => [g.id, g])
);

export function getGroupForSystem(systemId: string): SystemGroup | undefined {
  return MEMBER_TO_GROUP.get(systemId);
}

export function getGroupById(groupId: string): SystemGroup | undefined {
  return GROUP_BY_ID.get(groupId);
}

/**
 * Resolve a slider systemId (which may be a group alias) to the list of
 * real systemIds it represents. For non-grouped systems, returns `[systemId]`.
 */
export function resolveSystemMembers(systemId: string): string[] {
  return GROUP_BY_ID.get(systemId)?.members ?? [systemId];
}
