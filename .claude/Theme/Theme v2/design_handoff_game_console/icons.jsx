// icons.jsx — minimal functional UI glyphs (not illustrative). Exposes window.Icon.
function Icon({ name, size = 18, stroke = 2, className }) {
  const s = { width: size, height: size, display: "block" };
  const common = { fill: "none", stroke: "currentColor", strokeWidth: stroke,
    strokeLinecap: "round", strokeLinejoin: "round" };
  const v = "0 0 24 24";
  switch (name) {
    case "search":
      return <svg style={s} viewBox={v} className={className}><circle cx="11" cy="11" r="7" {...common}/><line x1="16.5" y1="16.5" x2="21" y2="21" {...common}/></svg>;
    case "play":
      return <svg style={s} viewBox={v} className={className}><path d="M7 5l12 7-12 7V5z" fill="currentColor" stroke="none"/></svg>;
    case "wifi":
      return <svg style={s} viewBox={v} className={className}><path d="M2.5 8.5a15 15 0 0 1 19 0" {...common}/><path d="M5.5 12a10.5 10.5 0 0 1 13 0" {...common}/><path d="M8.5 15.5a6 6 0 0 1 7 0" {...common}/><circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none"/></svg>;
    case "bt":
      return <svg style={s} viewBox={v} className={className}><path d="M7 7l10 10-5 4V3l5 4L7 17" {...common}/></svg>;
    case "chevron-right":
      return <svg style={s} viewBox={v} className={className}><path d="M9 6l6 6-6 6" {...common}/></svg>;
    case "chevron-left":
      return <svg style={s} viewBox={v} className={className}><path d="M15 6l-6 6 6 6" {...common}/></svg>;
    case "close":
      return <svg style={s} viewBox={v} className={className}><path d="M6 6l12 12M18 6L6 18" {...common}/></svg>;
    case "trophy":
      return <svg style={s} viewBox={v} className={className}><path d="M7 4h10v4a5 5 0 0 1-10 0V4z" {...common}/><path d="M7 5H4v1a3 3 0 0 0 3 3M17 5h3v1a3 3 0 0 1-3 3" {...common}/><path d="M12 13v3M9 20h6M10 20l.5-4h3l.5 4" {...common}/></svg>;
    case "clock":
      return <svg style={s} viewBox={v} className={className}><circle cx="12" cy="12" r="8.5" {...common}/><path d="M12 7.5V12l3 2" {...common}/></svg>;
    case "download":
      return <svg style={s} viewBox={v} className={className}><path d="M12 4v10m0 0l4-4m-4 4l-4-4" {...common}/><path d="M5 19h14" {...common}/></svg>;
    case "check":
      return <svg style={s} viewBox={v} className={className}><path d="M5 12.5l4.5 4.5L19 7" {...common}/></svg>;
    case "star":
      return <svg style={s} viewBox={v} className={className}><path d="M12 4l2.3 4.9 5.2.7-3.8 3.6 1 5.2L12 16.9 7.3 18.4l1-5.2L4.5 9.6l5.2-.7L12 4z" fill="currentColor" stroke="none"/></svg>;
    case "grid":
      return <svg style={s} viewBox={v} className={className}><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" {...common}/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" {...common}/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" {...common}/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" {...common}/></svg>;
    case "heart":
      return <svg style={s} viewBox={v} className={className}><path d="M12 20s-7-4.4-7-9.3A3.7 3.7 0 0 1 12 7a3.7 3.7 0 0 1 7 3.7C19 15.6 12 20 12 20z" {...common}/></svg>;
    case "dots":
      return <svg style={s} viewBox={v} className={className}><circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>;
    default:
      return null;
  }
}
window.Icon = Icon;
