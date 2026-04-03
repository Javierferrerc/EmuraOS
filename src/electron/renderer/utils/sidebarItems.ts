import type { ActiveFilter } from "../context/AppContext";
import type { Collection, SystemDefinition } from "../../../core/types";

export interface SidebarItem {
  key: string;
  filter: ActiveFilter;
  label: string;
}

export function buildSidebarItems(
  collections: Collection[],
  systemsWithRoms: SystemDefinition[]
): SidebarItem[] {
  const items: SidebarItem[] = [
    { key: "favorites", filter: { type: "favorites" }, label: "Favorites" },
    { key: "recent", filter: { type: "recent" }, label: "Recently Played" },
  ];

  for (const col of collections) {
    items.push({
      key: `col-${col.id}`,
      filter: { type: "collection", collectionId: col.id },
      label: col.name,
    });
  }

  items.push({ key: "all", filter: { type: "all" }, label: "All Systems" });

  for (const sys of systemsWithRoms) {
    items.push({
      key: `sys-${sys.id}`,
      filter: { type: "system", systemId: sys.id },
      label: sys.name,
    });
  }

  return items;
}
