import { describe, it, expect } from "vitest";
import { PLACEHOLDER_SECTIONS } from "../../src/electron/renderer/components/settings/sections/placeholders";
import type { SettingsContext } from "../../src/electron/renderer/schemas/settings-schema-types";

const fakeCtx: SettingsContext = {
  config: null,
  updateConfig: async () => {
    /* no-op */
  },
};

describe("placeholder SettingsSections", () => {
  it("exposes exactly 7 top-level sections in the expected order", () => {
    expect(PLACEHOLDER_SECTIONS.map((s) => s.id)).toEqual([
      "general",
      "rutas",
      "emuladores",
      "biblioteca",
      "cover-art",
      "controles",
      "avanzado",
    ]);
  });

  it("gives every section a /settings/* path", () => {
    for (const s of PLACEHOLDER_SECTIONS) {
      expect(s.path.startsWith("/settings")).toBe(true);
    }
  });

  it("gives every row a stable id (no duplicates within a section)", () => {
    for (const s of PLACEHOLDER_SECTIONS) {
      const ids = new Set<string>();
      for (const g of s.groups ?? []) {
        for (const r of g.rows) {
          expect(r.id).toBeTruthy();
          expect(ids.has(r.id)).toBe(false);
          ids.add(r.id);
        }
      }
    }
  });

  it("exercises every widget kind in the Avanzado playground", () => {
    const playground = PLACEHOLDER_SECTIONS.find((s) => s.id === "avanzado");
    expect(playground).toBeDefined();
    const kinds = new Set<string>();
    for (const g of playground!.groups ?? []) {
      for (const r of g.rows) {
        kinds.add(r.kind);
      }
    }
    // All 7 widget kinds should be present in the playground.
    expect(kinds).toEqual(
      new Set([
        "toggle",
        "dropdown",
        "slider",
        "button",
        "info",
        "folder",
        "path",
      ])
    );
  });

  it("lets every setting's getter run without throwing", () => {
    for (const s of PLACEHOLDER_SECTIONS) {
      for (const g of s.groups ?? []) {
        for (const r of g.rows) {
          switch (r.kind) {
            case "toggle":
              expect(typeof r.get(fakeCtx)).toBe("boolean");
              break;
            case "dropdown":
              expect(r.options.length).toBeGreaterThan(0);
              r.get(fakeCtx);
              break;
            case "slider":
              expect(typeof r.get(fakeCtx)).toBe("number");
              break;
            case "info":
              expect(typeof r.value(fakeCtx)).toBe("string");
              break;
            case "folder":
            case "path":
              expect(typeof r.get(fakeCtx)).toBe("string");
              break;
            case "button":
              // No getter; just confirm run exists.
              expect(typeof r.run).toBe("function");
              break;
          }
        }
      }
    }
  });
});
