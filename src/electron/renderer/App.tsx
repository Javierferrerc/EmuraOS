import { useApp } from "./context/AppContext";
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
