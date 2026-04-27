import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import { GameCard } from "./GameCard";
import { useGamepad } from "../hooks/useGamepad";
import { useKeyboardNav } from "../hooks/useKeyboardNav";
import type { FocusAction } from "../hooks/useFocusManager";
import { evaluateSmartCollection } from "../../../core/smart-collection";
import type { DiscoveredRom } from "../../../core/types";

/**
 * Fullscreen modal that displays the games inside a single collection.
 *
 * Triggered by clicking a CollectionTile in the main grid (or any sidebar
 * entry that resolves to a collection). Renders a dark, blurred backdrop
 * over the underlying library view so the user can dip in and out without
 * losing their place. Inside, the games are laid out as the same GameCards
 * used elsewhere — same launch / context-menu / focus behaviour.
 *
 * Smart collections are re-evaluated against the current library so the
 * viewer always reflects the latest state of metadata / favorites / recents.
 */
const MIN_CARD_WIDTH = 220;
const GRID_GAP = 24;

/** Window after the modal mounts during which we ignore ACTIVATE events.
 *  Prevents the same button press that opened the viewer (ACTIVATE on the
 *  CollectionTile) from immediately launching the first game inside —
 *  the input would otherwise rise → fire on tile → open modal → fire on
 *  card 0 → launch within a single key/button hold cycle. */
const ACTIVATE_GUARD_MS = 350;

