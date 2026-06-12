// settings-rows.jsx — reusable RowView + GroupView. Exposes window.RowView, window.GroupView.

function RowView({ row, value, setValue, focused, onFocus, disabled, playSound, onAction, innerRef }) {
  const cls = ["set-row"];
  if (focused) cls.push("is-focused");
  if (disabled) cls.push("disabled");
  if (row.kind === "info" && row.variant !== "plain") cls.push("info-glass");
  if (row.column) cls.push("col", "info-col");
  return (
    <div className={cls.join(" ")} ref={innerRef} data-rowid={row.id}
      onMouseEnter={onFocus}>
      <div className="set-row-main">
        <div className="set-row-label">{row.label}</div>
        {row.description && <div className="set-row-desc">{row.description}</div>}
      </div>
      <div className="set-row-ctrl">
        <SettingsControl row={row} value={value}
          onChange={(v) => setValue(row.id, v)}
          disabled={disabled} onAction={onAction} playSound={playSound} />
      </div>
    </div>
  );
}

function GroupView({ group, renderRow }) {
  const [open, setOpen] = React.useState(!group.collapsed);
  const hasHead = group.title || group.description || group.collapsible;
  return (
    <div className="set-group">
      {hasHead && (
        <div className="set-group-head">
          <div className="set-group-htxt">
            {group.title && <h2>{group.title}</h2>}
            {group.description && <p>{group.description}</p>}
          </div>
          {group.collapsible && (
            <button className={"set-collapse-btn" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Colapsar" : "Expandir"}>
              <Icon name="chevron-down" size={16} />
            </button>
          )}
        </div>
      )}
      {(!group.collapsible || open) && (
        <div className="set-rows">
          {group.rows.map((r) => renderRow(r))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { RowView, GroupView });
