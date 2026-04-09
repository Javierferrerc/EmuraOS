import type { SettingsSection } from "../../../schemas/settings-schema-types";
import logoEmura from "../../../assets/logo-emura.svg";

interface Props {
  sections: SettingsSection[];
  activeId: string;
  focusedIndex: number;
  regionFocused: boolean;
  onSelect: (section: SettingsSection, index: number) => void;
  onBack: () => void;
}

export function SettingsSidebar({
  sections,
  activeId,
  focusedIndex,
  regionFocused,
  onSelect,
  onBack,
}: Props) {
  return (
    <div
      className="flex h-full flex-col p-5"
      style={{ width: "var(--sidebar-width)" }}
    >
      {/* Back to menu */}
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-3 rounded-[var(--radius-md)] px-1 py-1 text-secondary transition-colors hover:text-primary"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4 shrink-0"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        <img src={logoEmura} alt="Emura OS" className="h-9" />
      </button>

      {/* Floating card */}
      <nav
        aria-label="Settings sections"
        className="flex flex-col gap-0.5 overflow-y-auto rounded-[var(--radius-lg)] border border-white/[0.06] bg-surface-0 p-2 shadow-lg shadow-black/20"
      >
        {sections.map((section, idx) => {
          const isActive = section.id === activeId;
          const isFocused = regionFocused && idx === focusedIndex;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section, idx)}
              className={`flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm transition-colors ${
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

    </div>
  );
}
