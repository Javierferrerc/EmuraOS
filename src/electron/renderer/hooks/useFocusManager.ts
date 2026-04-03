import { useReducer, useCallback } from "react";

export type FocusRegion = "slider" | "grid";

export interface FocusState {
  region: FocusRegion;
  sliderIndex: number;
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
  | { type: "SET_SLIDER_INDEX"; index: number }
  | { type: "DEACTIVATE" }
  | { type: "RESET_GRID" };

interface FocusCounts {
  sliderItemCount: number;
  gridItemCount: number;
  gridColumnCount: number;
}

const initialState: FocusState = {
  region: "grid",
  sliderIndex: 0,
  gridIndex: 0,
  active: false,
};

function createReducer(counts: FocusCounts) {
  return function focusReducer(
    state: FocusState,
    action: FocusAction
  ): FocusState {
    const { sliderItemCount, gridItemCount, gridColumnCount } = counts;

    switch (action.type) {
      case "MOVE_UP": {
        if (!state.active) return { ...state, active: true };
        if (state.region === "slider") {
          // Already at top — do nothing
          return state;
        }
        // Grid: if in first row, move to slider
        const row = Math.floor(state.gridIndex / gridColumnCount);
        if (row === 0) {
          return { ...state, region: "slider" };
        }
        const next = state.gridIndex - gridColumnCount;
        return { ...state, gridIndex: next };
      }

      case "MOVE_DOWN": {
        if (!state.active) return { ...state, active: true };
        if (state.region === "slider") {
          // Move from slider into grid
          return { ...state, region: "grid" };
        }
        // Grid: move down one row
        const next = state.gridIndex + gridColumnCount;
        if (next >= gridItemCount) return state;
        return { ...state, gridIndex: next };
      }

      case "MOVE_LEFT": {
        if (!state.active) return { ...state, active: true };
        if (state.region === "slider") {
          const next = Math.max(0, state.sliderIndex - 1);
          return { ...state, sliderIndex: next };
        }
        // Grid: at column 0 → wrap to last item of previous row
        const colL = state.gridIndex % gridColumnCount;
        if (colL === 0) {
          const prevRowEnd = state.gridIndex - 1;
          if (prevRowEnd < 0) return state;
          return { ...state, gridIndex: prevRowEnd };
        }
        return { ...state, gridIndex: state.gridIndex - 1 };
      }

      case "MOVE_RIGHT": {
        if (!state.active) return { ...state, active: true };
        if (state.region === "slider") {
          const next = Math.min(sliderItemCount - 1, state.sliderIndex + 1);
          return { ...state, sliderIndex: next };
        }
        // Grid: at last column → wrap to first item of next row
        const colR = state.gridIndex % gridColumnCount;
        if (colR >= gridColumnCount - 1) {
          const nextRowStart = state.gridIndex + 1;
          if (nextRowStart >= gridItemCount) return state;
          return { ...state, gridIndex: nextRowStart };
        }
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

      case "SET_SLIDER_INDEX":
        return { ...state, sliderIndex: action.index };

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
    [counts.sliderItemCount, counts.gridItemCount, counts.gridColumnCount]
  );

  const [state, dispatch] = useReducer(reducer, initialState);

  return { focusState: state, focusDispatch: dispatch };
}
