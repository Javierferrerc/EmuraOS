export interface SystemDefinition {
  id: string;
  name: string;
  manufacturer: string;
  extensions: string[];
  romFolder: string;
}

export interface DiscoveredRom {
  fileName: string;
  filePath: string;
  systemId: string;
  systemName: string;
  sizeBytes: number;
}

export interface ScanResult {
  totalRoms: number;
  systems: {
    systemId: string;
    systemName: string;
    roms: DiscoveredRom[];
  }[];
}

export interface AppConfig {
  romsPath: string;
  emulatorsPath: string;
  configPath: string;
  systems: string[];
  screenScraperDevId?: string;
  screenScraperDevPassword?: string;
  screenScraperUserId?: string;
  screenScraperUserPassword?: string;
  steamGridDbApiKey?: string;

  // Phase 13 — UI-managed app preferences
  language?: "es" | "en";
  fullscreenOnStart?: boolean;
  autoScanOnStartup?: boolean;
  metadataPath?: string;
  savesPath?: string;
  libretroCoversEnabled?: boolean;
  coverSourcePriority?: "libretro-first" | "sgdb-first" | "libretro-only" | "sgdb-only";
  // Source used by "Scrape metadatos completos". "libretro" pulls genre,
  // developer, publisher, year and player count from the libretro-database
  // with no credentials; "screenscraper" additionally fetches descriptions and
  // ratings but requires a ScreenScraper account. Defaults to "libretro".
  metadataSource?: "libretro" | "screenscraper";
  firstRunCompleted?: boolean;
  navSoundEnabled?: boolean;
  navSoundVolume?: number;
  cardTiltEnabled?: boolean;
  // Toggle the fullscreen 3D cube shown while a game is launching. When
  // false, game launches go straight from double-click to GameModeView
  // without the intermediate loader.
  gameLoadingOverlayEnabled?: boolean;
  // Toggle the dock-style magnification on the horizontal system slider.
  // When false, the slider behaves like a normal flat list with no mouse
  // tracking.
  systemSliderMagnificationEnabled?: boolean;
  theme?:
    | "dark"
    | "light"
    | "retro-crt"
    | "crt-amber"
    | "gameboy-green"
    | "snes-purple"
    | "synthwave"
    | "nexus";
  devMode?: boolean;
  // One-shot flag: set to true after we auto-apply the Azahar gamepad
  // profile on the first 3DS launch. Prevents re-patching qt-config.ini
  // on every subsequent launch and keeps the user in control if they
  // later customize their bindings inside Azahar.
  azaharGamepadAutoConfigured?: boolean;
  /** @deprecated Citra-era flag, superseded by azaharGamepadAutoConfigured.
   *  Kept so configs written by older builds still validate. */
  citraGamepadAutoConfigured?: boolean;
  gameSortOrder?: "alpha-asc" | "alpha-desc" | "recent" | "added";
  systemSortOrder?: "default" | "recent" | "custom";
  customSystemOrder?: string[];
  customSystemColors?: Record<string, string>;
  backgroundImage?: string;
  backgroundBrightness?: number;
  backgroundBlur?: number;
  backgroundOpacity?: number;
  cardClickAction?: "launch" | "detail";
  libraryViewMode?: "grid" | "list" | "compact";
  /** NEXUS library — visual style of the system selector rail at the top of
   *  the library (Configuración → Apariencia → Sistemas). Defaults to the
   *  original chips strip. */
  librarySelectorStyle?: "chips" | "two" | "breadcrumb" | "seg";
  libraryFilters?: {
    genre?: string;          // single genre filter (empty string = all)
    decade?: string;         // "all", "2020s", "2010s", "2000s", "1990s", "1980s", "1970s"
    minRating?: string;      // "0" = no filter, "1", "2", "3", "4"
    players?: string;        // "all", "1", "2", "multi"
    hasCover?: string;       // "all", "yes", "no"
  };
  // Phase 20 — Power UX
  // Controls SearchBar + QuickLaunch matching behaviour. Default true
  // (fuzzy with 1-char typo rescue). Substring fallback exists for users
  // who prefer strict matching.
  fuzzySearchEnabled?: boolean;
  // "systemId:fileName" keys hidden from the library via the game context
  // menu. Data stays on disk — only the UI hides them. An "Unhide all"
  // control in Settings brings them back.
  hiddenRoms?: string[];
  // Phase 22 — Launch wrapper scripts
  /** Absolute path to a script run before spawning the emulator. Receives
   *  EMURA_SYSTEM, EMURA_ROM_PATH, EMURA_TITLE, EMURA_EMULATOR_ID as env
   *  vars. Awaited with a 5s timeout so a hanging script can't lock the
   *  launch flow. Empty / missing string disables the hook. */
  preLaunchScript?: string;
  /** Absolute path to a script run after the emulator exits. Receives the
   *  same env vars plus EMURA_EXIT_CODE. Fire-and-forget — its exit status
   *  doesn't affect the launcher. */
  postLaunchScript?: string;
  /** When true, the 3-2-1 pre-launch countdown overlay is shown before the
   *  emulator window appears. Defaults to false (no countdown) so the
   *  feature is opt-in. Respects prefers-reduced-motion automatically. */
  preLaunchCountdownEnabled?: boolean;

