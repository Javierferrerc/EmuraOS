import { z } from "zod";

// ── Primitive schemas ──────────────────────────────────────────────

export const SystemIdSchema = z.string().regex(/^[a-z0-9-]+$/).max(50);
export const EmulatorIdSchema = z.string().regex(/^[a-z0-9-]+$/).max(50);
export const CollectionIdSchema = z.string().uuid();

// Windows-safe filename: no path separators or reserved characters
export const FileNameSchema = z
  .string()
  .min(1)
  .max(260)
  .regex(/^[^<>:"/\\|?*\x00-\x1f]+$/);

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
    theme: z.enum(["dark", "light", "retro-crt"]).optional(),
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
  })
  .strict();

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

export const CollectionNameSchema = z.string().min(1).max(100);

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
