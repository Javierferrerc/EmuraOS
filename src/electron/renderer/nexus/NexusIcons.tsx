/**
 * Minimal inline-SVG icon set for the NEXUS shell, ported from the design's
 * icons.jsx. Each icon inherits `currentColor` and takes an optional size.
 */

interface IconProps {
  size?: number;
  className?: string;
}

function svg(size: number, children: React.ReactNode, className?: string) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>,
    className
  );

export const PlayIcon = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M8 5v14l11-7z" />
  </svg>
);

export const InfoIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </>,
    className
  );

export const CloseIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>,
    className
  );

export const HeartIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
    className
  );

export const TrophyIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <path d="M6 9a6 6 0 0 0 12 0V3H6z" />
      <path d="M6 5H3v2a3 3 0 0 0 3 3" />
      <path d="M18 5h3v2a3 3 0 0 1-3 3" />
      <line x1="12" y1="15" x2="12" y2="19" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </>,
    className
  );

export const StarIcon = ({ size = 14, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
  </svg>
);

export const ClockIcon = ({ size = 16, className }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </>,
    className
  );

export const DownloadIcon = ({ size = 14, className }: IconProps) =>
  svg(
    size,
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>,
    className
  );

export const ChevronRightIcon = ({ size = 20, className }: IconProps) =>
  svg(size, <polyline points="9 6 15 12 9 18" />, className);

export const UploadIcon = ({ size = 14, className }: IconProps) =>
  svg(
    size,
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </>,
    className
  );

export const CameraIcon = ({ size = 16, className }: IconProps) =>
  svg(
    size,
    <>
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1-2h7l1 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </>,
    className
  );

export const TrashIcon = ({ size = 15, className }: IconProps) =>
  svg(
    size,
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6M14 11v6" />
    </>,
    className
  );

export const ImageIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M5 16l4-3 3 2 3-3 4 4" />
    </>,
    className
  );

export const PaletteIcon = ({ size = 19, className }: IconProps) =>
  svg(
    size,
    <>
      <path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-1.8 0-.6-.4-1-.4-1.6 0-.7.6-1.2 1.3-1.2H16a5 5 0 0 0 5-5c0-4.4-4-8.4-9-8.4z" />
      <circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
    </>,
    className
  );

export const GridIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>,
    className
  );

export const LayersIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </>,
    className
  );

export const SettingsIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>,
    className
  );

export const SparkIcon = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />
  </svg>
);

export const SidebarIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </>,
    className
  );

export const BackIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <path d="M11 5l-7 7 7 7" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </>,
    className
  );

export const EditIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </>,
    className
  );

export const CheckIcon = ({ size = 18, className }: IconProps) =>
  svg(size, <path d="M5 12.5l4.5 4.5L19 7" />, className);

export const RailIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <rect x="3" y="7" width="5.5" height="10" rx="1.6" />
      <rect x="10.25" y="7" width="5.5" height="10" rx="1.6" />
      <rect x="17.5" y="9" width="3.5" height="6" rx="1.4" />
    </>,
    className
  );

export const ConsoleIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <rect x="2" y="7" width="20" height="10" rx="5" />
      <line x1="7" y1="11" x2="7" y2="13" />
      <line x1="6" y1="12" x2="8" y2="12" />
      <circle cx="16" cy="11" r="0.6" fill="currentColor" />
      <circle cx="18" cy="13" r="0.6" fill="currentColor" />
    </>,
    className
  );

export const LibraryIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="7" cy="7" r="2.4" />
      <circle cx="17" cy="7" r="2.4" />
      <circle cx="7" cy="17" r="2.4" />
      <circle cx="17" cy="17" r="2.4" />
    </>,
    className
  );

export const CopyIcon = ({ size = 16, className }: IconProps) =>
  svg(
    size,
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
    className
  );

export const DotsIcon = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <circle cx="6" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="18" cy="12" r="1.6" />
  </svg>
);

export const WarnIcon = ({ size = 14, className }: IconProps) =>
  svg(
    size,
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </>,
    className
  );

export const GamepadIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <path d="M7 8h10a4 4 0 0 1 4 4 3.4 3.4 0 0 1-6 2.2l-.5-.7h-3l-.5.7A3.4 3.4 0 0 1 3 12a4 4 0 0 1 4-4z" />
      <path d="M7.5 11v2M6.5 12h2" />
      <circle cx="15.5" cy="11.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="17" cy="13" r="0.9" fill="currentColor" stroke="none" />
    </>,
    className
  );

export const EyeIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>,
    className
  );

export const EyeOffIcon = ({ size = 18, className }: IconProps) =>
  svg(
    size,
    <>
      <path d="M4 5l16 14" />
      <path d="M9.5 9.6A2.8 2.8 0 0 0 12 14.8c.7 0 1.3-.2 1.8-.6M6.3 7.2C3.9 8.7 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.4 0 2.6-.3 3.7-.8M10 5.7A8.7 8.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.3 3" />
    </>,
    className
  );
