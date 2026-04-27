import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import type { DiscoveredRom } from "../../../core/types";
import xIcon from "../assets/icons/controls/x.svg";
import circleIcon from "../assets/icons/controls/circle.svg";
import squareIcon from "../assets/icons/controls/square.svg";
import triangleIcon from "../assets/icons/controls/triangle.svg";

interface Props {
  onClose: () => void;
  /** Called when the user confirms creation. Returns the id of the new
   *  collection so the caller can chain follow-up actions (e.g. open it). */
  onCreated?: (collectionId: string) => void;
}

/**
 * Single-screen flow for creating a manual collection.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Header: Name input · count badge · close (×)         │
 *   ├─────────────────────────────────────────────────────┤
 *   │ Search bar                                           │
 *   │ Game grid (small thumbnails, click to toggle)        │
 *   ├─────────────────────────────────────────────────────┤
 *   │ Selected strip (covers of selected games)            │
 *   │ Cancelar          Crear colección [primary]          │
 *   └─────────────────────────────────────────────────────┘
 *
 * The backdrop uses a strong opacity + blur — the user sees they're in a
 * focused task, not glancing at the library underneath. Selecting games
 * mutates local state only; nothing is persisted until "Crear colección"
 * is clicked, which is when we both create the empty collection and add
 * each selected rom in sequence.
 */
