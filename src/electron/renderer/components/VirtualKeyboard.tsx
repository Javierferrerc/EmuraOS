import "./VirtualKeyboard.css";

export type VirtualKeyAction =
  | { type: "char"; value: string }
  | { type: "shift" }
  | { type: "space" }
  | { type: "backspace" }
  | { type: "done" };

export interface VirtualKey {
  action: VirtualKeyAction;
  label: string;
}

// Each character row has exactly 10 keys so column-to-column navigation
// between rows is straightforward. The last row is an action row with
// 4 variable-width keys (Shift, Space, Backspace, Done).
const LOWER_ROWS: VirtualKey[][] = [
  "1234567890".split("").map((c) => ({ action: { type: "char", value: c }, label: c })),
  "qwertyuiop".split("").map((c) => ({ action: { type: "char", value: c }, label: c })),
  "asdfghjkl'".split("").map((c) => ({ action: { type: "char", value: c }, label: c })),
  "zxcvbnm,.-".split("").map((c) => ({ action: { type: "char", value: c }, label: c })),
];

const UPPER_ROWS: VirtualKey[][] = [
  "!@#$%^&*()".split("").map((c) => ({ action: { type: "char", value: c }, label: c })),
  "QWERTYUIOP".split("").map((c) => ({ action: { type: "char", value: c }, label: c })),
  "ASDFGHJKL\"".split("").map((c) => ({ action: { type: "char", value: c }, label: c })),
  "ZXCVBNM<>_".split("").map((c) => ({ action: { type: "char", value: c }, label: c })),
];

const ACTION_ROW: VirtualKey[] = [
  { action: { type: "shift" }, label: "Shift" },
  { action: { type: "space" }, label: "Space" },
  { action: { type: "backspace" }, label: "⌫" },
  { action: { type: "done" }, label: "Done" },
];

export function getKeyboardRows(shift: boolean): VirtualKey[][] {
  return [...(shift ? UPPER_ROWS : LOWER_ROWS), ACTION_ROW];
}

export interface KeyboardCursor {
  row: number;
  col: number;
}

interface VirtualKeyboardProps {
  cursor: KeyboardCursor;
  shift: boolean;
  onKeyClick?: (row: number, col: number) => void;
}

export function VirtualKeyboard({ cursor, shift, onKeyClick }: VirtualKeyboardProps) {
  const rows = getKeyboardRows(shift);

  return (
    <div
      className="virtual-keyboard"
      // Prevent the document-level mousedown handler (which deactivates focus
      // and exits text-input mode) from firing when the user clicks keys,
      // and prevent default so the search input doesn't lose focus (which
      // would also exit text-input mode via its onBlur handler).
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <div className="virtual-keyboard-inner">
        {rows.map((row, rIdx) => {
          const isActionRow = rIdx === rows.length - 1;
          return (
            <div
              key={rIdx}
              className={`vk-row ${isActionRow ? "vk-action-row" : "vk-char-row"}`}
            >
              {row.map((key, cIdx) => {
                const isFocused = cursor.row === rIdx && cursor.col === cIdx;
                const isShiftActive = shift && key.action.type === "shift";
                return (
                  <button
                    key={cIdx}
                    type="button"
                    onClick={() => onKeyClick?.(rIdx, cIdx)}
                    className={`vk-key vk-key-${key.action.type} ${
                      isFocused ? "vk-key-focused" : ""
                    } ${isShiftActive ? "vk-key-active" : ""}`}
                  >
                    {key.label}
                  </button>
                );
              })}
            </div>
          );
        })}
        <div className="vk-hint">
          D-Pad: Move &nbsp;·&nbsp; A: Select &nbsp;·&nbsp; B: Close
        </div>
      </div>
    </div>
  );
}
