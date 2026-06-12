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
    case "gear":
      return <svg style={s} viewBox={v} className={className}><circle cx="12" cy="12" r="3.2" {...common}/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" {...common}/></svg>;
    case "palette":
      return <svg style={s} viewBox={v} className={className}><path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-1.8 0-.6-.4-1-.4-1.6 0-.7.6-1.2 1.3-1.2H16a5 5 0 0 0 5-5c0-4.4-4-8.4-9-8.4z" {...common}/><circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="11" cy="7.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none"/></svg>;
    case "books":
      return <svg style={s} viewBox={v} className={className}><path d="M5 4h5v16H5zM10 6l5-1 3 14-5 1z" {...common}/><path d="M7.5 4v16" {...common}/></svg>;
    case "image":
      return <svg style={s} viewBox={v} className={className}><rect x="4" y="5" width="16" height="14" rx="2.5" {...common}/><circle cx="9" cy="10" r="1.6" {...common}/><path d="M5 16l4-3 3 2 3-3 4 4" {...common}/></svg>;
    case "folder":
      return <svg style={s} viewBox={v} className={className}><path d="M4 7a2 2 0 0 1 2-2h3.5l2 2H18a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" {...common}/></svg>;
    case "folder-open":
      return <svg style={s} viewBox={v} className={className}><path d="M4 8a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v1H4z" {...common}/><path d="M4 11h17l-2 7a1.5 1.5 0 0 1-1.4 1H5a1.5 1.5 0 0 1-1.5-1.5z" {...common}/></svg>;
    case "gamepad":
      return <svg style={s} viewBox={v} className={className}><path d="M7 8h10a4 4 0 0 1 4 4 3.4 3.4 0 0 1-6 2.2l-.5-.7h-3l-.5.7A3.4 3.4 0 0 1 3 12a4 4 0 0 1 4-4z" {...common}/><path d="M7.5 11v2M6.5 12h2" {...common}/><circle cx="15.5" cy="11.2" r=".9" fill="currentColor" stroke="none"/><circle cx="17" cy="13" r=".9" fill="currentColor" stroke="none"/></svg>;
    case "wrench":
      return <svg style={s} viewBox={v} className={className}><path d="M15.5 7.5a3.5 3.5 0 0 1-4.6 4.6l-5.2 5.2a1.6 1.6 0 0 0 2.2 2.2l5.2-5.2a3.5 3.5 0 0 1 4.6-4.6l-2.3 2.3-.2 2 2-.2 2.3-2.3a3.5 3.5 0 0 1-.5-1z" {...common}/></svg>;
    case "chevron-down":
      return <svg style={s} viewBox={v} className={className}><path d="M6 9l6 6 6-6" {...common}/></svg>;
    case "external":
      return <svg style={s} viewBox={v} className={className}><path d="M14 5h5v5M19 5l-8 8M11 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" {...common}/></svg>;
    case "eye":
      return <svg style={s} viewBox={v} className={className}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...common}/><circle cx="12" cy="12" r="2.8" {...common}/></svg>;
    case "eye-off":
      return <svg style={s} viewBox={v} className={className}><path d="M4 5l16 14" {...common}/><path d="M9.5 9.6A2.8 2.8 0 0 0 12 14.8c.7 0 1.3-.2 1.8-.6M6.3 7.2C3.9 8.7 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.4 0 2.6-.3 3.7-.8M10 5.7A8.7 8.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.3 3" {...common}/></svg>;
    case "refresh":
      return <svg style={s} viewBox={v} className={className}><path d="M20 11a8 8 0 0 0-14-4.5L4 8M4 4v4h4" {...common}/><path d="M4 13a8 8 0 0 0 14 4.5L20 16M20 20v-4h-4" {...common}/></svg>;
    case "back":
      return <svg style={s} viewBox={v} className={className}><path d="M11 5l-7 7 7 7M4 12h16" {...common}/></svg>;
    case "reset":
      return <svg style={s} viewBox={v} className={className}><path d="M4 4v5h5" {...common}/><path d="M4.5 9a8 8 0 1 1-1.5 5.5" {...common}/></svg>;
    case "plug":
      return <svg style={s} viewBox={v} className={className}><path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5" {...common}/></svg>;
    case "warn":
      return <svg style={s} viewBox={v} className={className}><path d="M12 4l9 16H3z" {...common}/><path d="M12 10v4" {...common}/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/></svg>;
    case "info":
      return <svg style={s} viewBox={v} className={className}><circle cx="12" cy="12" r="8.5" {...common}/><path d="M12 11v5" {...common}/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/></svg>;
    case "controller-dl":
      return <svg style={s} viewBox={v} className={className}><path d="M12 3v8m0 0l3-3m-3 3L9 8" {...common}/><path d="M5 14h14" {...common}/><path d="M6 18h12" {...common}/></svg>;
    default:
      return null;
  }
}
window.Icon = Icon;
