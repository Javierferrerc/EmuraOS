import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type {
  NavigationApi,
  NavigationEntry,
  NavigationEntryMemo,
  NavigationPath,
  NavigationState,
} from "./navigation-types";

type Action =
  | { type: "NAVIGATE"; path: NavigationPath; memo?: NavigationEntryMemo }
  | { type: "REPLACE"; path: NavigationPath }
  | { type: "BACK" }
  | { type: "RESET"; path: NavigationPath }
  | { type: "UPDATE_MEMO"; memo: NavigationEntryMemo };

const INITIAL_PATH: NavigationPath = "/library";

const initialState: NavigationState = {
  stack: [{ path: INITIAL_PATH }],
};

function reducer(state: NavigationState, action: Action): NavigationState {
  switch (action.type) {
    case "NAVIGATE": {
      const entry: NavigationEntry = { path: action.path, memo: action.memo };
      return { stack: [...state.stack, entry] };
    }
    case "REPLACE": {
      if (state.stack.length === 0) {
        return { stack: [{ path: action.path }] };
      }
      const next = state.stack.slice(0, -1);
      next.push({ path: action.path });
      return { stack: next };
    }
    case "BACK": {
      if (state.stack.length <= 1) return state;
      return { stack: state.stack.slice(0, -1) };
    }
    case "RESET": {
      return { stack: [{ path: action.path }] };
    }
    case "UPDATE_MEMO": {
      if (state.stack.length === 0) return state;
      const top = state.stack[state.stack.length - 1]!;
      const merged: NavigationEntry = {
        path: top.path,
        memo: { ...top.memo, ...action.memo },
      };
      const next = state.stack.slice(0, -1);
      next.push(merged);
      return { stack: next };
    }
    default:
      return state;
  }
}

function normalize(path: string): string {
  if (!path.startsWith("/")) path = "/" + path;
  // collapse any double slashes
  path = path.replace(/\/+/g, "/");
  // strip trailing slash (except for the root "/")
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

function splitSegments(path: string): string[] {
  const n = normalize(path);
  if (n === "/") return [];
  return n.slice(1).split("/");
}

export function matchPath(
  currentPath: string,
  pattern: string
): Record<string, string> | null {
  const pathSegments = splitSegments(currentPath);
  const patternSegments = splitSegments(pattern);

  if (pathSegments.length !== patternSegments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const p = patternSegments[i]!;
    const v = pathSegments[i]!;
    if (p.startsWith(":")) {
      params[p.slice(1)] = v;
    } else if (p !== v) {
      return null;
    }
  }
  return params;
}

const NavigationContext = createContext<NavigationApi | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const currentPath = state.stack[state.stack.length - 1]?.path ?? INITIAL_PATH;

  const navigateTo = useCallback(
    (path: NavigationPath, memo?: NavigationEntryMemo) => {
      dispatch({ type: "NAVIGATE", path: normalize(path), memo });
    },
    []
  );

  const replace = useCallback((path: NavigationPath) => {
    dispatch({ type: "REPLACE", path: normalize(path) });
  }, []);

  const goBack = useCallback((): boolean => {
    if (state.stack.length <= 1) return false;
    dispatch({ type: "BACK" });
    return true;
  }, [state.stack.length]);

  const canGoBack = useCallback(() => state.stack.length > 1, [
    state.stack.length,
  ]);

  const reset = useCallback((path: NavigationPath) => {
    dispatch({ type: "RESET", path: normalize(path) });
  }, []);

  const match = useCallback(
    (pattern: string) => matchPath(currentPath, pattern),
    [currentPath]
  );

  const updateMemo = useCallback((memo: NavigationEntryMemo) => {
    dispatch({ type: "UPDATE_MEMO", memo });
  }, []);

  const api = useMemo<NavigationApi>(
    () => ({
      state,
      currentPath,
      navigateTo,
      replace,
      goBack,
      canGoBack,
      reset,
      match,
      updateMemo,
    }),
    [state, currentPath, navigateTo, replace, goBack, canGoBack, reset, match, updateMemo]
  );

  return (
    <NavigationContext.Provider value={api}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationApi {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error("useNavigation must be used within a NavigationProvider");
  }
  return ctx;
}
