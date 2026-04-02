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
} from "../../../core/types.js";

interface AppState {
  config: AppConfig | null;
  systems: SystemDefinition[];
  scanResult: ScanResult | null;
  selectedSystemId: string | null;
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
}

interface AppActions {
  setSelectedSystemId: (id: string | null) => void;
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
}

type AppContextType = AppState & AppActions;

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [systems, setSystems] = useState<SystemDefinition[]>([]);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
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

  useEffect(() => {
    async function init() {
      try {
        const [cfg, sys, scan, metadata] = await Promise.all([
          window.electronAPI.getConfig(),
          window.electronAPI.getSystems(),
          window.electronAPI.scanRoms(),
          window.electronAPI.getAllMetadata(),
        ]);
        setConfig(cfg);
        setSystems(sys);
        setScanResult(scan);
        setMetadataMap(metadata);

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

  const value: AppContextType = {
    config,
    systems,
    scanResult,
    selectedSystemId,
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
    setSelectedSystemId,
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
