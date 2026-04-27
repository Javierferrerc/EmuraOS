import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import { SmartCollectionEditorModal } from "./SmartCollectionEditorModal";
import { CreateCollectionModal } from "./CreateCollectionModal";
import { composeCollectionMosaic } from "../utils/collectionMosaic";
import { evaluateSmartCollection } from "../../../core/smart-collection";
import type { Collection, SmartCollectionFilter } from "../../../core/types";
import xIcon from "../assets/icons/controls/x.svg";
import circleIcon from "../assets/icons/controls/circle.svg";
import triangleIcon from "../assets/icons/controls/triangle.svg";

/**
 * Central place to view, create, edit and delete collections (manual + smart).
 * Open via the TopBar "Colecciones" button. Doubles as the navigation entry
 * point: clicking a collection sets it as the active library filter and
 * closes the modal.
 *
 * Manual collections are still managed by adding/removing roms from the grid
 * (no UI here — that's a separate flow). Smart collections expose their full
 * filter for editing inline via SmartCollectionEditorModal.
 */

export function CollectionsModal() {
  const {
    collections,
    createCollection,
    createSmartCollection,
    updateSmartCollectionFilter,
    renameCollection,
    deleteCollection,
    setCollectionsModalOpen,
    enterBulkSelect,
    openCollectionViewer,
  } = useApp();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingSmart, setEditingSmart] = useState<Collection | null>(null);
  const [creatingSmart, setCreatingSmart] = useState(false);
  // True while the unified manual-collection create modal is open. The
  // older inline rename-and-add-later flow was confusing — this modal
  // collects the name and games in one step.
  const [creatingManual, setCreatingManual] = useState(false);

  function handleClose() {
    setCollectionsModalOpen(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !editingSmart &&
        !creatingSmart &&
        !creatingManual
      ) {
        handleClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSmart, creatingSmart, creatingManual]);

  function activateCollection(col: Collection) {
    openCollectionViewer(col.id);
    handleClose();
  }

  function startRename(col: Collection) {
    setRenamingId(col.id);
    setRenameDraft(col.name);
  }

  function commitRename() {
    if (renamingId && renameDraft.trim()) {
      renameCollection(renamingId, renameDraft.trim());
    }
    setRenamingId(null);
    setRenameDraft("");
  }

  // createCollection is still used by the smart-collection inline path
  // and exposed through context; the manual path goes through
  // CreateCollectionModal which calls the same action under the hood.
  void createCollection;

  async function handleCreateSmart(
    name: string,
    filter: SmartCollectionFilter
  ) {
    await createSmartCollection(name, filter);
    setCreatingSmart(false);
  }

  async function handleUpdateSmart(
    name: string,
    filter: SmartCollectionFilter
  ) {
    if (!editingSmart) return;
    if (name !== editingSmart.name) {
      await renameCollection(editingSmart.id, name);
    }
    await updateSmartCollectionFilter(editingSmart.id, filter);
    setEditingSmart(null);
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
        onClick={handleClose}
      >
        <div
          className="flex w-full max-w-3xl max-h-[85vh] flex-col rounded-2xl shadow-2xl"
          style={{
            // Stack the themed surface tint over a fully opaque base bg
            // so the panel is no longer translucent (surface-1 ships at
            // 0.7 alpha for the in-app glass cards). Console-style
            // modals should feel solid and own the screen.
            backgroundColor: "var(--color-bg)",
            backgroundImage:
              "linear-gradient(var(--color-surface-1), var(--color-surface-1))",
            border: "1px solid var(--color-glass-border)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[var(--color-surface-2)] px-5 py-4">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Colecciones
            </h2>
            <button
              onClick={handleClose}
              className="text-2xl leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              aria-label="Cerrar"
            >
              &times;
            </button>
          </div>

          <div className="flex gap-2 border-b border-[var(--color-surface-2)] px-5 py-3">
            <button
              onClick={() => setCreatingManual(true)}
              className="rounded border border-[var(--color-accent)] bg-[var(--color-accent)]/10 px-3 py-1.5 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20"
            >
              + Nueva colección
            </button>
            <button
              onClick={() => setCreatingSmart(true)}
              className="rounded border border-[var(--color-surface-2)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
            >
              + Inteligente
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3">
            {collections.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">
                No hay colecciones todavía. Crea una manual o inteligente para
                empezar.
              </p>
            ) : (
              <ul className="space-y-1">
                {collections.map((col) => {
                  const isSmart = col.kind === "smart";
                  const isRenaming = renamingId === col.id;
                  return (
                    <li
                      key={col.id}
                      className="group flex items-center gap-3 rounded px-2 py-2 hover:bg-[var(--color-surface-2)]/50"
                    >
                      <CollectionMosaicThumb collection={col} />
                      <span
                        className={`text-base ${isSmart ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}`}
                        title={isSmart ? "Inteligente" : "Manual"}
                      >
                        {isSmart ? "\u2728" : "\u2630"}
                      </span>
                      {isRenaming ? (
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") {
                              setRenamingId(null);
                              setRenameDraft("");
                            }
                          }}
                          autoFocus
                          className="flex-1 rounded border border-[var(--color-accent)] bg-[var(--color-surface-0)] px-2 py-1 text-sm text-[var(--color-text-primary)] outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => activateCollection(col)}
                          className="flex-1 truncate text-left text-sm text-[var(--color-text-primary)]"
                          title="Ver esta colección"
                        >
                          {col.name}
                        </button>
                      )}
                      <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                        {isSmart
                          ? "filtro"
                          : `${col.roms.length} juego${col.roms.length === 1 ? "" : "s"}`}
                      </span>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isSmart && (
                          <button
                            onClick={() => {
                              enterBulkSelect(col.id, col.name);
                              handleClose();
                            }}
                            className="rounded px-2 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
                            title="Añadir juegos a esta colección desde la biblioteca"
                          >
                            + Juegos
                          </button>
                        )}
                        {isSmart && (
                          <button
                            onClick={() => setEditingSmart(col)}
                            className="rounded px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
                            title="Editar filtro"
                          >
                            Editar
                          </button>
                        )}
                        <button
                          onClick={() => startRename(col)}
                          className="rounded px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
                          title="Renombrar"
                        >
                          Renombrar
                        </button>
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `¿Eliminar la colección "${col.name}"?`
                              )
                            ) {
                              deleteCollection(col.id);
                            }
                          }}
                          className="rounded px-2 py-1 text-xs text-[var(--color-bad)] hover:bg-[var(--color-bad)]/10"
                          title="Eliminar"
                        >
                          Eliminar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Console-style footer — gamepad button hints. Mirrors the
              language used by BottomBar and the create modal so the
              UX feels consistent across the app. */}
          <div className="flex items-center gap-5 border-t border-[var(--color-surface-2)] px-6 py-3 text-[13px] font-medium text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1.5">
              <img src={xIcon} alt="" className="h-5 w-5" />
              Abrir
            </span>
            <span className="flex items-center gap-1.5">
              <img src={triangleIcon} alt="" className="h-5 w-5" />
              Editar
            </span>
            <span className="flex items-center gap-1.5">
              <img src={circleIcon} alt="" className="h-5 w-5" />
              Cerrar
            </span>
          </div>
        </div>
      </div>

      {creatingManual && (
        <CreateCollectionModal
          onClose={() => setCreatingManual(false)}
          onCreated={(id) => {
            // After creating, immediately open the viewer so the user can
            // see what they made — feels more rewarding than dropping back
            // to a list with one extra row.
            setCreatingManual(false);
            handleClose();
            openCollectionViewer(id);
          }}
        />
      )}

      {creatingSmart && (
        <SmartCollectionEditorModal
          mode="create"
          onClose={() => setCreatingSmart(false)}
          onSubmit={handleCreateSmart}
        />
      )}

      {editingSmart && (
        <SmartCollectionEditorModal
          mode="edit"
          initialName={editingSmart.name}
          initialFilter={editingSmart.filter ?? {}}
          onClose={() => setEditingSmart(null)}
          onSubmit={handleUpdateSmart}
        />
      )}
    </>,
    document.body
  );
}

