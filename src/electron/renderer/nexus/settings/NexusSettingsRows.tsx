/**
 * NEXUS settings rows — RowView + GroupView. Mirror the design's row/group
 * markup, fed by the real schema Settings + SettingsContext.
 */

import { useState } from "react";
import type {
  Setting,
  SettingsContext,
  SettingsGroup,
} from "../../schemas/settings-schema-types";
import { SettingControl } from "./NexusSettingsControls";
import { SetIcon } from "./SetIcon";

export function resolveDisabled(setting: Setting, ctx: SettingsContext): boolean {
  if (typeof setting.disabled === "function") return setting.disabled(ctx);
  return !!setting.disabled;
}

interface RowProps {
  setting: Setting;
  ctx: SettingsContext;
  focused: boolean;
  onHover: () => void;
  innerRef?: (el: HTMLDivElement | null) => void;
}

export function RowView({ setting, ctx, focused, onHover, innerRef }: RowProps) {
  const disabled = resolveDisabled(setting, ctx);
  const isInfo = setting.kind === "info";
  const isColumn = isInfo && (setting as Extract<Setting, { kind: "info" }>).column;
  const cls = ["set-row"];
  if (focused) cls.push("is-focused");
  if (disabled) cls.push("disabled");
  if (isInfo) cls.push("info-glass");
  if (isColumn) cls.push("col", "info-col");

  return (
    <div className={cls.join(" ")} ref={innerRef} data-rowid={setting.id} onMouseEnter={onHover}>
      <div className="set-row-main">
        <div className="set-row-label">{setting.label}</div>
        {setting.description && <div className="set-row-desc">{setting.description}</div>}
      </div>
      <div className="set-row-ctrl">
        <SettingControl setting={setting} ctx={ctx} disabled={disabled} />
      </div>
    </div>
  );
}

interface GroupProps {
  group: SettingsGroup;
  renderRow: (setting: Setting) => React.ReactNode;
}

export function GroupView({ group, renderRow }: GroupProps) {
  const [open, setOpen] = useState(!group.collapsible);
  const hasHead = group.title || group.description || group.collapsible;
  const rows = group.rows.filter((r) => !r.hidden);
  return (
    <div className="set-group">
      {hasHead && (
        <div className="set-group-head">
          <div className="set-group-htxt">
            {group.title && <h2>{group.title}</h2>}
            {group.description && <p>{group.description}</p>}
          </div>
          {group.collapsible && (
            <button
              className={"set-collapse-btn" + (open ? " open" : "")}
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Colapsar" : "Expandir"}
            >
              <SetIcon name="chevron-down" size={16} />
            </button>
          )}
        </div>
      )}
      {(!group.collapsible || open) && <div className="set-rows">{rows.map((r) => renderRow(r))}</div>}
    </div>
  );
}
