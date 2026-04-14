import { describe, it, expect } from "vitest";
import { normalizeTitle, tokenize } from "../../src/core/title-utils.js";

describe("normalizeTitle", () => {
  it("lowercases input", () => {
    expect(normalizeTitle("Super Mario Bros")).toBe("super mario bros");
  });

  it("splits camelCase words", () => {
    expect(normalizeTitle("BreathOfTheWild")).toBe("breath of the wild");
    expect(normalizeTitle("SuperMarioBros")).toBe("super mario bros");
  });

  it("splits camelCase with consecutive uppercase (acronyms)", () => {
    expect(normalizeTitle("GBAGame")).toBe("gba game");
    expect(normalizeTitle("NBAJam")).toBe("nba jam");
  });

  it("replaces underscores with spaces", () => {
    expect(normalizeTitle("super_mario_bros")).toBe("super mario bros");
  });

  it("replaces hyphens with spaces", () => {
    expect(normalizeTitle("Legend-of-Zelda")).toBe("legend of zelda");
  });

  it("strips punctuation (: ' , ! ? . &)", () => {
    expect(normalizeTitle("Kirby's Adventure")).toBe("kirbys adventure");
    expect(normalizeTitle("Zelda: Ocarina of Time")).toBe(
      "zelda ocarina of time"
    );
    expect(normalizeTitle("Mario & Luigi")).toBe("mario luigi");
    expect(normalizeTitle("Wow!")).toBe("wow");
    expect(normalizeTitle("Dr. Mario")).toBe("dr mario");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeTitle("super   mario   bros")).toBe("super mario bros");
  });

  it("trims whitespace", () => {
    expect(normalizeTitle("  Mario  ")).toBe("mario");
  });

  it("handles combined transformations", () => {
    expect(normalizeTitle("The_Legend-of Zelda: Breath's Wild!")).toBe(
      "the legend of zelda breaths wild"
    );
  });
});

describe("tokenize", () => {
  it("returns normalized tokens", () => {
    expect(tokenize("Super Mario Bros")).toEqual(["super", "mario", "bros"]);
  });

  it("filters stop words (the, a, an, of, and, or)", () => {
    expect(tokenize("The Legend of Zelda")).toEqual(["legend", "zelda"]);
    expect(tokenize("A Boy and His Blob")).toEqual(["boy", "his", "blob"]);
  });

  it("tokenizes camelCase correctly", () => {
    expect(tokenize("BreathOfTheWild")).toEqual(["breath", "wild"]);
  });

  it("tokenizes underscored names", () => {
    expect(tokenize("pokemon_emerald")).toEqual(["pokemon", "emerald"]);
  });

  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("returns empty array for stop-words-only input", () => {
    expect(tokenize("the a an")).toEqual([]);
  });
});
