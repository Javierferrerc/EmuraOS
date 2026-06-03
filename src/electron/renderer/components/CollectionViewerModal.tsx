import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
    reorderCollection,
  } = useApp();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [columnCount, setColumnCount] = useState(4);
  const openedAtRef = useRef(0);
  // Live-preview drag state. We track stable rom keys instead of indices
  // because the displayed order shifts in real time as the user drags
  // (Trello-style): the dragged item is removed and re-inserted at the
  // hover position on every dragover, so a captured index would point
  // to the wrong rom one cell later. The keys stay stable while the
  // layout reflows around them.
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // FLIP animation plumbing for sibling-card slide during reorder.
  // - cardRefs: every rendered drag-card div registers itself here by
  //   rom key, so the FLIP pass can read its DOM rect after layout.
  // - flipSnapshotRef: a snapshot of every card's bounding rect taken
  //   right BEFORE the layout-changing state update (in handleDragOver
  //   / handleDragEnd). After React commits the new layout, the
  //   useLayoutEffect below diffs each card's new rect against the
  //   snapshot, applies an inverse translate to put it visually back
  //   at the old spot, forces a reflow, then transitions to identity
  //   — the classic First/Last/Invert/Play pattern. CSS Grid cannot
  //   animate cell changes natively, so this is what makes the
  //   neighbours slide instead of jumping.
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const flipSnapshotRef = useRef<Map<string, DOMRect> | null>(null);
  const captureFlipSnapshot = useCallback(() => {
    const snap = new Map<string, DOMRect>();
    cardRefs.current.forEach((el, key) => {
      snap.set(key, el.getBoundingClientRect());
    });
    flipSnapshotRef.current = snap;
  }, []);

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

  // FLIP play step. Runs after every commit; bails out cheaply when no
  // snapshot was queued. When one is present, for each tracked card
  // we compute the delta between its previous and current bounding
  // rect, position it at the previous spot via transform, force a
  // synchronous reflow with offsetHeight, then transition back to
  // identity. Cards that didn't move (|d| < 1px) are skipped so we
  // don't waste a render on a no-op transition.
  useLayoutEffect(() => {
    const snap = flipSnapshotRef.current;
    if (!snap) return;
    flipSnapshotRef.current = null;

    cardRefs.current.forEach((el, key) => {
      const prev = snap.get(key);
      if (!prev) return;
      const curr = el.getBoundingClientRect();
      const dx = prev.left - curr.left;
      const dy = prev.top - curr.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      // Synchronous reflow read forces the browser to apply the
      // pre-transition transform before the next style change kicks
      // in — otherwise the two transform values merge and the
      // animation skips entirely.
      void el.offsetHeight;
      el.style.transition =
        "transform 220ms cubic-bezier(0.2, 0, 0.2, 1)";
      el.style.transform = "";
    });
  });

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
  // Smart collections compute their roms from a filter — reordering is
  // meaningless and would just snap back on next render.
  const canReorder = !isSmart && roms.length > 1;
  const keyOf = (r: DiscoveredRom) => `${r.systemId}:${r.fileName}`;

  // Sentinel used by dragOverKey to mean "insert at the end of the list"
  // — needed for the right-half-of-last-card drop zone, since there's
  // no next rom whose key we could use as the insertion anchor.
  const END_KEY = "__end__";

  // Order shown to the user while a drag is in progress. dragOverKey is
  // either the key of the rom to insert BEFORE, or END_KEY to append
  // after everything. The right-half threshold inside handleDragOver
  // converts cursor position into the appropriate anchor, so each card
  // is a forgiving drop zone: hover the left half → land before it,
  // hover the right half → land after it. The activation flips at the
  // card midpoint instead of at the narrow gap between cards.
  const displayRoms: DiscoveredRom[] = (() => {
    if (!draggingKey || !dragOverKey || draggingKey === dragOverKey) {
      return roms;
    }
    const withoutDragged = roms.filter((r) => keyOf(r) !== draggingKey);
    const draggedRom = roms.find((r) => keyOf(r) === draggingKey);
    if (!draggedRom) return roms;
    if (dragOverKey === END_KEY) {
      return [...withoutDragged, draggedRom];
    }
    const targetIdx = withoutDragged.findIndex(
      (r) => keyOf(r) === dragOverKey
    );
    if (targetIdx === -1) return roms;
    const out = [...withoutDragged];
    out.splice(targetIdx, 0, draggedRom);
    return out;
  })();

  const handleDragStart = (rom: DiscoveredRom) => (e: React.DragEvent) => {
    if (!canReorder) return;
    setDraggingKey(keyOf(rom));
    // Required for Firefox to dispatch dragstart at all. Value is ignored —
    // the drag context lives entirely in component state.
    e.dataTransfer.setData("text/plain", keyOf(rom));
    e.dataTransfer.effectAllowed = "move";
    // Note: we deliberately do NOT call setDragImage(transparent) here.
    // The browser's default semi-transparent ghost following the cursor
    // is the user's primary "what am I dragging" feedback — hiding it
    // makes the dragged card visually disappear during travel. The
    // in-grid card *also* stays visible at opacity-60 at its current
    // preview position, so the user sees both: cursor ghost + landing
    // preview.
  };

  const handleDragOver = (rom: DiscoveredRom) => (e: React.DragEvent) => {
    if (!canReorder || !draggingKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const k = keyOf(rom);
    // Ignore dragover on the dragged item itself. After the live preview
    // re-inserts it at the hover target, the cursor often passes back
    // over it; without this guard `dragOverKey` would flip to the dragged
    // item's own key, displayRoms would snap back to the unmodified
    // order, and the user would see the layout flicker between the
    // preview state and the original state.
    if (k === draggingKey) return;

    // Card midpoint threshold: hovering the LEFT half means "insert
    // before this card"; hovering the RIGHT half means "insert after"
    // (== "insert before the next non-dragged card", or end-of-list).
    // This makes each card a wide drop zone — far more forgiving than
    // aiming at the thin gap between cards.
    const rect = e.currentTarget.getBoundingClientRect();
    const isRightHalf = e.clientX > rect.left + rect.width / 2;

    let nextDragOverKey: string;
    if (isRightHalf) {
      // Walk forward in `roms` to find the next non-dragged neighbour.
      // Skipping the dragged item matters because in displayRoms the
      // dragged rom sits between this card and the literal "next" one
      // when its preview slot is here.
      const idx = roms.findIndex((r) => keyOf(r) === k);
      let neighbour: DiscoveredRom | undefined;
      for (let i = idx + 1; i < roms.length; i++) {
        if (keyOf(roms[i]) !== draggingKey) {
          neighbour = roms[i];
          break;
        }
      }
      nextDragOverKey = neighbour ? keyOf(neighbour) : END_KEY;
    } else {
      nextDragOverKey = k;
    }

    if (dragOverKey !== nextDragOverKey) {
      captureFlipSnapshot();
      setDragOverKey(nextDragOverKey);
    }
  };

  const handleDragEnd = () => {
    // Snapshot before clearing so that if the user cancelled the drag
    // (no drop) the layout reset animates back to the original order.
    // On a successful drop the persisted roms order matches the
    // preview, so the FLIP pass sees dx≈dy≈0 and is a no-op.
    captureFlipSnapshot();
    setDraggingKey(null);
    setDragOverKey(null);
  };

  const handleDrop = () => (e: React.DragEvent) => {
    if (!canReorder || !draggingKey) {
      setDragOverKey(null);
      return;
    }
    e.preventDefault();
    // Persist whatever the user currently sees — displayRoms already
    // has the dragged rom in its final position thanks to the live
    // preview computation above, so we just snapshot it.
    const newKeys = displayRoms.map(keyOf);
    setDraggingKey(null);
    setDragOverKey(null);
    const currentKeys = roms.map(keyOf);
    // Skip the IPC if nothing actually moved (e.g. drop on the same
    // card it started from).
    if (newKeys.every((k, i) => k === currentKeys[i])) return;
    reorderCollection(collection.id, newKeys);
  };

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
              {displayRoms.map((rom, idx) => {
                const k = keyOf(rom);
                const isDragging = draggingKey === k;
                const cursorClass = canReorder
                  ? draggingKey
                    ? "cursor-grabbing"
                    : "cursor-grab"
                  : "";
                return (
                  <div
                    key={k}
                    ref={(el) => {
                      if (el) cardRefs.current.set(k, el);
                      else cardRefs.current.delete(k);
                    }}
                    className={`game-grid-card collection-drag-card transition-opacity duration-150 ${cursorClass} ${
                      isDragging ? "opacity-60" : ""
                    }`}
                    data-modal-grid-index={idx}
                    draggable={canReorder}
                    onDragStart={handleDragStart(rom)}
                    onDragOver={handleDragOver(rom)}
                    onDrop={handleDrop()}
                    onDragEnd={handleDragEnd}
                  >
                    <GameCard
                      rom={rom}
                      gridIndex={idx}
                      isFocused={idx === focusedIndex}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
