/**
 * NEXUS settings controls — the design's widgets (Toggle, Dropdown, Selector,
 * Slider, Button, Info, Folder, Path, Color) wired to the REAL schema Settings.
 * Each control reads `setting.get(ctx)` and writes `setting.set(value, ctx)`
 * (which routes through the staging layer); buttons call `setting.run(ctx)`.
 */

import { useEffect, useRef, useState } from "react";
import type {
  Setting,
  SettingsContext,
  SettingValue,
} from "../../schemas/settings-schema-types";
import { SetIcon } from "./SetIcon";

interface ControlProps {
  setting: Setting;
  ctx: SettingsContext;
  disabled: boolean;
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <button className="ct-toggle" data-on={value ? "1" : "0"} role="switch" aria-checked={value} disabled={disabled} onClick={() => onChange(!value)}>
      <i />
    </button>
  );
}

function DropdownMenu({
  value,
  options,
  onChange,
}: {
  value: SettingValue;
  options: Array<{ value: SettingValue; label: string }>;
  onChange: (v: SettingValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const current = options.find((o) => o.value === value);
  return (
    <div className="ct-dd" ref={ref}>
      <button className="ct-dd-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span>{current?.label ?? String(value)}</span>
        <SetIcon name="chevron-down" size={16} />
      </button>
      {open && (
        <div className="ct-dd-menu" role="listbox">
          {options.map((o) => (
            <button
              key={String(o.value)}
              className={"ct-dd-opt" + (o.value === value ? " sel" : "")}
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              {o.value === value && (
                <span className="ct-dd-check">
                  <SetIcon name="check" size={15} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Selector({
  value,
  options,
  onChange,
}: {
  value: SettingValue;
  options: Array<{ value: SettingValue; label: string }>;
  onChange: (v: SettingValue) => void;
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const go = (d: number) => onChange(options[(i + d + options.length) % options.length].value);
  return (
    <div className="ct-sel" role="group">
      <button className="ct-sel-arrow" aria-label="Anterior" onClick={() => go(-1)}>
        <SetIcon name="chevron-left" size={18} />
      </button>
      <span className="ct-sel-val">{options[i]?.label ?? String(value)}</span>
      <button className="ct-sel-arrow" aria-label="Siguiente" onClick={() => go(1)}>
        <SetIcon name="chevron-right" size={18} />
      </button>
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="ct-slider-wrap">
      <input
        type="range"
        className="ct-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(90deg, var(--accent) ${pct}%, var(--panel-3) ${pct}%)` }}
      />
      <span className="ct-slider-val">{value}</span>
    </div>
  );
}

function ActionButton({ setting, ctx, disabled }: { setting: Extract<Setting, { kind: "button" }>; ctx: SettingsContext; disabled: boolean }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3500);
    return () => clearTimeout(t);
  }, [confirming]);

  const status = setting.status?.(ctx) ?? null;
  const click = async () => {
    if (setting.confirmLabel && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    await setting.run(ctx);
  };
  const cls = confirming ? "confirm" : setting.variant ?? "ghost";
  const label = confirming ? setting.confirmLabel : setting.label;
  return (
    <>
      {status && <span className="ct-status">{status}</span>}
      <button className={"ct-btn " + cls} disabled={disabled} onClick={click}>
        {label}
      </button>
    </>
  );
}

function InfoControl({ setting, ctx }: { setting: Extract<Setting, { kind: "info" }>; ctx: SettingsContext }) {
  const value = setting.value(ctx);
  const tone = setting.tone && setting.tone !== "default" ? setting.tone : "";
  if (setting.column) {
    return (
      <div className={"ct-info-col " + tone} style={{ whiteSpace: "pre-line" }}>
        {value}
      </div>
    );
  }
  return <span className={"ct-info " + tone}>{value}</span>;
}

function FolderControl({
  value,
  hint,
  openable,
  onChange,
}: {
  value: string;
  hint?: string;
  openable?: boolean;
  onChange: (v: string) => void;
}) {
  const browse = async () => {
    try {
      const picked = await window.electronAPI.pickFolder();
      if (picked) onChange(picked);
    } catch (err) {
      console.warn("pickFolder failed:", err);
    }
  };
  const open = async () => {
    try {
      await window.electronAPI.openFolder(hint || value);
    } catch (err) {
      console.warn("openFolder failed:", err);
    }
  };
  return (
    <div className="ct-field-wrap">
      <div className="ct-field-row">
        <input className="ct-input mono" value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
        <button className="ct-icon-btn" title="Examinar" onClick={browse}>
          <SetIcon name="folder" size={18} />
        </button>
        {openable && (
          <button className="ct-icon-btn" title="Abrir en explorador" onClick={open}>
            <SetIcon name="folder-open" size={18} />
          </button>
        )}
      </div>
      {hint && <div className="ct-hint">{hint}</div>}
    </div>
  );
}

function PathControl({
  value,
  secret,
  onChange,
}: {
  value: string;
  secret?: boolean;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="ct-field-wrap">
      <div className="ct-field-row">
        <input
          className="ct-input mono"
          type={secret && !show ? "password" : "text"}
          value={value}
          spellCheck={false}
          placeholder={secret ? "••••••••" : ""}
          onChange={(e) => onChange(e.target.value)}
        />
        {secret && (
          <button className="ct-icon-btn" title={show ? "Ocultar" : "Mostrar"} onClick={() => setShow((s) => !s)}>
            <SetIcon name={show ? "eye-off" : "eye"} size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function ColorControl({
  value,
  defaultValue,
  onChange,
}: {
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
}) {
  const isDefault = (value || "").toLowerCase() === (defaultValue || "").toLowerCase();
  return (
    <div className="ct-color">
      <span className="ct-color-hex">{(value || "").toUpperCase()}</span>
      <label className="ct-swatch" style={{ background: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      <button className="ct-reset" title="Restablecer" disabled={isDefault} onClick={() => onChange(defaultValue)}>
        <SetIcon name="reset" size={15} />
      </button>
    </div>
  );
}

export function SettingControl({ setting, ctx, disabled }: ControlProps) {
  switch (setting.kind) {
    case "toggle":
      return <Toggle value={setting.get(ctx)} onChange={(v) => setting.set(v, ctx)} disabled={disabled} />;
    case "dropdown":
      return setting.variant === "selector" ? (
        <Selector value={setting.get(ctx)} options={setting.options} onChange={(v) => setting.set(v as never, ctx)} />
      ) : (
        <DropdownMenu value={setting.get(ctx)} options={setting.options} onChange={(v) => setting.set(v as never, ctx)} />
      );
    case "slider":
      return (
        <Slider
          value={setting.get(ctx)}
          min={setting.min}
          max={setting.max}
          step={setting.step ?? 1}
          onChange={(v) => setting.set(v, ctx)}
        />
      );
    case "button":
      return <ActionButton setting={setting} ctx={ctx} disabled={disabled} />;
    case "info":
      return <InfoControl setting={setting} ctx={ctx} />;
    case "folder":
      return (
        <FolderControl
          value={setting.get(ctx)}
          hint={setting.hint?.(ctx)}
          openable={setting.openable}
          onChange={(v) => setting.set(v, ctx)}
        />
      );
    case "path":
      return <PathControl value={setting.get(ctx)} secret={setting.secret} onChange={(v) => setting.set(v, ctx)} />;
    case "color":
      return (
        <ColorControl value={setting.get(ctx)} defaultValue={setting.defaultValue} onChange={(v) => setting.set(v, ctx)} />
      );
    default:
      return null;
  }
}
