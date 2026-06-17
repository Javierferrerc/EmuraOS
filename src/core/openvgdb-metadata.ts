/**
 * OpenVGDB metadata source — a credential-free, offline SQLite catalogue that
 * covers the disc/portable systems libretro's metadata DB lacks (PSX, NDS, PSP,
 * GameCube, Saturn…). The database ships as a single ~9 MB zip on GitHub
 * releases; we download + extract it once into the metadata cache and then read
 * it locally forever.
 *
 * Provides genre, developer, publisher, release year and a description. It has
 * no "number of players" field — that stays libretro-only.
 *
 * Reading SQLite uses Node's built-in `node:sqlite` (Electron 39 / Node 22+).
 * If it isn't available the provider degrades to a no-op so the rest of the
 * cascade still runs.
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeTitle, tokenize } from "./title-utils.js";
import { extractFileFromZip } from "./zip-utils.js";

const OPENVGDB_VERSION = "v29.0";
const OPENVGDB_ZIP_URL = `https://github.com/OpenVGDB/OpenVGDB/releases/download/${OPENVGDB_VERSION}/openvgdb.zip`;

/** Our systemId → OpenVGDB `systemShortName`. Only systems OpenVGDB actually
 * carries are listed; everything else simply has no OpenVGDB coverage. */
const OPENVGDB_SYSTEMS: Record<string, string> = {
  nes: "NES",
  snes: "SNES",
  n64: "N64",
  gb: "GB",
  gbc: "GBC",
  gba: "GBA",
  nds: "NDS",
  gamecube: "NGC",
  megadrive: "MD",
  mastersystem: "SMS",
  psx: "PSX",
  psp: "PSP",
};

export interface OpenVgdbFields {
  title?: string;
  genre?: string;
  developer?: string;
  publisher?: string;
  year?: string;
  description?: string;
}

interface OvgdbEntry {
  fields: OpenVgdbFields;
  norm: string;
  tokens: string[];
  /** Higher = preferred (has real data, USA/World region). */
  score: number;
}

interface OvgdbIndex {
  byNorm: Map<string, OvgdbEntry>;
  entries: OvgdbEntry[];
}

// Minimal shape of the bits of node:sqlite we use, so the file type-checks
// without depending on @types for an experimental builtin.
interface SqliteStatement {
  all(...params: unknown[]): Record<string, unknown>[];
}
interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}

