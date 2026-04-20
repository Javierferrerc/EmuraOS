import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
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
  UpdateInfo,
} from "../../../core/types.js";

export type ActiveFilter =
  | { type: "all" }
  | { type: "system"; systemId: string }
  | { type: "favorites" }
  | { type: "recent" }
  | { type: "collection"; collectionId: string };

// Transient state for the fullscreen loading overlay shown between the
// moment the user triggers a launch and the moment the emulator window
// is actually visible (onGameSessionStarted). Carries the cover so the
// overlay can paint it onto the 3D cube without refetching.
export interface LaunchingGameState {
  rom: DiscoveredRom;
  coverDataUrl: string | null;
}

export interface DisambiguationFile {
  filePath: string;
  fileName: string;
  systems: Array<{ id: string; name: string }>;
  selectedSystemId: string | null;
}

export interface DisambiguationState {
  files: DisambiguationFile[];
  /** Unambiguous entries already resolved, waiting to be copied together */
  readyEntries: Array<{ filePath: string; systemId: string }>;
}

interface AppState {
  config: AppConfig | null;
  systems: SystemDefinition[];
  scanResult: ScanResult | null;
  activeFilter: ActiveFilter;
  searchQuery: string;
  isLoading: boolean;
  currentView: "library" | "settings" | "emulator-config" | "game";
  isGameRunning: boolean;
  launchingGame: LaunchingGameState | null;
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
  updateInfo: UpdateInfo | null;
  isUpdateModalOpen: boolean;
  isScanning: boolean;
  isAddingRoms: boolean;
  disambiguationPending: DisambiguationState | null;
  resolvedPaths: { romsPath: string; emulatorsPath: string } | null;
  romAddedDates: Record<string, string>;
}

interface AppActions {
  setActiveFilter: (filter: ActiveFilter) => void;
  setSearchQuery: (query: string) => void;
  setCurrentView: (view: "library" | "settings" | "emulator-config" | "game") => void;
  stopGame: () => Promise<void>;
  refreshScan: () => Promise<void>;
  updateConfig: (partial: Partial<AppConfig>) => Promise<void>;
  detectEmulators: () => Promise<void>;
  launchGame: (rom: DiscoveredRom, emulatorId?: string) => Promise<void>;
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
  cancelEmulatorDownload: () => void;
  checkForUpdates: () => Promise<void>;
  dismissUpdateModal: () => void;
  addRomsFlow: () => Promise<void>;
  resolveDisambiguation: (selections: Array<{ filePath: string; systemId: string }>) => Promise<void>;
  cancelDisambiguation: () => void;
}

