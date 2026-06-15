/**
 * SetIcon — functional UI glyphs for the NEXUS settings shell. Ported from the
 * design's icons.jsx. Inherits currentColor; stroke-based.
 */

interface Props {
  name: string;
  size?: number;
  stroke?: number;
  className?: string;
}

export function SetIcon({ name, size = 18, stroke = 2, className }: Props) {
  const s = { width: size, height: size, display: "block" as const };
  const c = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const v = "0 0 24 24";
  switch (name) {
    case "search":
      return (<svg style={s} viewBox={v} className={className}><circle cx="11" cy="11" r="7" {...c} /><line x1="16.5" y1="16.5" x2="21" y2="21" {...c} /></svg>);
    case "trophy":
      return (<svg style={s} viewBox={v} className={className}><path d="M7 4h10v4a5 5 0 0 1-10 0V4z" {...c} /><path d="M7 5H4v1a3 3 0 0 0 3 3M17 5h3v1a3 3 0 0 1-3 3" {...c} /><path d="M12 13v3M9 20h6M10 20l.5-4h3l.5 4" {...c} /></svg>);
    case "chevron-right":
      return (<svg style={s} viewBox={v} className={className}><path d="M9 6l6 6-6 6" {...c} /></svg>);
    case "chevron-left":
      return (<svg style={s} viewBox={v} className={className}><path d="M15 6l-6 6 6 6" {...c} /></svg>);
    case "chevron-down":
      return (<svg style={s} viewBox={v} className={className}><path d="M6 9l6 6 6-6" {...c} /></svg>);
    case "check":
      return (<svg style={s} viewBox={v} className={className}><path d="M5 12.5l4.5 4.5L19 7" {...c} /></svg>);
    case "sound":
      return (<svg style={s} viewBox={v} className={className}><path d="M4 9v6h4l5 4V5L8 9H4z" {...c} /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8 8 0 0 1 0 12" {...c} /></svg>);
    case "download":
      return (<svg style={s} viewBox={v} className={className}><path d="M12 4v10m0 0l4-4m-4 4l-4-4" {...c} /><path d="M5 19h14" {...c} /></svg>);
    case "gear":
      return (<svg style={s} viewBox={v} className={className}><circle cx="12" cy="12" r="3.2" {...c} /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" {...c} /></svg>);
    case "palette":
      return (<svg style={s} viewBox={v} className={className}><path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-1.8 0-.6-.4-1-.4-1.6 0-.7.6-1.2 1.3-1.2H16a5 5 0 0 0 5-5c0-4.4-4-8.4-9-8.4z" {...c} /><circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none" /><circle cx="11" cy="7.5" r="1.1" fill="currentColor" stroke="none" /><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" /></svg>);
    case "books":
      return (<svg style={s} viewBox={v} className={className}><path d="M5 4h5v16H5zM10 6l5-1 3 14-5 1z" {...c} /><path d="M7.5 4v16" {...c} /></svg>);
    case "image":
      return (<svg style={s} viewBox={v} className={className}><rect x="4" y="5" width="16" height="14" rx="2.5" {...c} /><circle cx="9" cy="10" r="1.6" {...c} /><path d="M5 16l4-3 3 2 3-3 4 4" {...c} /></svg>);
    case "folder":
      return (<svg style={s} viewBox={v} className={className}><path d="M4 7a2 2 0 0 1 2-2h3.5l2 2H18a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" {...c} /></svg>);
    case "folder-open":
      return (<svg style={s} viewBox={v} className={className}><path d="M4 8a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v1H4z" {...c} /><path d="M4 11h17l-2 7a1.5 1.5 0 0 1-1.4 1H5a1.5 1.5 0 0 1-1.5-1.5z" {...c} /></svg>);
    case "gamepad":
      return (<svg style={s} viewBox={v} className={className}><path d="M7 8h10a4 4 0 0 1 4 4 3.4 3.4 0 0 1-6 2.2l-.5-.7h-3l-.5.7A3.4 3.4 0 0 1 3 12a4 4 0 0 1 4-4z" {...c} /><path d="M7.5 11v2M6.5 12h2" {...c} /><circle cx="15.5" cy="11.2" r=".9" fill="currentColor" stroke="none" /><circle cx="17" cy="13" r=".9" fill="currentColor" stroke="none" /></svg>);
    case "wrench":
      return (<svg style={s} viewBox={v} className={className}><path d="M15.5 7.5a3.5 3.5 0 0 1-4.6 4.6l-5.2 5.2a1.6 1.6 0 0 0 2.2 2.2l5.2-5.2a3.5 3.5 0 0 1 4.6-4.6l-2.3 2.3-.2 2 2-.2 2.3-2.3a3.5 3.5 0 0 1-.5-1z" {...c} /></svg>);
    case "external":
      return (<svg style={s} viewBox={v} className={className}><path d="M14 5h5v5M19 5l-8 8M11 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" {...c} /></svg>);
    case "eye":
      return (<svg style={s} viewBox={v} className={className}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...c} /><circle cx="12" cy="12" r="2.8" {...c} /></svg>);
    case "eye-off":
      return (<svg style={s} viewBox={v} className={className}><path d="M4 5l16 14" {...c} /><path d="M9.5 9.6A2.8 2.8 0 0 0 12 14.8c.7 0 1.3-.2 1.8-.6M6.3 7.2C3.9 8.7 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.4 0 2.6-.3 3.7-.8M10 5.7A8.7 8.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.3 3" {...c} /></svg>);
    case "refresh":
      return (<svg style={s} viewBox={v} className={className}><path d="M20 11a8 8 0 0 0-14-4.5L4 8M4 4v4h4" {...c} /><path d="M4 13a8 8 0 0 0 14 4.5L20 16M20 20v-4h-4" {...c} /></svg>);
    case "back":
      return (<svg style={s} viewBox={v} className={className}><path d="M11 5l-7 7 7 7M4 12h16" {...c} /></svg>);
    case "reset":
      return (<svg style={s} viewBox={v} className={className}><path d="M4 4v5h5" {...c} /><path d="M4.5 9a8 8 0 1 1-1.5 5.5" {...c} /></svg>);
    default:
      return null;
  }
}

/** Section id → SetIcon name for the sidebar. */
export const SECTION_ICON: Record<string, string> = {
  general: "gear",
  apariencia: "palette",
  sonido: "sound",
  biblioteca: "books",
  portadas: "image",
  rutas: "folder",
  emuladores: "gamepad",
  retroachievements: "trophy",
  avanzado: "wrench",
};
