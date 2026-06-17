import { describe, it, expect } from "vitest";
import { parseRomAttributes } from "../../src/core/rom-attributes.js";

describe("parseRomAttributes", () => {
  it("derives a clean title and a single region", () => {
    const a = parseRomAttributes("Super Mario Bros. (USA).nes");
    expect(a.cleanTitle).toBe("Super Mario Bros.");
    expect(a.region).toBe("EE.UU.");
    expect(a.languages).toBeUndefined();
    expect(a.revision).toBeUndefined();
  });

  it("joins multi-region groups", () => {
    const a = parseRomAttributes("10-Yard Fight (USA, Europe).nes");
    expect(a.region).toBe("EE.UU./Europa");
    expect(a.cleanTitle).toBe("10-Yard Fight");
  });

  it("parses a language group into uppercased codes", () => {
    const a = parseRomAttributes("Some Game (Europe) (En,Fr,De,Es,It).gba");
    expect(a.region).toBe("Europa");
    expect(a.languages).toEqual(["EN", "FR", "DE", "ES", "IT"]);
  });

  it("extracts revision, disc and clean title together", () => {
    const a = parseRomAttributes("Final Fantasy VII (USA) (Disc 1) (Rev 1).cue");
    expect(a.cleanTitle).toBe("Final Fantasy VII");
    expect(a.region).toBe("EE.UU.");
    expect(a.disc).toBe(1);
    expect(a.revision).toBe("Rev 1");
  });

  it("recognizes version and PRG revision forms", () => {
    expect(parseRomAttributes("Game (Japan) (v1.1).snes").revision).toBe("v1.1");
    expect(parseRomAttributes("Game (USA) (PRG1).nes").revision).toBe("PRG1");
    expect(parseRomAttributes("Game (Europe) (Rev A).md").revision).toBe("Rev A");
  });

  it("collects dump-status flags without consuming real tags", () => {
    const a = parseRomAttributes("Star Fox 2 (USA) (Proto).sfc");
    expect(a.region).toBe("EE.UU.");
    expect(a.flags).toEqual(["Proto"]);
  });

  it("does not misclassify a non-region/non-language group as language", () => {
    // "(Unl)" is a flag, not a language; "(Konami)" is neither and is ignored.
    const a = parseRomAttributes("Some Homebrew (World) (Unl) (Konami).nes");
    expect(a.region).toBe("Mundial");
    expect(a.languages).toBeUndefined();
    expect(a.flags).toEqual(["Unl"]);
  });

  it("keeps a usable clean title when there are no tags", () => {
    const a = parseRomAttributes("homebrew_demo.gb");
    expect(a.cleanTitle).toBe("homebrew_demo");
    expect(a.region).toBeUndefined();
  });

  it("handles bracket tags and dotted titles", () => {
    const a = parseRomAttributes("Mega Man X4 (USA) [!].bin");
    expect(a.cleanTitle).toBe("Mega Man X4");
    expect(a.region).toBe("EE.UU.");
  });

  it("falls back to the unknown region verbatim is not done — unknown regions are skipped", () => {
    // A group that is neither a known region, language, rev, disc nor flag is
    // ignored entirely (e.g. a publisher or date), leaving region undefined.
    const a = parseRomAttributes("Game (Acclaim).gen");
    expect(a.region).toBeUndefined();
    expect(a.cleanTitle).toBe("Game");
  });
});
