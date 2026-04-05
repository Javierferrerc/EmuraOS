import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type {
  AppConfig,
  SystemDefinition,
  ScanResult,
  DetectionResult,
  DiscoveredRom,
  LaunchResult,
  GameMetadata,
  GameSessionEvent,
  ScrapeResult,
  ScrapeProgress,
  CoverFetchResult,
  CoverFetchProgress,
  CoreDownloadProgress,
  ReadinessReport,
  Collection,
  PlayRecord,
  EmulatorDefinition,
  DriveEmulatorMapping,
  EmulatorDownloadProgress,
} from "../../../core/types.js";

export type ActiveFilter =
  | { type: "all" }
  | { type: "system"; systemId: string }
  | { type: "favorites" }
  | { type: "recent" }
  | { type: "collection"; collectionId: string };

interface AppState {
  config: AppConfig | null;
  systems: SystemDefinition[];
  scanResult: ScanResult | null;
  activeFilter: ActiveFilter;
  searchQuery: string;
  isLoading: boolean;
  currentView: "library" | "settings" | "emulator-config" | "game";
  isGameRunning: boolean;
  currentGame: GameSessionEvent | null;
  lastDetection: DetectionResult | null;
  lastLaunchResult: LaunchResult | null;
  metadataMap: Record<string, Record<string, GameMetadata>>;
  isScraping: boolean;
  scrapeProgress: ScrapeProgress | null;
  lastScrapeResult: ScrapeResult | null;
  isFetchingCovers: boolean;
  coverFetchProgress: CoverFetchProgress | null;
  lastCoverFetchResult: CoverFetchResult | null;
  favorites: Set<string>;
  collections: Collection[];
  recentlyPlayed: string[];
  playHistory: Record<string, PlayRecord>;
  isFullscreen: boolean;
  gamepadConnected: boolean;
  isDetectingEmulators: boolean;
  coreDownloadProgress: CoreDownloadProgress | null;
  readinessReport: ReadinessReport | null;
  pendingCemuKeysLaunch: DiscoveredRom | null;
  isCemuKeysModalOpen: boolean;
  showCemuKeysError: boolean;
  emulatorDefs: EmulatorDefinition[];
  driveEmulators: Record<string, DriveEmulatorMapping>;
  isLoadingDrive: boolean;
  downloadingEmulatorId: string | null;
  emulatorDownloadProgress: EmulatorDownloadProgress | null;
}

