// QuickMenu.tsx — EMURA menú rápido (Esc). Faithful React+TS port of the
// handoff `quick-menu.jsx` (source of truth). Variants: grid | dock | rail |
// command. All four share the same options, confirm dialogs and power-off fade;
// only the chrome differs. Mounted by the app's global Esc listener.
//
// Integration adaptations (behaviour-preserving, visuals untouched):
//   • Rendered through a portal into <body>, like the other overlays.
//   • The keydown listener runs in the capture phase and calls
//     stopImmediatePropagation() for the keys it handles, so the library /
//     NEXUS grid behind the menu can't double-react to arrows / Enter.
//   • Icons come from the local trimmed `./icons`; the EMURA mark is the
//     existing renderer asset (no duplicate copy).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type QuickMenuIconName } from "./icons";
import emuraMark from "../../assets/emura-mark.png";
import "./quick-menu.css";

export type QuickMenuVariant = "grid" | "dock" | "rail" | "command";

export interface QuickMenuProfile {
  name: string;
  hue: number;
  avatar?: string;
}

export interface QuickMenuProps {
  profile?: QuickMenuProfile;
  variant?: QuickMenuVariant;
  onResume?: () => void;
  onSwitchUser?: () => void;
  onSettings?: () => void;
  onQuit?: () => void;
}

interface QuickMenuOption {
  id: string;
  icon: QuickMenuIconName;
  cls: string;
  title: string;
  sub: string;
  act: () => void;
}

function qmOrb(hue: number): React.CSSProperties {
  return {
    background: `radial-gradient(circle at 34% 28%, oklch(0.88 0.10 ${hue}), oklch(0.64 0.20 ${hue}) 46%, oklch(0.34 0.12 ${hue}) 100%)`,
  };
}
function qmTint(hue: number): string {
  return `oklch(0.66 0.19 ${hue})`;
}

