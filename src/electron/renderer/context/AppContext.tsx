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
}

interface AppActions {
  setSelectedSystemId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setCurrentView: (view: "library" | "settings") => void;
  refreshScan: () => Promise<void>;
  updateConfig: (partial: Partial<AppConfig>) => Promise<void>;
  detectEmulators: () => Promise<void>;
  launchGame: (rom: DiscoveredRom) => Promise<void>;
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

  useEffect(() => {
    async function init() {
      try {
        const [cfg, sys, scan] = await Promise.all([
          window.electronAPI.getConfig(),
          window.electronAPI.getSystems(),
          window.electronAPI.scanRoms(),
        ]);
        setConfig(cfg);
        setSystems(sys);
        setScanResult(scan);
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
    setSelectedSystemId,
    setSearchQuery,
    setCurrentView,
    refreshScan,
    updateConfig,
    detectEmulators,
    launchGame,
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