interface AppActions {
  setActiveFilter: (filter: ActiveFilter) => void;
  setSearchQuery: (query: string) => void;
  setCurrentView: (view: "library" | "settings" | "emulator-config" | "game") => void;
  stopGame: () => Promise<void>;
  refreshScan: () => Promise<void>;
  updateConfig: (partial: Partial<AppConfig>) => Promise<void>;
  detectEmulators: () => Promise<void>;
  launchGame: (rom: DiscoveredRom) => Promise<void>;
  loadAllMetadata: () => Promise<void>;
  startScraping: () => Promise<void>;
  startFetchingCovers: () => Promise<void>;
  getMetadataForRom: (
    systemId: string,
    romFileName: string
  ) => GameMetadata | null;
  toggleFavorite: (systemId: string, fileName: string) => Promise<void>;
  isFavorite: (systemId: string, fileName: string) => boolean;
  createCollection: (name: string) => Promise<void>;
  renameCollection: (id: string, name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  addToCollection: (
    collectionId: string,
    systemId: string,
    fileName: string
  ) => Promise<void>;
  removeFromCollection: (
    collectionId: string,
    systemId: string,
    fileName: string
  ) => Promise<void>;
  toggleFullscreen: () => void;
  setGamepadConnected: (connected: boolean) => void;
  submitCemuKeys: (content: string) => Promise<void>;
  cancelCemuKeys: () => void;
  openCemuKeysModal: () => void;
  goToCemuKeysSettings: () => void;
  dismissCemuKeysError: () => void;
  refreshDriveEmulators: (forceRefresh?: boolean) => Promise<void>;
  downloadEmulator: (
    emulatorId: string
  ) => Promise<{ success: boolean; installPath: string; error?: string }>;
}

type AppContextType = AppState & AppActions;

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [systems, setSystems] = useState<SystemDefinition[]>([]);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>({
    type: "all",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState<
    "library" | "settings" | "emulator-config" | "game"
  >("library");
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [currentGame, setCurrentGame] = useState<GameSessionEvent | null>(null);
  const [lastDetection, setLastDetection] = useState<DetectionResult | null>(
    null
  );
  const [lastLaunchResult, setLastLaunchResult] =
    useState<LaunchResult | null>(null);
  const [metadataMap, setMetadataMap] = useState<
    Record<string, Record<string, GameMetadata>>
  >({});
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<ScrapeProgress | null>(
    null
  );
  const [lastScrapeResult, setLastScrapeResult] =
    useState<ScrapeResult | null>(null);
  const [isFetchingCovers, setIsFetchingCovers] = useState(false);
  const [coverFetchProgress, setCoverFetchProgress] =
    useState<CoverFetchProgress | null>(null);
  const [lastCoverFetchResult, setLastCoverFetchResult] =
    useState<CoverFetchResult | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [collections, setCollections] = useState<Collection[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<string[]>([]);
  const [playHistory, setPlayHistory] = useState<Record<string, PlayRecord>>(
    {}
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [isDetectingEmulators, setIsDetectingEmulators] = useState(false);
  const [coreDownloadProgress, setCoreDownloadProgress] =
    useState<CoreDownloadProgress | null>(null);
  const [readinessReport, setReadinessReport] =
    useState<ReadinessReport | null>(null);
  const [pendingCemuKeysLaunch, setPendingCemuKeysLaunch] =
    useState<DiscoveredRom | null>(null);
  const [isCemuKeysModalOpen, setIsCemuKeysModalOpen] = useState(false);
  const [showCemuKeysError, setShowCemuKeysError] = useState(false);
  const [emulatorDefs, setEmulatorDefs] = useState<EmulatorDefinition[]>([]);
  const [driveEmulators, setDriveEmulators] = useState<
    Record<string, DriveEmulatorMapping>
  >({});
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [downloadingEmulatorId, setDownloadingEmulatorId] = useState<
    string | null
  >(null);
  const [emulatorDownloadProgress, setEmulatorDownloadProgress] =
    useState<EmulatorDownloadProgress | null>(null);

  // Load emulator definitions once on mount.
  useEffect(() => {
    window.electronAPI
      .getEmulatorDefs()
      .then(setEmulatorDefs)
      .catch((err) => console.error("Failed to load emulator defs:", err));
  }, []);

  // Fullscreen sync
  useEffect(() => {
    window.electronAPI.getFullscreen().then(setIsFullscreen);
    window.electronAPI.onFullscreenChanged(setIsFullscreen);
    return () => {
      window.electronAPI.removeFullscreenChangedListener();
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    window.electronAPI.toggleFullscreen();
  }, []);

  // Game session listeners
  useEffect(() => {
    window.electronAPI.onGameSessionStarted((event: GameSessionEvent) => {
      setIsGameRunning(true);
      setCurrentGame(event);
      setCurrentView("game");
    });
    window.electronAPI.onGameSessionEnded(() => {
      setIsGameRunning(false);
      setCurrentGame(null);
      setCurrentView("library");
    });
    return () => {
      window.electronAPI.removeGameSessionStartedListener();
      window.electronAPI.removeGameSessionEndedListener();
    };
  }, []);

  const stopGame = useCallback(async () => {
    try {
      await window.electronAPI.stopEmbeddedGame();
    } catch (err) {
      console.error("Failed to stop game:", err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const [cfg, sys, scan, metadata, userLib] = await Promise.all([
          window.electronAPI.getConfig(),
          window.electronAPI.getSystems(),
          window.electronAPI.scanRoms(),
          window.electronAPI.getAllMetadata(),
          window.electronAPI.getUserLibrary(),
        ]);
        setConfig(cfg);
        setSystems(sys);
        setScanResult(scan);
        setMetadataMap(metadata);
        setFavorites(new Set(userLib.favorites));
        setCollections(userLib.collections);
        setRecentlyPlayed(userLib.recentlyPlayed);
        setPlayHistory(userLib.playHistory);

        // Auto-fetch covers from Libretro if there are ROMs without covers
        const hasRomsWithoutCovers = scan.systems.some((system) =>
          system.roms.some(
            (rom) => !metadata[system.systemId]?.[rom.fileName]?.coverPath
          )
        );
        if (hasRomsWithoutCovers && scan.totalRoms > 0) {
          setIsFetchingCovers(true);
          window.electronAPI.onCoverFetchProgress((progress) => {
            setCoverFetchProgress(progress);
          });
          try {
            const coverResult = await window.electronAPI.fetchCovers();
            setLastCoverFetchResult(coverResult);
            // Reload metadata to pick up new covers
            const updatedMetadata =
              await window.electronAPI.getAllMetadata();
            setMetadataMap(updatedMetadata);
          } catch (coverErr) {
            console.error("Failed to auto-fetch covers:", coverErr);
          } finally {
            setIsFetchingCovers(false);
            window.electronAPI.removeCoverFetchProgressListener();
          }
        }
      } catch (err) {
        console.error("Failed to initialize:", err);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const refreshScan = useCallback(async () => {
    setIsLoading(true);
    try {
      const scan = await window.electronAPI.scanRoms();
      setScanResult(scan);

      // Reload metadata for any new ROMs
      const metadata = await window.electronAPI.getAllMetadata();
      setMetadataMap(metadata);

      // Auto-fetch covers for ROMs that don't have one yet
      const hasRomsWithoutCovers = scan.systems.some((system) =>
        system.roms.some(
          (rom) => !metadata[system.systemId]?.[rom.fileName]?.coverPath
        )
      );
      if (hasRomsWithoutCovers && scan.totalRoms > 0) {
        setIsFetchingCovers(true);
        window.electronAPI.onCoverFetchProgress((progress) => {
          setCoverFetchProgress(progress);
        });
        try {
          const coverResult = await window.electronAPI.fetchCovers();
          setLastCoverFetchResult(coverResult);
          const updatedMetadata = await window.electronAPI.getAllMetadata();
          setMetadataMap(updatedMetadata);
        } catch (coverErr) {
          console.error("Failed to auto-fetch covers:", coverErr);
        } finally {
          setIsFetchingCovers(false);
          window.electronAPI.removeCoverFetchProgressListener();
        }
      }
    } catch (err) {
      console.error("Failed to scan ROMs:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateConfig = useCallback(async (partial: Partial<AppConfig>) => {
    try {
      const updated = await window.electronAPI.updateConfig(partial);
      setConfig(updated);
    } catch (err) {
      console.error("Failed to update config:", err);
    }
  }, []);

  const refreshDriveEmulators = useCallback(
    async (forceRefresh = false) => {
      setIsLoadingDrive(true);
      try {
        const map =
          await window.electronAPI.listDriveEmulators(forceRefresh);
        setDriveEmulators(map);
      } catch (err) {
        console.error("Failed to list Drive emulators:", err);
      } finally {
        setIsLoadingDrive(false);
      }
    },
    []
  );

  const detectEmulators = useCallback(async () => {
    setIsDetectingEmulators(true);
    setCoreDownloadProgress(null);
    setReadinessReport(null);

    window.electronAPI.onCoreDownloadProgress((progress) => {
      setCoreDownloadProgress(progress);
    });

    try {
      // Run local detection and Drive listing together — one click should
      // answer both "is it installed locally?" and "is there a downloadable
      // copy on Drive?". Drive listing is force-refreshed so the cache is
      // bypassed and the user always sees the latest Drive state.
      setIsLoadingDrive(true);
      const [result, driveMap] = await Promise.all([
        window.electronAPI.detectEmulators(),
        window.electronAPI
          .listDriveEmulators(true)
          .catch((err) => {
            console.error("Failed to list Drive emulators:", err);
            return {} as Record<string, DriveEmulatorMapping>;
          }),
      ]);
      setLastDetection(result);
      if (result.readiness) {
        setReadinessReport(result.readiness);
      }
      setDriveEmulators(driveMap);
    } catch (err) {
      console.error("Failed to detect emulators:", err);
    } finally {
      setIsDetectingEmulators(false);
      setIsLoadingDrive(false);
      window.electronAPI.removeCoreDownloadProgressListener();
    }
  }, []);

  const downloadEmulatorAction = useCallback(
    async (emulatorId: string) => {
      setDownloadingEmulatorId(emulatorId);
      setEmulatorDownloadProgress(null);
      const unsubscribe = window.electronAPI.onEmulatorDownloadProgress(
        (p) => setEmulatorDownloadProgress(p)
      );
      try {
        const result =
          await window.electronAPI.downloadEmulator(emulatorId);
        if (result.success) {
          // Re-run detection so the emulator flips from "Available" to
          // "Installed" in the UI.
          await detectEmulators();
        }
        return result;
      } finally {
        unsubscribe();
        setDownloadingEmulatorId(null);
        setEmulatorDownloadProgress(null);
      }
    },
    [detectEmulators]
  );

  const updatePlayStats = useCallback((rom: DiscoveredRom) => {
    const key = `${rom.systemId}:${rom.fileName}`;
    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((k) => k !== key);
      return [key, ...filtered].slice(0, 50);
    });
    setPlayHistory((prev) => {
      const existing = prev[key];
      return {
        ...prev,
        [key]: {
          lastPlayed: new Date().toISOString(),
          playCount: (existing?.playCount ?? 0) + 1,
        },
      };
    });
  }, []);

  const fallbackLaunch = useCallback(
    async (rom: DiscoveredRom) => {
      const result = await window.electronAPI.launchGame(rom);
      setLastLaunchResult(result);
      if (result.success) updatePlayStats(rom);
    },
    [updatePlayStats]
  );

  const doLaunch = useCallback(
    async (rom: DiscoveredRom) => {
      // Try embedded overlay first
      try {
        console.log("[renderer] calling launchGameEmbedded...");
        const embeddedResult =
          await window.electronAPI.launchGameEmbedded(rom);
        console.log("[renderer] embeddedResult:", JSON.stringify(embeddedResult));
        if (embeddedResult.success) {
          updatePlayStats(rom);
          return;
        }
        console.warn(
          "Embedded launch failed, falling back to normal:",
          embeddedResult.error
        );
      } catch (err) {
        console.warn("Embedded launch threw, falling back to normal:", err);
      }

      // Fallback to normal (detached) launch
      try {
        await fallbackLaunch(rom);
      } catch (err) {
        console.error("Failed to launch game:", err);
      }
    },
    [updatePlayStats, fallbackLaunch]
  );

  const launchGame = useCallback(
    async (rom: DiscoveredRom) => {
      // Wii U: verify Cemu keys.txt exists before launching. If missing,
      // stop here and show an explanatory error modal with a button that
      // directs the user to Settings, where they can paste the keys. The
      // rom is stashed in `pendingCemuKeysLaunch` so the paste-modal submit
      // handler can auto-launch it once keys are saved.
      if (rom.systemId === "wiiu") {
        try {
          const status = await window.electronAPI.checkCemuKeys();
          if (status.emulatorFound && !status.exists) {
            setPendingCemuKeysLaunch(rom);
            setShowCemuKeysError(true);
            return;
          }
        } catch (err) {
          console.warn("Failed to check Cemu keys:", err);
        }
      }

      await doLaunch(rom);
    },
    [doLaunch]
  );

  const submitCemuKeys = useCallback(
    async (content: string) => {
      await window.electronAPI.writeCemuKeys(content);
      const rom = pendingCemuKeysLaunch;
      setPendingCemuKeysLaunch(null);
      setIsCemuKeysModalOpen(false);
      setShowCemuKeysError(false);
      if (rom) {
        await doLaunch(rom);
      }
    },
    [pendingCemuKeysLaunch, doLaunch]
  );

  const cancelCemuKeys = useCallback(() => {
    setPendingCemuKeysLaunch(null);
    setIsCemuKeysModalOpen(false);
    setShowCemuKeysError(false);
  }, []);

  const openCemuKeysModal = useCallback(() => {
    setIsCemuKeysModalOpen(true);
  }, []);

  const goToCemuKeysSettings = useCallback(() => {
    // Keep pendingCemuKeysLaunch so the game auto-launches after the user
    // pastes the keys in Settings.
    setShowCemuKeysError(false);
    setCurrentView("settings");
  }, []);

  const dismissCemuKeysError = useCallback(() => {
    setShowCemuKeysError(false);
    setPendingCemuKeysLaunch(null);
  }, []);

  const loadAllMetadata = useCallback(async () => {
    try {
      const metadata = await window.electronAPI.getAllMetadata();
      setMetadataMap(metadata);
    } catch (err) {
      console.error("Failed to load metadata:", err);
    }
  }, []);

  const startScraping = useCallback(async () => {
    setIsScraping(true);
    setScrapeProgress(null);
    setLastScrapeResult(null);

    window.electronAPI.onScrapeProgress((progress) => {
      setScrapeProgress(progress);
    });

    try {
      const result = await window.electronAPI.scrapeAllMetadata();
      setLastScrapeResult(result);
      // Reload metadata after scraping
      const metadata = await window.electronAPI.getAllMetadata();
      setMetadataMap(metadata);
    } catch (err) {
      console.error("Failed to scrape metadata:", err);
    } finally {
      setIsScraping(false);
      window.electronAPI.removeScrapeProgressListener();
    }
  }, []);

  const startFetchingCovers = useCallback(async () => {
    setIsFetchingCovers(true);
    setCoverFetchProgress(null);
    setLastCoverFetchResult(null);

    window.electronAPI.onCoverFetchProgress((progress) => {
      setCoverFetchProgress(progress);
    });

    try {
      const result = await window.electronAPI.fetchCovers();
      setLastCoverFetchResult(result);
      // Reload metadata after fetching covers
      const metadata = await window.electronAPI.getAllMetadata();
      setMetadataMap(metadata);
    } catch (err) {
      console.error("Failed to fetch covers:", err);
    } finally {
      setIsFetchingCovers(false);
      window.electronAPI.removeCoverFetchProgressListener();
    }
  }, []);

  const getMetadataForRom = useCallback(
    (systemId: string, romFileName: string): GameMetadata | null => {
      // Metadata cache is keyed by basename (no extension) so that
      // Silent Hill.bin / Silent Hill.cue / Silent Hill.chd share
      // the same metadata entry.
      const lastDot = romFileName.lastIndexOf(".");
      const key = lastDot > 0 ? romFileName.substring(0, lastDot) : romFileName;
      return metadataMap[systemId]?.[key] ?? null;
    },
    [metadataMap]
  );

  const toggleFavorite = useCallback(
    async (systemId: string, fileName: string) => {
      try {
        const isFav = await window.electronAPI.toggleFavorite(
          systemId,
          fileName
        );
        const key = `${systemId}:${fileName}`;
        setFavorites((prev) => {
          const next = new Set(prev);
          if (isFav) {
            next.add(key);
          } else {
            next.delete(key);
          }
          return next;
        });
      } catch (err) {
        console.error("Failed to toggle favorite:", err);
      }
    },
    []
  );

  const isFavoriteCheck = useCallback(
    (systemId: string, fileName: string): boolean => {
      return favorites.has(`${systemId}:${fileName}`);
    },
    [favorites]
  );

  const createCollectionAction = useCallback(async (name: string) => {
    try {
      const col = await window.electronAPI.createCollection(name);
      setCollections((prev) => [...prev, col]);
    } catch (err) {
      console.error("Failed to create collection:", err);
    }
  }, []);

  const renameCollectionAction = useCallback(
    async (id: string, name: string) => {
      try {
        await window.electronAPI.renameCollection(id, name);
        setCollections((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, name, updatedAt: new Date().toISOString() }
              : c
          )
        );
      } catch (err) {
        console.error("Failed to rename collection:", err);
      }
    },
    []
  );

  const deleteCollectionAction = useCallback(
    async (id: string) => {
      try {
        await window.electronAPI.deleteCollection(id);
        setCollections((prev) => prev.filter((c) => c.id !== id));
        // If we were viewing the deleted collection, switch to "all"
        setActiveFilter((prev) =>
          prev.type === "collection" && prev.collectionId === id
            ? { type: "all" }
            : prev
        );
      } catch (err) {
        console.error("Failed to delete collection:", err);
      }
    },
    []
  );

  const addToCollectionAction = useCallback(
    async (collectionId: string, systemId: string, fileName: string) => {
      try {
        await window.electronAPI.addToCollection(
          collectionId,
          systemId,
          fileName
        );
        const key = `${systemId}:${fileName}`;
        setCollections((prev) =>
          prev.map((c) =>
            c.id === collectionId && !c.roms.includes(key)
              ? {
                  ...c,
                  roms: [...c.roms, key],
                  updatedAt: new Date().toISOString(),
                }
              : c
          )
        );
      } catch (err) {
        console.error("Failed to add to collection:", err);
      }
    },
    []
  );

  const removeFromCollectionAction = useCallback(
    async (collectionId: string, systemId: string, fileName: string) => {
      try {
        await window.electronAPI.removeFromCollection(
          collectionId,
          systemId,
          fileName
        );
        const key = `${systemId}:${fileName}`;
        setCollections((prev) =>
          prev.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  roms: c.roms.filter((r) => r !== key),
                  updatedAt: new Date().toISOString(),
                }
              : c
          )
        );
      } catch (err) {
        console.error("Failed to remove from collection:", err);
      }
    },
    []
  );

  const value: AppContextType = {
    config,
    systems,
    scanResult,
    activeFilter,
    searchQuery,
    isLoading,
    currentView,
    isGameRunning,
    currentGame,
    lastDetection,
    lastLaunchResult,
    metadataMap,
    isScraping,
    scrapeProgress,
    lastScrapeResult,
    isFetchingCovers,
    coverFetchProgress,
    lastCoverFetchResult,
    favorites,
    collections,
    recentlyPlayed,
    playHistory,
    isFullscreen,
    gamepadConnected,
    isDetectingEmulators,
    coreDownloadProgress,
    readinessReport,
    pendingCemuKeysLaunch,
    isCemuKeysModalOpen,
    showCemuKeysError,
    emulatorDefs,
    driveEmulators,
    isLoadingDrive,
    downloadingEmulatorId,
    emulatorDownloadProgress,
    setActiveFilter,
    setSearchQuery,
    setCurrentView,
    stopGame,
    refreshScan,
    updateConfig,
    detectEmulators,
    launchGame,
    loadAllMetadata,
    startScraping,
    startFetchingCovers,
    getMetadataForRom,
    toggleFavorite,
    isFavorite: isFavoriteCheck,
    createCollection: createCollectionAction,
    renameCollection: renameCollectionAction,
    deleteCollection: deleteCollectionAction,
    addToCollection: addToCollectionAction,
    removeFromCollection: removeFromCollectionAction,
    toggleFullscreen,
    setGamepadConnected,
    submitCemuKeys,
    cancelCemuKeys,
    openCemuKeysModal,
    goToCemuKeysSettings,
    dismissCemuKeysError,
    refreshDriveEmulators,
    downloadEmulator: downloadEmulatorAction,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