type AppContextType = AppState & AppActions;

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  // Stable ref to the latest config so callbacks like `doLaunch` can read
  // up-to-date values without taking `config` as a dependency (which would
  // recreate the callback on every toggle change).
  const configRef = useRef<AppConfig | null>(null);
  useEffect(() => {
    configRef.current = config;
  }, [config]);
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
  const [launchingGame, setLaunchingGame] =
    useState<LaunchingGameState | null>(null);
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
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isAddingRoms, setIsAddingRoms] = useState(false);
  const [disambiguationPending, setDisambiguationPending] =
    useState<DisambiguationState | null>(null);
  const [resolvedPaths, setResolvedPaths] = useState<{
    romsPath: string;
    emulatorsPath: string;
  } | null>(null);
  const [romAddedDates, setRomAddedDates] = useState<Record<string, string>>({});

  // Load emulator definitions once on mount.
  useEffect(() => {
    window.electronAPI
      .getEmulatorDefs()
      .then(setEmulatorDefs)
      .catch((err) => console.error("Failed to load emulator defs:", err));
  }, []);

  // Load resolved config paths (absolute) and refresh when config changes.
  useEffect(() => {
    window.electronAPI
      .resolveConfigPaths()
      .then(setResolvedPaths)
      .catch((err) => console.error("Failed to resolve config paths:", err));
  }, [config]);

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
      // Clear the loading overlay — the main process just confirmed the
      // emulator window is visible (parented + fullscreen'd). All three
      // setStates batch into one render so the loader unmounts at the
      // same frame GameModeView mounts, avoiding any flash.
      setLaunchingGame(null);
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

  // Safety net: if the loader is shown but `game-session-started` never
  // fires (e.g. main-process bug, emulator crash during boot), force-clear
  // after 30s so the user isn't trapped behind the overlay.
  useEffect(() => {
    if (!launchingGame) return;
    const id = window.setTimeout(() => {
      console.warn(
        "[launchingGame] safety timeout reached — clearing overlay"
      );
      setLaunchingGame(null);
    }, 30_000);
    return () => window.clearTimeout(id);
  }, [launchingGame]);

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
        const [cfg, sys, scan, metadata, userLib, addedDates] = await Promise.all([
          window.electronAPI.getConfig(),
          window.electronAPI.getSystems(),
          window.electronAPI.scanRoms(),
          window.electronAPI.getAllMetadata(),
          window.electronAPI.getUserLibrary(),
          window.electronAPI.getRomAddedDates(),
        ]);
        setConfig(cfg);
        setSystems(sys);
        setScanResult(scan);
        setMetadataMap(metadata);
        setFavorites(new Set(userLib.favorites));
        setCollections(userLib.collections);
        setRecentlyPlayed(userLib.recentlyPlayed);
        setPlayHistory(userLib.playHistory);
        setRomAddedDates(addedDates);

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

      // Fire-and-forget emulator detection so results are ready
      // by the time the user opens the emulators settings page.
      detectEmulators();
    }
    init();
  }, []);

  const refreshScan = useCallback(async () => {
    setIsScanning(true);
    try {
      const scan = await window.electronAPI.scanRoms();
      setScanResult(scan);

      // Reload romAddedDates (scan-roms records new additions)
      const addedDates = await window.electronAPI.getRomAddedDates();
      setRomAddedDates(addedDates);

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
      setIsScanning(false);
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

  const cancelEmulatorDownloadAction = useCallback(() => {
    if (downloadingEmulatorId) {
      window.electronAPI.cancelEmulatorDownload(downloadingEmulatorId);
    }
  }, [downloadingEmulatorId]);

  // ── Auto-update ──────────────────────────────────────────────────
  const checkForUpdates = useCallback(async () => {
    try {
      const result = await window.electronAPI.checkForUpdates();
      if (result.available && result.updateInfo) {
        setUpdateInfo(result.updateInfo);
        setIsUpdateModalOpen(true);
      }
    } catch (err) {
      console.warn("Update check failed:", err);
    }
  }, []);

  const dismissUpdateModal = useCallback(() => {
    setIsUpdateModalOpen(false);
  }, []);

  // ── Add ROMs flow ──────────────────────────────────────────────────
  const addRomsFlow = useCallback(async () => {
    try {
      const selectedSystemId = activeFilter.type === "system" ? activeFilter.systemId : undefined;
      const filePaths = await window.electronAPI.pickRomFiles(selectedSystemId);
      if (!filePaths || filePaths.length === 0) return;

      const resolved = await window.electronAPI.resolveRomSystems(filePaths);

      const unambiguous: Array<{ filePath: string; systemId: string }> = [];
      const ambiguous: DisambiguationFile[] = [];

      for (const entry of resolved) {
        if (entry.systems.length === 1) {
          unambiguous.push({ filePath: entry.filePath, systemId: entry.systems[0].id });
        } else if (entry.systems.length > 1) {
          ambiguous.push({ ...entry, selectedSystemId: null });
        }
        // systems.length === 0 → skip silently (no matching system)
      }

      if (ambiguous.length > 0) {
        setDisambiguationPending({ files: ambiguous, readyEntries: unambiguous });
        return;
      }

      if (unambiguous.length === 0) return;

      setIsAddingRoms(true);
      try {
        await window.electronAPI.addRoms(unambiguous);
        await refreshScan();
      } finally {
        setIsAddingRoms(false);
      }
    } catch (err) {
      console.error("Failed to add ROMs:", err);
    }
  }, [refreshScan, activeFilter]);

  const resolveDisambiguation = useCallback(
    async (selections: Array<{ filePath: string; systemId: string }>) => {
      if (!disambiguationPending) return;
      const allEntries = [...disambiguationPending.readyEntries, ...selections];
      setDisambiguationPending(null);
      if (allEntries.length === 0) return;

      setIsAddingRoms(true);
      try {
        await window.electronAPI.addRoms(allEntries);
        await refreshScan();
      } catch (err) {
        console.error("Failed to add ROMs:", err);
      } finally {
        setIsAddingRoms(false);
      }
    },
    [disambiguationPending, refreshScan]
  );

  const cancelDisambiguation = useCallback(() => {
    setDisambiguationPending(null);
  }, []);

  // Listen for the main-process startup trigger
  useEffect(() => {
    const unsubscribe = window.electronAPI.onStartupUpdateCheck(() => {
      checkForUpdates();
    });
    return () => {
      unsubscribe();
    };
  }, [checkForUpdates]);

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
    async (rom: DiscoveredRom, emulatorId?: string) => {
      const result = await window.electronAPI.launchGame(rom, emulatorId);
      setLastLaunchResult(result);
      if (result.success) updatePlayStats(rom);
    },
    [updatePlayStats]
  );

  const doLaunch = useCallback(
    async (rom: DiscoveredRom, emulatorId?: string) => {
      // Show the loading overlay immediately so the user has instant
      // visual feedback. Look up the cover (cached in metadata) and read
      // it as a data URL so the overlay can paint it onto the 3D cube
      // without re-fetching from disk. Missing covers are fine — the
      // overlay falls back to a system-colored gradient.
      //
      // When the user has disabled the loading overlay from settings,
      // skip the cover read and the state write entirely — this makes
      // launches go straight from click to GameModeView without the
      // intermediate cube.
      const overlayEnabled =
        configRef.current?.gameLoadingOverlayEnabled ?? true;

      if (overlayEnabled) {
        const lastDot = rom.fileName.lastIndexOf(".");
        const metadataKey =
          lastDot > 0 ? rom.fileName.substring(0, lastDot) : rom.fileName;
        const metadata = metadataMap[rom.systemId]?.[metadataKey] ?? null;

        let coverDataUrl: string | null = null;
        if (metadata?.coverPath) {
          try {
            coverDataUrl = await window.electronAPI.readCoverDataUrl(
              metadata.coverPath
            );
          } catch (err) {
            console.warn("Failed to read cover for loading overlay:", err);
          }
        }
        setLaunchingGame({ rom, coverDataUrl });
      }

      // Try embedded overlay first. On success we DON'T clear the overlay
      // here — `onGameSessionStarted` will clear it when the main process
      // confirms the emulator window is visible. This keeps the cube
      // spinning through the ~500ms findWindowByPid + setFullScreen wait.
      try {
        console.log("[renderer] calling launchGameEmbedded...");
        const embeddedResult =
          await window.electronAPI.launchGameEmbedded(rom, emulatorId);
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

      // Fallback to normal (detached) launch. Detached emulators don't
      // emit game-session-started, so clear the overlay manually when
      // the IPC resolves — success or failure.
      try {
        await fallbackLaunch(rom, emulatorId);
      } catch (err) {
        console.error("Failed to launch game:", err);
      } finally {
        setLaunchingGame(null);
      }
    },
    [updatePlayStats, fallbackLaunch, metadataMap]
  );

  const launchGame = useCallback(
    async (rom: DiscoveredRom, emulatorId?: string) => {
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

      await doLaunch(rom, emulatorId);
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
    launchingGame,
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
    cancelEmulatorDownload: cancelEmulatorDownloadAction,
    updateInfo,
    isUpdateModalOpen,
    checkForUpdates,
    dismissUpdateModal,
    isScanning,
    isAddingRoms,
    disambiguationPending,
    addRomsFlow,
    resolveDisambiguation,
    cancelDisambiguation,
    resolvedPaths,
    romAddedDates,
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
