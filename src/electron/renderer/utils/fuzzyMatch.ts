/**
 * Lightweight fzf-style fuzzy matcher.
 *
 * `needle` must appear in `haystack` as a subsequence (every char of needle
 * appears in haystack in the same order, with gaps allowed). When it does,
 * we return a `{ score, indices }` result; callers can highlight the matched
 * positions and rank results by score. When the needle is not a subsequence
 * we return `null`.
 *
 * Scoring goals, loosely inspired by fzf + VS Code's QuickOpen:
 *   • Prefer matches that start at the beginning of the haystack.
 *   • Prefer matches that land on word boundaries (start of word, after a
 *     separator like space, `-`, `_`, `.`, `:` or the boundary between
 *     lowercase → uppercase in CamelCase).
 *   • Prefer consecutive matches (fewer gaps between characters).
 *   • Penalise long gaps between matched characters.
 *
 * We use a greedy left-to-right scan rather than full dynamic programming.
 * That's ~20× cheaper on long haystacks and the ranking quality is good
 * enough for launcher titles; a proper DP could be swapped in later if we
 * ever see ranking issues on pathological inputs.
 *
 * Matching is case-insensitive. The `indices` we return refer to positions
 * in the ORIGINAL haystack so callers can use them to render highlights
 * directly on the source string.
 */

export interface FuzzyMatchResult {
  score: number;
  indices: number[];
}

// Tunable scoring constants — kept close together so ranking behaviour is
// easy to reason about. All positive, higher = better match.
const BASE_CHAR_MATCH = 16;
const BONUS_PREFIX = 10;
const BONUS_WORD_BOUNDARY = 8;
const BONUS_CONSECUTIVE = 5;
const PENALTY_GAP_PER_CHAR = 1;

const WORD_SEPARATORS = new Set([
  " ", "-", "_", ".", ":", "/", "\\", "(", ")", "[", "]", "{", "}",
  "'", '"', ",", "!", "?", "&",
]);

function isWordBoundary(haystack: string, index: number): boolean {
  if (index === 0) return true;
  const prev = haystack[index - 1];
  if (WORD_SEPARATORS.has(prev)) return true;
  // CamelCase boundary: lowercase/digit followed by uppercase.
  const cur = haystack[index];
  if (prev >= "a" && prev <= "z" && cur >= "A" && cur <= "Z") return true;
  if (prev >= "0" && prev <= "9" && cur >= "A" && cur <= "Z") return true;
  return false;
}

/**
 * 1-character typo tolerance: if the strict subsequence match fails, we
 * try every variant with one needle character removed and take the best.
 * The fuzzy score is penalised so real subsequence matches outrank typo
 * rescues. Guarded by a minimum needle length so tiny queries like "mk"
 * can't silently match everything by dropping a character.
 */
const TYPO_PENALTY = 20;
const MIN_LENGTH_FOR_TYPO_RESCUE = 4;

export function fuzzyMatch(
  needle: string,
  haystack: string
): FuzzyMatchResult | null {
  const strict = strictFuzzyMatch(needle, haystack);
  if (strict) return strict;

  if (needle.length < MIN_LENGTH_FOR_TYPO_RESCUE) return null;

  // Try each "drop one character" variant — cheap enough for launcher
  // titles (quadratic in needle length × haystack length). Keeps the best
  // scoring variant so "smsbros" (typo) still ranks reasonably against
  // "Super Mario Bros" via "smbros" as the winning variant.
  let best: FuzzyMatchResult | null = null;
  for (let i = 0; i < needle.length; i++) {
    const trimmed = needle.slice(0, i) + needle.slice(i + 1);
    const variant = strictFuzzyMatch(trimmed, haystack);
    if (variant && (best === null || variant.score > best.score)) {
      best = variant;
    }
  }
  if (best === null) return null;
  return { score: best.score - TYPO_PENALTY, indices: best.indices };
}

