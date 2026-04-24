/**
 * Command palette — action registry.
 *
 * Given the current domain state (config + collections + detection report)
 * and a set of callbacks, `buildCommandPaletteActions` returns the flat
 * list of actions available in the palette. QuickLaunch consumes this via
 * the `useCommandPaletteActions` hook which closes over AppContext.
 *
 * Design notes:
 *   • Kept as a pure builder function so it can be unit-tested with a plain
 *     object input — no AppContext mocking required.
 *   • Every action has a stable `id` so tests (and future "recent actions"
 *     work) can assert by identifier rather than label wording.
 *   • Dynamic actions (collections, un-installed emulators) are filtered
 *     deterministically so the palette list stays predictable as the user
 *     moves through the app.
 */

import type {
  AppConfig,
  Collection,
  DetectionResult,
  EmulatorDefinition,
} from "../../../core/types";

export type ActionGroup =
  | "Acciones"
  | "Temas"
  | "Vista"
  | "Colecciones"
  | "Emuladores";

export interface CommandAction {
  id: string;
  label: string;
  group: ActionGroup;
  /** Extra words that should also match the action via fuzzy search. */
  keywords?: string[];
  /** Small glyph to render next to the label. Emojis are acceptable — the
   * palette uses them as decorative hints, not meaningful iconography. */
  icon?: string;
  /** Marked featured when the empty-query state should include it. */
  featured?: boolean;
  run: () => void;
}

export interface BuildActionsArgs {
  config: AppConfig | null;
  collections: Collection[];
  detection: DetectionResult | null;
  emulatorDefs: EmulatorDefinition[];

  // Callbacks — the runtime wires these up from AppContext in the hook below.
  setCurrentView: (
    view: "library" | "settings" | "emulator-config" | "game"
  ) => void;
  refreshScan: () => void;
  addRomsFlow: () => void;
  startScraping: () => void;
  startFetchingCovers: () => void;
  setCollectionsModalOpen: (open: boolean) => void;
  toggleFullscreen: () => void;
  updateConfig: (partial: Partial<AppConfig>) => void;
  setActiveFilter: (filter: {
    type: "collection";
    collectionId: string;
  }) => void;
  downloadEmulator: (emulatorId: string) => void;
}

// List kept separate so the Settings dropdown and the palette always stay
// in sync on supported themes. Labels mirror general.ts — any future theme
// lives in one place.
const THEMES: Array<{ value: NonNullable<AppConfig["theme"]>; label: string }> =
  [
    { value: "dark", label: "Oscuro" },
    { value: "light", label: "Claro" },
    { value: "retro-crt", label: "Retro CRT verde" },
    { value: "crt-amber", label: "CRT Ámbar" },
    { value: "gameboy-green", label: "Game Boy verde" },
    { value: "snes-purple", label: "SNES púrpura" },
    { value: "synthwave", label: "Neon Synthwave" },
  ];

