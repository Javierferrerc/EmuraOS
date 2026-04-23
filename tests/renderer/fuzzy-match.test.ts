import { describe, it, expect } from "vitest";
import {
  fuzzyMatch,
  fuzzyFilter,
  substringMatch,
} from "../../src/electron/renderer/utils/fuzzyMatch";

describe("fuzzyMatch", () => {
  it("returns null when needle is not a subsequence", () => {
    expect(fuzzyMatch("xyz", "Super Mario Bros")).toBeNull();
  });

  it("matches the acceptance case from the roadmap with 1-typo tolerance (smsbros → Super Mario Bros)", () => {
    // "smsbros" isn't a strict subsequence of "Super Mario Bros" — the second
    // 's' is a typo. The 1-char-drop rescue should still find it by matching
    // the "smbros" variant (s-m-b-r-o-s = positions 0, 6, 12, 13, 14, 15).
    const result = fuzzyMatch("smsbros", "Super Mario Bros");
    expect(result).not.toBeNull();
    expect(result!.indices).toEqual([0, 6, 12, 13, 14, 15]);
  });

  it("typo rescue is penalised vs a strict match", () => {
    const strict = fuzzyMatch("smbros", "Super Mario Bros");
    const rescue = fuzzyMatch("smsbros", "Super Mario Bros");
    expect(strict!.score).toBeGreaterThan(rescue!.score);
  });

  it("does not rescue tiny queries (under length 4)", () => {
    // "sxm" shouldn't match by silently dropping 'x' — too loose.
    expect(fuzzyMatch("sxm", "Super Mario")).toBeNull();
  });

  it("matches a common abbreviation", () => {
    const result = fuzzyMatch("mk64", "Mario Kart 64");
    expect(result).not.toBeNull();
  });

  it("is case insensitive but reports indices on the original string", () => {
    const result = fuzzyMatch("SMB", "Super Mario Bros");
    expect(result).not.toBeNull();
    // Indices must point into the original casing of the haystack
    expect(result!.indices).toEqual([0, 6, 12]);
  });

  it("returns an empty result for an empty needle", () => {
    const result = fuzzyMatch("", "anything");
    expect(result).toEqual({ score: 0, indices: [] });
  });

  it("scores prefix matches higher than mid-string matches", () => {
    const prefix = fuzzyMatch("super", "Super Mario Bros");
    const mid = fuzzyMatch("super", "The Super Game");
    expect(prefix).not.toBeNull();
    expect(mid).not.toBeNull();
    expect(prefix!.score).toBeGreaterThan(mid!.score);
  });

  it("scores consecutive matches higher than scattered matches", () => {
    const consecutive = fuzzyMatch("mario", "Super Mario Bros");
    const scattered = fuzzyMatch("mario", "Masters And Rising In Ocean");
    expect(consecutive).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(consecutive!.score).toBeGreaterThan(scattered!.score);
  });

  it("scores word-boundary matches higher than mid-word matches", () => {
    const boundary = fuzzyMatch("mk", "Mario Kart");
    const midword = fuzzyMatch("mk", "Smackdown");
    expect(boundary).not.toBeNull();
    expect(midword).not.toBeNull();
    expect(boundary!.score).toBeGreaterThan(midword!.score);
  });
});

describe("fuzzyFilter", () => {
  const games = [
    "Super Mario Bros",
    "Super Mario World",
    "Mario Kart 64",
    "Donkey Kong",
    "The Legend of Zelda",
  ];

  it("returns items in descending score order", () => {
    const ranked = fuzzyFilter(games, "smb", (g) => g);
    expect(ranked.length).toBeGreaterThan(0);
    // "Super Mario Bros" should outrank "Super Mario World" for "smb"
    // because it gains the consecutive bonus on "B" → "Bros".
    expect(ranked[0].text).toBe("Super Mario Bros");
  });

  it("drops non-matches", () => {
    const ranked = fuzzyFilter(games, "zelda", (g) => g);
    expect(ranked.every((r) => r.text.includes("Zelda"))).toBe(true);
  });

  it("returns the full list verbatim on empty query", () => {
    const ranked = fuzzyFilter(games, "", (g) => g);
    expect(ranked.map((r) => r.text)).toEqual(games);
  });

  it("returns the full list verbatim on whitespace-only query", () => {
    const ranked = fuzzyFilter(games, "   ", (g) => g);
    expect(ranked.map((r) => r.text)).toEqual(games);
  });
});

describe("substringMatch", () => {
  it("matches contiguous substrings only", () => {
    expect(substringMatch("mario", "Super Mario Bros")).not.toBeNull();
    expect(substringMatch("smb", "Super Mario Bros")).toBeNull();
  });

  it("returns contiguous indices", () => {
    const result = substringMatch("mario", "Super Mario Bros");
    expect(result!.indices).toEqual([6, 7, 8, 9, 10]);
  });

  it("is case insensitive", () => {
    expect(substringMatch("MARIO", "super mario bros")).not.toBeNull();
  });
});
