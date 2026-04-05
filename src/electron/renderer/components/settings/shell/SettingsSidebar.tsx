import type { SettingsSection } from "../../../schemas/settings-schema-types";

interface Props {
  sections: SettingsSection[];
  activeId: string;
  focusedIndex: number;
  regionFocused: boolean;
  onSelect: (section: SettingsSection, index: number) => void;
}

export function SettingsSidebar({
  sections,
  activeId,
  focusedIndex,
  regionFocused,
  onSelect,
}: Props) {
  return (
    <nav
      aria-label="Settings sections"
      className="flex h-full flex-col gap-1 border-r border-white/5 bg-surface-0 p-4"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div className="mb-4 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Ajustes
      </div>
      {sections.map((section, idx) => {
        const isActive = section.id === activeId;
        const isFocused = regionFocused && idx === focusedIndex;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section, idx)}
            className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
              isActive
                ? "bg-surface-2 text-primary"
                : "text-secondary hover:bg-surface-1"
            } ${isFocused ? "ring-focus" : ""}`}
          >
            {section.icon && (
              <span aria-hidden className="text-base leading-none">
                {section.icon}
              </span>
            )}
            <span className="flex-1">{section.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