export function CollectionViewerModal() {
  const {
    viewingCollectionId,
    closeCollectionViewer,
    collections,
    scanResult,
    favorites,
    recentlyPlayed,
    getMetadataForRom,
    launchGame,
    isGameRunning,
  } = useApp();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [columnCount, setColumnCount] = useState(4);
  const openedAtRef = useRef(0);

  const collection = useMemo(
    () =>
      viewingCollectionId
        ? collections.find((c) => c.id === viewingCollectionId) ?? null
        : null,
    [viewingCollectionId, collections]
  );

  const roms = useMemo<DiscoveredRom[]>(() => {
    if (!collection || !scanResult) return [];
    const allRoms = scanResult.systems.flatMap((s) => s.roms);
    const byKey = new Map<string, DiscoveredRom>();
    for (const r of allRoms) byKey.set(`${r.systemId}:${r.fileName}`, r);

    if (collection.kind === "smart" && collection.filter) {
      const matched = evaluateSmartCollection(
        collection.filter,
        allRoms,
        getMetadataForRom,
        favorites,
        recentlyPlayed
      );
      return matched
        .map((k) => byKey.get(k))
        .filter((r): r is DiscoveredRom => !!r);
    }
    return collection.roms
      .map((k) => byKey.get(k))
      .filter((r): r is DiscoveredRom => !!r);
  }, [collection, scanResult, getMetadataForRom, favorites, recentlyPlayed]);

  // Reset focus + arm the activation guard whenever a new collection is
  // opened. The guard window swallows the input that triggered the open.
  useEffect(() => {
    setFocusedIndex(0);
    openedAtRef.current = performance.now();
  }, [viewingCollectionId]);

  // Track grid column count via ResizeObserver so MOVE_UP/DOWN step by
  // the correct row width regardless of viewport.
  useEffect(() => {
    const el = gridRef.current;
    if (!el || !collection) return;
    const compute = () => {
      const cols = Math.max(
        1,
        Math.floor((el.clientWidth + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP))
      );
      setColumnCount(cols);
    };
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    compute();
    return () => observer.disconnect();
  }, [collection, roms.length]);

  // Scroll the focused card into view as gamepad navigation moves.
  useEffect(() => {
    if (!collection) return;
    const el = gridRef.current?.querySelector(
      `[data-modal-grid-index="${focusedIndex}"]`
    );
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedIndex, collection]);

  // Single action handler shared by gamepad + keyboard. Moves the focused
  // index inside the modal grid and dispatches launch/close on
  // ACTIVATE/BACK so the underlying Layout never sees these inputs while
  // the viewer is open (App.tsx adds viewingCollectionId to inputDisabled).
  const handleAction = useCallback(
    (action: FocusAction) => {
      if (!collection) return;
      switch (action.type) {
        case "MOVE_LEFT":
          setFocusedIndex((i) => Math.max(0, i - 1));
          break;
        case "MOVE_RIGHT":
          setFocusedIndex((i) => Math.min(roms.length - 1, i + 1));
          break;
        case "MOVE_UP":
          setFocusedIndex((i) => Math.max(0, i - columnCount));
          break;
        case "MOVE_DOWN":
          setFocusedIndex((i) =>
            Math.min(roms.length - 1, i + columnCount)
          );
          break;
        case "ACTIVATE": {
          // Drop ACTIVATE if the modal just opened — otherwise the same
          // button press that opened the collection would also launch
          // the first game inside it.
          if (performance.now() - openedAtRef.current < ACTIVATE_GUARD_MS) {
            break;
          }
          const rom = roms[focusedIndex];
          if (rom) launchGame(rom);
          break;
        }
        case "BACK":
          closeCollectionViewer();
          break;
      }
    },
    [collection, roms, focusedIndex, columnCount, launchGame, closeCollectionViewer]
  );

  // While a game is running the GameModeView owns the screen (overlay,
  // exit/fullscreen bar, etc.). Keeping the viewer mounted here would
  // paint its dark+blur backdrop on top and obscure those controls.
  // Disabling input + returning null below keeps the modal closed-but-
  // remembered: when the user exits the game they don't immediately
  // pop back into a collection, since opening was their last action.
  const isActive = !!collection && !isGameRunning;
  useGamepad({ onAction: handleAction, disabled: !isActive });
  useKeyboardNav({
    onAction: handleAction,
    onToggleFullscreen: () => {
      /* no-op — fullscreen toggle stays on Layout */
    },
    disabled: !isActive,
  });

  if (!collection || isGameRunning) return null;

  const isSmart = collection.kind === "smart";
  const totalLabel = roms.length === 1 ? "1 juego" : `${roms.length} juegos`;

  return createPortal(
    <div
      className="fixed inset-0 z-[9991] flex flex-col"
      onClick={closeCollectionViewer}
    >
      {/* Dark + blur backdrop. clicking it closes; the inner panel stops
          propagation so clicks on cards / header don't trigger close. */}
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(0, 0, 0, 0.78)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
        aria-hidden
      />

      <div
        className="relative z-10 flex h-full flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-8 py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/50">
              <span aria-hidden>{isSmart ? "\u2728" : "\uD83D\uDDC2\uFE0F"}</span>
              <span>{isSmart ? "Colección inteligente" : "Colección"}</span>
            </div>
            <h2
              className="mt-1 truncate text-2xl font-semibold text-white"
              title={collection.name}
            >
              {collection.name}
            </h2>
            <p className="text-sm text-white/60">{totalLabel}</p>
          </div>
          <button
            onClick={closeCollectionViewer}
            className="rounded-full p-2 text-2xl leading-none text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
          >
            &times;
          </button>
        </div>

        {/* Body — game grid (or empty state) */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {roms.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-white/60">
              <span className="text-5xl" aria-hidden>
                {"\uD83D\uDDC2\uFE0F"}
              </span>
              <p className="text-base">Esta colección está vacía.</p>
              <p className="text-xs text-white/40">
                Añade juegos desde el botón &quot;Colecciones&quot; en la barra superior.
              </p>
            </div>
          ) : (
            <div
              ref={gridRef}
              className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))]"
              style={{ gap: `${GRID_GAP}px` }}
            >
              {roms.map((rom, idx) => (
                <div
                  key={`${rom.systemId}:${rom.fileName}`}
                  className="game-grid-card"
                  data-modal-grid-index={idx}
                >
                  <GameCard
                    rom={rom}
                    gridIndex={idx}
                    isFocused={idx === focusedIndex}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
