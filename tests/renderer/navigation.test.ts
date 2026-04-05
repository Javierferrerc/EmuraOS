import { describe, it, expect } from "vitest";
import { matchPath } from "../../src/electron/renderer/navigation/NavigationContext";

describe("matchPath", () => {
  it("returns empty params for a literal match", () => {
    expect(matchPath("/settings", "/settings")).toEqual({});
  });

  it("captures a single dynamic segment", () => {
    expect(
      matchPath("/settings/emuladores/dolphin", "/settings/emuladores/:id")
    ).toEqual({ id: "dolphin" });
  });

  it("captures multiple dynamic segments", () => {
    expect(
      matchPath(
        "/settings/emuladores/dolphin/configuracion",
        "/settings/emuladores/:id/:tab"
      )
    ).toEqual({ id: "dolphin", tab: "configuracion" });
  });

  it("returns null when segment counts differ", () => {
    expect(matchPath("/settings", "/settings/general")).toBeNull();
    expect(matchPath("/settings/a/b", "/settings/:x")).toBeNull();
  });

  it("returns null when a literal segment mismatches", () => {
    expect(matchPath("/library", "/settings")).toBeNull();
    expect(
      matchPath("/settings/rutas", "/settings/emuladores")
    ).toBeNull();
  });

  it("normalizes trailing slashes", () => {
    expect(matchPath("/settings/", "/settings")).toEqual({});
    expect(matchPath("/settings", "/settings/")).toEqual({});
  });

  it("normalizes double slashes", () => {
    expect(matchPath("/settings//general", "/settings/general")).toEqual({});
  });

  it("handles the root path", () => {
    expect(matchPath("/", "/")).toEqual({});
  });
});