export function QuickMenu({
  profile,
  variant = "grid",
  onResume,
  onSwitchUser,
  onQuit,
  onSettings,
}: QuickMenuProps) {
  const [confirm, setConfirm] = useState<null | "quit" | "switch">(null);
  const [poweroff, setPoweroff] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [focus, setFocus] = useState(0);
  const [q, setQ] = useState("");
  const p = profile || { name: "Alex", hue: 224 };
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (variant === "command")
      setTimeout(() => searchRef.current && searchRef.current.focus(), 60);
  }, [variant]);

  const ALL: QuickMenuOption[] = [
    { id: "resume", icon: "play", cls: "accent", title: "Reanudar", sub: "Volver a la biblioteca", act: () => onResume && onResume() },
    { id: "switch", icon: "user-plus", cls: "", title: "Cambiar de usuario", sub: "Elegir otro perfil", act: () => setConfirm("switch") },
    { id: "settings", icon: "settings", cls: "", title: "Ajustes", sub: "Preferencias de EMURA", act: () => onSettings && onSettings() },
    { id: "quit", icon: "power", cls: "danger", title: "Cerrar EMURA", sub: "Salir de la aplicación", act: () => setConfirm("quit") },
  ];
  const OPTS =
    variant === "command" && q.trim()
      ? ALL.filter((o) => (o.title + " " + o.sub).toLowerCase().includes(q.trim().toLowerCase()))
      : ALL;
  const cols = variant === "grid" ? 2 : 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (confirm) {
        // While a confirm dialog is up: Esc cancels; swallow nav keys so the
        // grid behind the menu can't react to them.
        if (e.key === "Escape") { stop(); setConfirm(null); }
        else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(e.key)) stop();
        return;
      }
      if (e.key === "Escape") { stop(); onResume && onResume(); }
      else if (e.key === "ArrowRight" && (variant === "grid" || variant === "dock")) { stop(); setFocus((f) => Math.min(OPTS.length - 1, f + 1)); }
      else if (e.key === "ArrowLeft" && (variant === "grid" || variant === "dock")) { stop(); setFocus((f) => Math.max(0, f - 1)); }
      else if (e.key === "ArrowDown") { stop(); setFocus((f) => Math.min(OPTS.length - 1, f + cols)); }
      else if (e.key === "ArrowUp") { stop(); setFocus((f) => Math.max(0, f - cols)); }
      else if (e.key === "Enter") { stop(); OPTS[focus] && OPTS[focus].act(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [confirm, focus, onResume, variant, OPTS, cols]);

  useEffect(() => {
    if (focus > OPTS.length - 1) setFocus(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [OPTS.length]);

  const doQuit = () => {
    setConfirm(null);
    setPoweroff(true);
    setTimeout(() => { onQuit && onQuit(); }, 1500);
  };
  const doSwitch = () => {
    setConfirm(null);
    onSwitchUser && onSwitchUser();
  };

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const dateStr = now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  const Avatar = () => (
    <div className="qm-ava">
      {p.avatar ? <img src={p.avatar} alt="" /> : <div className="qm-ava-orb" style={qmOrb(p.hue || 224)} />}
    </div>
  );

  // ── option renderers per variant ──
  const renderOpts = () =>
    OPTS.map((o, i) => (
      <button
        key={o.id}
        className={"qm-opt " + o.cls + (focus === i ? " focus" : "")}
        onMouseEnter={() => setFocus(i)}
        onClick={o.act}
      >
        <span className="qm-opt-ico"><Icon name={o.icon} size={22} /></span>
        <span className="qm-opt-txt"><b>{o.title}</b><span>{o.sub}</span></span>
      </button>
    ));

  let body: React.ReactNode;
  if (variant === "dock") {
    body = (
      <div className="qm-dock-wrap">
        <div className="qm-dock-head">
          <Avatar />
          <div className="qm-head-txt"><div className="lbl">Menú rápido · {p.name}</div><div className="name">{hh}:{mm}</div></div>
        </div>
        <div className="qm-dock">
          {OPTS.map((o, i) => (
            <button
              key={o.id}
              className={"qm-dock-opt " + o.cls + (focus === i ? " focus" : "")}
              onMouseEnter={() => setFocus(i)}
              onClick={o.act}
            >
              <span className="qm-dock-ico"><Icon name={o.icon} size={26} /></span>
              <span className="qm-dock-lbl">{o.title}</span>
            </button>
          ))}
        </div>
      </div>
    );
  } else if (variant === "rail") {
    body = (
      <div className="qm-rail">
        <div className="qm-head">
          <Avatar />
          <div className="qm-head-txt"><div className="lbl">Menú rápido</div><div className="name">{p.name}</div></div>
        </div>
        <div className="qm-rail-clock"><div className="t">{hh}:{mm}</div><div className="d">{dateStr}</div></div>
        <div className="qm-rail-list">{renderOpts()}</div>
      </div>
    );
  } else if (variant === "command") {
    body = (
      <div className="qm-cmd">
        <div className="qm-cmd-bar">
          <Icon name="search" size={20} />
          <input
            ref={searchRef}
            className="qm-cmd-input"
            value={q}
            onChange={(e) => { setQ(e.target.value); setFocus(0); }}
            placeholder="Escribe una acción…"
          />
        </div>
        <div className="qm-cmd-list">
          {OPTS.map((o, i) => (
            <button
              key={o.id}
              className={"qm-cmd-opt " + o.cls + (focus === i ? " focus" : "")}
              onMouseEnter={() => setFocus(i)}
              onClick={o.act}
            >
              <span className="qm-cmd-ico"><Icon name={o.icon} size={19} /></span>
              <span className="qm-cmd-txt"><b>{o.title}</b><span>{o.sub}</span></span>
            </button>
          ))}
          {OPTS.length === 0 && <div className="qm-cmd-empty">Sin resultados</div>}
        </div>
      </div>
    );
  } else {
    // grid
    body = (
      <div className="qm-panel">
        <div className="qm-head">
          <Avatar />
          <div className="qm-head-txt"><div className="lbl">Menú rápido</div><div className="name">{p.name}</div></div>
          <div className="qm-clock"><div className="t">{hh}:{mm}</div><div className="d">{dateStr}</div></div>
        </div>
        <div className="qm-grid">{renderOpts()}</div>
      </div>
    );
  }

  return createPortal(
    <>
      <div
        className={"qm qm-v-" + variant}
        style={{ ["--pcolor" as string]: qmTint(p.hue || 224) }}
        onMouseDown={(e) => { if (e.target === e.currentTarget && !confirm) onResume && onResume(); }}
      >
        {!confirm ? body : (
          <div className="qm-confirm">
            <div className="qm-confirm-body">
              <span className={"qm-confirm-ico " + (confirm === "quit" ? "danger" : "accent")}>
                <Icon name={confirm === "quit" ? "power" : "user-plus"} size={28} />
              </span>
              <h2>{confirm === "quit" ? "¿Cerrar EMURA?" : "¿Cambiar de usuario?"}</h2>
              <p>
                {confirm === "quit"
                  ? "Se cerrará la aplicación. Tu progreso ya está guardado."
                  : `Saldrás del perfil de ${p.name} y volverás al selector de perfiles.`}
              </p>
            </div>
            <div className="qm-confirm-foot">
              <button className="qm-cbtn ghost" onClick={() => setConfirm(null)}>Cancelar</button>
              {confirm === "quit" ? (
                <button className="qm-cbtn danger" onClick={doQuit}><Icon name="power" size={17} /> Cerrar</button>
              ) : (
                <button className="qm-cbtn accent" onClick={doSwitch}><Icon name="user-plus" size={17} /> Cambiar</button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={"qm-poweroff" + (poweroff ? " on" : "")}><img src={emuraMark} alt="" /></div>
    </>,
    document.body
  );
}
