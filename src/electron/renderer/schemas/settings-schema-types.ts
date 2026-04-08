import type { ComponentType } from "react";
import type {
  AppConfig,
  Collection,
  CoverFetchProgress,
  CoverFetchResult,
  DetectionResult,
  DiscoveredRom,
  DriveEmulatorMapping,
  EmulatorDefinition,
  EmulatorDownloadProgress,
  GameMetadata,
  PlayRecord,
  ReadinessReport,
  ScrapeProgress,
  ScrapeResult,
} from "../../../core/types";
import type { NavigationApi } from "../navigation/navigation-types";

/**
 * Phase 13 schema-driven settings types.
 *
 * Each Settings row is a plain data object — not bespoke JSX — so that the
 * same schema can drive the Settings shell, the first-run wizard, and the
 * eventual prerequisite cards without duplication.
 *
 * `SettingsContext` is the host environment passed to every row's `get` /
 * `set` / `run` closure. PR2 extends it with readiness, downloads, virtual
 * keyboard, library actions, etc.
 */

export type SettingValue = string | number | boolean;

/**
 * Everything a settings row closure might need in order to read state,
 * mutate config, run an action, or route elsewhere. All fields are
 * supplied from `SettingsRoot` by pulling the values from `useApp()` +
 * `useNavigation()` and forwarding them here.
 *
 * Keep this interface additive — rows depend on it structurally.
 */
export interface SettingsContext {
  // --- Config + persistence ---
  config: AppConfig | null;
  updateConfig: (partial: Partial<AppConfig>) => Promise<void>;

  // --- Navigation (for buttons that jump to sub-sections) ---
  navigation: NavigationApi;

  // --- Library state ---
  favorites: Set<string>;
  recentlyPlayed: string[];
  playHistory: Record<string, PlayRecord>;
  collections: Collection[];
  metadataMap: Record<string, Record<string, GameMetadata>>;

  // --- Scan / scrape / cover fetch ---
  isLoading: boolean;
  refreshScan: () => Promise<void>;
  isScraping: boolean;
  scrapeProgress: ScrapeProgress | null;
  lastScrapeResult: ScrapeResult | null;
  startScraping: () => Promise<void>;
  isFetchingCovers: boolean;
  coverFetchProgress: CoverFetchProgress | null;
  lastCoverFetchResult: CoverFetchResult | null;
  startFetchingCovers: () => Promise<void>;

  // --- Emulators ---
  emulatorDefs: EmulatorDefinition[];
  lastDetection: DetectionResult | null;
  readinessReport: ReadinessReport | null;
  isDetectingEmulators: boolean;
  detectEmulators: () => Promise<void>;
  driveEmulators: Record<string, DriveEmulatorMapping>;
  isLoadingDrive: boolean;
  refreshDriveEmulators: (forceRefresh?: boolean) => Promise<void>;
  downloadingEmulatorId: string | null;
  emulatorDownloadProgress: EmulatorDownloadProgress | null;
  downloadEmulator: (
    emulatorId: string
  ) => Promise<{ success: boolean; installPath: string; error?: string }>;

  // --- Cemu keys flow ---
  pendingCemuKeysLaunch: DiscoveredRom | null;
  isCemuKeysModalOpen: boolean;
  openCemuKeysModal: () => void;

  // --- Gamepad / fullscreen ---
  gamepadConnected: boolean;
  isFullscreen: boolean;
  toggleFullscreen: () => void;

  // --- Game session (for StatusBar + Estado tab) ---
  isGameRunning: boolean;
  currentGameFileName: string | null;
}

interface BaseSetting {
  /** Stable identifier — used for focus restore and React keys. */
  id: string;
  label: string;
  description?: string;
  hidden?: boolean;
  disabled?: boolean | ((ctx: SettingsContext) => boolean);
  /** When true, the row renders but is skipped by gamepad/keyboard focus. */
  nonFocusable?: boolean;
  /** When true, uses glassmorphic styling (matching FolderRow). */
  glass?: boolean;
}

export interface ToggleSetting extends BaseSetting {
  kind: "toggle";
  get: (ctx: SettingsContext) => boolean;
  set: (value: boolean, ctx: SettingsContext) => Promise<void> | void;
}

export interface DropdownOption<V extends SettingValue = string> {
  value: V;
  label: string;
}

export interface DropdownSetting<V extends SettingValue = string>
  extends BaseSetting {
  kind: "dropdown";
  options: Array<DropdownOption<V>>;
  get: (ctx: SettingsContext) => V;
  set: (value: V, ctx: SettingsContext) => Promise<void> | void;
  /** "selector" renders a console-style inline picker with left/right arrows. */
  variant?: "dropdown" | "selector";
}

export interface SliderSetting extends BaseSetting {
  kind: "slider";
  min: number;
  max: number;
  step?: number;
  get: (ctx: SettingsContext) => number;
  set: (value: number, ctx: SettingsContext) => Promise<void> | void;
}

export interface ButtonSetting extends BaseSetting {
  kind: "button";
  variant?: "primary" | "danger" | "ghost";
  confirmLabel?: string;
  run: (ctx: SettingsContext) => Promise<void> | void;
  /** Optional status string shown next to the button (e.g. "Saved!"). */
  status?: (ctx: SettingsContext) => string | null;
}

export interface InfoSetting extends BaseSetting {
  kind: "info";
  value: (ctx: SettingsContext) => string;
  tone?: "default" | "good" | "warn" | "bad";
  /** Stack label and value vertically instead of side-by-side. */
  column?: boolean;
  /** Visual variant. "glass" uses the glassmorphic TopBar style. */
  variant?: "default" | "glass";
}

export interface FolderSetting extends BaseSetting {
  kind: "folder";
  get: (ctx: SettingsContext) => string;
  set: (value: string, ctx: SettingsContext) => Promise<void> | void;
}

export interface PathSetting extends BaseSetting {
  kind: "path";
  get: (ctx: SettingsContext) => string;
  set: (value: string, ctx: SettingsContext) => Promise<void> | void;
  /** When true, renders as a password-style masked input. */
  secret?: boolean;
}

export type Setting =
  | ToggleSetting
  | DropdownSetting
  | SliderSetting
  | ButtonSetting
  | InfoSetting
  | FolderSetting
  | PathSetting;

export interface SettingsGroup {
  id: string;
  title?: string;
  description?: string;
  collapsible?: boolean;
  rows: Setting[];
}

export interface SettingsTab {
  id: string;
  label: string;
  groups: SettingsGroup[];
}

export interface SettingsSection {
  id: string;
  path: string;
  label: string;
  icon?: string;
  /**
   * A section can be a simple list of groups, a tabbed view, or a custom
   * component (escape hatch used by Emuladores in PR2). Exactly one of
   * `groups`, `tabs`, or `customComponent` should be set.
   */
  tabs?: SettingsTab[];
  groups?: SettingsGroup[];
  customComponent?: ComponentType<{ ctx: SettingsContext }>;
}

export function isDisabled(
  setting: BaseSetting,
  ctx: SettingsContext
): boolean {
  if (typeof setting.disabled === "function") return setting.disabled(ctx);
  return Boolean(setting.disabled);
}
