import { useCallback, useEffect, useMemo } from "react";
import { useApp } from "../../context/AppContext";
import { useNavigation } from "../../navigation/NavigationContext";
import {
  useSettingsFocus,
  type SettingsFocusAction,
} from "../../hooks/useSettingsFocus";
import type {
  SettingsContext as ISettingsContext,
  SettingsGroup,
  SettingsSection,
} from "../../schemas/settings-schema-types";
import { PLACEHOLDER_SECTIONS } from "./sections/placeholders";
import { SettingsLayout } from "./shell/SettingsLayout";
import { SettingsSidebar } from "./shell/SettingsSidebar";
import { SettingsHeader } from "./shell/SettingsHeader";
import { SettingsTabBar } from "./shell/SettingsTabBar";
import {
  SettingsListView,
  countVisibleRows,
} from "./shell/SettingsListView";

/**
 * Mount point for the new Settings shell (PR1).
 *
 * PR1 responsibilities:
 *   - pick the active section from the nav path
 *   - expose an `ISettingsContext` backed by AppContext's config/updateConfig
 *   - wire keyboard / mouse focus via `useSettingsFocus`
 *   - translate Escape → `navigation.goBack()`
 *
 * PR2 extends this with: custom component escape hatch for Emuladores,
 * deeper focus restore via navigation memos, extended SettingsContext,
 * and prerequisite cards.
 */
export function SettingsRoot() {
  const { config, updateConfig } = useApp();
  const navigation = useNavigation();

  const ctx: ISettingsContext = useMemo(
    () => ({ config, updateConfig }),
    [config, updateConfig]
  );

  const sections = PLACEHOLDER_SECTIONS;

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

  const activeGroups: SettingsGroup[] = useMemo(() => {
    if (activeSection.groups) return activeSection.groups;
    if (activeSection.tabs && activeSection.tabs.length > 0) {
      // PR1: just show the first tab; PR2 introduces tabbed nav for Emuladores.
      return activeSection.tabs[0]!.groups;
    }
    return [];
  }, [activeSection]);

  const listCount = countVisibleRows(activeGroups);
  const hasTabBar = Boolean(
    activeSection.tabs && activeSection.tabs.length > 0
  );
  const tabCount = activeSection.tabs?.length ?? 0;
  const sidebarCount = sections.length;

  const { state: focus, dispatch } = useSettingsFocus({
    sidebarCount,
    tabCount,
    listCount,
    hasTabBar,
  });

  // Keep the sidebar index in sync with the nav path (so keyboard movement
  // through the sidebar highlights the active item).
  useEffect(() => {
    const idx = sections.findIndex((s) => s.id === activeSection.id);
    if (idx >= 0 && idx !== focus.sidebarIndex) {
      dispatch({ type: "SET_SIDEBAR", index: idx });
      // Keep region on list by default — setting sidebar index above switches
      // region to sidebar; restore list region if that was the entry point.
      dispatch({ type: "SET_REGION", region: "list" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection.id]);

  // Activate the shell on first mount so keyboard input is captured.
  useEffect(() => {
    dispatch({ type: "ACTIVATE_SHELL" });
  }, [dispatch]);

  const handleSelectSection = useCallback(
    (section: SettingsSection, index: number) => {
      dispatch({ type: "SET_SIDEBAR", index });
      dispatch({ type: "SET_LIST", index: 0 });
      navigation.navigateTo(section.path);
    },
    [dispatch, navigation]
  );

  const handleSelectTab = useCallback(
    (index: number) => {
      dispatch({ type: "SET_TAB", index });
      dispatch({ type: "SET_LIST", index: 0 });
    },
    [dispatch]
  );

  const handleBack = useCallback(() => {
    const popped = navigation.goBack();
    if (!popped) {
      // At the bottom of the stack. PR2 hooks into AppContext for fullscreen;
      // PR1 is a no-op so behavior matches the old flat router.
    }
  }, [navigation]);

  // Keyboard handling — dpad + Enter/Escape. This is isolated to the
  // Settings shell; the library's `useKeyboardNav` is not mounted while
  // Settings is visible (enforced by App.tsx routing).
  useEffect(() => {
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
          action = { type: "MOVE_UP" };
          break;
        case "ArrowDown":
          action = { type: "MOVE_DOWN" };
          break;
        case "ArrowLeft":
          action = { type: "MOVE_LEFT" };
          break;
        case "ArrowRight":
          action = { type: "MOVE_RIGHT" };
          break;
        case "Enter":
        case " ":
          action = { type: "ACTIVATE" };
          break;
        case "Escape":
        case "Backspace":
          e.preventDefault();
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
  }, [dispatch, handleBack]);

  return (
    <SettingsLayout
      sidebar={
        <SettingsSidebar
          sections={sections}
          activeId={activeSection.id}
          focusedIndex={focus.sidebarIndex}
          regionFocused={focus.region === "sidebar"}
          onSelect={handleSelectSection}
        />
      }
      header={
        <SettingsHeader
          title={activeSection.label}
          breadcrumb={["Ajustes", activeSection.label]}
          canGoBack={navigation.canGoBack()}
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
    >
      <SettingsListView
        groups={activeGroups}
        ctx={ctx}
        focusedRowIndex={focus.listIndex}
        regionFocused={focus.region === "list"}
        onRowActivate={(index) => dispatch({ type: "SET_LIST", index })}
      />
    </SettingsLayout>
  );
}
