import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import type { DiscoveredRom } from "../../../core/types";

const MAX_RESULTS = 10;

export function QuickLaunch() {
  const {
    scanResult,
    launchGame,
    getMetadataForRom,
    closeQuickLaunch,
  } = useApp();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build flat ROM list once
  const allRoms = useMemo(() => {
    if (!scanResult) return [];
    const roms: DiscoveredRom[] = [];
    for (const sys of scanResult.systems) {
      roms.push(...sys.roms);
    }
    return roms;
  }, [scanResult]);

  // Filter ROMs by query
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const matched: DiscoveredRom[] = [];
    for (const rom of allRoms) {
      if (matched.length >= MAX_RESULTS) break;
      const meta = getMetadataForRom(rom.systemId, rom.fileName);
      const title = meta?.title ?? rom.fileName;
      if (title.toLowerCase().includes(q) || rom.fileName.toLowerCase().includes(q)) {
        matched.push(rom);
      }
    }
    return matched;
  }, [query, allRoms, getMetadataForRom]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  // Autofocus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeQuickLaunch();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [closeQuickLaunch]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) closeQuickLaunch();
    },
    [closeQuickLaunch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const rom = results[selectedIndex];
        if (rom) {
          closeQuickLaunch();
          launchGame(rom);
        }
      }
    },
    [results, selectedIndex, closeQuickLaunch, launchGame]
  );

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-ql-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Cover loader for results
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const toLoad = results.filter((r) => {
      const meta = getMetadataForRom(r.systemId, r.fileName);
      return meta?.coverPath && !coverUrls[`${r.systemId}:${r.fileName}`];
    });
    for (const rom of toLoad) {
      const meta = getMetadataForRom(rom.systemId, rom.fileName);
      if (!meta?.coverPath) continue;
      window.electronAPI.readCoverDataUrl(meta.coverPath).then((url) => {
        if (!cancelled && url) {
          setCoverUrls((prev) => ({ ...prev, [`${rom.systemId}:${rom.fileName}`]: url }));
        }
      });
    }
    return () => { cancelled = true; };
  }, [results, getMetadataForRom, coverUrls]);

  const SYSTEM_NAMES: Record<string, string> = {
    nes: "NES", snes: "SNES", n64: "N64", gb: "GB", gbc: "GBC", gba: "GBA",
    nds: "NDS", gamecube: "GCN", wii: "Wii", megadrive: "MD",
    mastersystem: "SMS", dreamcast: "DC", psx: "PSX", ps2: "PS2", psp: "PSP",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center pt-[15vh]"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/10 shadow-2xl backdrop-blur-xl"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <svg
            className="h-5 w-5 shrink-0 text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Quick Launch — buscar juego..."
            className="flex-1 bg-transparent text-sm text-primary placeholder-[var(--color-text-muted)] outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-white/20 px-1.5 py-0.5 text-[10px] text-muted">
            ESC
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
            {results.map((rom, idx) => {
              const meta = getMetadataForRom(rom.systemId, rom.fileName);
              const name = meta?.title || rom.fileName.replace(/\.[^.]+$/, "");
              const cover = coverUrls[`${rom.systemId}:${rom.fileName}`];
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={rom.filePath}
                  data-ql-index={idx}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                    isSelected
                      ? "bg-white/15"
                      : "hover:bg-white/8"
                  }`}
                  onClick={() => {
                    closeQuickLaunch();
                    launchGame(rom);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  {/* Mini cover */}
                  <div className="h-11 w-8 shrink-0 overflow-hidden rounded">
                    {cover ? (
                      <img src={cover} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-white/5 text-xs">
                        🎮
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-primary">{name}</p>
                    {meta?.genre && (
                      <p className="truncate text-xs text-muted">{meta.genre}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-muted">
                    {SYSTEM_NAMES[rom.systemId] ?? rom.systemId.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {query.trim() && results.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted">
            No se encontraron juegos para "{query}"
          </div>
        )}

        {/* Hint when no query */}
        {!query.trim() && (
          <div className="px-4 py-6 text-center text-sm text-muted">
            Escribe el nombre de un juego para lanzarlo al instante
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
