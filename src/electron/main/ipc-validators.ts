import { z } from "zod";

// ── Primitive schemas ──────────────────────────────────────────────

export const SystemIdSchema = z.string().regex(/^[a-z0-9-]+$/).max(50);
export const EmulatorIdSchema = z.string().regex(/^[a-z0-9-]+$/).max(50);
// Collection ids are generated locally as `col_<timestamp>` (see
// UserLibrary.createCollection). Older / hand-edited libraries may also
// contain UUIDs. Both shapes are accepted, but we still reject anything
// that could be path-traversal or contain whitespace / shell metacharacters.
export const CollectionIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

// Windows-safe filename: no path separators or reserved characters
export const FileNameSchema = z
  .string()
  .min(1)
  .max(260)
  .regex(/^[^<>:"/\\|?*\x00-\x1f]+$/);

/** Composite "<systemId>:<fileName>" key as stored inside collections.
 *  Validated structurally — leaves field-level checks to the splitter on
 *  the server. The 500-char ceiling guards against pathological payloads
 *  for the reorder-collection IPC, which accepts an array of these. */
export const RomCollectionKeySchema = z
  .string()
  .min(3)
  .max(500)
  .regex(/^[a-z0-9-]+:[^<>:"/\\|?*\x00-\x1f]+$/);

export const UrlSchema = z
  .string()
  .url()
  .refine(
    (u) => {
      try {
        const p = new URL(u).protocol;
        return p === "https:" || p === "http:";
      } catch {
        return false;
      }
    },
    { message: "Only HTTP(S) URLs are allowed" }
  );

// ── Composite schemas ──────────────────────────────────────────────

export const DiscoveredRomSchema = z.object({
  fileName: z.string().min(1).max(260),
  filePath: z.string().min(1).max(500),
  systemId: z.string().regex(/^[a-z0-9-]+$/),
  systemName: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

export const AppConfigPartialSchema = z
  .object({
    romsPath: z.string().max(500).optional(),
    emulatorsPath: z.string().max(500).optional(),
    configPath: z.string().max(500).optional(),
    systems: z.array(z.string()).optional(),
    screenScraperDevId: z.string().max(200).optional(),
    screenScraperDevPassword: z.string().max(200).optional(),
    screenScraperUserId: z.string().max(200).optional(),
    screenScraperUserPassword: z.string().max(200).optional(),
    steamGridDbApiKey: z.string().max(200).optional(),
    language: z.enum(["es", "en"]).optional(),
    fullscreenOnStart: z.boolean().optional(),
    autoScanOnStartup: z.boolean().optional(),
    metadataPath: z.string().max(500).optional(),
    savesPath: z.string().max(500).optional(),
    libretroCoversEnabled: z.boolean().optional(),
    coverSourcePriority: z
      .enum(["libretro-first", "sgdb-first", "libretro-only", "sgdb-only"])
      .optional(),
    firstRunCompleted: z.boolean().optional(),
    navSoundEnabled: z.boolean().optional(),
    // Percent 0..100 — matches the slider UI range and the `/100` divisor in
    // useNavigationSounds. Was previously `.max(1)` which silently rejected
    // every real value the slider could produce.
    navSoundVolume: z.number().min(0).max(100).optional(),
    cardTiltEnabled: z.boolean().optional(),
    gameLoadingOverlayEnabled: z.boolean().optional(),
    systemSliderMagnificationEnabled: z.boolean().optional(),
    theme: z
      .enum([
        "dark",
        "light",
        "retro-crt",
        "crt-amber",
        "gameboy-green",
        "snes-purple",
        "synthwave",
        "nexus",
      ])
      .optional(),
    devMode: z.boolean().optional(),
    citraGamepadAutoConfigured: z.boolean().optional(),
    gameSortOrder: z
      .enum(["alpha-asc", "alpha-desc", "recent", "added"])
      .optional(),
    systemSortOrder: z.enum(["default", "recent", "custom"]).optional(),
    customSystemOrder: z.array(z.string()).optional(),
    customSystemColors: z
      .record(
        z.string().regex(/^[a-z0-9-]+$/),
        z.string().regex(/^#[0-9a-fA-F]{6}$/)
      )
      .optional(),
    backgroundImage: z.string().max(500).optional(),
    backgroundBrightness: z.number().min(0).max(200).optional(),
    backgroundBlur: z.number().min(0).max(20).optional(),
    backgroundOpacity: z.number().min(0).max(100).optional(),
    cardClickAction: z.enum(["launch", "detail"]).optional(),
    libraryViewMode: z.enum(["grid", "list", "compact"]).optional(),
    libraryFilters: z
      .object({
        genre: z.string().max(100).optional(),
        decade: z.string().max(20).optional(),
        minRating: z.string().max(10).optional(),
        players: z.string().max(20).optional(),
        hasCover: z.string().max(10).optional(),
      })
      .optional(),
    fuzzySearchEnabled: z.boolean().optional(),
    hiddenRoms: z.array(z.string().max(500)).max(10000).optional(),
    // Phase 22 — paths are validated structurally only; the runtime checks
    // existence + interpreter mapping. Empty string is allowed and means
    // "no script".
    preLaunchScript: z.string().max(500).optional(),
    postLaunchScript: z.string().max(500).optional(),
    preLaunchCountdownEnabled: z.boolean().optional(),
    // Phase 23 — RetroAchievements
    retroAchievementsUsername: z.string().max(100).optional(),
    retroAchievementsPassword: z.string().max(200).optional(),
    retroAchievementsWebApiKey: z.string().max(200).optional(),
    retroAchievementsToken: z.string().max(200).optional(),
    retroAchievementsEnabled: z.boolean().optional(),
    retroAchievementsHardcore: z.boolean().optional(),
  })
  .strict();

// Phase 23 — credentials for the connect flow. Password is required here
// (used once to derive the token) but never echoed back to the renderer.
export const RaLoginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
  webApiKey: z.string().max(200).optional(),
});

export const BoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const FileFilterSchema = z.object({
  name: z.string(),
  extensions: z.array(z.string()),
});

export const CemuKeysContentSchema = z.string().max(10000);

export const EmulatorConfigChangesSchema = z.record(z.string(), z.string());

// Dolphin GameCube controller config (GCPadNew.ini) updates.
export const GcPadPortSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

// INI key: "Group/Name" or "Name". Value: bare text or backticked string.
// Max length bounded to keep validation cheap; real Dolphin keys are <64 chars.
export const GcPadUpdateSchema = z.object({
  port: GcPadPortSchema,
  changes: z.record(
    z.string().min(1).max(128),
    z.string().max(512)
  ),
});

export const GcPadUpdatesArraySchema = z.array(GcPadUpdateSchema).max(16);

export const ExecutablePathSchema = z.string().min(1).max(500);

export const CollectionNameSchema = z.string().min(1).max(100);

export const SmartCollectionFilterSchema = z.object({
  systems: z.array(SystemIdSchema).max(30).optional(),
  genre: z.string().max(100).optional(),
  minRating: z.number().min(0).max(10).optional(),
  decade: z.string().max(20).optional(),
  onlyFavorites: z.boolean().optional(),
  onlyRecent: z.boolean().optional(),
  hasCover: z.enum(["yes", "no"]).optional(),
});

export const RecentlyPlayedLimitSchema = z.number().int().positive().optional();

export const ForceRefreshSchema = z.boolean().optional();

export const FilePathsSchema = z.array(z.string().min(1).max(500)).min(1).max(200);

export const AddRomEntrySchema = z.object({
  filePath: z.string().min(1).max(500),
  systemId: z.string().regex(/^[a-z0-9-]+$/),
});

export const AddRomsSchema = z.array(AddRomEntrySchema).min(1).max(200);

export const OptionalEmulatorIdSchema = z.string().regex(/^[a-z0-9-]+$/).max(50).optional();

export const FolderPathSchema = z.string().min(1).max(500);

// ── Phase 22 — Per-game overrides ──────────────────────────────────

/** Setting an override to null clears it (the IPC handler honours the
 *  distinction between "missing" and "null"). */
export const NullableEmulatorIdSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/)
  .max(50)
  .nullable();

/** Curated set of Dolphin per-game toggles the UI is allowed to mutate.
 *  Mirrors `DolphinGameConfig` in core/types.ts — keep in sync. Setting a
 *  field to null clears it (falls back to Dolphin's global setting). */
export const DolphinGameConfigPatchSchema = z
  .object({
    overclockEnable: z.boolean().nullable().optional(),
    overclockFactor: z.number().min(0.1).max(5).nullable().optional(),
    emulationSpeed: z.number().min(0).max(5).nullable().optional(),
    aspectRatio: z
      .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
      .nullable()
      .optional(),
    skipEFBAccess: z.boolean().nullable().optional(),
    wideScreenHack: z.boolean().nullable().optional(),
    disablePort2: z.boolean().nullable().optional(),
  })
  .strict();

/** Curated set of RetroArch per-game toggles the UI may mutate. Mirrors
 *  `RetroArchGameConfig` in core/types.ts — keep in sync. Per-field null
 *  clears that key (falls back to the global retroarch.cfg). */
export const RetroArchGameConfigPatchSchema = z
  .object({
    bilinearFilter: z.boolean().nullable().optional(),
    integerScale: z.boolean().nullable().optional(),
    aspectRatio: z
      .union([z.literal(0), z.literal(1)])
      .nullable()
      .optional(),
    runAhead: z.boolean().nullable().optional(),
    runAheadFrames: z.number().int().min(1).max(6).nullable().optional(),
    rewind: z.boolean().nullable().optional(),
  })
  .strict();