export function buildCommandPaletteActions(
  args: BuildActionsArgs
): CommandAction[] {
  const {
    config,
    collections,
    detection,
    emulatorDefs,
    setCurrentView,
    refreshScan,
    addRomsFlow,
    startScraping,
    startFetchingCovers,
    setCollectionsModalOpen,
    toggleFullscreen,
    updateConfig,
    setActiveFilter,
    downloadEmulator,
  } = args;

  const currentTheme = config?.theme ?? "dark";
  const currentViewMode = config?.libraryViewMode ?? "grid";
  const actions: CommandAction[] = [];

  // — Acciones base ------------------------------------------------
  actions.push(
    {
      id: "nav.settings",
      label: "Ir a Ajustes",
      group: "Acciones",
      keywords: ["settings", "configuración", "preferencias"],
      icon: "⚙",
      featured: true,
      run: () => setCurrentView("settings"),
    },
    {
      id: "nav.library",
      label: "Ir a Biblioteca",
      group: "Acciones",
      keywords: ["library", "juegos", "home"],
      icon: "🏠",
      run: () => setCurrentView("library"),
    },
    {
      id: "lib.rescan",
      label: "Rescanear ROMs",
      group: "Acciones",
      keywords: ["scan", "refresh", "actualizar"],
      icon: "🔄",
      featured: true,
      run: () => refreshScan(),
    },
    {
      id: "lib.add-roms",
      label: "Añadir ROMs",
      group: "Acciones",
      keywords: ["add", "nuevo", "import"],
      icon: "＋",
      run: () => addRomsFlow(),
    },
    {
      id: "lib.fetch-covers",
      label: "Actualizar portadas",
      group: "Acciones",
      keywords: ["covers", "carátulas", "imagenes"],
      icon: "🖼",
      featured: true,
      run: () => startFetchingCovers(),
    },
    {
      id: "lib.scrape-metadata",
      label: "Actualizar metadata",
      group: "Acciones",
      keywords: ["metadata", "scrape", "info"],
      icon: "📋",
      featured: true,
      run: () => startScraping(),
    },
    {
      id: "lib.collections",
      label: "Abrir Colecciones",
      group: "Acciones",
      keywords: ["collections", "listas"],
      icon: "📚",
      run: () => setCollectionsModalOpen(true),
    },
    {
      id: "view.fullscreen",
      label: "Alternar pantalla completa",
      group: "Acciones",
      keywords: ["fullscreen", "f11"],
      icon: "⛶",
      run: () => toggleFullscreen(),
    }
  );

  // — Temas --------------------------------------------------------
  for (const theme of THEMES) {
    if (theme.value === currentTheme) continue; // no point switching to current
    actions.push({
      id: `theme.set.${theme.value}`,
      label: `Cambiar tema a ${theme.label}`,
      group: "Temas",
      keywords: ["theme", "tema", theme.value],
      icon: "🎨",
      run: () => updateConfig({ theme: theme.value }),
    });
  }

  // — Vista --------------------------------------------------------
  const viewModes: Array<{
    value: NonNullable<AppConfig["libraryViewMode"]>;
    label: string;
  }> = [
    { value: "grid", label: "Grid" },
    { value: "list", label: "Lista" },
    { value: "compact", label: "Compacta" },
  ];
  for (const mode of viewModes) {
    if (mode.value === currentViewMode) continue;
    actions.push({
      id: `view.mode.${mode.value}`,
      label: `Vista ${mode.label}`,
      group: "Vista",
      keywords: ["view", "mode", mode.value],
      icon: "▦",
      run: () => updateConfig({ libraryViewMode: mode.value }),
    });
  }

  // — Colecciones dinámicas ----------------------------------------
  for (const col of collections) {
    actions.push({
      id: `collection.open.${col.id}`,
      label: `Abrir colección "${col.name}"`,
      group: "Colecciones",
      keywords: ["collection", col.name],
      icon: "📁",
      run: () => {
        setActiveFilter({ type: "collection", collectionId: col.id });
        setCurrentView("library");
      },
    });
  }

  // — Emuladores por descargar -------------------------------------
  // "No detected" is the signal that the user hasn't installed it yet.
  // We only surface emulators whose definitions exist — if the detection
  // report mentions an unknown id (shouldn't happen, but belt-and-braces)
  // we ignore it to keep labels honest.
  if (detection) {
    const detectedIds = new Set(detection.detected.map((e) => e.id));
    const defById = new Map(emulatorDefs.map((d) => [d.id, d]));
    for (const missingId of detection.notFound) {
      if (detectedIds.has(missingId)) continue;
      const def = defById.get(missingId);
      if (!def) continue;
      actions.push({
        id: `emulator.download.${def.id}`,
        label: `Descargar emulador ${def.name}`,
        group: "Emuladores",
        keywords: ["download", "install", def.id],
        icon: "⬇",
        run: () => downloadEmulator(def.id),
      });
    }
  }

  return actions;
}

/** Ordered list of action groups as they should render in the palette. */
export const ACTION_GROUP_ORDER: ActionGroup[] = [
  "Acciones",
  "Temas",
  "Vista",
  "Colecciones",
  "Emuladores",
];