  /** NEXUS "Ignición" launch animation — sound signature profile id (one of
   *  the LAUNCH_SOUNDS ids: minimal/impact/cinematic/arcade/synthwave/electric).
   *  Defaults to "minimal". */
  launchSoundProfile?: string;
  /** Master toggle for the launch sound signature. Defaults to true. */
  launchSoundEnabled?: boolean;

  // Phase 23 — RetroAchievements
  /** RA account username. */
  retroAchievementsUsername?: string;
  /** RA account password. Used only to derive the emulator token on
   *  "Connect"; kept (like the ScreenScraper credentials) so re-deriving a
   *  token later doesn't require re-typing it. Not injected anywhere. */
  retroAchievementsPassword?: string;
  /** Web API key from the RA settings page — authenticates the read-only
   *  web API calls that power the achievements panel. */
  retroAchievementsWebApiKey?: string;
  /** Token derived from login2, injected into emulator configs as the
   *  cheevos token. Set by the connect flow, not user-edited. */
  retroAchievementsToken?: string;
  /** Master switch — when false we never inject credentials or fetch
   *  achievements even if the account is connected. */
  retroAchievementsEnabled?: boolean;
  /** Inject hardcore mode (no save states / cheats) into emulators. */
  retroAchievementsHardcore?: boolean;
}

export interface EmulatorDefinition {
  id: string;
  name: string;
  executable: string;
  defaultPaths: string[];
  systems: string[];
  launchTemplate: string;
  args: Record<string, string>;
  defaultArgs: string;
  coreUrls?: Record<string, string>;
  /** Other executable names that also count as this emulator (e.g. a legacy
   *  `citra-qt.exe` install detected as Azahar). Checked after `executable`. */
  altExecutables?: string[];
  acquisition?: EmulatorAcquisition;
}

/**
 * How the in-app Download button obtains this emulator. Absent → "gdrive"
 * (curated Drive build). "https" downloads a pinned official archive from an
 * allowlisted host; "github" resolves the latest release asset through the
 * GitHub API (falling back to `url`). Both extract under
 * {emulatorsPath}/{id}/. "manual" has no direct download — the UI links to
 * `pageUrl` and detection picks the install up. "flatpak" installs from
 * Flathub (Linux; carried for parity with Phase 28).
 */
