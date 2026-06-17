/**
 * rom-attributes.ts — structured attributes derived purely from a ROM filename.
 *
 * No-Intro / Redump name their dumps with parenthetical tags that already
 * encode real, verifiable facts about the dump: region, languages, revision,
 * disc number and dump status (Beta/Proto/Demo/Unl…). Unlike scraped metadata
 * (genre, developer, rating) these need NO network, NO database and NO
 * credentials — they live in the filename of every ROM — so they are available
 * for EVERY game on EVERY system, including the disc/modern systems the
 * libretro-database has no metadata for, and for cartridges that never matched
 * a scrape.
 *
 * This module is intentionally pure (no `node:` imports) so the renderer can
 * import it directly to enrich the game model without an IPC round-trip.
 *
 * Example:
 *   "Final Fantasy VII (USA) (Disc 1) (Rev 1).cue"
 *     → { region: "EE.UU.", disc: 1, revision: "Rev 1",
 *         cleanTitle: "Final Fantasy VII", … }
 */

export interface RomAttributes {
  /** Title with all parenthetical/bracket tags removed. Never empty. */
  cleanTitle: string;
  /** Localized region label ("EE.UU.", "Europa", "Japón", "EE.UU./Europa"…)
   *  or undefined when the filename carries no recognizable region tag. */
  region?: string;
  /** Uppercased ISO-ish language codes in filename order (["EN","FR","DE"]). */
  languages?: string[];
  /** Revision / version descriptor, normalized ("Rev 1", "v1.1", "PRG1"). */
  revision?: string;
  /** Disc number for multi-disc releases (1-based). */
  disc?: number;
  /** Non-final dump status tags ("Beta", "Proto", "Demo", "Unl"…). */
  flags?: string[];
}

/** Raw region token (lowercased) → localized Spanish label. Ordered roughly by
 *  how often they appear in real romsets. Unknown regions fall through and are
 *  shown verbatim (title-cased) so we never hide a real region we don't map. */
const REGION_LABELS: Record<string, string> = {
  usa: "EE.UU.",
  europe: "Europa",
  japan: "Japón",
  world: "Mundial",
  asia: "Asia",
  australia: "Australia",
  brazil: "Brasil",
  canada: "Canadá",
  china: "China",
  korea: "Corea",
  france: "Francia",
  germany: "Alemania",
  italy: "Italia",
  spain: "España",
  netherlands: "Países Bajos",
  sweden: "Suecia",
  russia: "Rusia",
  taiwan: "Taiwán",
  "hong kong": "Hong Kong",
  uk: "Reino Unido",
  "united kingdom": "Reino Unido",
  scandinavia: "Escandinavia",
  "latin america": "Latinoamérica",
};

/** Recognized 2-letter language codes used inside No-Intro language groups
 *  like "(En,Fr,De,Es,It)". Kept as a set so a group is classified as a
 *  language group only when *every* comma part is a known code. */
const LANGUAGE_CODES = new Set([
  "en", "fr", "de", "es", "it", "ja", "pt", "nl", "sv", "da", "no", "fi",
  "pl", "ru", "ko", "zh", "cs", "hu", "el", "tr", "ar", "he", "ca", "gl",
  "eu", "uk", "ro", "hr", "sk", "sl", "bg", "lt", "lv", "et",
]);

/** Dump-status / category tags worth surfacing as flags. Matched case-
 *  insensitively against the leading word of a parenthetical group. */
const FLAG_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /^beta\b/i, label: "Beta" },
  { re: /^(proto|prototype)\b/i, label: "Proto" },
  { re: /^(demo|sample|kiosk)\b/i, label: "Demo" },
  { re: /^unl\b/i, label: "Unl" },
  { re: /^(pirate|bootleg)\b/i, label: "Pirata" },
  { re: /^aftermarket\b/i, label: "Aftermarket" },
  { re: /^hack\b/i, label: "Hack" },
];

