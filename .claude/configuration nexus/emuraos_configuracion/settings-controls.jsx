// settings-controls.jsx — NEXUS settings widgets. Exposes window.SettingsControl.

function Toggle({ value, onChange, disabled }) {
  return (
    <button className="ct-toggle" data-on={value ? "1" : "0"} role="switch" aria-checked={!!value}
      disabled={disabled} onClick={() => onChange(!value)}><i /></button>
  );
}

function DropdownMenu({ value, options, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="ct-dd" ref={ref}>
      <button className="ct-dd-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span>{value}</span><Icon name="chevron-down" size={16} />
      </button>
      {open && (
        <div className="ct-dd-menu" role="listbox">
          {options.map((o) => (
            <button key={o} className={"ct-dd-opt" + (o === value ? " sel" : "")} role="option" aria-selected={o === value}
              onClick={() => { onChange(o); setOpen(false); }}>
              <span>{o}</span>{o === value && <span className="ct-dd-check"><Icon name="check" size={15} /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Selector({ value, options, onChange }) {
  const i = Math.max(0, options.indexOf(value));
  const go = (d) => onChange(options[(i + d + options.length) % options.length]);
  return (
    <div className="ct-sel" role="group">
      <button className="ct-sel-arrow" aria-label="Anterior" onClick={() => go(-1)}><Icon name="chevron-left" size={18} /></button>
      <span className="ct-sel-val">{value}</span>
      <button className="ct-sel-arrow" aria-label="Siguiente" onClick={() => go(1)}><Icon name="chevron-right" size={18} /></button>
    </div>
  );
}

function Slider({ row, value, onChange }) {
  return (
    <div className="ct-slider-wrap">
      <input type="range" className="ct-slider" min={row.min} max={row.max} step={row.step}
        value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(90deg, var(--accent) ${((value - row.min) / (row.max - row.min)) * 100}%, var(--panel-3) ${((value - row.min) / (row.max - row.min)) * 100}%)` }} />
      <span className="ct-slider-val">{value}{row.unit || ""}</span>
    </div>
  );
}

function ActionButton({ row, onAction, disabled, playSound }) {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [doneStatus, setDoneStatus] = React.useState(null);
  React.useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3500);
    return () => clearTimeout(t);
  }, [confirming]);

  const click = () => {
    if (row.confirmLabel && !confirming) { setConfirming(true); playSound && playSound("toggle"); return; }
    setConfirming(false);
    if (row.busyStatus) {
      setBusy(true); setDoneStatus(null); playSound && playSound("select");
      setTimeout(() => { setBusy(false); setDoneStatus(row.doneStatus || "Hecho ✓"); }, 1800);
    } else {
      playSound && playSound("select");
      setDoneStatus(row.doneStatus || null);
    }
    onAction && onAction(row);
  };

  const cls = confirming ? "confirm" : (row.variant || "ghost");
  const label = confirming ? row.confirmLabel : (busy ? row.busyStatus : row.btnLabel || "Acción");
  const status = doneStatus || row.status;
  return (
    <>
      {status && <span className={"ct-status " + (row.statusTone || "")}>{status}</span>}
      <button className={"ct-btn " + cls} disabled={disabled || busy} onClick={click}>
        {row.icon && !busy && <Icon name={row.icon} size={16} />}{label}
      </button>
    </>
  );
}

function InfoControl({ row, value }) {
  if (row.column) {
    return <div className={"ct-info-col " + (row.tone || "")} style={{ whiteSpace: "pre-line" }}>{value}</div>;
  }
  return <span className={"ct-info " + (row.tone || "")}>{value}</span>;
}

function FolderControl({ row, value, onChange }) {
  return (
    <div className="ct-field-wrap">
      <div className="ct-field-row">
        <input className="ct-input mono" value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
        <button className="ct-icon-btn" title="Examinar" onClick={() => {}}><Icon name="folder" size={18} /></button>
        {row.openable && <button className="ct-icon-btn" title="Abrir en explorador" onClick={() => {}}><Icon name="folder-open" size={18} /></button>}
      </div>
      {row.hint && <div className="ct-hint">{row.hint}</div>}
    </div>
  );
}

function PathControl({ row, value, onChange }) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="ct-field-wrap">
      <div className="ct-field-row">
        <input className="ct-input mono" type={row.secret && !show ? "password" : "text"} value={value}
          spellCheck={false} placeholder={row.secret ? "••••••••" : ""} onChange={(e) => onChange(e.target.value)} />
        {row.secret && (
          <button className="ct-icon-btn" title={show ? "Ocultar" : "Mostrar"} onClick={() => setShow((s) => !s)}>
            <Icon name={show ? "eye-off" : "eye"} size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function ColorControl({ row, value, onChange }) {
  const isDefault = (value || "").toLowerCase() === (row.defaultValue || "").toLowerCase();
  return (
    <div className="ct-color">
      <span className="ct-color-hex">{(value || "").toUpperCase()}</span>
      <label className="ct-swatch" style={{ background: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      <button className="ct-reset" title="Restablecer" disabled={isDefault} onClick={() => onChange(row.defaultValue)}>
        <Icon name="reset" size={15} />
      </button>
    </div>
  );
}

// Dispatcher
function SettingsControl({ row, value, onChange, disabled, onAction, playSound }) {
  switch (row.kind) {
    case "toggle": return <Toggle value={value} onChange={onChange} disabled={disabled} />;
    case "dropdown":
      return row.variant === "selector"
        ? <Selector value={value} options={row.options} onChange={onChange} />
        : <DropdownMenu value={value} options={row.options} onChange={onChange} />;
    case "slider": return <Slider row={row} value={value} onChange={onChange} />;
    case "button": return <ActionButton row={row} onAction={onAction} disabled={disabled} playSound={playSound} />;
    case "info": return <InfoControl row={row} value={value} />;
    case "folder": return <FolderControl row={row} value={value} onChange={onChange} />;
    case "path": return <PathControl row={row} value={value} onChange={onChange} />;
    case "color": return <ColorControl row={row} value={value} onChange={onChange} />;
    default: return null;
  }
}

window.SettingsControl = SettingsControl;
