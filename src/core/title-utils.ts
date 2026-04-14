const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "or"]);

/**
 * Normalize a title for fuzzy comparison:
 * - lowercase
 * - split camelCase (e.g. BreathOfTheWild → breath of the wild)
 * - underscores/hyphens to spaces
 * - strip punctuation (: ' , ! ? . &)
 * - collapse whitespace
 */
export function normalizeTitle(s: string): string {
  return s
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[_\-]/g, " ")
    .replace(/[:'',!?.&]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenize a title: normalize then split into words,
 * filtering out common stop words.
 */
export function tokenize(s: string): string[] {
  return normalizeTitle(s)
    .split(" ")
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
}