export interface EmulatorAcquisition {
  provider: "gdrive" | "https" | "github" | "manual" | "flatpak";
  /** https: pinned official archive URL. github: fallback when the API fails. */
  url?: string;
  /** Archive format; inferred from the URL extension when absent. */
  archive?: "zip" | "7z";
  /** https: expected SHA-256 (hex) of the archive; mismatch aborts install. */
  sha256?: string;
  /** github: "owner/repo" whose latest release is used. */
  repo?: string;
  /** github: regex (source) matching the Windows asset name. */
  asset?: string;
  /** manual: official download page opened in the browser. */
  pageUrl?: string;
  /** flatpak: Flathub application id */
  appId?: string;
}

export interface ResolvedEmulator {
  definition: EmulatorDefinition;
  executablePath: string;
  systemId: string;
}

export interface LaunchResult {
  success: boolean;
  emulatorId: string;
  romPath: string;
  command: string;
  pid?: number;
  error?: string;
}

export interface DetectedEmulator {
  id: string;
  name: string;
  executablePath: string;
  systems: string[];
  source: "emulatorsPath" | "defaultPath";
}

export interface DetectionResult {
  detected: DetectedEmulator[];
  notFound: string[];
  totalChecked: number;
}

export interface GameMetadata {
  title: string;
  description: string;
  year: string;
  genre: string;
  publisher: string;
  developer: string;
  players: string;
  rating: string;
  coverPath: string;
  coverSource?: "libretro" | "screenscraper" | "steamgriddb" | "custom";
  /** Wide hero/banner image (SteamGridDB), used by the NEXUS "Continuar" hero
   * where the tall cover stretches badly. */
  heroPath?: string;
  /** "steamgriddb" once a hero is stored; "none" negative-caches a lookup that
   * found no hero so we don't re-query the API every time. */
  heroSource?: "steamgriddb" | "none";
  /** Hero-lookup strategy version that produced heroSource. Bumping it in code
   * invalidates stale negative caches so improved lookups re-run. */
  heroCheck?: number;
  screenshotPath: string;
  screenScraperId: string;
  lastScraped: string;
}

export interface MetadataCacheFile {
  systemId: string;
  lastUpdated: string;
  games: Record<string, GameMetadata>;
}

export interface ScrapeResult {
  totalProcessed: number;
  totalFound: number;
  totalNotFound: number;
  totalErrors: number;
  errors: ScrapeError[];
}

export interface ScrapeError {
  romFileName: string;
  systemId: string;
  error: string;
}

export interface ScrapeProgress {
  current: number;
  total: number;
  romFileName: string;
  systemId: string;
  status: "scraping" | "found" | "not_found" | "error" | "cached";
}

export interface ScreenScraperCredentials {
  devId: string;
  devPassword: string;
  softName: string;
  ssId?: string;
  ssPassword?: string;
}

export interface CoverFetchProgress {
  current: number;
  total: number;
  romFileName: string;
  systemId: string;
  status: "downloading" | "found" | "not_found" | "error" | "already_cached";
  phase?: "libretro" | "steamgriddb";
}

export interface CoverFetchResult {
  totalProcessed: number;
  totalFound: number;
  totalNotFound: number;
  totalErrors: number;
}

export interface AddRomsProgress {
  fileIndex: number;
  totalFiles: number;
  fileName: string;
  copiedBytes: number;
  totalBytes: number;
  percent: number;
}

/**
 * One SteamGridDB grid candidate — used by the per-game cover picker so the
 * user can preview multiple covers and choose the one they like instead of
 * accepting the auto-selected "best".
 */
export interface SgdbCandidate {
  /** SteamGridDB grid id — stable identifier. */
  gridId: number;
  /** Full-resolution image URL (used for the actual download). */
  fullUrl: string;
  /** Smaller preview image URL (falls back to fullUrl when not provided). */
  thumbnailUrl: string;
  width: number;
  height: number;
  style: string;
  score: number;
}

export interface RomReference {
  systemId: string;
  fileName: string;
}

