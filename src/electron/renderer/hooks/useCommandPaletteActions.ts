/**
 * React hook that wires AppContext into the command-palette action registry.
 *
 * Kept as a thin adapter over `buildCommandPaletteActions` so the builder
 * stays pure and testable without having to mock AppContext. The palette
 * component only needs to call `useCommandPaletteActions()` and render.
 */

import { useMemo } from "react";
import { useApp } from "../context/AppContext";
import {
  buildCommandPaletteActions,
  type CommandAction,
} from "../utils/commandPaletteActions";

export function useCommandPaletteActions(): CommandAction[] {
  const app = useApp();

  return useMemo(
    () =>
      buildCommandPaletteActions({
        config: app.config,
        collections: app.collections,
        detection: app.lastDetection,
        emulatorDefs: app.emulatorDefs,
        setCurrentView: app.setCurrentView,
        refreshScan: () => {
          void app.refreshScan();
        },
        addRomsFlow: () => {
          void app.addRomsFlow();
        },
        startScraping: () => {
          void app.startScraping();
        },
        startFetchingCovers: () => {
          void app.startFetchingCovers();
        },
        setCollectionsModalOpen: app.setCollectionsModalOpen,
        toggleFullscreen: app.toggleFullscreen,
        updateConfig: (patch) => {
          void app.updateConfig(patch);
        },
        setActiveFilter: app.setActiveFilter,
        downloadEmulator: (id) => {
          void app.downloadEmulator(id);
        },
      }),
    // Recompute when the inputs that affect the action list change. Callbacks
    // are assumed stable (they come from useCallback in AppContext).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      app.config?.theme,
      app.config?.libraryViewMode,
      app.collections,
      app.lastDetection,
      app.emulatorDefs,
    ]
  );
}
