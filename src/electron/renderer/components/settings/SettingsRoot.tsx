import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppConfig } from "../../../../core/types";
import { useApp } from "../../context/AppContext";
import { useNavigation } from "../../navigation/NavigationContext";
import {
  useSettingsFocus,
  type SettingsFocusAction,
} from "../../hooks/useSettingsFocus";
import { useGamepad } from "../../hooks/useGamepad";
import type { FocusAction } from "../../hooks/useFocusManager";
import { useNavigationSounds } from "../../hooks/useNavigationSounds";
import xIcon from "../../assets/icons/controls/x.svg";
import circleIcon from "../../assets/icons/controls/circle.svg";
import squareIcon from "../../assets/icons/controls/square.svg";
import navigateIcon from "../../assets/icons/controls/navigate.svg";
import type {
  SettingsContext as ISettingsContext,
  SettingsGroup,
  SettingsSection,
} from "../../schemas/settings-schema-types";
import { generalSection } from "./sections/general";
import { rutasSection } from "./sections/rutas";
import { emuladoresSection } from "./sections/emuladores/index";
import { bibliotecaSection } from "./sections/biblioteca";
import { coverArtSection } from "./sections/cover-art";
import { controlesSection } from "./sections/controles";
import { avanzadoSection } from "./sections/avanzado";

const SECTIONS: SettingsSection[] = [
  generalSection,
  rutasSection,
  emuladoresSection,
  bibliotecaSection,
  coverArtSection,
  controlesSection,
  avanzadoSection,
];
import { SettingsLayout } from "./shell/SettingsLayout";
import { SaveBar } from "./shell/SaveBar";
import { SettingsSidebar } from "./shell/SettingsSidebar";
import { SettingsTabBar } from "./shell/SettingsTabBar";
import {
  SettingsListView,
  countVisibleRows,
} from "./shell/SettingsListView";

/**
 * Mount point for the schema-driven Settings shell.
 *
 * Picks the active section from the nav path, exposes a full
 * `SettingsContext` backed by AppContext, and wires keyboard focus.
 * Sections with `customComponent` (Emuladores) skip SettingsListView
 * and render their own tree.
 */
