import { describe, it, expect, vi } from "vitest";
import {
  buildCommandPaletteActions,
  type BuildActionsArgs,
} from "../../src/electron/renderer/utils/commandPaletteActions";
import type {
  AppConfig,
  DetectionResult,
  EmulatorDefinition,
} from "../../src/core/types";

function makeArgs(overrides: Partial<BuildActionsArgs> = {}): BuildActionsArgs {
  return {
    config: { theme: "dark" } as AppConfig,
    collections: [],
    detection: null,
    emulatorDefs: [],
    setCurrentView: vi.fn(),
    refreshScan: vi.fn(),
    addRomsFlow: vi.fn(),
    startScraping: vi.fn(),
    startFetchingCovers: vi.fn(),
    setCollectionsModalOpen: vi.fn(),
    toggleFullscreen: vi.fn(),
    updateConfig: vi.fn(),
    setActiveFilter: vi.fn(),
    downloadEmulator: vi.fn(),
    ...overrides,
  };
}

describe("buildCommandPaletteActions", () => {
  it("always registers the base navigation and library actions", () => {
    const actions = buildCommandPaletteActions(makeArgs());
    const ids = actions.map((a) => a.id);
    expect(ids).toContain("nav.settings");
    expect(ids).toContain("nav.library");
    expect(ids).toContain("lib.rescan");
    expect(ids).toContain("lib.add-roms");
    expect(ids).toContain("lib.fetch-covers");
    expect(ids).toContain("lib.scrape-metadata");
    expect(ids).toContain("lib.collections");
    expect(ids).toContain("view.fullscreen");
  });

  it("omits the current theme from the switcher", () => {
    const actions = buildCommandPaletteActions(
      makeArgs({ config: { theme: "synthwave" } as AppConfig })
    );
    const themeIds = actions
      .filter((a) => a.group === "Temas")
      .map((a) => a.id);
    expect(themeIds).not.toContain("theme.set.synthwave");
    expect(themeIds).toContain("theme.set.dark");
  });

  it("omits the current view mode from the view switcher", () => {
    const actions = buildCommandPaletteActions(
      makeArgs({
        config: { theme: "dark", libraryViewMode: "list" } as AppConfig,
      })
    );
    const viewIds = actions.filter((a) => a.group === "Vista").map((a) => a.id);
    expect(viewIds).not.toContain("view.mode.list");
    expect(viewIds).toContain("view.mode.grid");
    expect(viewIds).toContain("view.mode.compact");
  });

  it("registers one action per collection", () => {
    const actions = buildCommandPaletteActions(
      makeArgs({
        collections: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            name: "RPGs",
            roms: [],
            createdAt: "",
            updatedAt: "",
          },
          {
            id: "22222222-2222-2222-2222-222222222222",
            name: "Party games",
            roms: [],
            createdAt: "",
            updatedAt: "",
          },
        ],
      })
    );
    const colIds = actions
      .filter((a) => a.group === "Colecciones")
      .map((a) => a.id);
    expect(colIds).toEqual([
      "collection.open.11111111-1111-1111-1111-111111111111",
      "collection.open.22222222-2222-2222-2222-222222222222",
    ]);
  });

  it("surfaces a download action for every emulator in notFound", () => {
    const emulatorDefs: EmulatorDefinition[] = [
      {
        id: "dolphin",
        name: "Dolphin",
        executable: "dolphin.exe",
        defaultPaths: [],
        systems: [],
        launchTemplate: "",
        args: {},
        defaultArgs: "",
      },
      {
        id: "pcsx2",
        name: "PCSX2",
        executable: "pcsx2.exe",
        defaultPaths: [],
        systems: [],
        launchTemplate: "",
        args: {},
        defaultArgs: "",
      },
    ];
    const detection: DetectionResult = {
      detected: [],
      notFound: ["dolphin", "pcsx2"],
      totalChecked: 2,
    };
    const actions = buildCommandPaletteActions(
      makeArgs({ emulatorDefs, detection })
    );
    const ids = actions
      .filter((a) => a.group === "Emuladores")
      .map((a) => a.id);
    expect(ids).toEqual([
      "emulator.download.dolphin",
      "emulator.download.pcsx2",
    ]);
  });

  it("does not register emulator download actions when detection is null", () => {
    const actions = buildCommandPaletteActions(makeArgs());
    expect(actions.filter((a) => a.group === "Emuladores")).toHaveLength(0);
  });

  it("flags featured actions so the empty-query state has defaults", () => {
    const actions = buildCommandPaletteActions(makeArgs());
    const featured = actions.filter((a) => a.featured);
    // Should at least surface Settings + Rescan on an empty palette
    expect(featured.map((a) => a.id)).toContain("nav.settings");
    expect(featured.map((a) => a.id)).toContain("lib.rescan");
  });

  it("runs the right callback when the action is invoked", () => {
    const setCurrentView = vi.fn();
    const refreshScan = vi.fn();
    const actions = buildCommandPaletteActions(
      makeArgs({ setCurrentView, refreshScan })
    );
    actions.find((a) => a.id === "nav.settings")!.run();
    actions.find((a) => a.id === "lib.rescan")!.run();
    expect(setCurrentView).toHaveBeenCalledWith("settings");
    expect(refreshScan).toHaveBeenCalledOnce();
  });
});
