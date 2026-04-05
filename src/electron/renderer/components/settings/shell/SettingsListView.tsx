import { useEffect, useRef, type ReactElement } from "react";
import type {
  Setting,
  SettingsContext,
  SettingsGroup,
} from "../../../schemas/settings-schema-types";
import { ToggleRow } from "../widgets/ToggleRow";
import { DropdownRow } from "../widgets/DropdownRow";
import { SliderRow } from "../widgets/SliderRow";
import { ButtonRow } from "../widgets/ButtonRow";
import { InfoRow } from "../widgets/InfoRow";
import { FolderRow } from "../widgets/FolderRow";
import { PathRow } from "../widgets/PathRow";

interface Props {
  groups: SettingsGroup[];
  ctx: SettingsContext;
  focusedRowIndex: number;
  regionFocused: boolean;
  onRowActivate: (index: number) => void;
}

/**
 * Generic renderer: walks the groups, flattens to visible rows, and
 * dispatches each row to the matching widget. Tracks a flat focus index
 * that maps into the visible rows.
 */
export function SettingsListView({
  groups,
  ctx,
  focusedRowIndex,
  regionFocused,
  onRowActivate,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Flatten groups → [{ group, row, flatIndex }]
  const visibleRows: Array<{ group: SettingsGroup; row: Setting }> = [];
  for (const group of groups) {
    for (const row of group.rows) {
      if (row.hidden) continue;
      visibleRows.push({ group, row });
    }
  }

  // Scroll the focused row into view when focus moves.
  useEffect(() => {
    if (!regionFocused) return;
    const el = rowRefs.current[focusedRowIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedRowIndex, regionFocused]);

  // Group rows by their parent group for rendering with titles.
  const byGroup = new Map<string, Array<{ row: Setting; flatIndex: number }>>();
  visibleRows.forEach(({ group, row }, flatIndex) => {
    const list = byGroup.get(group.id) ?? [];
    list.push({ row, flatIndex });
    byGroup.set(group.id, list);
  });

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-6 py-6"
    >
      <div className="mx-auto max-w-3xl">
        {groups.map((group) => {
          const rows = byGroup.get(group.id) ?? [];
          if (rows.length === 0) return null;
          return (
            <section
              key={group.id}
              style={{ marginBottom: "var(--spacing-group)" }}
            >
              {group.title && (
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  {group.title}
                </h2>
              )}
              {group.description && (
                <p className="mb-3 text-xs text-muted">{group.description}</p>
              )}
              <div>
                {rows.map(({ row, flatIndex }) => (
                  <div
                    key={row.id}
                    ref={(el) => {
                      rowRefs.current[flatIndex] = el;
                    }}
                    onMouseEnter={() => onRowActivate(flatIndex)}
                  >
                    {renderRow(row, ctx, regionFocused && flatIndex === focusedRowIndex)}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function renderRow(
  row: Setting,
  ctx: SettingsContext,
  focused: boolean
): ReactElement {
  switch (row.kind) {
    case "toggle":
      return <ToggleRow setting={row} ctx={ctx} focused={focused} />;
    case "dropdown":
      // The generic narrows to the union member being rendered; the
      // widget itself is parameterised on `SettingValue` so it can host
      // any dropdown shape.
      return (
        <DropdownRow
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setting={row as any}
          ctx={ctx}
          focused={focused}
        />
      );
    case "slider":
      return <SliderRow setting={row} ctx={ctx} focused={focused} />;
    case "button":
      return <ButtonRow setting={row} ctx={ctx} focused={focused} />;
    case "info":
      return <InfoRow setting={row} ctx={ctx} focused={focused} />;
    case "folder":
      return <FolderRow setting={row} ctx={ctx} focused={focused} />;
    case "path":
      return <PathRow setting={row} ctx={ctx} focused={focused} />;
    default: {
      // Exhaustiveness check
      const _never: never = row;
      void _never;
      return <div />;
    }
  }
}

/** Count visible rows (non-hidden) across all groups. */
export function countVisibleRows(groups: SettingsGroup[]): number {
  let n = 0;
  for (const g of groups) {
    for (const r of g.rows) {
      if (!r.hidden) n++;
    }
  }
  return n;
}
