import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./context/AppContext";
import { useNavigation } from "./navigation/NavigationContext";
import { Layout } from "./components/Layout";
import { SettingsPage } from "./components/SettingsPage";
import { EmulatorConfigPage } from "./components/EmulatorConfigPage";
import { GameModeView } from "./components/GameModeView";
import { CemuKeysModal } from "./components/CemuKeysModal";
import { CemuKeysMissingModal } from "./components/CemuKeysMissingModal";
import { GameLoadingOverlay } from "./components/GameLoadingOverlay";
import { UpdateModal } from "./components/UpdateModal";
import { DisambiguationDialog } from "./components/DisambiguationDialog";
import { GameDetailModal } from "./components/GameDetailModal";
import { QuickLaunch } from "./components/QuickLaunch";
import { CollectionsModal } from "./components/CollectionsModal";
import { BulkSelectBar } from "./components/BulkSelectBar";
import { StatusBar } from "./components/StatusBar";
import { FirstRunWizard } from "./components/settings/wizard/FirstRunWizard";
import { AddRomWizard } from "./components/settings/wizard/AddRomWizard";
import { NEW_SETTINGS_ENABLED } from "./components/settings/feature-flags";
import type { SettingsContext as ISettingsContext } from "./schemas/settings-schema-types";

export default function App() {
  const app = useApp();
  const navigation = useNavigation();
  const [showWizard, setShowWizard] = useState(false);
  const [showAddRomWizard, setShowAddRomWizard] = useState(false);
  const addRomWizardShownRef = useRef(false);

  const {
    currentView,
    isGameRunning,
    pendingCemuKeysLaunch,
    isCemuKeysModalOpen,
    showCemuKeysError,
    submitCemuKeys,
    cancelCemuKeys,
    goToCemuKeysSettings,
    dismissCemuKeysError,
    isUpdateModalOpen,
    updateInfo,
    dismissUpdateModal,
  } = app;

  // Bridge: mirror `currentView` → navigation stack.
  //
  // Game session transitions ("/game" ↔ "/library") must ALWAYS sync
  // regardless of NEW_SETTINGS_ENABLED, because the game session IPC
  // events set `currentView` directly. Without this, when the new
  // settings flag is on, navigation.currentPath stays stale after a
  // game launch and GameModeView never renders — leaving the Layout
  // (and its useGamepad poll loop) active during gameplay.
  useEffect(() => {
    const target =
      currentView === "settings"
        ? "/settings"
        : currentView === "emulator-config"
          ? "/settings/emuladores"
          : currentView === "game"
            ? "/game"
            : "/library";

    // With the new settings flag, only sync game/library transitions.
    // Settings paths are driven by NavigationContext directly.
    if (NEW_SETTINGS_ENABLED && target !== "/game" && target !== "/library") {
      return;
    }

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

  // Apply theme to <html> so CSS [data-theme] selectors work globally
  useEffect(() => {
    const theme = app.config?.theme ?? "dark";
    if (theme === "dark") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [app.config?.theme]);

  // First-run wizard — only show when the user hasn't completed setup yet
  useEffect(() => {
    if (NEW_SETTINGS_ENABLED && app.config && !app.config.firstRunCompleted) {
      setShowWizard(true);
    }
  }, [app.config]);

  // AddRomWizard — show when setup is done but no ROMs found
  useEffect(() => {
    if (
      !showWizard &&
      app.config?.firstRunCompleted &&
      app.scanResult &&
      app.scanResult.totalRoms === 0 &&
      !addRomWizardShownRef.current
    ) {
      addRomWizardShownRef.current = true;
      setShowAddRomWizard(true);
    }
  }, [showWizard, app.config?.firstRunCompleted, app.scanResult]);

  // Auto-close AddRomWizard when ROMs appear
  useEffect(() => {
    if (showAddRomWizard && app.scanResult && app.scanResult.totalRoms > 0) {
      setTimeout(() => setShowAddRomWizard(false), 300);
    }
  }, [showAddRomWizard, app.scanResult]);

  // Systems available for AddRomWizard (derived from detected emulators)
  const availableSystems = useMemo(() => {
    if (!app.lastDetection?.detected) return [];
    const systemIds = new Set<string>();
    for (const emu of app.lastDetection.detected) {
      for (const sysId of emu.systems) systemIds.add(sysId);
    }
    return app.systems
      .filter((s) => systemIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name }));
  }, [app.lastDetection, app.systems]);

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
      resolvedPaths: app.resolvedPaths ?? undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      app.config,
      app.updateConfig,
      app.isDetectingEmulators,
      app.lastDetection,
      app.driveEmulators,
      app.isLoadingDrive,
      app.downloadingEmulatorId,
      app.emulatorDownloadProgress,
      app.emulatorDefs,
      app.gamepadConnected,
      app.resolvedPaths,
    ]
  );

  // ── Background image layer ─────────────────────────────────────────
  const [backgroundDataUrl, setBackgroundDataUrl] = useState<string | null>(null);
  const bgImagePath = app.config?.backgroundImage;
  useEffect(() => {
    if (!bgImagePath) {
      setBackgroundDataUrl(null);
      return;
    }
    let cancelled = false;
    window.electronAPI.readBackgroundDataUrl(bgImagePath).then((url) => {
      if (!cancelled) setBackgroundDataUrl(url);
    });
    return () => { cancelled = true; };
  }, [bgImagePath]);

  const bgBrightness = app.config?.backgroundBrightness ?? 100;
  const bgBlur = app.config?.backgroundBlur ?? 0;
  const bgOpacity = app.config?.backgroundOpacity ?? 30;

  let page;
  if (NEW_SETTINGS_ENABLED) {
    const path = navigation.currentPath;
    if (path === "/game") {
      page = <GameModeView />;
    } else if (path.startsWith("/settings")) {
      page = <SettingsPage />;
    } else {
      page = <Layout inputDisabled={showWizard || showAddRomWizard || isGameRunning || !!app.detailModalRom || app.quickLaunchOpen || app.collectionsModalOpen} />;
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
        page = <Layout inputDisabled={showWizard || showAddRomWizard || isGameRunning || !!app.detailModalRom || app.quickLaunchOpen || app.collectionsModalOpen} />;
    }
  }

  return (
    <div className="flex h-screen flex-col">
      {backgroundDataUrl && (
        <div
          className="pointer-events-none fixed inset-0"
          style={{
            backgroundImage: `url(${backgroundDataUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: `brightness(${bgBrightness / 100}) blur(${bgBlur}px)`,
            opacity: bgOpacity / 100,
            zIndex: 0,
          }}
        />
      )}
      <div className="flex-1 overflow-hidden">{page}</div>
      {/* <StatusBar /> */}
      {showWizard && (
        <FirstRunWizard
          ctx={wizardCtx}
          onComplete={() => { setTimeout(() => setShowWizard(false), 300); }}
        />
      )}
      {showAddRomWizard && (
        <AddRomWizard
          onComplete={() => { setTimeout(() => setShowAddRomWizard(false), 300); }}
          onAddRoms={app.addRomsFlow}
          availableSystems={availableSystems}
          gamepadConnected={app.gamepadConnected}
          isAddingRoms={app.isAddingRoms}
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
      {isUpdateModalOpen && updateInfo && (
        <UpdateModal updateInfo={updateInfo} onDismiss={dismissUpdateModal} />
      )}
      <DisambiguationDialog />
      {app.quickLaunchOpen && <QuickLaunch />}
      {app.collectionsModalOpen && <CollectionsModal />}
      <BulkSelectBar />
      {app.detailModalRom && (
        <GameDetailModal
          rom={app.detailModalRom}
          onClose={app.closeGameDetail}
          onLaunch={(rom) => {
            app.closeGameDetail();
            app.launchGame(rom);
          }}
        />
      )}
      {/* Launch loading overlay — mounted last so DOM order + z-index 9999
          + isolation guarantee it wins stacking over any modal. Conditional
          on `launchingGame` inside the component itself. */}
      <GameLoadingOverlay />
    </div>
  );
}
