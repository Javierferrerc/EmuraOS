import { useEffect, useRef, type MutableRefObject, type ReactElement } from "react";
import type {
  Setting,
  SettingsContext,
  SettingsGroup,
} from "../../../schemas/settings-schema-types";
import { ToggleRow } from "../widgets/ToggleRow";
import { DropdownRow } from "../widgets/DropdownRow";
import { SelectorRow } from "../widgets/SelectorRow";
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
  activateRef?: MutableRefObject<(() => void) | null>;
  /** When true, disables overflow clipping so absolute children (dropdowns) can float. */
  overflowVisible?: boolean;
  /** When true, removes own padding (for use inside an already-padded container like the wizard). */
  noPadding?: boolean;
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
  activateRef,
  overflowVisible,
  noPadding,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const mouseNavRef = useRef(false);

  // Flatten groups → visible rows. Focusable rows get a flatIndex for
  // gamepad/keyboard navigation; nonFocusable rows render but are skipped.
  const allVisible: Array<{ group: SettingsGroup; row: Setting; flatIndex: number | null }> = [];
  let focusIdx = 0;
  for (const group of groups) {
    for (const row of group.rows) {
      if (row.hidden) continue;
      if (row.nonFocusable) {
        allVisible.push({ group, row, flatIndex: null });
      } else {
        allVisible.push({ group, row, flatIndex: focusIdx });
        focusIdx++;
      }
    }
  }

  // Scroll the focused row into view only for gamepad/keyboard navigation.
  useEffect(() => {
    if (!regionFocused) return;
    if (mouseNavRef.current) {
      mouseNavRef.current = false;
      return;
    }
    const el = rowRefs.current[focusedRowIndex];
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusedRowIndex, regionFocused]);

  // Wire activateRef to the focused row's action.
  useEffect(() => {
    if (!activateRef) return;
    const entry = allVisible.find((v) => v.flatIndex === focusedRowIndex);
    const row = entry?.row;
    if (!row || !regionFocused) {
      activateRef.current = null;
      return;
    }
    switch (row.kind) {
      case "toggle":
        activateRef.current = () => { void row.set(!row.get(ctx), ctx); };
        break;
      case "button":
        activateRef.current = () => { void row.run(ctx); };
        break;
      case "folder":
        activateRef.current = () => {
          window.electronAPI.pickFolder().then((picked) => {
            if (picked) void row.set(picked, ctx);
          }).catch(() => {});
        };
        break;
      case "dropdown":
        if (row.variant === "selector") {
          activateRef.current = () => {
            document.dispatchEvent(new CustomEvent("selector-nav", { detail: "right" }));
          };
        } else {
          activateRef.current = () => {
            document.dispatchEvent(new CustomEvent("dropdown-nav", { detail: "open" }));
          };
        }
        break;
      default:
        activateRef.current = null;
    }
  }, [focusedRowIndex, regionFocused, allVisible, ctx, activateRef]);

  // Group rows by their parent group for rendering with titles.
  const byGroup = new Map<string, Array<{ row: Setting; flatIndex: number | null }>>();
  for (const entry of allVisible) {
    const list = byGroup.get(entry.group.id) ?? [];
    list.push({ row: entry.row, flatIndex: entry.flatIndex });
    byGroup.set(entry.group.id, list);
  }

  return (
    <div
      ref={containerRef}
      className={`flex-1 ${noPadding ? "px-2 py-2" : "px-6 py-6"} ${overflowVisible ? "overflow-visible" : "overflow-y-auto"}`}
    >
      <div>
        {groups.map((group) => {
          const rows = byGroup.get(group.id) ?? [];
          if (rows.length === 0 && !group.title && !group.description) return null;
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
                <p className="mb-3 text-xs text-muted">
                  {renderDescription(group.description)}
                </p>
              )}
              <div>
                {rows.map(({ row, flatIndex }) => (
                  <div
                    key={row.id}
                    ref={flatIndex != null ? (el) => { rowRefs.current[flatIndex] = el; } : undefined}
                    onMouseEnter={flatIndex != null ? () => { mouseNavRef.current = true; onRowActivate(flatIndex); } : undefined}
                  >
                    {renderRow(row, ctx, flatIndex != null && regionFocused && flatIndex === focusedRowIndex)}
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

/** Highlight a leading "Word:" prefix in white if present. */
function renderDescription(text: string) {
  const match = text.match(/^(\S+:)\s/);
  if (!match) return text;
  return (
    <>
      <span className="text-primary font-medium">{match[1]}</span>{" "}
      {text.slice(match[0].length)}
    </>
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
      if (row.variant === "selector") {
        return (
          <SelectorRow
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setting={row as any}
            ctx={ctx}
            focused={focused}
          />
        );
      }
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

/** Count focusable visible rows (non-hidden, non-nonFocusable) across all groups. */
export function countVisibleRows(groups: SettingsGroup[]): number {
  let n = 0;
  for (const g of groups) {
    for (const r of g.rows) {
      if (!r.hidden && !r.nonFocusable) n++;
    }
  }
  return n;
}