/** Extract the inner text of every top-level `( … )` and `[ … ]` group. */
function tagGroups(name: string): string[] {
  const groups: string[] = [];
  const re = /[([]([^()[\]]*)[)\]]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(name)) !== null) {
    const inner = m[1].trim();
    if (inner) groups.push(inner);
  }
  return groups;
}

/** Strip the file extension and all tag groups, leaving the bare title. */
function deriveCleanTitle(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  const ext = lastDot > 0 ? fileName.slice(lastDot) : "";
  const base =
    ext.length <= 5 && /^\.[a-z0-9]+$/i.test(ext)
      ? fileName.slice(0, lastDot)
      : fileName;
  const stripped = base
    .replace(/\s*[([][^()[\]]*[)\]]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Never return empty — fall back to the bare base name if the title was
  // somehow entirely tags (rare, but keeps `cleanTitle` a usable label).
  return stripped || base.trim();
}

function classifyRegionGroup(inner: string): string | null {
  const parts = inner.split(/\s*,\s*/).map((p) => p.trim());
  const labels: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (REGION_LABELS[key]) {
      labels.push(REGION_LABELS[key]);
    } else {
      return null; // any non-region part disqualifies the whole group
    }
  }
  return labels.length ? labels.join("/") : null;
}

function classifyLanguageGroup(inner: string): string[] | null {
  const parts = inner.split(/\s*,\s*/).map((p) => p.trim().toLowerCase());
  if (parts.length === 0) return null;
  if (!parts.every((p) => LANGUAGE_CODES.has(p))) return null;
  return parts.map((p) => p.toUpperCase());
}

function classifyRevision(inner: string): string | null {
  // "Rev 1", "Rev A", "Rev 1.1"
  const rev = inner.match(/^Rev\s+([0-9A-Za-z.]+)$/i);
  if (rev) return `Rev ${rev[1].toUpperCase()}`;
  // "v1.1", "v1.03"
  const ver = inner.match(/^v\.?\s?(\d+(?:\.\d+)*)$/i);
  if (ver) return `v${ver[1]}`;
  // "PRG0" / "PRG1" (NES program revisions)
  const prg = inner.match(/^PRG\s?(\d+)$/i);
  if (prg) return `PRG${prg[1]}`;
  return null;
}

function classifyDisc(inner: string): number | null {
  const m = inner.match(/^(?:Disc|Disk|Disque|Disco)\s+(\d+)/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

function classifyFlag(inner: string): string | null {
  for (const { re, label } of FLAG_PATTERNS) {
    if (re.test(inner)) return label;
  }
  return null;
}

/**
 * Parse a ROM filename into its structured, real attributes. Always returns a
 * usable object — at minimum a non-empty `cleanTitle`. Every recognized tag is
 * classified independently, so a name with mixed groups
 * ("(USA) (En,Fr) (Rev 1) (Disc 2)") yields all four facts.
 */
export function parseRomAttributes(fileName: string): RomAttributes {
  const attrs: RomAttributes = { cleanTitle: deriveCleanTitle(fileName) };
  const flags: string[] = [];

  for (const inner of tagGroups(fileName)) {
    if (attrs.region === undefined) {
      const region = classifyRegionGroup(inner);
      if (region) {
        attrs.region = region;
        continue;
      }
    }
    if (attrs.languages === undefined) {
      const langs = classifyLanguageGroup(inner);
      if (langs) {
        attrs.languages = langs;
        continue;
      }
    }
    if (attrs.revision === undefined) {
      const rev = classifyRevision(inner);
      if (rev) {
        attrs.revision = rev;
        continue;
      }
    }
    if (attrs.disc === undefined) {
      const disc = classifyDisc(inner);
      if (disc !== null) {
        attrs.disc = disc;
        continue;
      }
    }
    const flag = classifyFlag(inner);
    if (flag && !flags.includes(flag)) flags.push(flag);
  }

  if (flags.length) attrs.flags = flags;
  return attrs;
}