/** Strip extension tags / region/version parentheticals from a name. */
function bareTitle(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Region preference from the original (untrimmed) name. */
function regionScore(name: string): number {
  if (/\(USA/i.test(name) || /\(World/i.test(name)) return 3;
  if (/\(Europe/i.test(name)) return 2;
  if (/\(Japan/i.test(name)) return 0;
  return 1;
}

function yearFrom(date: string | null | undefined): string {
  if (!date) return "";
  const m = date.match(/(19|20)\d{2}/);
  return m ? m[0] : "";
}

/** Tidy OpenVGDB's comma-joined genre ("action,adventure") into "Action, Adventure". */
function tidyGenre(g: string | null | undefined): string {
  if (!g) return "";
  return g
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(", ");
}

export class OpenVgdbMetadataProvider {
  private dbDir: string;
  private dbPath: string;
  private db: SqliteDatabase | null = null;
  private dbReady = false;
  private dbFailed = false;
  private indexCache = new Map<string, OvgdbIndex | null>();

  constructor(metadataDir: string) {
    this.dbDir = resolve(metadataDir, "openvgdb");
    this.dbPath = resolve(this.dbDir, "openvgdb.sqlite");
  }

  /** True only when this system has OpenVGDB coverage at all. */
  supports(systemId: string): boolean {
    return systemId in OPENVGDB_SYSTEMS;
  }

  /** Download + extract the SQLite once, then open it. Returns null (and stays
   * a no-op) if the download fails or node:sqlite is unavailable. */
  private async ensureDb(): Promise<SqliteDatabase | null> {
    if (this.dbReady) return this.db;
    if (this.dbFailed) return null;

    try {
      if (!existsSync(this.dbPath)) {
        mkdirSync(this.dbDir, { recursive: true });
        const zipPath = resolve(this.dbDir, "openvgdb.zip");
        const resp = await fetch(OPENVGDB_ZIP_URL);
        if (!resp.ok) throw new Error(`download failed (${resp.status})`);
        const buf = Buffer.from(await resp.arrayBuffer());
        writeFileSync(zipPath, buf);
        const ok = extractFileFromZip(zipPath, "openvgdb.sqlite", this.dbPath);
        try {
          unlinkSync(zipPath);
        } catch {
          /* leftover zip is harmless */
        }
        if (!ok) throw new Error("openvgdb.sqlite not found in archive");
      }

      // node:sqlite is an experimental builtin; import dynamically so a runtime
      // without it doesn't crash the whole scrape.
      const sqlite = (await import("node:sqlite")) as unknown as {
        DatabaseSync: new (path: string, opts?: unknown) => SqliteDatabase;
      };
      this.db = new sqlite.DatabaseSync(this.dbPath, { readOnly: true });
      this.dbReady = true;
      return this.db;
    } catch (err) {
      console.warn("[openvgdb] unavailable:", err instanceof Error ? err.message : err);
      this.dbFailed = true;
      return null;
    }
  }

  /** Build (and cache) the per-system match index from the SQLite catalogue. */
  async loadIndex(systemId: string): Promise<OvgdbIndex | null> {
    if (this.indexCache.has(systemId)) return this.indexCache.get(systemId) ?? null;

    const short = OPENVGDB_SYSTEMS[systemId];
    if (!short) {
      this.indexCache.set(systemId, null);
      return null;
    }
    const db = await this.ensureDb();
    if (!db) {
      this.indexCache.set(systemId, null);
      return null;
    }

    let rows: Record<string, unknown>[];
    try {
      rows = db
        .prepare(
          `SELECT r.releaseTitleName AS title, r.releaseGenre AS genre,
                  r.releaseDeveloper AS developer, r.releasePublisher AS publisher,
                  r.releaseDate AS date, r.releaseDescription AS description,
                  rm.romExtensionlessFileName AS fileName
           FROM RELEASES r
           JOIN ROMs rm ON r.romID = rm.romID
           JOIN SYSTEMS s ON rm.systemID = s.systemID
           WHERE s.systemShortName = ?`
        )
        .all(short);
    } catch (err) {
      console.warn("[openvgdb] query failed:", err instanceof Error ? err.message : err);
      this.indexCache.set(systemId, null);
      return null;
    }

    const entries: OvgdbEntry[] = [];
    for (const row of rows) {
      const fileName = (row.fileName as string) || (row.title as string) || "";
      const stripped = bareTitle(fileName);
      if (!stripped) continue;
      const fields: OpenVgdbFields = {
        title: (row.title as string) || stripped,
        genre: tidyGenre(row.genre as string),
        developer: ((row.developer as string) || "").trim(),
        publisher: ((row.publisher as string) || "").trim(),
        year: yearFrom(row.date as string),
        description: ((row.description as string) || "").trim(),
      };
      const hasData = Boolean(fields.genre || fields.developer || fields.year || fields.description);
      // Data presence dominates region so an empty "(Korea)" row never beats a
      // populated "(USA)" row for the same normalized title.
      const score = (hasData ? 10 : 0) + regionScore(fileName);
      entries.push({ fields, norm: normalizeTitle(stripped), tokens: tokenize(stripped), score });
    }

    // Best-scoring entry wins per normalized title.
    const byNorm = new Map<string, OvgdbEntry>();
    for (const e of entries) {
      const cur = byNorm.get(e.norm);
      if (!cur || e.score > cur.score) byNorm.set(e.norm, e);
    }

    const index: OvgdbIndex = { byNorm, entries };
    this.indexCache.set(systemId, index);
    return index;
  }

  /** Find the best OpenVGDB record for a ROM filename. Mirrors the libretro
   * matcher's tiers (normalized exact → prefix → token subset → substring). */
  findMatch(romFileName: string, index: OvgdbIndex): OpenVgdbFields | null {
    const title = bareTitle(romFileName);
    if (!title) return null;
    const norm = normalizeTitle(title);

    const exact = index.byNorm.get(norm);
    if (exact) return exact.fields;

    const tokens = tokenize(title);
    let matches = index.entries.filter((e) => e.norm.startsWith(norm));
    if (matches.length === 0 && tokens.length >= 2) {
      matches = index.entries.filter((e) => tokens.every((t) => e.tokens.includes(t)));
    }
    if (matches.length === 0 && norm.length >= 6) {
      matches = index.entries.filter((e) => e.norm.includes(norm));
    }
    if (matches.length === 0) return null;

    // Prefer entries with real data + better region, then the shortest title
    // (closest to the bare game name, fewer extra words).
    matches.sort((a, b) => b.score - a.score || a.norm.length - b.norm.length);
    return matches[0].fields;
  }

  close(): void {
    try {
      this.db?.close();
    } catch {
      /* ignore */
    }
  }
}
