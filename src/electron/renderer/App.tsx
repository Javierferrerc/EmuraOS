import { useEffect, useMemo, useState } from "react";
import { useApp } from "./context/AppContext";
import { useNavigation } from "./navigation/NavigationContext";
import { Layout } from "./components/Layout";
import { SettingsPage } from "./components/SettingsPage";
import { EmulatorConfigPage } from "./components/EmulatorConfigPage";
import { GameModeView } from "./components/GameModeView";
import { CemuKeysModal } from "./components/CemuKeysModal";
import { CemuKeysMissingModal } from "./components/CemuKeysMissingModal";
import { StatusBar } from "./components/StatusBar";
import { FirstRunWizard } from "./components/settings/wizard/FirstRunWizard";
import { NEW_SETTINGS_ENABLED } from "./components/settings/feature-flags";
import type { SettingsContext as ISettingsContext } from "./schemas/settings-schema-types";

export default function App() {
  const app = useApp();
  const navigation = useNavigation();
  const [showWizard, setShowWizard] = useState(false);

  const {
    currentView,
    pendingCemuKeysLaunch,
    isCemuKeysModalOpen,
    showCemuKeysError,
    submitCemuKeys,
    cancelCemuKeys,
    goToCemuKeysSettings,
    dismissCemuKeysError,
  } = app;

  // Bridge: mirror `currentView` → navigation stack. When the new flag is
  // on, navigation is the source of truth.
  useEffect(() => {
    if (NEW_SETTINGS_ENABLED) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView]);

  // Cemu missing-keys: navigate to Estado tab instead of standalone modal
  useEffect(() => {
    if (!NEW_SETTINGS_ENABLED) return;
    if (showCemuKeysError && pendingCemuKeysLaunch) {
      navigation.navigateTo("/settings/emuladores/cemu");
      dismissCemuKeysError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCemuKeysError, pendingCemuKeysLaunch]);

  // First-run wizard
  useEffect(() => {
    if (NEW_SETTINGS_ENABLED && app.config && !app.config.firstRunCompleted) {
      setShowWizard(true);
    }
  }, [app.config]);

  // Minimal SettingsContext for the wizard (full ctx lives in SettingsRoot)
  const wizardCtx: ISettingsContext = useMemo(
    () => ({
      config: app.config,
      updateConfig: app.updateConfig,
      navigation,
      favorites: app.favorites,
      recentlyPlayed: app.recentlyPlayed,
      playHistory: app.playHistory,
      collections: app.collections,
      metadataMap: app.metadataMap,
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
      pendingCemuKeysLaunch: app.pendingCemuKeysLaunch,
      isCemuKeysModalOpen: app.isCemuKeysModalOpen,
      openCemuKeysModal: app.openCemuKeysModal,
      gamepadConnected: app.gamepadConnected,
      isFullscreen: app.isFullscreen,
      toggleFullscreen: app.toggleFullscreen,
      isGameRunning: app.isGameRunning,
      currentGameFileName: app.currentGame?.rom?.fileName ?? null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.config, app.updateConfig, app.isDetectingEmulators]
  );

  let page;
  if (NEW_SETTINGS_ENABLED) {
    const path = navigation.currentPath;
    if (path === "/game") {
      page = <GameModeView />;
    } else if (path.startsWith("/settings")) {
      page = <SettingsPage />;
    } else {
      page = <Layout />;
    }
  } else {
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
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex-1 overflow-hidden">{page}</div>
      <StatusBar />
      {showWizard && (
        <FirstRunWizard
          ctx={wizardCtx}
          onComplete={() => setShowWizard(false)}
        />
      )}
      {isCemuKeysModalOpen && (
        <CemuKeysModal onSubmit={submitCemuKeys} onCancel={cancelCemuKeys} />
      )}
      {!NEW_SETTINGS_ENABLED &&
        showCemuKeysError &&
        pendingCemuKeysLaunch && (
          <CemuKeysMissingModal
            gameName={pendingCemuKeysLaunch.fileName}
            onGoToSettings={goToCemuKeysSettings}
            onCancel={dismissCemuKeysError}
          />
        )}
    </div>
  );
}