function strictFuzzyMatch(
  needle: string,
  haystack: string
): FuzzyMatchResult | null {
  if (!needle) return { score: 0, indices: [] };
  if (!haystack) return null;

  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();

  // Fast reject: every needle char must appear somewhere in the haystack.
  // Cheap and filters out most non-matches without allocating.
  {
    let cursor = 0;
    for (let i = 0; i < n.length; i++) {
      const found = h.indexOf(n[i], cursor);
      if (found === -1) return null;
      cursor = found + 1;
    }
  }

  // Greedy match: for each needle char, take the best-scoring haystack
  // position ≥ cursor. "Best-scoring" here means: among positions where
  // `h[pos] === n[i]` within a bounded lookahead window, pick the one with
  // the highest single-char contribution. A bounded window keeps the
  // algorithm O(needle · window) instead of O(needle · haystack) while
  // still rewarding word-boundary matches right after a gap.
  const LOOKAHEAD = 32;
  const indices: number[] = [];
  let score = 0;
  let cursor = 0;
  let lastMatched = -1;

  for (let i = 0; i < n.length; i++) {
    const ch = n[i];

    let bestPos = -1;
    let bestGain = -Infinity;

    const limit = Math.min(h.length, cursor + LOOKAHEAD);
    for (let pos = cursor; pos < limit; pos++) {
      if (h[pos] !== ch) continue;

      let gain = BASE_CHAR_MATCH;
      if (pos === 0) gain += BONUS_PREFIX;
      if (isWordBoundary(haystack, pos)) gain += BONUS_WORD_BOUNDARY;
      if (lastMatched >= 0 && pos === lastMatched + 1) {
        gain += BONUS_CONSECUTIVE;
      }
      const gap = lastMatched >= 0 ? pos - lastMatched - 1 : 0;
      gain -= gap * PENALTY_GAP_PER_CHAR;

      if (gain > bestGain) {
        bestGain = gain;
        bestPos = pos;
        // A word-boundary match with no gap is essentially optimal — stop
        // scanning the rest of the window so we don't over-optimise on
        // late duplicates that happen to also match.
        if (gain >= BASE_CHAR_MATCH + BONUS_WORD_BOUNDARY + BONUS_CONSECUTIVE) {
          break;
        }
      }
    }

    if (bestPos === -1) {
      // Fast-reject earlier guarantees a position exists somewhere, but
      // the bounded lookahead may have skipped past it. Fall back to the
      // next occurrence without the scoring optimisations.
      const fallback = h.indexOf(ch, cursor);
      if (fallback === -1) return null;
      bestPos = fallback;
      bestGain = BASE_CHAR_MATCH;
      if (fallback === 0) bestGain += BONUS_PREFIX;
      if (isWordBoundary(haystack, fallback)) bestGain += BONUS_WORD_BOUNDARY;
      const gap = lastMatched >= 0 ? fallback - lastMatched - 1 : 0;
      bestGain -= gap * PENALTY_GAP_PER_CHAR;
    }

    indices.push(bestPos);
    score += bestGain;
    lastMatched = bestPos;
    cursor = bestPos + 1;
  }

  return { score, indices };
}

/**
 * Convenience: rank and filter a list by fuzzy score.
 *
 * Items where the matcher returns null are dropped. Items are returned in
 * descending score order. When the query is empty, the original list is
 * returned verbatim (ranking becomes a no-op).
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string
): Array<{ item: T; score: number; indices: number[]; text: string }> {
  if (!query.trim()) {
    return items.map((item) => ({
      item,
      score: 0,
      indices: [],
      text: getText(item),
    }));
  }

  const ranked: Array<{ item: T; score: number; indices: number[]; text: string }> = [];
  for (const item of items) {
    const text = getText(item);
    const match = fuzzyMatch(query, text);
    if (match) {
      ranked.push({ item, score: match.score, indices: match.indices, text });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/**
 * Substring fallback — same shape as `fuzzyMatch` so callers can swap
 * behind a feature toggle without touching the consumer code.
 */
export function substringMatch(
  needle: string,
  haystack: string
): FuzzyMatchResult | null {
  if (!needle) return { score: 0, indices: [] };
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  const pos = h.indexOf(n);
  if (pos === -1) return null;
  const indices: number[] = [];
  for (let i = 0; i < n.length; i++) indices.push(pos + i);
  // Substring scoring: prefer prefix and word-boundary starts so the sort
  // order is stable and intuitive even in substring mode.
  let score = n.length * BASE_CHAR_MATCH;
  if (pos === 0) score += BONUS_PREFIX;
  if (isWordBoundary(haystack, pos)) score += BONUS_WORD_BOUNDARY;
  return { score, indices };
}