export interface PlayRecord {
  lastPlayed: string;
  playCount: number;
  totalPlayTime?: number; // accumulated seconds (optional for backward compat)
}

/**
 * Filter criteria used by smart collections. Any field left undefined is
 * not applied. Multiple active fields AND together. Shared with the library
 * filter panel so the two features stay consistent.
 */
export interface SmartCollectionFilter {
  systems?: string[];
  genre?: string;
  minRating?: number;
  decade?: string; // "2020s", "2010s", etc. "all" or undefined = no filter
  onlyFavorites?: boolean;
  onlyRecent?: boolean; // within last N played
  hasCover?: "yes" | "no";
}

export interface Collection {
  id: string;
  name: string;
  roms: string[]; // "systemId:fileName" keys — empty for smart collections
  createdAt: string;
  updatedAt: string;
  /**
   * Collection shape:
   * - "manual" (default when absent, for backward compat): user manages the
   *   roms list explicitly.
   * - "smart": `roms` is ignored and the effective list is computed by
   *   evaluating `filter` against current metadata/favorites/history.
   */
  kind?: "manual" | "smart";
  filter?: SmartCollectionFilter;
  /** Optional custom cover path (overrides the 2x2 auto-mosaic). */
  customCoverPath?: string;
}

export interface EmbeddedLaunchResult {
  success: boolean;
  emulatorId: string;
  romPath: string;
  command: string;
  pid?: number;
  error?: string;
}

export interface GameSessionEvent {
  rom: DiscoveredRom;
  emulatorId: string;
  sessionStartedAt?: number; // Date.now() epoch ms
}

export interface CoreDownloadProgress {
  current: number;
  total: number;
  coreName: string;
  status: "downloading" | "extracting" | "installed" | "already_installed" | "error";
}

export interface DriveEmulatorMapping {
  emulatorId: string;
  folderId: string;
  fileCount: number;
  totalBytes: number;
}

export interface EmulatorDownloadProgress {
  emulatorId: string;
  phase: "listing" | "downloading" | "finalizing" | "done" | "error" | "cancelled";
  filesCompleted: number;
  filesTotal: number;
  bytesReceived: number;
  bytesTotal: number;
  currentFile?: string;
  message?: string;
}

export interface EmulatorReadinessResult {
  emulatorId: string;
  isReady: boolean;
  issues: string[];
  fixed: string[];
  errors: string[];
}

export interface ReadinessReport {
  results: EmulatorReadinessResult[];
  totalFixed: number;
  totalErrors: number;
}

export interface UserLibraryFile {
  version: 1;
  favorites: string[];
  collections: Collection[];
  recentlyPlayed: string[];
  playHistory: Record<string, PlayRecord>;
  romAddedDates?: Record<string, string>; // "systemId:fileName" → ISO date
  /** Phase 22 — per-game launch overrides keyed by `${systemId}:${fileName}`.
   *  Missing entry means "use defaults"; the field itself is optional so
   *  older files round-trip without touching the structure. */
  gameOverrides?: Record<string, GameOverride>;

  // ── Cloud sync bookkeeping (see library-sync.ts). All optional so files
  //    written before sync existed round-trip unchanged. ──
  /** THIS device's own play contributions. `playHistory` is the merged view
   *  (own + every other device); this slice is what gets uploaded. Absent
   *  until the first sync, when it's seeded from `playHistory`. */
  ownPlay?: Record<string, PlayRecord>;
  /** Last favourite toggle per key, for last-writer-wins across devices. */
  favoriteTimes?: Record<string, { on: boolean; at: string }>;
  /** Deleted collection ids → deletion time (so a sync can't resurrect them). */
  collectionTombstones?: Record<string, string>;
  /** Per-game play resets → reset time; drops older contributions everywhere. */
  playResets?: Record<string, string>;
  /** Machine-local translation: key used in the cloud (another device's file
   *  name) → key of the matching ROM on this machine. */
  keyAliases?: Record<string, string>;
  /** Cached cloud view for offline use: other devices' library keys + titles. */
  cloud?: CloudLibraryCache;
}

