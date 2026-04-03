import { useReducer, useCallback } from "react";

export type FocusRegion = "sidebar" | "grid";

export interface FocusState {
  region: FocusRegion;
  sidebarIndex: number;
  gridIndex: number;
  active: boolean;
}

export type FocusAction =
  | { type: "MOVE_UP" }
  | { type: "MOVE_DOWN" }
  | { type: "MOVE_LEFT" }
  | { type: "MOVE_RIGHT" }
  | { type: "ACTIVATE" }
  | { type: "BACK" }
  | { type: "TOGGLE_FAVORITE" }
  | { type: "OPEN_SETTINGS" }
  | { type: "PREV_FILTER" }
  | { type: "NEXT_FILTER" }
  | { type: "SET_REGION"; region: FocusRegion }
  | { type: "SET_GRID_INDEX"; index: number }
  | { type: "SET_SIDEBAR_INDEX"; index: number }
  | { type: "DEACTIVATE" }
  | { type: "RESET_GRID" };

interface FocusCounts {
  sidebarItemCount: number;
  gridItemCount: number;
  gridColumnCount: number;
}

const initialState: FocusState = {
  region: "grid",
  sidebarIndex: 0,
  gridIndex: 0,
  active: false,
};

function createReducer(counts: FocusCounts) {
  return function focusReducer(
    state: FocusState,
    action: FocusAction
  ): FocusState {
    const { sidebarItemCount, gridItemCount, gridColumnCount } = counts;

    switch (action.type) {
      case "MOVE_UP": {
        if (!state.active) return { ...state, active: true };
        if (state.region === "sidebar") {
          const next = Math.max(0, state.sidebarIndex - 1);
          return { ...state, sidebarIndex: next };
        }
        // Grid: move up one row
        const next = state.gridIndex - gridColumnCount;
        if (next < 0) return state;
        return { ...state, gridIndex: next };
      }

      case "MOVE_DOWN": {
        if (!state.active) return { ...state, active: true };
        if (state.region === "sidebar") {
          const next = Math.min(sidebarItemCount - 1, state.sidebarIndex + 1);
          return { ...state, sidebarIndex: next };
        }
        // Grid: move down one row
        const next = state.gridIndex + gridColumnCount;
        if (next >= gridItemCount) return state;
        return { ...state, gridIndex: next };
      }

      case "MOVE_LEFT": {
        if (!state.active) return { ...state, active: true };
        if (state.region === "sidebar") return state;
        // Grid: at column 0 → switch to sidebar
        const col = state.gridIndex % gridColumnCount;
        if (col === 0) {
          return { ...state, region: "sidebar" };
        }
        return { ...state, gridIndex: state.gridIndex - 1 };
      }

      case "MOVE_RIGHT": {
        if (!state.active) return { ...state, active: true };
        if (state.region === "sidebar") {
          return { ...state, region: "grid" };
        }
        const col = state.gridIndex % gridColumnCount;
        if (col >= gridColumnCount - 1) return state;
        const next = state.gridIndex + 1;
        if (next >= gridItemCount) return state;
        return { ...state, gridIndex: next };
      }

      case "ACTIVATE":
      case "BACK":
      case "TOGGLE_FAVORITE":
      case "OPEN_SETTINGS":
      case "PREV_FILTER":
      case "NEXT_FILTER":
        // These are handled by Layout; just ensure active
        if (!state.active) return { ...state, active: true };
        return state;

      case "SET_REGION":
        return { ...state, region: action.region, active: true };

      case "SET_GRID_INDEX":
        return { ...state, gridIndex: action.index };

      case "SET_SIDEBAR_INDEX":
        return { ...state, sidebarIndex: action.index };

      case "DEACTIVATE":
        return { ...state, active: false };

      case "RESET_GRID":
        return { ...state, gridIndex: 0 };

      default:
        return state;
    }
  };
}

export function useFocusManager(counts: FocusCounts) {
  const reducer = useCallback(
    (state: FocusState, action: FocusAction) =>
      createReducer(counts)(state, action),
    [counts.sidebarItemCount, counts.gridItemCount, counts.gridColumnCount]
  );

  const [state, dispatch] = useReducer(reducer, initialState);

  return { focusState: state, focusDispatch: dispatch };
}