export function CreateCollectionModal({ onClose, onCreated }: Props) {
  const {
    scanResult,
    getMetadataForRom,
    createCollection,
    addToCollection,
    collections,
  } = useApp();

  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Esc closes — but not while submitting (avoids cancelling mid-write).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [submitting, onClose]);

  const allRoms = useMemo<DiscoveredRom[]>(() => {
    if (!scanResult) return [];
    const list: DiscoveredRom[] = [];
    for (const sys of scanResult.systems) list.push(...sys.roms);
    list.sort((a, b) => a.fileName.localeCompare(b.fileName));
    return list;
  }, [scanResult]);

  const filteredRoms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRoms;
    return allRoms.filter((r) => {
      const meta = getMetadataForRom(r.systemId, r.fileName);
      const title = meta?.title?.toLowerCase() ?? "";
      const file = r.fileName.toLowerCase();
      return title.includes(q) || file.includes(q);
    });
  }, [allRoms, search, getMetadataForRom]);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Resolve selected keys to actual roms (preserving order they were added).
  const selectedRoms = useMemo<DiscoveredRom[]>(() => {
    const byKey = new Map<string, DiscoveredRom>();
    for (const r of allRoms) byKey.set(`${r.systemId}:${r.fileName}`, r);
    const out: DiscoveredRom[] = [];
    for (const key of selected) {
      const rom = byKey.get(key);
      if (rom) out.push(rom);
    }
    return out;
  }, [allRoms, selected]);

  const trimmedName = name.trim();
  const nameClash = collections.some(
    (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
  );
  const canSubmit =
    !!trimmedName && !nameClash && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // createCollection returns void, so we keep `submitting` true and
      // wait for the new collection to appear in the context's collections
      // array (handled by the effect below) to add the selected roms.
      await createCollection(trimmedName);
    } catch (err) {
      console.error("Failed to create collection:", err);
      setSubmitting(false);
    }
  }

  // Once the newly-created collection appears in the list, add the
  // selected roms to it in sequence and close. We track the collection
  // we created in a ref to avoid re-triggering on unrelated collection
  // mutations.
  const handledRef = useRef(false);
  useEffect(() => {
    if (!submitting || handledRef.current) return;
    const created = collections.find(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (!created) return;
    handledRef.current = true;

    (async () => {
      try {
        for (const rom of selectedRoms) {
          try {
            await addToCollection(created.id, rom.systemId, rom.fileName);
          } catch (err) {
            console.error("Failed to add rom to new collection:", err);
          }
        }
        onCreated?.(created.id);
      } finally {
        setSubmitting(false);
        onClose();
      }
    })();
  }, [
    submitting,
    collections,
    trimmedName,
    selectedRoms,
    addToCollection,
    onCreated,
    onClose,
  ]);

  return createPortal(
    <div className="fixed inset-0 z-[9992] flex items-center justify-center p-6">
      {/* Heavy backdrop — strong dim + blur so the modal owns the screen. */}
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(0, 0, 0, 0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
        onClick={() => {
          if (!submitting) onClose();
        }}
        aria-hidden
      />

      <div
        className="relative z-10 flex h-full max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl shadow-2xl"
        style={{
          // Opaque panel — surface-1 alone is 0.7 alpha so the modal
          // looks transparent over the dimmed backdrop. Stacking it over
          // var(--color-bg) gives the same theme tint with full opacity,
          // which reads as a console-style "screen takeover".
          backgroundColor: "var(--color-bg)",
          backgroundImage:
            "linear-gradient(var(--color-surface-1), var(--color-surface-1))",
          border: "1px solid var(--color-glass-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-[var(--color-surface-2)] px-6 py-4">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
              Nombre de la colección
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Mis Pokémon, Speedruns favoritos…"
              maxLength={80}
              className="bg-transparent text-xl font-semibold text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]/50"
              disabled={submitting}
            />
            {nameClash && (
              <span className="text-xs text-[var(--color-bad)]">
                Ya existe una colección con ese nombre.
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="rounded-full bg-[var(--color-surface-2)]/60 px-3 py-1 text-xs font-mono text-[var(--color-text-secondary)]">
              {selected.size === 1 ? "1 juego" : `${selected.size} juegos`}
            </span>
            <button
              onClick={() => {
                if (!submitting) onClose();
              }}
              disabled={submitting}
              className="rounded-full p-2 text-2xl leading-none text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]/60 hover:text-[var(--color-text-primary)] disabled:opacity-40"
              aria-label="Cerrar"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-[var(--color-surface-2)] px-6 py-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar un juego para añadir…"
            className="w-full rounded-md border border-[var(--color-surface-2)] bg-[var(--color-surface-0)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            disabled={submitting}
          />
        </div>

        {/* Game grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredRoms.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
              {search.trim()
                ? "Sin resultados."
                : "No hay juegos en tu biblioteca todavía."}
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
              {filteredRoms.map((rom) => {
                const key = `${rom.systemId}:${rom.fileName}`;
                const isSelected = selected.has(key);
                return (
                  <PickerCard
                    key={key}
                    rom={rom}
                    selected={isSelected}
                    disabled={submitting}
                    onToggle={() => toggleSelect(key)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Selected strip */}
        {selectedRoms.length > 0 && (
          <div className="border-t border-[var(--color-surface-2)] bg-[var(--color-surface-0)]/60 px-6 py-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
              Seleccionados
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {selectedRoms.map((rom) => {
                const key = `${rom.systemId}:${rom.fileName}`;
                return (
                  <SelectedThumb
                    key={key}
                    rom={rom}
                    onRemove={() => toggleSelect(key)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Footer — console-style. Left side: gamepad button hints
            (matches BottomBar so the user reads the same visual language
            in modals and library). Right side: primary mouse-driven
            buttons that mirror the same actions. */}
        <div className="flex items-center justify-between gap-4 border-t border-[var(--color-surface-2)] px-6 py-4">
          <div className="flex items-center gap-5 text-[13px] font-medium text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1.5">
              <img src={xIcon} alt="" className="h-5 w-5" />
              Marcar / Quitar
            </span>
            <span className="flex items-center gap-1.5">
              <img src={triangleIcon} alt="" className="h-5 w-5" />
              Crear colección
            </span>
            <span className="flex items-center gap-1.5">
              <img src={squareIcon} alt="" className="h-5 w-5" />
              Limpiar
            </span>
            <span className="flex items-center gap-1.5">
              <img src={circleIcon} alt="" className="h-5 w-5" />
              Cancelar
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!submitting) onClose();
              }}
              disabled={submitting}
              className="rounded-md px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]/60 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-md bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Creando…" : "Crear colección"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Single tile in the picker grid. Lazy-loads its thumbnail on first
 * intersect so a library with thousands of ROMs doesn't hammer IPC at
 * mount time.
 */
function PickerCard({
  rom,
  selected,
  disabled,
  onToggle,
}: {
  rom: DiscoveredRom;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.disconnect();
            void window.electronAPI
              .readThumbnailDataUrl(rom.systemId, rom.fileName)
              .then((url) => {
                if (!cancelled) setThumb(url ?? null);
              })
              .catch(() => {
                /* silent — placeholder stays */
              });
          }
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [rom.systemId, rom.fileName]);

  const displayName = rom.fileName.replace(/\.[^.]+$/, "");

  return (
    <button
      ref={ref}
      onClick={onToggle}
      disabled={disabled}
      className={`group relative flex flex-col gap-1 rounded-md border bg-[var(--color-surface-2)]/30 p-2 text-left transition-all hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-2)]/60 disabled:cursor-not-allowed ${
        selected
          ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/40"
          : "border-[var(--color-surface-2)]"
      }`}
      title={displayName}
    >
      {selected && (
        <span className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-bold text-white shadow">
          {"\u2713"}
        </span>
      )}
      <div className="aspect-[2/3] w-full overflow-hidden rounded bg-black/30">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl opacity-30">
            {"\uD83C\uDFAE"}
          </div>
        )}
      </div>
      <span className="line-clamp-2 text-[11px] leading-tight text-[var(--color-text-primary)]">
        {displayName}
      </span>
    </button>
  );
}

/** Compact thumbnail strip item. Click to remove from selection. */
function SelectedThumb({
  rom,
  onRemove,
}: {
  rom: DiscoveredRom;
  onRemove: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void window.electronAPI
      .readThumbnailDataUrl(rom.systemId, rom.fileName)
      .then((url) => {
        if (!cancelled) setThumb(url ?? null);
      })
      .catch(() => {
        /* silent */
      });
    return () => {
      cancelled = true;
    };
  }, [rom.systemId, rom.fileName]);

  const displayName = rom.fileName.replace(/\.[^.]+$/, "");

  return (
    <button
      onClick={onRemove}
      title={`Quitar ${displayName}`}
      className="group relative h-14 w-10 shrink-0 overflow-hidden rounded bg-black/30"
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-base opacity-40">
          {"\uD83C\uDFAE"}
        </div>
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
        Quitar
      </span>
    </button>
  );
}
