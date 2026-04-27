import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { DiscoveredRom, SgdbCandidate } from "../../../core/types";

interface Props {
  rom: DiscoveredRom;
  /** True if there's currently a custom cover (controls visibility of Reset). */
  hasCustomCover: boolean;
  /** Called after the cover is successfully replaced/cleared. The renderer
   *  uses this to refresh the gallery card and show a "guardado" badge. */
  onApplied: (result: {
    action: "libretro" | "steamgriddb" | "custom" | "reset";
    coverPath?: string;
  }) => void;
  onClose: () => void;
}

type Mode = "menu" | "sgdb-list";

type Busy =
  | null
  | { kind: "libretro" | "custom" | "reset" | "sgdb-list" }
  | { kind: "sgdb-apply"; gridId: number };

/** One option in the source menu — kept as data so the focus styling and
 *  layout stay consistent across all rows. */
interface MenuOption {
  id: "libretro" | "steamgriddb" | "custom" | "reset";
  label: string;
  hint: string;
  icon: string;
}

export function CoverSourcePicker({
  rom,
  hasCustomCover,
  onApplied,
  onClose,
}: Props) {
  const [mode, setMode] = useState<Mode>("menu");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SgdbCandidate[]>([]);

  // Esc closes — but only when we're not in the middle of a network call.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && busy === null) {
        if (mode === "sgdb-list") {
          setMode("menu");
          setError(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, mode, onClose]);

  const handleLibretro = useCallback(async () => {
    setBusy({ kind: "libretro" });
    setError(null);
    try {
      const res = await window.electronAPI.fetchCoverFromLibretro(
        rom.systemId,
        rom.fileName
      );
      if (!res.success) {
        setError(res.error ?? "No se pudo descargar de Libretro.");
        return;
      }
      onApplied({ action: "libretro", coverPath: res.coverPath });
      onClose();
    } finally {
      setBusy(null);
    }
  }, [rom, onApplied, onClose]);

  const handleCustomFile = useCallback(async () => {
    setBusy({ kind: "custom" });
    setError(null);
    try {
      const sourcePath = await window.electronAPI.pickFile([
        { name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] },
      ]);
      if (!sourcePath) return;
      const res = await window.electronAPI.setCustomCover(
        rom.systemId,
        rom.fileName,
        sourcePath
      );
      if (!res.success) {
        setError(res.error ?? "No se pudo guardar la imagen.");
        return;
      }
      onApplied({ action: "custom", coverPath: res.coverPath });
      onClose();
    } finally {
      setBusy(null);
    }
  }, [rom, onApplied, onClose]);

  const handleReset = useCallback(async () => {
    setBusy({ kind: "reset" });
    setError(null);
    try {
      const res = await window.electronAPI.resetCustomCover(
        rom.systemId,
        rom.fileName
      );
      if (!res.success) {
        setError(res.error ?? "No se pudo restablecer la portada.");
        return;
      }
      onApplied({ action: "reset" });
      onClose();
    } finally {
      setBusy(null);
    }
  }, [rom, onApplied, onClose]);

  const openSgdb = useCallback(async () => {
    setBusy({ kind: "sgdb-list" });
    setError(null);
    try {
      const res = await window.electronAPI.listSteamGridDbCandidates(
        rom.systemId,
        rom.fileName
      );
      if (!res.success && (!res.candidates || res.candidates.length === 0)) {
        setError(res.error ?? "No se pudieron obtener candidatos.");
        return;
      }
      setCandidates(res.candidates);
      setMode("sgdb-list");
      if (res.candidates.length === 0) {
        setError(res.error ?? "Sin resultados en SteamGridDB.");
      }
    } finally {
      setBusy(null);
    }
  }, [rom]);

  const applyCandidate = useCallback(
    async (candidate: SgdbCandidate) => {
      setBusy({ kind: "sgdb-apply", gridId: candidate.gridId });
      setError(null);
      try {
        const res = await window.electronAPI.applySteamGridDbCandidate(
          rom.systemId,
          rom.fileName,
          candidate.fullUrl
        );
        if (!res.success) {
          setError(res.error ?? "No se pudo aplicar la portada.");
          return;
        }
        onApplied({ action: "steamgriddb", coverPath: res.coverPath });
        onClose();
      } finally {
        setBusy(null);
      }
    },
    [rom, onApplied, onClose]
  );

  const options: MenuOption[] = [
    {
      id: "libretro",
      label: "Libretro",
      hint: "Cartas oficiales del proyecto libretro-thumbnails.",
      icon: "\uD83C\uDFAE",
    },
    {
      id: "steamgriddb",
      label: "SteamGridDB",
      hint: "Elige entre varias portadas hechas por la comunidad.",
      icon: "\u2728",
    },
    {
      id: "custom",
      label: "Imagen personalizada",
      hint: "Carga un archivo desde tu equipo (jpg / png / webp).",
      icon: "\uD83D\uDDBC\uFE0F",
    },
  ];

  const isBusy = busy !== null;
  const titleLabel = rom.fileName.replace(/\.[^.]+$/, "");

  return createPortal(
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!isBusy) onClose();
      }}
    >
      <div
        className="flex w-full max-w-3xl max-h-[85vh] flex-col rounded-lg bg-[var(--color-surface-1)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-surface-2)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              {mode === "menu"
                ? "Cambiar portada"
                : "Elige una portada de SteamGridDB"}
            </h2>
            <p
              className="truncate text-xs text-[var(--color-text-muted)]"
              title={titleLabel}
            >
              {titleLabel}
            </p>
          </div>
          <button
            onClick={() => {
              if (!isBusy) onClose();
            }}
            disabled={isBusy}
            className="text-2xl leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
            aria-label="Cerrar"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-md border border-[var(--color-bad)]/40 bg-[var(--color-bad)]/10 px-3 py-2 text-xs text-[var(--color-text-primary)]">
              {error}
            </div>
          )}

          {mode === "menu" && (
            <ul className="space-y-2">
              {options.map((opt) => {
                const active =
                  (opt.id === "libretro" && busy?.kind === "libretro") ||
                  (opt.id === "steamgriddb" && busy?.kind === "sgdb-list") ||
                  (opt.id === "custom" && busy?.kind === "custom");
                return (
                  <li key={opt.id}>
                    <button
                      onClick={() => {
                        if (isBusy) return;
                        if (opt.id === "libretro") void handleLibretro();
                        else if (opt.id === "steamgriddb") void openSgdb();
                        else if (opt.id === "custom") void handleCustomFile();
                      }}
                      disabled={isBusy}
                      className="flex w-full items-center gap-3 rounded-md border border-[var(--color-surface-2)] bg-[var(--color-surface-2)]/40 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-2)]/80 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-2xl" aria-hidden>
                        {opt.icon}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {opt.label}
                        </span>
                        <span className="block text-xs text-[var(--color-text-muted)]">
                          {opt.hint}
                        </span>
                      </span>
                      {active && (
                        <span className="text-xs text-[var(--color-text-muted)]">
                          Cargando…
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}

              {hasCustomCover && (
                <li>
                  <button
                    onClick={() => {
                      if (!isBusy) void handleReset();
                    }}
                    disabled={isBusy}
                    className="flex w-full items-center gap-3 rounded-md border border-[var(--color-surface-2)] px-4 py-3 text-left text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)]/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="text-xl" aria-hidden>
                      {"\u21A9"}
                    </span>
                    <span className="flex-1">
                      Restablecer portada original
                    </span>
                    {busy?.kind === "reset" && (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        Cargando…
                      </span>
                    )}
                  </button>
                </li>
              )}
            </ul>
          )}

          {mode === "sgdb-list" && (
            <>
              {candidates.length === 0 && !error && (
                <p className="px-2 py-6 text-center text-sm text-[var(--color-text-muted)]">
                  Sin resultados.
                </p>
              )}
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {candidates.map((c) => {
                  const applying =
                    busy?.kind === "sgdb-apply" && busy.gridId === c.gridId;
                  const dimmed = isBusy && !applying;
                  return (
                    <button
                      key={c.gridId}
                      onClick={() => {
                        if (!isBusy) void applyCandidate(c);
                      }}
                      disabled={isBusy}
                      className={`group relative flex flex-col items-center gap-1 rounded-md border border-[var(--color-surface-2)] bg-[var(--color-surface-2)]/30 p-2 text-left transition-all hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-2)]/60 ${
                        dimmed ? "opacity-50" : ""
                      } disabled:cursor-not-allowed`}
                      title={`${c.width}\u00d7${c.height} · ${c.style}`}
                    >
                      <div className="aspect-[2/3] w-full overflow-hidden rounded bg-black/30">
                        <img
                          src={c.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                        {c.width}
                        {"\u00d7"}
                        {c.height}
                      </span>
                      {applying && (
                        <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/60 text-xs font-medium text-white">
                          Aplicando…
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-surface-2)] px-5 py-3">
          {mode === "sgdb-list" ? (
            <button
              onClick={() => {
                if (!isBusy) {
                  setMode("menu");
                  setError(null);
                }
              }}
              disabled={isBusy}
              className="rounded-md px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]/60 disabled:opacity-50"
            >
              ← Volver
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={() => {
              if (!isBusy) onClose();
            }}
            disabled={isBusy}
            className="rounded-md px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]/60 disabled:opacity-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
