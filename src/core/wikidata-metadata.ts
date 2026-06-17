/**
 * Wikidata metadata source — credential-free, last-resort fallback for systems
 * neither libretro nor OpenVGDB cover (PS2, Wii, Wii U, PS3, 3DS, Dreamcast).
 *
 * Matching is by title (fuzzy) via the public search API, then a SPARQL query
 * pulls developer (P178), publisher (P123), genre (P136) and publication date
 * (P577). There is no reliable per-game player count, so that field is left to
 * libretro. Quality varies and a wrong edition can match — this is best-effort.
 *
 * The Wikimedia query service expects a descriptive User-Agent and a modest
 * request rate, so calls are throttled and only run for the handful of ROMs the
 * earlier sources couldn't fill.
 */

const SEARCH_API = "https://www.wikidata.org/w/api.php";
const SPARQL = "https://query.wikidata.org/sparql";
const UA = "EmuraOS/1.0 (retro-launcher metadata scraper)";
const MIN_INTERVAL_MS = 300; // polite spacing between requests

export interface WikidataFields {
  genre?: string;
  developer?: string;
  publisher?: string;
  year?: string;
}

/** Short platform hint appended to the search to bias toward the right game. */
const PLATFORM_HINT: Record<string, string> = {
  nes: "NES",
  snes: "Super Nintendo",
  n64: "Nintendo 64",
  gb: "Game Boy",
  gbc: "Game Boy Color",
  gba: "Game Boy Advance",
  nds: "Nintendo DS",
  gamecube: "GameCube",
  wii: "Wii",
  wiiu: "Wii U",
  switch: "Nintendo Switch",
  "3ds": "Nintendo 3DS",
  megadrive: "Sega Genesis",
  mastersystem: "Master System",
  dreamcast: "Dreamcast",
  psx: "PlayStation",
  ps2: "PlayStation 2",
  ps3: "PlayStation 3",
  psp: "PlayStation Portable",
};

export class WikidataMetadataProvider {
  private lastCall = 0;

  /** Wikidata is the universal last-resort fallback — worth trying for any
   * system once libretro/OpenVGDB have left a gap. */
  supports(): boolean {
    return true;
  }

  private async throttle(): Promise<void> {
    const wait = this.lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCall = Date.now();
  }

  private async getJson(url: string): Promise<unknown> {
    await this.throttle();
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!resp.ok) throw new Error(`wikidata ${resp.status}`);
    return resp.json();
  }

  private async searchOnce(term: string): Promise<string[]> {
    const url =
      `${SEARCH_API}?action=wbsearchentities&format=json&language=en&type=item&limit=4` +
      `&search=${encodeURIComponent(term)}`;
    const j = (await this.getJson(url)) as { search?: { id: string }[] };
    return (j.search ?? []).map((s) => s.id);
  }

  private async search(title: string, systemId: string): Promise<string[]> {
    const hint = PLATFORM_HINT[systemId] ?? "";
    // Title without a "- subtitle" / ": subtitle" — Wikidata's search over-narrows
    // on long ROM subtitles (e.g. "… - A DC Comics Adventure"), so the bare main
    // title is a vital fallback.
    const main = title.split(/\s*[-:]\s/)[0].trim();

    // Try progressively looser queries; first non-empty wins.
    const terms = [
      hint ? `${title} ${hint}` : title,
      title,
      ...(main && main !== title ? [hint ? `${main} ${hint}` : main, main] : []),
    ];
    const seen = new Set<string>();
    for (const t of terms) {
      if (seen.has(t)) continue;
      seen.add(t);
      const ids = await this.searchOnce(t);
      if (ids.length > 0) return ids;
    }
    return [];
  }

  private async fetchEntity(qid: string): Promise<WikidataFields | null> {
    // The P31=Q7889 (instance of "video game") triple is REQUIRED, so a
    // franchise/film/soundtrack entity that merely shares the title yields no
    // rows and we move on to the next search candidate.
    const query = `SELECT ?devLabel ?pubLabel ?genreLabel ?date WHERE {
      wd:${qid} wdt:P31 wd:Q7889 .
      OPTIONAL { wd:${qid} wdt:P178 ?dev. }
      OPTIONAL { wd:${qid} wdt:P123 ?pub. }
      OPTIONAL { wd:${qid} wdt:P136 ?genre. }
      OPTIONAL { wd:${qid} wdt:P577 ?date. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
    } LIMIT 1`;
    const url = `${SPARQL}?format=json&query=${encodeURIComponent(query)}`;
    const j = (await this.getJson(url)) as {
      results?: { bindings?: Record<string, { value: string }>[] };
    };
    const b = j.results?.bindings?.[0];
    if (!b) return null;
    const dev = b.devLabel?.value?.trim();
    // Require a developer: real games have one; this guards against matching a
    // film/book/soundtrack entity that happens to share the title.
    if (!dev) return null;
    return {
      developer: dev,
      publisher: b.pubLabel?.value?.trim() || "",
      genre: b.genreLabel?.value?.trim() || "",
      year: b.date?.value ? b.date.value.slice(0, 4) : "",
    };
  }

  /** Best-effort lookup; returns null on no match or any transient failure. */
  async lookup(title: string, systemId: string): Promise<WikidataFields | null> {
    if (!title) return null;
    try {
      const ids = await this.search(title, systemId);
      for (const qid of ids.slice(0, 4)) {
        const fields = await this.fetchEntity(qid);
        if (fields) return fields;
      }
    } catch (err) {
      console.warn("[wikidata] lookup failed:", err instanceof Error ? err.message : err);
    }
    return null;
  }
}
