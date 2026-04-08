import type { SettingsTab } from "../../../schemas/settings-schema-types";

interface Props {
  tabs: SettingsTab[];
  activeIndex: number;
  focusedIndex: number;
  regionFocused: boolean;
  onSelect: (index: number) => void;
}

export function SettingsTabBar({
  tabs,
  activeIndex,
  focusedIndex,
  regionFocused,
  onSelect,
}: Props) {
  if (tabs.length === 0) return null;
  return (
    <div
      role="tablist"
      aria-label="Section tabs"
      className="flex items-center gap-2 px-6 py-2"
    >
      {tabs.map((tab, idx) => {
        const isActive = idx === activeIndex;
        const isFocused = regionFocused && idx === focusedIndex;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(idx)}
            className={`folder-row-glass rounded-full px-6 py-2.5 text-sm transition-colors ${
              isActive
                ? "ring-focus text-primary"
                : "text-secondary hover:text-primary"
            } ${isFocused ? "ring-focus" : ""}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
