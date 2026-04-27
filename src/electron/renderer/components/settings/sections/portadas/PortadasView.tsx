import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type MouseEvent } from "react";
import type { SettingsContext } from "../../../../schemas/settings-schema-types";
import type { DiscoveredRom } from "../../../../../../core/types";
import { CoverSourcePicker } from "../../../CoverSourcePicker";

/** Resolve the metadata key for a ROM filename (strip extension). */
function metaKey(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
}

/**
 * Grid of all discovered ROMs with their current cover art.
 * Click a card → pick a new image.  Click the reset button → restore original.
 *
 * Rendered by SettingsRoot only when the "Galería" tab is active (the tab
 * with empty groups). The other Portadas tabs (Fuentes, Credenciales, Acciones)
 * are standard settings lists rendered by SettingsRoot directly.
 */
export function PortadasView({
  ctx,
  focusIndex,
  regionFocused,
  activateRef,
  secondaryRef,
}: {
  ctx: SettingsContext;
  focusIndex: number;
  regionFocused: boolean;
  activateRef: MutableRefObject<(() => void) | null>;
  secondaryRef: MutableRefObject<(() => void) | null>;
  prevFilterRef: MutableRefObject<(() => void) | null>;
  nextFilterRef: MutableRefObject<(() => void) | null>;
  listActionRef: MutableRefObject<((action: "up" | "down" | "left" | "right" | "activate") => boolean) | null>;
}) {
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const [covers, setCovers] = useState<Record<string, string | null>>({});
  // Keys of cards that were just saved/reset — shows a brief badge.
  const [savedKeys, setSavedKeys] = useState<Record<string, "saved" | "reset">>({});
  // ROM whose source-picker modal is currently open (null when closed).
  const [pickerRom, setPickerRom] = useState<DiscoveredRom | null>(null);

  // Keep a ref to metadataMap so the cover-loading effect can read the
  // latest value without re-firing on every metadata change.
  const metadataMapRef = useRef(ctx.metadataMap);
  metadataMapRef.current = ctx.metadataMap;

  // Flatten all ROMs from scanResult, sorted alphabetically by filename.
  const flatRoms = useMemo<DiscoveredRom[]>(() => {
    if (!ctx.scanResult) return [];
    const all: DiscoveredRom[] = [];
    for (const sys of ctx.scanResult.systems) {
      for (const rom of sys.roms) {
        all.push(rom);
      }
    }
    all.sort((a, b) => a.fileName.localeCompare(b.fileName));
    return all;
  }, [ctx.scanResult]);

  // Load cover data URLs for all ROMs — only on initial mount / scan change.
  useEffect(() => {
    if (flatRoms.length === 0) return;
    let cancelled = false;

    async function loadCovers() {
      const result: Record<string, string | null> = {};
      const map = metadataMapRef.current;
      for (const rom of flatRoms) {
        if (cancelled) break;
        const key = `${rom.systemId}:${rom.fileName}`;
        const meta = map[rom.systemId]?.[metaKey(rom.fileName)];
        if (meta?.coverPath) {
          try {
            const dataUrl = await window.electronAPI.readCoverDataUrl(meta.coverPath);
            result[key] = dataUrl;
          } catch {
            result[key] = null;
          }
        } else {
          result[key] = null;
        }
      }
      if (!cancelled) setCovers(result);
    }

    loadCovers();
    return () => { cancelled = true; };
  }, [flatRoms]);

  // Scroll focused item into view.
  useEffect(() => {
    if (!regionFocused) return;
    const el = itemRefs.current[focusIndex];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusIndex, regionFocused]);

  // Check if a ROM has a custom cover.
  const isCustomCover = useCallback(
    (rom: DiscoveredRom): boolean => {
      const meta = ctx.metadataMap[rom.systemId]?.[metaKey(rom.fileName)];
      return meta?.coverSource === "custom";
    },
    [ctx.metadataMap]
  );

  // Show a brief badge on a card for 2 seconds.
  const flashBadge = useCallback((key: string, type: "saved" | "reset") => {
    setSavedKeys((prev) => ({ ...prev, [key]: type }));
    setTimeout(() => {
      setSavedKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 2000);
  }, []);

  const handleOpenPicker = useCallback((rom: DiscoveredRom) => {
    setPickerRom(rom);
  }, []);

  // Called by CoverSourcePicker after any successful source switch. Refreshes
  // the card image without re-fetching every cover in the gallery, and shows
  // a brief feedback badge ("Guardado" or "Restaurado").
  const handlePickerApplied = useCallback(
    async (
      rom: DiscoveredRom,
      result: {
        action: "libretro" | "steamgriddb" | "custom" | "reset";
        coverPath?: string;
      }
    ) => {
      const key = `${rom.systemId}:${rom.fileName}`;

      if (result.action === "reset") {
        // Clear local cover so placeholder shows while we re-fetch from any
        // source via the bulk pipeline (libretro → sgdb).
        setCovers((prev) => ({ ...prev, [key]: null }));
        await ctx.startFetchingCovers();
        await ctx.loadAllMetadata();
        const meta =
          metadataMapRef.current[rom.systemId]?.[metaKey(rom.fileName)];
        if (meta?.coverPath) {
          try {
            const dataUrl = await window.electronAPI.readCoverDataUrl(
              meta.coverPath
            );
            setCovers((prev) => ({ ...prev, [key]: dataUrl }));
          } catch {
            /* silent */
          }
        }
        flashBadge(key, "reset");
        return;
      }

      if (result.coverPath) {
        try {
          const dataUrl = await window.electronAPI.readCoverDataUrl(
            result.coverPath
          );
          setCovers((prev) => ({ ...prev, [key]: dataUrl }));
        } catch {
          /* silent */
        }
      }
      await ctx.loadAllMetadata();
      flashBadge(key, "saved");
    },
    [ctx, flashBadge]
  );

  const handleResetCover = useCallback(async (rom: DiscoveredRom) => {
    const result = await window.electronAPI.resetCustomCover(
      rom.systemId,
      rom.fileName
    );
    if (!result.success) return;

    const key = `${rom.systemId}:${rom.fileName}`;
    // Clear local cover immediately so the placeholder shows while re-fetching
    setCovers((prev) => ({ ...prev, [key]: null }));

    // Re-fetch covers from libretro + steamgriddb so the original is restored
    await ctx.startFetchingCovers();

    // Reload metadata (startFetchingCovers already reloads internally, but
    // we update the ref so the local read below picks it up)
    await ctx.loadAllMetadata();

    // Read the freshly downloaded cover and update the card
    const meta = metadataMapRef.current[rom.systemId]?.[metaKey(rom.fileName)];
    if (meta?.coverPath) {
      try {
        const dataUrl = await window.electronAPI.readCoverDataUrl(meta.coverPath);
        setCovers((prev) => ({ ...prev, [key]: dataUrl }));
      } catch { /* silent */ }
    }

    flashBadge(key, "reset");
  }, [ctx, flashBadge]);

  // Wire activateRef (X / Enter) → pick cover.
  // Wire secondaryRef (Square) → reset cover (only if custom).
  useEffect(() => {
    if (!regionFocused) {
      activateRef.current = null;
      secondaryRef.current = null;
      return;
    }
    const rom = flatRoms[focusIndex];
    if (!rom) {
      activateRef.current = null;
      secondaryRef.current = null;
      return;
    }
    activateRef.current = () => { handleOpenPicker(rom); };
    secondaryRef.current = isCustomCover(rom)
      ? () => { void handleResetCover(rom); }
      : null;
  });

  const isFocused = (idx: number) => regionFocused && focusIndex === idx;

  if (flatRoms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="text-4xl">{"\uD83C\uDFAE"}</span>
        <p className="text-sm text-[var(--color-text-muted)]">
          No se encontraron ROMs. Escanea tu biblioteca primero.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-6 py-6">
      <div className="grid grid-cols-4 gap-3">
        {flatRoms.map((rom, i) => {
          const key = `${rom.systemId}:${rom.fileName}`;
          const coverUrl = covers[key];
          const focused = isFocused(i);
          const displayName = metaKey(rom.fileName);
          const badgeType = savedKeys[key];
          const custom = isCustomCover(rom);

          return (
            <button
              key={key}
              ref={(el) => { itemRefs.current[i] = el; }}
              onClick={() => handleOpenPicker(rom)}
              className={`group relative flex flex-col items-center gap-2 rounded-[var(--radius-md)] folder-row-glass p-3 text-center transition-colors hover:bg-white/[0.06] cursor-pointer ${focused ? "ring-focus" : ""}`}
            >
              {/* Feedback badge */}
              {badgeType && (
                <span
                  className={`absolute top-1.5 right-1.5 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-md ${
                    badgeType === "saved"
                      ? "bg-[var(--color-good)]"
                      : "bg-[var(--color-accent)]"
                  }`}
                >
                  {badgeType === "saved" ? "\u2713 Guardado" : "\u21A9 Restaurado"}
                </span>
              )}

              {/* Reset button — only on custom covers, visible on hover / focus */}
              {custom && !badgeType && (
                <span
                  role="button"
                  tabIndex={-1}
                  title="Restaurar portada original"
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    void handleResetCover(rom);
                  }}
                  className="absolute top-1.5 left-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  {"\u21A9"}
                </span>
              )}

              {/* Cover image or placeholder */}
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-md bg-black/20">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={displayName}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <span className="text-3xl opacity-40">{"\uD83C\uDFAE"}</span>
                )}
              </div>

              {/* Game name */}
              <span className="line-clamp-2 w-full text-xs font-medium text-[var(--color-text-primary)]">
                {displayName}
              </span>

              {/* System badge */}
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                {rom.systemName}
              </span>
            </button>
          );
        })}
      </div>

      {pickerRom && (
        <CoverSourcePicker
          rom={pickerRom}
          hasCustomCover={isCustomCover(pickerRom)}
          onApplied={(result) => {
            void handlePickerApplied(pickerRom, result);
          }}
          onClose={() => setPickerRom(null)}
        />
      )}
    </div>
  );
}