// ── Cloud library sync (Supabase `user_library.data`) ─────────────────

/** Display info for a game, so a device without the ROM can still render it. */
export interface CloudGameEntry {
  /** Title. */
  t: string;
  /** System display name. */
  s?: string;
  /** Shareable cover URL (Supabase Storage), when one was uploaded. */
  c?: string;
}

/** A device's own slice of the cloud doc. Only that device ever writes it. */
export interface CloudDeviceSlice {
  name: string;
  updatedAt: string;
  /** key → { c: playCount, t: seconds, l: lastPlayed ISO } */
  play: Record<string, { c: number; t: number; l: string }>;
  /** Keys of the ROMs present on that device. */
  lib: string[];
}

export interface CloudPinned {
  keys: string[];
  at: string;
}

/** The whole synced document (one row per account). */
export interface CloudLibraryDoc {
  v: 1;
  devices: Record<string, CloudDeviceSlice>;
  fav: Record<string, { on: boolean; at: string }>;
  collections: Collection[];
  colDel: Record<string, string>;
  resets: Record<string, string>;
  pinned: CloudPinned | null;
  games: Record<string, CloudGameEntry>;
}

/** What the renderer needs offline to show games that live on other devices. */
export interface CloudLibraryCache {
  /** Keys (already translated to local keys) present on OTHER devices —
   *  may include games this machine also has. */
  remoteLib: string[];
  games: Record<string, CloudGameEntry>;
  syncedAt: string;
}

// ── Phase 22 — Per-game control ────────────────────────────────────

/** Toggles persisted into Dolphin's `User/GameSettings/<GameID>.ini`.
 *  We expose a curated subset of keys (the ones a normal user actually
 *  wants to toggle) rather than the full GameINI surface. Each field
 *  maps to a concrete INI section/key in dolphin-game-config.ts. */
export interface DolphinGameConfig {
  /** [Core] CPUThread / Overclock toggle. */
  overclockEnable?: boolean;
  /** [Core] Overclock value (1.0 = 100%, range 0.5–3.0). */
  overclockFactor?: number;
  /** [Core] EmulationSpeed (1.0 = 100%, 0 = unlimited). */
  emulationSpeed?: number;
  /** [Video_Settings] AspectRatio. 0=Auto 1=4:3 2=16:9 3=Stretch. */
  aspectRatio?: 0 | 1 | 2 | 3;
  /** [Video_Hacks] EFBSkipCache + EFBToTextureEnable shortcut. */
  skipEFBAccess?: boolean;
  /** [Video_Settings] wideScreenHack — patches games' rendering matrices
   *  for true 16:9 instead of letterboxed 4:3. */
  wideScreenHack?: boolean;
  /** [Controls] Disable port 2 input so a stray pad doesn't pause. */
  disablePort2?: boolean;
}

/** Curated subset of RetroArch settings persisted into the per-game
 *  override file `<configDir>/config/<CoreName>/<rom>.cfg`. Each field maps
 *  to a concrete retroarch.cfg key in retroarch-game-config.ts. Applied only
 *  when the resolved emulator is RetroArch and the core has a known display
 *  name. */
export interface RetroArchGameConfig {
  /** video_smooth — bilinear filtering on/off. */
  bilinearFilter?: boolean;
  /** video_scale_integer — snap output to integer multiples of native res. */
  integerScale?: boolean;
  /** aspect_ratio_index. 0 = 4:3, 1 = 16:9 (the two long-stable indices). */
  aspectRatio?: 0 | 1;
  /** run_ahead_enabled — speculative frame run-ahead for lower input lag. */
  runAhead?: boolean;
  /** run_ahead_frames — how many frames to run ahead (1–6 typical). */
  runAheadFrames?: number;
  /** rewind_enable — keep a rewind buffer for this game. */
  rewind?: boolean;
}

