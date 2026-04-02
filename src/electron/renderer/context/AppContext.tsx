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
  ScrapeResult,
  ScrapeProgress,
  CoverFetchResult,
  CoverFetchProgress,
  Collection,
  PlayRecord,
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
  currentView: "library" | "settings";
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
}

interface AppActions {
  setActiveFilter: (filter: ActiveFilter) => void;
  setSearchQuery: (query: string) => void;
  setCurrentView: (view: "library" | "settings") => void;
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
  const [currentView, setCurrentView] = useState<"library" | "settings">(
    "library"
  );
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

  const detectEmulators = useCallback(async () => {
    try {
      const result = await window.electronAPI.detectEmulators();
      setLastDetection(result);
    } catch (err) {
      console.error("Failed to detect emulators:", err);
    }
  }, []);

  const launchGame = useCallback(async (rom: DiscoveredRom) => {
    try {
      const result = await window.electronAPI.launchGame(rom);
      setLastLaunchResult(result);
      if (result.success) {
        // Optimistically update recently played and play history
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
      }
    } catch (err) {
      console.error("Failed to launch game:", err);
    }
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
      return metadataMap[systemId]?.[romFileName] ?? null;
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
    setActiveFilter,
    setSearchQuery,
    setCurrentView,
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
