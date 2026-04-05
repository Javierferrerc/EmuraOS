import { useEffect } from "react";
import { useApp } from "./context/AppContext";
import { useNavigation } from "./navigation/NavigationContext";
import { Layout } from "./components/Layout";
import { SettingsPage } from "./components/SettingsPage";
import { GameModeView } from "./components/GameModeView";
import { EmulatorConfigPage } from "./components/EmulatorConfigPage";
import { CemuKeysModal } from "./components/CemuKeysModal";
import { CemuKeysMissingModal } from "./components/CemuKeysMissingModal";

export default function App() {
  const {
    currentView,
    pendingCemuKeysLaunch,
    isCemuKeysModalOpen,
    showCemuKeysError,
    submitCemuKeys,
    cancelCemuKeys,
    goToCemuKeysSettings,
    dismissCemuKeysError,
  } = useApp();

  const navigation = useNavigation();

  // PR1 bridge: mirror `currentView` → navigation stack so the new nav
  // provider always reflects the current view. Existing callers of
  // `setCurrentView("settings")` keep working and the new stack stays in
  // sync. PR2 flips the direction (nav becomes source of truth and
  // `currentView` becomes a computed getter).
  useEffect(() => {
    const target =
      currentView === "settings"
        ? "/settings"
        : currentView === "emulator-config"
          ? "/settings/emuladores"
          : currentView === "game"
            ? "/game"
            : "/library";
    if (navigation.currentPath !== target) {
      navigation.reset(target);
    }
    // We intentionally do not list `navigation` — the nav api is stable but
    // its `currentPath` reference changes on every tick which would re-fire
    // this bridge unnecessarily. We only want to react to `currentView`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView]);

  let page;
  switch (currentView) {
    case "settings":
      page = <SettingsPage />;
      break;
    case "emulator-config":
      page = <EmulatorConfigPage />;
      break;
    case "game":
      page = <GameModeView />;
      break;
    default:
      page = <Layout />;
  }

  // Only one modal is visible at a time. The paste modal takes priority
  // because it's the final step of the flow.
  return (
    <>
      {page}
      {isCemuKeysModalOpen ? (
        <CemuKeysModal onSubmit={submitCemuKeys} onCancel={cancelCemuKeys} />
      ) : showCemuKeysError && pendingCemuKeysLaunch ? (
        <CemuKeysMissingModal
          gameName={pendingCemuKeysLaunch.fileName}
          onGoToSettings={goToCemuKeysSettings}
          onCancel={dismissCemuKeysError}
        />
      ) : null}
    </>
  );
}