/**
 * Small 40x40 mosaic preview of a collection. Resolves the first 4 rom keys
 * (static for manual, evaluated live for smart), fetches their thumbnails,
 * composites a 2x2 in a canvas, and renders the resulting JPEG dataURL.
 * Falls back to a folder glyph when no roms have covers.
 */
function CollectionMosaicThumb({ collection }: { collection: Collection }) {
  const {
    scanResult,
    getMetadataForRom,
    favorites,
    recentlyPlayed,
  } = useApp();

  const [mosaicUrl, setMosaicUrl] = useState<string | null>(null);

  // Resolve the first 4 rom keys for this collection. For smart collections
  // we evaluate against the live library, so the preview always reflects the
  // current state of metadata/favorites/history.
  const firstRomKeys = useMemo(() => {
    if (collection.kind === "smart" && collection.filter && scanResult) {
      const allRoms = scanResult.systems.flatMap((s) => s.roms);
      const matched = evaluateSmartCollection(
        collection.filter,
        allRoms,
        getMetadataForRom,
        favorites,
        recentlyPlayed
      );
      return matched.slice(0, 4);
    }
    return collection.roms.slice(0, 4);
  }, [collection, scanResult, getMetadataForRom, favorites, recentlyPlayed]);

  useEffect(() => {
    let cancelled = false;
    async function build() {
      const dataUrls: string[] = [];
      for (const key of firstRomKeys) {
        const idx = key.indexOf(":");
        if (idx <= 0) continue;
        const systemId = key.slice(0, idx);
        const fileName = key.slice(idx + 1);
        const meta = getMetadataForRom(systemId, fileName);
        if (!meta?.coverPath) continue;
        const url = await window.electronAPI.readThumbnailDataUrl(
          systemId,
          fileName
        );
        if (url) dataUrls.push(url);
        if (dataUrls.length >= 4) break;
      }
      if (cancelled) return;
      const mosaic = await composeCollectionMosaic(dataUrls, 80);
      if (!cancelled) setMosaicUrl(mosaic);
    }
    build();
    return () => {
      cancelled = true;
    };
  }, [firstRomKeys, getMetadataForRom]);

  if (!mosaicUrl) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[var(--color-surface-2)] text-sm text-[var(--color-text-muted)]">
        🗂
      </div>
    );
  }
  return (
    <img
      src={mosaicUrl}
      alt=""
      className="h-10 w-10 shrink-0 rounded object-cover"
    />
  );
}
