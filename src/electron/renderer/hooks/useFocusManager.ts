import { useReducer, useCallback } from "react";

export type FocusRegion = "topbar" | "slider" | "grid";

export interface FocusState {
  region: FocusRegion;
  topbarIndex: number;
  sliderIndex: number;
  gridIndex: number;
  active: boolean;
  textInputMode: boolean;
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
  | { type: "SET_TOPBAR_INDEX"; index: number }
  | { type: "ENTER_TEXT_INPUT" }
  | { type: "EXIT_TEXT_INPUT" }
  | { type: "DEACTIVATE" }
  | { type: "RESET_GRID" }
  | { type: "SECONDARY_ACTION" };

interface FocusCounts {
  topbarItemCount: number;
  sliderItemCount: number;
  gridItemCount: number;
  gridColumnCount: number;
}

const initialState: FocusState = {
  region: "grid",
  topbarIndex: 0,
  sliderIndex: 0,
  gridIndex: 0,
  active: false,
  textInputMode: false,
};

function createReducer(counts: FocusCounts) {
  return function focusReducer(
    state: FocusState,
    action: FocusAction
  ): FocusState {
    const {
      topbarItemCount,
      sliderItemCount,
      gridItemCount,
      gridColumnCount,
    } = counts;

    switch (action.type) {
      case "MOVE_UP": {
        // First arrow press both activates focus AND performs the move,
        // so the user gets immediate visual feedback on the first input
        // instead of having to press the same key twice.
        if (!state.active) state = { ...state, active: true };
        if (state.region === "topbar") {
          return state;
        }
        if (state.region === "slider") {
          return { ...state, region: "topbar" };
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
        // First arrow press both activates focus AND performs the move,
        // so the user gets immediate visual feedback on the first input
        // instead of having to press the same key twice.
        if (!state.active) state = { ...state, active: true };
        if (state.region === "topbar") {
          return { ...state, region: "slider" };
        }
        if (state.region === "slider") {
          return { ...state, region: "grid" };
        }
        const next = state.gridIndex + gridColumnCount;
        if (next >= gridItemCount) return state;
        return { ...state, gridIndex: next };
      }

      case "MOVE_LEFT": {
        // First arrow press both activates focus AND performs the move,
        // so the user gets immediate visual feedback on the first input
        // instead of having to press the same key twice.
        if (!state.active) state = { ...state, active: true };
        if (state.region === "topbar") {
          const next = Math.max(0, state.topbarIndex - 1);
          return { ...state, topbarIndex: next };
        }
        if (state.region === "slider") {
          const next = Math.max(0, state.sliderIndex - 1);
          return { ...state, sliderIndex: next };
        }
        const colL = state.gridIndex % gridColumnCount;
        if (colL === 0) {
          const prevRowEnd = state.gridIndex - 1;
          if (prevRowEnd < 0) return state;
          return { ...state, gridIndex: prevRowEnd };
        }
        return { ...state, gridIndex: state.gridIndex - 1 };
      }

      case "MOVE_RIGHT": {
        // First arrow press both activates focus AND performs the move,
        // so the user gets immediate visual feedback on the first input
        // instead of having to press the same key twice.
        if (!state.active) state = { ...state, active: true };
        if (state.region === "topbar") {
          const next = Math.min(
            Math.max(0, topbarItemCount - 1),
            state.topbarIndex + 1
          );
          return { ...state, topbarIndex: next };
        }
        if (state.region === "slider") {
          const next = Math.min(sliderItemCount - 1, state.sliderIndex + 1);
          return { ...state, sliderIndex: next };
        }
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
        // First arrow press both activates focus AND performs the move,
        // so the user gets immediate visual feedback on the first input
        // instead of having to press the same key twice.
        if (!state.active) state = { ...state, active: true };
        return state;

      case "SET_REGION":
        return { ...state, region: action.region, active: true };

      case "SET_GRID_INDEX":
        return { ...state, gridIndex: action.index };

      case "SET_SLIDER_INDEX":
        return { ...state, sliderIndex: action.index };

      case "SET_TOPBAR_INDEX":
        return { ...state, topbarIndex: action.index };

      case "ENTER_TEXT_INPUT":
        return { ...state, textInputMode: true };

      case "EXIT_TEXT_INPUT":
        return { ...state, textInputMode: false };

      case "DEACTIVATE":
        return { ...state, active: false, textInputMode: false };

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
    [
      counts.topbarItemCount,
      counts.sliderItemCount,
      counts.gridItemCount,
      counts.gridColumnCount,
    ]
  );

  const [state, dispatch] = useReducer(reducer, initialState);

  return { focusState: state, focusDispatch: dispatch };
}