/** Stored under UserLibraryFile.gameOverrides[key]. Each field is
 *  independently optional so partial overrides (just emulator, just
 *  Dolphin tweaks) stay small on disk. */
export interface GameOverride {
  /** Force this emulator id instead of the system default. Must be one
   *  that declares support for the game's system; the launcher refuses
   *  unknown ids and falls back to the default. */
  emulatorId?: string;
  /** Dolphin-only structured overrides — only applied when the resolved
   *  emulator is Dolphin and the GameID can be detected. */
  dolphin?: DolphinGameConfig;
  /** RetroArch-only structured overrides — only applied when the resolved
   *  emulator is RetroArch and the system maps to a known core. */
  retroarch?: RetroArchGameConfig;
}

// ── Emulator Configuration System ──────────────────────────────────

export interface EmulatorSettingDefinition {
  key: string;
  label: string;
  type: "boolean" | "enum" | "number" | "string" | "path";
  category: string;
  default?: string;
  // Labeled options let schemas show human-readable dropdowns
  // (e.g. {value: "0", label: "Default"}) while still storing the raw value.
  // Plain strings remain supported for backward compatibility.
  options?: (string | { value: string; label: string })[];
  min?: number;
  max?: number;
  description?: string;
}

export interface EmulatorConfigSchema {
  configFile: string;
  configFormat: "ini" | "keyvalue" | "json" | "yaml" | "xml";
  configLocations: string[];
  categories: {
    id: string;
    name: string;
    settings: Omit<EmulatorSettingDefinition, "category">[];
  }[];
}

export interface EmulatorConfigData {
  emulatorId: string;
  configPath: string | null;
  settings: Record<string, string>;
  schema: EmulatorConfigSchema;
}

// ── Auto-Update System ─────────────────────────────────────────────

export interface UpdateInfo {
  version: string;
  releaseNotes: string;
  downloadUrl: string;
  publishedAt: string;
  size: number;
}

export interface UpdateDownloadProgress {
  bytesDownloaded: number;
  bytesTotal: number;
  percentComplete: number;
  status: "downloading" | "complete" | "cancelled" | "error";
}

export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateInfo?: UpdateInfo;
}

// ── Phase 23 — RetroAchievements ───────────────────────────────────

/** Result of the connect/login flow. */
export interface RaLoginResult {
  success: boolean;
  username?: string;
  token?: string;
  error?: string;
}

/** Non-secret RA account state exposed to the renderer. */
export interface RaStatus {
  connected: boolean;
  username: string;
  enabled: boolean;
  hardcore: boolean;
  hasWebApiKey: boolean;
}

/** A single achievement plus the user's earned state for it. */
export interface RaAchievement {
  id: number;
  title: string;
  description: string;
  points: number;
  /** Badge image URL (earned art) and its locked variant. */
  badgeUrl: string;
  badgeUrlLocked: string;
  /** ISO-ish date string from RA, or null when not yet earned. */
  dateEarned: string | null;
  dateEarnedHardcore: string | null;
}

/** A game's achievement set + the user's progress against it. */
export interface RaGameProgress {
  gameId: number;
  title: string;
  consoleName: string;
  iconUrl: string | null;
  numAchievements: number;
  numAwarded: number;
  numAwardedHardcore: number;
  userCompletion: string;
  achievements: RaAchievement[];
}

/** Discriminated result of "fetch achievements for this ROM", so the UI can
 *  render a precise hint for every dead-end instead of a generic error. */
export type RaAchievementsResult =
  | { status: "ok"; progress: RaGameProgress }
  | { status: "not-configured" } // no account / web API key set
  | { status: "disabled" } // RA master switch off
  | { status: "unhashable" } // disc/unsupported system — no local hash
  | { status: "not-found" } // hash computed but not in RA's database
  | { status: "error"; message: string };