export function SettingsRoot() {
  const app = useApp();
  const navigation = useNavigation();

  // ── Staging layer — buffer changes until user clicks "Guardar" ────
  const [pendingChanges, setPendingChanges] = useState<Partial<AppConfig>>({});
  const hasChanges = Object.keys(pendingChanges).length > 0;

  const mergedConfig = useMemo(
    () => (app.config ? { ...app.config, ...pendingChanges } : null),
    [app.config, pendingChanges]
  );

  const stagingUpdateConfig = useCallback(
    async (partial: Partial<AppConfig>) => {
      setPendingChanges((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    await app.updateConfig(pendingChanges);
    setPendingChanges({});
  }, [app.updateConfig, pendingChanges]);

  const handleDiscard = useCallback(() => {
    setPendingChanges({});
  }, []);

  const ctx: ISettingsContext = useMemo(
    () => ({
      // Config + persistence (staged)
      config: mergedConfig,
      updateConfig: stagingUpdateConfig,

      // Navigation
      navigation,

      // Library state
      favorites: app.favorites,
      recentlyPlayed: app.recentlyPlayed,
      playHistory: app.playHistory,
      collections: app.collections,
      metadataMap: app.metadataMap,

      // Scan / scrape / cover fetch
      isLoading: app.isLoading,
      refreshScan: app.refreshScan,
      isScraping: app.isScraping,
      scrapeProgress: app.scrapeProgress,
      lastScrapeResult: app.lastScrapeResult,
      startScraping: app.startScraping,
      isFetchingCovers: app.isFetchingCovers,
      coverFetchProgress: app.coverFetchProgress,
      lastCoverFetchResult: app.lastCoverFetchResult,
      startFetchingCovers: app.startFetchingCovers,

      // Emulators
      emulatorDefs: app.emulatorDefs,
      lastDetection: app.lastDetection,
      readinessReport: app.readinessReport,
      isDetectingEmulators: app.isDetectingEmulators,
      detectEmulators: app.detectEmulators,
      driveEmulators: app.driveEmulators,
      isLoadingDrive: app.isLoadingDrive,
      refreshDriveEmulators: app.refreshDriveEmulators,
      downloadingEmulatorId: app.downloadingEmulatorId,
      emulatorDownloadProgress: app.emulatorDownloadProgress,
      downloadEmulator: app.downloadEmulator,

      // Cemu keys flow
      pendingCemuKeysLaunch: app.pendingCemuKeysLaunch,
      isCemuKeysModalOpen: app.isCemuKeysModalOpen,
      openCemuKeysModal: app.openCemuKeysModal,

      // Gamepad / fullscreen
      gamepadConnected: app.gamepadConnected,
      isFullscreen: app.isFullscreen,
      toggleFullscreen: app.toggleFullscreen,

      // Game session
      isGameRunning: app.isGameRunning,
      currentGameFileName: app.currentGame?.rom?.fileName ?? null,

      // Resolved paths
      resolvedPaths: app.resolvedPaths ?? undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      mergedConfig,
      stagingUpdateConfig,
      navigation,
      app.favorites,
      app.recentlyPlayed,
      app.playHistory,
      app.collections,
      app.metadataMap,
      app.isLoading,
      app.refreshScan,
      app.isScraping,
      app.scrapeProgress,
      app.lastScrapeResult,
      app.startScraping,
      app.isFetchingCovers,
      app.coverFetchProgress,
      app.lastCoverFetchResult,
      app.startFetchingCovers,
      app.emulatorDefs,
      app.lastDetection,
      app.readinessReport,
      app.isDetectingEmulators,
      app.detectEmulators,
      app.driveEmulators,
      app.isLoadingDrive,
      app.refreshDriveEmulators,
      app.downloadingEmulatorId,
      app.emulatorDownloadProgress,
      app.downloadEmulator,
      app.pendingCemuKeysLaunch,
      app.isCemuKeysModalOpen,
      app.openCemuKeysModal,
      app.gamepadConnected,
      app.isFullscreen,
      app.toggleFullscreen,
      app.isGameRunning,
      app.currentGame,
      app.resolvedPaths,
    ]
  );

  const sections = SECTIONS;

  // Find the active section by the longest matching prefix in the nav path.
  const activeSection: SettingsSection = useMemo(() => {
    const currentPath = navigation.currentPath;
    let best: SettingsSection = sections[0]!;
    let bestLen = 0;
    for (const s of sections) {
      if (
        currentPath === s.path ||
        currentPath.startsWith(s.path + "/")
      ) {
        if (s.path.length > bestLen) {
          best = s;
          bestLen = s.path.length;
        }
      }
    }
    return best;
  }, [navigation.currentPath, sections]);

  const hasTabBar = Boolean(
    activeSection.tabs && activeSection.tabs.length > 0
  );
  const tabCount = activeSection.tabs?.length ?? 0;
  const sidebarCount = sections.length;

  // listCount comes from activeGroups which depends on focus.tabIndex from
  // the hook. Use a ref to carry the previous render's value and update it
  // after computing activeGroups (stabilises on the next render).
  const listCountRef = useRef(0);

  const { state: focus, dispatch } = useSettingsFocus({
    sidebarCount,
    tabCount,
    listCount: listCountRef.current,
    hasTabBar,
  });

  const { playNavigate, playSelect } = useNavigationSounds({
    enabled: mergedConfig?.navSoundEnabled ?? true,
    volume: mergedConfig?.navSoundVolume ?? 70,
  });

  const activeGroups: SettingsGroup[] = useMemo(() => {
    if (activeSection.tabs && activeSection.tabs.length > 0) {
      return activeSection.tabs[focus.tabIndex]?.groups ?? activeSection.tabs[0]!.groups;
    }
    if (activeSection.groups) return activeSection.groups;
    return [];
  }, [activeSection, focus.tabIndex]);

  // For custom components, use the declared item count; otherwise count visible rows.
  if (activeSection.customComponent && activeSection.customListCount != null) {
    listCountRef.current =
      typeof activeSection.customListCount === "function"
        ? activeSection.customListCount(ctx)
        : activeSection.customListCount;
  } else {
    listCountRef.current = countVisibleRows(activeGroups);
  }

  // Keep the sidebar index in sync with the nav path (so keyboard movement
  // through the sidebar highlights the active item).
  useEffect(() => {
    const idx = sections.findIndex((s) => s.id === activeSection.id);
    if (idx >= 0 && idx !== focus.sidebarIndex) {
      dispatch({ type: "SET_SIDEBAR", index: idx });
      // Only jump to list when the user isn't actively browsing the sidebar
      // (e.g. mouse click, initial mount). Sidebar preview should keep focus.
      if (focus.region !== "sidebar") {
        dispatch({ type: "SET_REGION", region: "list" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection.id]);

  // Activate the shell on first mount so keyboard input is captured.
  useEffect(() => {
    dispatch({ type: "ACTIVATE_SHELL" });
  }, [dispatch]);

  // Preview: update the content panel as the user browses the sidebar
  // with gamepad/keyboard, without moving focus out of the sidebar.
  // Uses `replace` instead of `navigateTo` to avoid polluting the nav stack.
  useEffect(() => {
    if (focus.region !== "sidebar" || !focus.active) return;
    const section = sections[focus.sidebarIndex];
    if (section && section.id !== activeSection.id) {
      navigation.replace(section.path);
    }
  }, [focus.region, focus.active, focus.sidebarIndex, sections, activeSection.id, navigation]);

  // Auto-focus the list region when navigating into a detail sub-path
  // (e.g. /settings/emuladores/retroarch). This ensures the custom
  // component's listActionRef receives gamepad actions immediately.
  const isInsideSubPath = useMemo(() => {
    const p = navigation.currentPath;
    return sections.some((s) => p.startsWith(s.path + "/") && p !== s.path);
  }, [navigation.currentPath, sections]);

  useEffect(() => {
    if (isInsideSubPath) {
      dispatch({ type: "SET_REGION", region: "list" });
    }
  }, [isInsideSubPath, dispatch]);

  const handleSelectSection = useCallback(
    (section: SettingsSection, index: number) => {
      dispatch({ type: "SET_SIDEBAR", index });
      dispatch({ type: "SET_LIST", index: 0 });
      navigation.navigateTo(section.path);
    },
    [dispatch, navigation]
  );

  // When switching tabs, reset list focus to the top.
  const handleSelectTab = useCallback(
    (index: number) => {
      dispatch({ type: "SET_TAB", index });
      dispatch({ type: "SET_LIST", index: 0 });
    },
    [dispatch]
  );

  const handleBack = useCallback(() => {
    // If inside a sub-path (e.g. /settings/emuladores/retroarch),
    // go back to the section root instead of leaving settings.
    const current = navigation.currentPath;
    const section = sections.find(
      (s) => current.startsWith(s.path + "/") && current !== s.path
    );
    if (section) {
      navigation.navigateTo(section.path);
      return;
    }
    app.setCurrentView("library");
  }, [app, navigation, sections]);

  // Refs so the stable gamepad callback can read the latest values.
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const activateRef = useRef<(() => void) | null>(null);
  const secondaryRef = useRef<(() => void) | null>(null);
  const prevFilterRef = useRef<(() => void) | null>(null);
  const nextFilterRef = useRef<(() => void) | null>(null);
  const listActionRef = useRef<((action: "up" | "down" | "left" | "right" | "activate") => boolean) | null>(null);
  const isInsideSubPathRef = useRef(isInsideSubPath);
  isInsideSubPathRef.current = isInsideSubPath;
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  /**
   * Grid-aware list navigation for custom components.
   * Item 0 is a full-width header row (detect button); items 1..N sit in a
   * multi-column grid.  Returns the new index, or -1 to escape to sidebar,
   * or -2 to escape upward (to tabbar).
   */
  const gridNav = useCallback(
    (
      dir: "up" | "down" | "left" | "right",
      index: number,
      itemCount: number,
      cols: number
    ): number => {
      if (itemCount === 0) return -1;
      // Header row (index 0): full-width, not part of the grid.
      if (index === 0) {
        switch (dir) {
          case "down":
            return Math.min(1, itemCount - 1);
          case "up":
            return -2; // escape up
          case "left":
            return -1; // escape to sidebar
          case "right":
            return 0;
        }
      }
      // Grid items (index >= 1).  Map to 0-based grid position.
      const gi = index - 1; // grid index
      const col = gi % cols;
      switch (dir) {
        case "left":
          return col === 0 ? -1 : index - 1;
        case "right": {
          const next = index + 1;
          return col < cols - 1 && next < itemCount ? next : index;
        }
        case "up": {
          const prev = index - cols;
          return prev >= 1 ? prev : 0; // jump to header
        }
        case "down": {
          const next = index + cols;
          return next < itemCount ? next : index;
        }
      }
    },
    []
  );

  // Helper: handle a directional action inside the list region when the
  // active section declares grid columns. Returns true if handled.
  // Disabled inside detail sub-paths where listActionRef manages navigation.
  const handleGridListNav = useCallback(
    (dir: "up" | "down" | "left" | "right"): boolean => {
      if (isInsideSubPathRef.current) return false;
      const sec = activeSectionRef.current;
      const cols = sec.customListColumns;
      if (!cols || !sec.customComponent) return false;
      const f = focusRef.current;
      if (f.region !== "list") return false;
      const count =
        typeof sec.customListCount === "function"
          ? sec.customListCount(ctxRef.current)
          : sec.customListCount ?? 0;
      const next = gridNav(dir, f.listIndex, count, cols);
      if (next === -1) {
        // Escape to sidebar
        dispatch({ type: "SET_REGION", region: "sidebar" });
      } else if (next === -2) {
        // Escape upward to tabbar (or sidebar if no tabbar)
        dispatch(
          sec.tabs && sec.tabs.length > 0
            ? { type: "SET_REGION", region: "tabbar" }
            : { type: "SET_REGION", region: "sidebar" }
        );
      } else {
        dispatch({ type: "SET_LIST", index: next });
      }
      return true;
    },
    [dispatch, gridNav]
  );

  // Gamepad support — bridge FocusAction from the gamepad hook into the
  // settings focus system so the controller works while Settings is open.
  const handleGamepadAction = useCallback(
    (action: FocusAction) => {
      // Helper: try custom list action handler first (for emulator detail, etc.)
      const tryListAction = (a: "up" | "down" | "left" | "right" | "activate"): boolean => {
        if (focusRef.current.region !== "list") return false;
        return listActionRef.current?.(a) ?? false;
      };

      switch (action.type) {
        case "MOVE_UP":
          playNavigate();
          if (tryListAction("up")) break;
          if (!handleGridListNav("up")) dispatch(action);
          break;
        case "MOVE_DOWN":
          playNavigate();
          if (tryListAction("down")) break;
          if (!handleGridListNav("down")) dispatch(action);
          break;
        case "MOVE_LEFT":
          playNavigate();
          if (tryListAction("left")) break;
          if (!handleGridListNav("left")) dispatch(action);
          break;
        case "MOVE_RIGHT": {
          playNavigate();
          if (tryListAction("right")) break;
          if (handleGridListNav("right")) break;
          const f = focusRef.current;
          if (f.region === "sidebar") {
            const section = sections[f.sidebarIndex];
            if (section) handleSelectSection(section, f.sidebarIndex);
          }
          dispatch(action);
          break;
        }
        case "ACTIVATE": {
          playSelect();
          if (tryListAction("activate")) break;
          const f = focusRef.current;
          if (f.region === "sidebar") {
            const section = sections[f.sidebarIndex];
            if (section) handleSelectSection(section, f.sidebarIndex);
          } else if (f.region === "tabbar") {
            handleSelectTab(f.tabIndex);
          } else if (f.region === "list") {
            activateRef.current?.();
          }
          break;
        }
        case "PREV_FILTER": {
          playNavigate();
          const f = focusRef.current;
          if (tabCount > 0) {
            const prev = f.tabIndex <= 0 ? tabCount - 1 : f.tabIndex - 1;
            handleSelectTab(prev);
          } else {
            prevFilterRef.current?.();
          }
          break;
        }
        case "NEXT_FILTER": {
          playNavigate();
          const f = focusRef.current;
          if (tabCount > 0) {
            const next = f.tabIndex >= tabCount - 1 ? 0 : f.tabIndex + 1;
            handleSelectTab(next);
          } else {
            nextFilterRef.current?.();
          }
          break;
        }
        case "SECONDARY_ACTION": {
          playSelect();
          const f = focusRef.current;
          if (f.region === "list") {
            secondaryRef.current?.();
          }
          break;
        }
        case "BACK":
        case "OPEN_SETTINGS":
          playSelect();
          handleBack();
          break;
      }
    },
    [dispatch, handleBack, handleSelectSection, handleSelectTab, handleGridListNav, sections, tabCount, playNavigate, playSelect]
  );

  useGamepad({ onAction: handleGamepadAction });

  // Keyboard handling — dpad + Enter/Escape. This is isolated to the
  // Settings shell; the library's `useKeyboardNav` is not mounted while
  // Settings is visible (enforced by App.tsx routing).
  useEffect(() => {
    // Helper: try custom list action handler (mirrors gamepad logic)
    const tryListAction = (a: "up" | "down" | "left" | "right" | "activate"): boolean => {
      if (focusRef.current.region !== "list") return false;
      return listActionRef.current?.(a) ?? false;
    };

    function onKeyDown(e: KeyboardEvent) {
      // Don't swallow typing inside inputs/textareas.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (e.key === "Escape") {
          target?.blur();
          return;
        }
        return;
      }

      let action: SettingsFocusAction | null = null;
      switch (e.key) {
        case "ArrowUp":
          playNavigate();
          if (tryListAction("up")) { e.preventDefault(); return; }
          if (handleGridListNav("up")) { e.preventDefault(); return; }
          action = { type: "MOVE_UP" };
          break;
        case "ArrowDown":
          playNavigate();
          if (tryListAction("down")) { e.preventDefault(); return; }
          if (handleGridListNav("down")) { e.preventDefault(); return; }
          action = { type: "MOVE_DOWN" };
          break;
        case "ArrowLeft":
          playNavigate();
          if (tryListAction("left")) { e.preventDefault(); return; }
          if (handleGridListNav("left")) { e.preventDefault(); return; }
          action = { type: "MOVE_LEFT" };
          break;
        case "ArrowRight": {
          playNavigate();
          if (tryListAction("right")) { e.preventDefault(); return; }
          if (handleGridListNav("right")) { e.preventDefault(); return; }
          const f = focusRef.current;
          if (f.region === "sidebar") {
            const section = sections[f.sidebarIndex];
            if (section) handleSelectSection(section, f.sidebarIndex);
          }
          action = { type: "MOVE_RIGHT" };
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          playSelect();
          if (tryListAction("activate")) return;
          const f = focusRef.current;
          if (f.region === "sidebar") {
            const section = sections[f.sidebarIndex];
            if (section) handleSelectSection(section, f.sidebarIndex);
          } else if (f.region === "tabbar") {
            handleSelectTab(f.tabIndex);
          } else if (f.region === "list") {
            activateRef.current?.();
          }
          return;
        }
        case "Escape":
        case "Backspace":
          e.preventDefault();
          playSelect();
          handleBack();
          return;
      }
      if (action) {
        e.preventDefault();
        dispatch(action);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, handleBack, handleSelectSection, handleSelectTab, handleGridListNav, sections, playNavigate, playSelect]);

  return (
    <SettingsLayout
      sidebar={
        <SettingsSidebar
          sections={sections}
          activeId={activeSection.id}
          focusedIndex={focus.sidebarIndex}
          regionFocused={focus.region === "sidebar"}
          onSelect={handleSelectSection}
          onBack={handleBack}
        />
      }
      tabBar={
        hasTabBar && activeSection.tabs ? (
          <SettingsTabBar
            tabs={activeSection.tabs}
            activeIndex={focus.tabIndex}
            focusedIndex={focus.tabIndex}
            regionFocused={focus.region === "tabbar"}
            onSelect={handleSelectTab}
          />
        ) : undefined
      }
      saveBar={
        hasChanges ? (
          <SaveBar onSave={handleSave} onDiscard={handleDiscard} />
        ) : undefined
      }
      bottomBar={
        app.gamepadConnected ? (
          <footer className="flex items-center justify-end gap-6 px-4 pt-2 pb-4 text-[16px] font-medium text-gray-600">
            {navigation.currentPath.match(/^\/settings\/emuladores\/.+/) && (
              <span className="flex items-center gap-1.5">
                <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs font-bold text-gray-300">L1/R1</span>
                Tabs
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <img src={xIcon} alt="" className="h-5 w-5" />
              Seleccionar
            </span>
            <span className="flex items-center gap-1.5">
              <img src={squareIcon} alt="" className="h-5 w-5" />
              Descargar
            </span>
            <span className="flex items-center gap-1.5">
              <img src={circleIcon} alt="" className="h-5 w-5" />
              Volver
            </span>
            <span className="flex items-center gap-1.5">
              <img src={navigateIcon} alt="" className="h-5 w-5" />
              Navegar
            </span>
          </footer>
        ) : undefined
      }
    >
      {activeSection.customComponent ? (
        <activeSection.customComponent
          ctx={ctx}
          focusIndex={focus.listIndex}
          regionFocused={focus.region === "list"}
          activateRef={activateRef}
          secondaryRef={secondaryRef}
          prevFilterRef={prevFilterRef}
          nextFilterRef={nextFilterRef}
          listActionRef={listActionRef}
        />
      ) : (
        <SettingsListView
          groups={activeGroups}
          ctx={ctx}
          focusedRowIndex={focus.listIndex}
          regionFocused={focus.region === "list"}
          onRowActivate={(index) => dispatch({ type: "SET_LIST", index })}
          activateRef={activateRef}
        />
      )}
    </SettingsLayout>
  );
}
