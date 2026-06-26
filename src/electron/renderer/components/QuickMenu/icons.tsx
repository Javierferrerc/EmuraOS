// icons.tsx — minimal glyphs for the quick menu (Esc). Pixel-faithful port of
// the handoff `icons.jsx`, trimmed to the five icons the menu uses:
// play · user-plus · settings · power · search.

export type QuickMenuIconName =
  | "play"
  | "user-plus"
  | "settings"
  | "power"
  | "search";

interface IconProps {
  name: QuickMenuIconName;
  size?: number;
  stroke?: number;
  className?: string;
}

export function Icon({ name, size = 18, stroke = 2, className }: IconProps) {
  const s = { width: size, height: size, display: "block" as const };
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const v = "0 0 24 24";
  switch (name) {
    case "search":
      return (
        <svg style={s} viewBox={v} className={className}>
          <circle cx="11" cy="11" r="7" {...common} />
          <line x1="16.5" y1="16.5" x2="21" y2="21" {...common} />
        </svg>
      );
    case "play":
      return (
        <svg style={s} viewBox={v} className={className}>
          <path d="M7 5l12 7-12 7V5z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "settings":
      return (
        <svg style={s} viewBox={v} className={className}>
          <circle cx="12" cy="12" r="3.2" {...common} />
          <path
            d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a7.5 7.5 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 1.7-1l2.3 1 2-3.4z"
            {...common}
          />
        </svg>
      );
    case "user-plus":
      return (
        <svg style={s} viewBox={v} className={className}>
          <circle cx="9.5" cy="8" r="3.6" {...common} />
          <path d="M3.5 20a6 6 0 0 1 12 0" {...common} />
          <path d="M18.5 8.5v5M16 11h5" {...common} />
        </svg>
      );
    case "power":
      return (
        <svg style={s} viewBox={v} className={className}>
          <path d="M12 3.5v8" {...common} />
          <path d="M7.5 6.5a7 7 0 1 0 9 0" {...common} />
        </svg>
      );
    default:
      return null;
  }
}
