import { useReducer, type Dispatch } from "react";

/**
 * Isolated focus manager for the Phase 13 Settings shell.
 *
 * Lives alongside `useFocusManager` but never collides with it — only one
 * of the two is mounted at any time (Settings vs Library), enforced by the
 * routing in `App.tsx`. Keeping them as siblings means future theme / nav
 * tweaks to Settings never risk breaking library focus.
 *
 * Regions:
 *   - sidebar : the 7 top-level section buttons on the left
 *   - tabbar  : horizontal tab bar inside a section (e.g. Emuladores tabs)
 *   - list    : the rows inside the currently active tab/group
 */

export type SettingsFocusRegion = "sidebar" | "tabbar" | "list";

export interface SettingsFocusState {
  region: SettingsFocusRegion;
  sidebarIndex: number;
  tabIndex: number;
  listIndex: number;
  active: boolean;
}

export type SettingsFocusAction =
  | { type: "MOVE_UP" }
  | { type: "MOVE_DOWN" }
  | { type: "MOVE_LEFT" }
  | { type: "MOVE_RIGHT" }
  | { type: "ACTIVATE" }
  | { type: "BACK" }
  | { type: "SET_REGION"; region: SettingsFocusRegion }
  | { type: "SET_SIDEBAR"; index: number }
  | { type: "SET_TAB"; index: number }
  | { type: "SET_LIST"; index: number }
  | { type: "ACTIVATE_SHELL" }
  | { type: "DEACTIVATE" };

export interface SettingsFocusCounts {
  sidebarCount: number;
  tabCount: number;
  listCount: number;
  hasTabBar: boolean;
}

const initialState: SettingsFocusState = {
  region: "sidebar",
  sidebarIndex: 0,
  tabIndex: 0,
  listIndex: 0,
  active: false,
};

function clamp(value: number, max: number): number {
  if (max <= 0) return 0;
  if (value < 0) return 0;
  if (value >= max) return max - 1;
  return value;
}

function createReducer(counts: SettingsFocusCounts) {
  return function reducer(
    state: SettingsFocusState,
    action: SettingsFocusAction
  ): SettingsFocusState {
    switch (action.type) {
      case "ACTIVATE_SHELL":
        return { ...state, active: true };
      case "DEACTIVATE":
        return { ...state, active: false };
      case "SET_REGION":
        return { ...state, region: action.region, active: true };
      case "SET_SIDEBAR":
        return {
          ...state,
          region: "sidebar",
          sidebarIndex: clamp(action.index, counts.sidebarCount),
          tabIndex: 0,
          active: true,
        };
      case "SET_TAB":
        return {
          ...state,
          region: "tabbar",
          tabIndex: clamp(action.index, counts.tabCount),
          active: true,
        };
      case "SET_LIST":
        return {
          ...state,
          region: "list",
          listIndex: clamp(action.index, counts.listCount),
          active: true,
        };
      case "MOVE_UP": {
        if (state.region === "sidebar") {
          return {
            ...state,
            sidebarIndex: clamp(state.sidebarIndex - 1, counts.sidebarCount),
          };
        }
        if (state.region === "list") {
          // Top of list jumps up into the tab bar if one exists.
          if (state.listIndex === 0 && counts.hasTabBar) {
            return { ...state, region: "tabbar" };
          }
          return {
            ...state,
            listIndex: clamp(state.listIndex - 1, counts.listCount),
          };
        }
        // tabbar → stay (no row above tabbar)
        return state;
      }
      case "MOVE_DOWN": {
        if (state.region === "sidebar") {
          return {
            ...state,
            sidebarIndex: clamp(state.sidebarIndex + 1, counts.sidebarCount),
          };
        }
        if (state.region === "tabbar") {
          return { ...state, region: "list", listIndex: 0 };
        }
        return {
          ...state,
          listIndex: clamp(state.listIndex + 1, counts.listCount),
        };
      }
      case "MOVE_LEFT": {
        if (state.region === "tabbar") {
          if (state.tabIndex === 0) {
            return { ...state, region: "sidebar" };
          }
          return { ...state, tabIndex: state.tabIndex - 1, listIndex: 0 };
        }
        if (state.region === "list") {
          return { ...state, region: "sidebar" };
        }
        return state;
      }
      case "MOVE_RIGHT": {
        if (state.region === "sidebar") {
          return {
            ...state,
            region: counts.hasTabBar ? "tabbar" : "list",
          };
        }
        if (state.region === "tabbar") {
          return {
            ...state,
            tabIndex: clamp(state.tabIndex + 1, counts.tabCount),
            listIndex: 0,
          };
        }
        return state;
      }
      default:
        return state;
    }
  };
}

export function useSettingsFocus(counts: SettingsFocusCounts): {
  state: SettingsFocusState;
  dispatch: Dispatch<SettingsFocusAction>;
} {
  const [state, dispatch] = useReducer(createReducer(counts), initialState);
  return { state, dispatch };
}
