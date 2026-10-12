/**
 * library-sync.ts — merge a profile's local activity store (user-library.json)
 * with its cloud copy (Supabase `user_library.data`) so an account's playtime,
 * played games, library, favourites, collections and pinned games follow it to
 * any machine.
 *
 * Pure (no `node:` imports) and deterministic given `now`, so it's unit-tested
 * directly and runs in the main process on an IPC call.
 *
 * Conflict model — each field uses the rule that can't lose data:
 *  - Play time / sessions: per-DEVICE counters. Each device uploads only its own
 *    contributions (`ownPlay`); the merged view is own + Σ other devices. Two
 *    machines that both played a game add up instead of one overwriting the
 *    other. A per-game reset is a timestamped tombstone that drops every
 *    contribution last played before it.
 *  - Favourites / pinned: last-writer-wins on a timestamp per toggle.
 *  - Collections: last-writer-wins per collection on `updatedAt`; deletions are
 *    tombstones so a sync never resurrects a deleted collection.
 *  - Library: each device publishes the keys of the ROMs it has; games present
 *    elsewhere but not here are exposed (cache.remoteLib) so the UI can show
 *    them as "not on this machine".
 *
 * Keys are `systemId:fileName`. The same game can have a different file name on
 * another machine; `keyAliases` (cloud key → local key, machine-local) translates
 * on the way in and back on the way out, so the cloud keeps one namespace.
 */

import type {
  CloudDeviceSlice,
  CloudGameEntry,
  CloudLibraryDoc,
  CloudPinned,
  Collection,
  PlayRecord,
  UserLibraryFile,
} from "./types.js";

const MAX_RECENT = 50;
const MAX_KEYS = 20000;
const MAX_KEY_LEN = 600;

export function emptyCloudDoc(): CloudLibraryDoc {
  return { v: 1, devices: {}, fav: {}, collections: [], colDel: {}, resets: {}, pinned: null, games: {} };
}

// ── Sanitizing (the doc comes from the network) ─────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 2000): string => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
const isKey = (k: unknown): k is string =>
  typeof k === "string" && k.length > 2 && k.length <= MAX_KEY_LEN && k.indexOf(":") > 0;

function keyList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const k of v) {
    if (isKey(k)) out.push(k);
    if (out.length >= MAX_KEYS) break;
  }
  return out;
}

function timeMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObj(v)) return out;
  for (const [k, t] of Object.entries(v)) if (typeof t === "string" && k.length <= MAX_KEY_LEN) out[k] = t;
  return out;
}

function sanitizeCollection(v: unknown): Collection | null {
  if (!isObj(v) || typeof v.id !== "string" || typeof v.name !== "string") return null;
  const c: Collection = {
    id: v.id.slice(0, 100),
    name: v.name.slice(0, 200),
    roms: keyList(v.roms),
    createdAt: str(v.createdAt, 40),
    updatedAt: str(v.updatedAt, 40),
  };
  if (v.kind === "smart" || v.kind === "manual") c.kind = v.kind;
  if (isObj(v.filter)) c.filter = v.filter as Collection["filter"];
  return c;
}

/** Coerce an untrusted value into a well-formed doc (unknown/bad parts dropped). */
export function sanitizeCloudDoc(raw: unknown): CloudLibraryDoc {
  const doc = emptyCloudDoc();
  if (!isObj(raw)) return doc;
  if (isObj(raw.devices)) {
    for (const [id, s] of Object.entries(raw.devices)) {
      if (!isObj(s) || id.length > 100) continue;
      const play: CloudDeviceSlice["play"] = {};
      if (isObj(s.play)) {
        for (const [k, r] of Object.entries(s.play)) {
          if (!isKey(k) || !isObj(r)) continue;
          play[k] = { c: num(r.c), t: num(r.t), l: str(r.l, 40) };
        }
      }
      doc.devices[id] = { name: str(s.name, 200), updatedAt: str(s.updatedAt, 40), play, lib: keyList(s.lib) };
    }
  }
  if (isObj(raw.fav)) {
    for (const [k, f] of Object.entries(raw.fav)) {
      if (isKey(k) && isObj(f)) doc.fav[k] = { on: f.on === true, at: str(f.at, 40) };
    }
  }
  if (Array.isArray(raw.collections)) {
    for (const c of raw.collections) {
      const sc = sanitizeCollection(c);
      if (sc) doc.collections.push(sc);
    }
  }
  doc.colDel = timeMap(raw.colDel);
  doc.resets = timeMap(raw.resets);
  if (isObj(raw.pinned)) doc.pinned = { keys: keyList(raw.pinned.keys).slice(0, 12), at: str(raw.pinned.at, 40) };
  if (isObj(raw.games)) {
    for (const [k, g] of Object.entries(raw.games)) {
      if (!isKey(k) || !isObj(g)) continue;
      const e: CloudGameEntry = { t: str(g.t, 300) };
      if (typeof g.s === "string") e.s = g.s.slice(0, 100);
      if (typeof g.c === "string" && /^https:\/\//.test(g.c)) e.c = g.c.slice(0, 1000);
      if (e.t) doc.games[k] = e;
    }
  }
  return doc;
}

// ── Key translation ─────────────────────────────────────────────────────

/** Rewrite every key in the local store through `map` (cloud key → local key).
 *  Used when an alias is added so data recorded under the cloud name moves to
 *  the local ROM. Play records that collide are added together. */
export function remapLocalKeys(local: UserLibraryFile, map: Record<string, string>): UserLibraryFile {
  if (Object.keys(map).length === 0) return local;
  const tr = (k: string) => map[k] ?? k;
  const mergeRecords = (src: Record<string, PlayRecord> | undefined) => {
    if (!src) return src;
    const out: Record<string, PlayRecord> = {};
    for (const [k, r] of Object.entries(src)) out[tr(k)] = out[tr(k)] ? addRecords(out[tr(k)], r) : { ...r };
    return out;
  };
  const remapMap = <T>(src: Record<string, T> | undefined, pick: (a: T, b: T) => T) => {
    if (!src) return src;
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(src)) out[tr(k)] = tr(k) in out ? pick(out[tr(k)], v) : v;
    return out;
  };
  return {
    ...local,
    favorites: dedupe(local.favorites.map(tr)),
    favoriteTimes: remapMap(local.favoriteTimes, (a, b) => (b.at > a.at ? b : a)),
    recentlyPlayed: dedupe(local.recentlyPlayed.map(tr)),
    playHistory: mergeRecords(local.playHistory) ?? {},
    ownPlay: mergeRecords(local.ownPlay),
    playResets: remapMap(local.playResets, (a, b) => (b > a ? b : a)),
    collections: local.collections.map((c) => ({ ...c, roms: dedupe(c.roms.map(tr)) })),
  };
}

function dedupe(keys: string[]): string[] {
  return [...new Set(keys)];
}

function addRecords(a: PlayRecord, b: PlayRecord): PlayRecord {
  return {
    playCount: (a.playCount ?? 0) + (b.playCount ?? 0),
    totalPlayTime: (a.totalPlayTime ?? 0) + (b.totalPlayTime ?? 0),
    lastPlayed: (a.lastPlayed ?? "") > (b.lastPlayed ?? "") ? a.lastPlayed : b.lastPlayed,
  };
}

function maxTimes(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
  const out = { ...a };
  for (const [k, t] of Object.entries(b)) if (!out[k] || t > out[k]) out[k] = t;
  return out;
}

// ── Merge ───────────────────────────────────────────────────────────────

export interface MergeInput {
  local: UserLibraryFile;
  /** The cloud doc as fetched (null when the account has none yet). */
  remote: CloudLibraryDoc | null;
  deviceId: string;
  deviceName: string;
  /** Keys of the ROMs present on THIS machine (local namespace). */
  localLibKeys: string[];
  /** Title/system/cover for this machine's games (local namespace). */
  localGames: Record<string, CloudGameEntry>;
  /** Pinned showcase games (kept in renderer storage, merged here). */
  localPinned: CloudPinned;
  now: string;
}

export interface MergeResult {
  local: UserLibraryFile;
  doc: CloudLibraryDoc;
  pinned: CloudPinned;
  /** True when `doc` differs from `remote` and should be uploaded. */
  docChanged: boolean;
}

export function mergeLibrarySync(input: MergeInput): MergeResult {
  const { deviceId, deviceName, now } = input;
  const remote = input.remote ?? emptyCloudDoc();
  const aliases = input.local.keyAliases ?? {};
  const toLocal = (k: string) => aliases[k] ?? k;
  const inverse: Record<string, string> = {};
  for (const [cloudKey, localKey] of Object.entries(aliases)) inverse[localKey] = cloudKey;
  const toCloud = (k: string) => inverse[k] ?? k;
  const local = remapLocalKeys(input.local, aliases);

  // 1. Play resets (tombstones) — union, newest wins.
  const remoteResets: Record<string, string> = {};
  for (const [k, t] of Object.entries(remote.resets)) remoteResets[toLocal(k)] = t;
  const resets = maxTimes(local.playResets ?? {}, remoteResets);
  const isReset = (k: string, lastPlayed: string) => !!resets[k] && (lastPlayed || "") <= resets[k];

  // 2. Own contributions (seeded from the merged view on the very first sync,
  //    when everything recorded so far was played on this machine).
  const own: Record<string, PlayRecord> = {};
  for (const [k, r] of Object.entries(local.ownPlay ?? local.playHistory)) {
    if (!isReset(k, r.lastPlayed)) own[k] = { ...r };
  }

  // 3. Every other device's contributions, summed.
  const remoteSum: Record<string, PlayRecord> = {};
  const remoteLib = new Set<string>();
  for (const [id, slice] of Object.entries(remote.devices)) {
    if (id === deviceId) continue;
    for (const [ck, r] of Object.entries(slice.play)) {
      const k = toLocal(ck);
      if (isReset(k, r.l)) continue;
      const rec: PlayRecord = { playCount: r.c, totalPlayTime: r.t, lastPlayed: r.l };
      remoteSum[k] = remoteSum[k] ? addRecords(remoteSum[k], rec) : rec;
    }
    for (const ck of slice.lib) remoteLib.add(toLocal(ck));
  }

  // 4. Merged view.
  const playHistory: Record<string, PlayRecord> = {};
  for (const k of new Set([...Object.keys(own), ...Object.keys(remoteSum)])) {
    const a = own[k];
    const b = remoteSum[k];
    playHistory[k] = a && b ? addRecords(a, b) : { ...(a ?? b) };
  }
  const recentlyPlayed = Object.entries(playHistory)
    .filter(([, r]) => (r.playCount ?? 0) > 0 && r.lastPlayed)
    .sort((x, y) => (y[1].lastPlayed > x[1].lastPlayed ? 1 : y[1].lastPlayed < x[1].lastPlayed ? -1 : 0))
    .slice(0, MAX_RECENT)
    .map(([k]) => k);

  // 5. Favourites — LWW per key; legacy entries without a time count as oldest.
  const favT: Record<string, { on: boolean; at: string }> = { ...(local.favoriteTimes ?? {}) };
  for (const k of local.favorites) if (!favT[k]?.on) favT[k] = { on: true, at: favT[k]?.at ?? "" };
  for (const [k, f] of Object.entries(favT)) if (f.on && !local.favorites.includes(k)) favT[k] = { on: false, at: f.at };
  for (const [ck, rf] of Object.entries(remote.fav)) {
    const k = toLocal(ck);
    const lf = favT[k];
    if (!lf || rf.at > lf.at || (rf.at === lf.at && rf.on && !lf.on)) favT[k] = { ...rf };
  }
  const favorites = [
    ...local.favorites.filter((k) => favT[k]?.on),
    ...Object.keys(favT).filter((k) => favT[k].on && !local.favorites.includes(k)),
  ];

  // 6. Collections — LWW on updatedAt, tombstones win over older edits.
  const tomb = maxTimes(local.collectionTombstones ?? {}, remote.colDel);
  const byId = new Map<string, Collection>();
  const order: string[] = [];
  for (const c of local.collections) {
    byId.set(c.id, c);
    order.push(c.id);
  }
  for (const rc of remote.collections) {
    const mapped: Collection = { ...rc, roms: dedupe(rc.roms.map(toLocal)) };
    const lc = byId.get(rc.id);
    if (!lc) {
      byId.set(rc.id, mapped);
      order.push(rc.id);
    } else if (rc.updatedAt > lc.updatedAt) {
      // Keep this machine's custom cover (a local file path) when adopting the
      // remote edit — it never travels through the cloud.
      byId.set(rc.id, lc.customCoverPath ? { ...mapped, customCoverPath: lc.customCoverPath } : mapped);
    }
  }
  const collections = order
    .map((id) => byId.get(id)!)
    .filter((c) => !(tomb[c.id] && tomb[c.id] >= c.updatedAt));

  // 7. Pinned showcase — LWW.
  const rp = remote.pinned ? { keys: remote.pinned.keys.map(toLocal), at: remote.pinned.at } : null;
  let pinned: CloudPinned = input.localPinned;
  if (rp && (rp.at > pinned.at || (rp.at === pinned.at && pinned.keys.length === 0))) pinned = rp;

  // 8. Game catalog (local namespace) — this machine's data wins, but keeps a
  //    cover someone already uploaded.
  const games: Record<string, CloudGameEntry> = {};
  for (const [ck, g] of Object.entries(remote.games)) games[toLocal(ck)] = g;
  for (const [k, g] of Object.entries(input.localGames)) {
    games[k] = { ...g, c: g.c ?? games[k]?.c };
    if (!games[k].c) delete games[k].c;
  }

  const cache = {
    // Unfiltered: consumers subtract this machine's own games themselves.
    remoteLib: [...remoteLib],
    games,
    syncedAt: now,
  };

  // 9. Outgoing doc (cloud namespace).
  const mySlice: CloudDeviceSlice = {
    name: deviceName,
    updatedAt: now,
    play: {},
    lib: input.localLibKeys.slice(0, MAX_KEYS).map(toCloud),
  };
  for (const [k, r] of Object.entries(own)) {
    mySlice.play[toCloud(k)] = { c: r.playCount ?? 0, t: r.totalPlayTime ?? 0, l: r.lastPlayed ?? "" };
  }
  const fav: CloudLibraryDoc["fav"] = {};
  for (const [k, f] of Object.entries(favT)) fav[toCloud(k)] = f;
  const outResets: Record<string, string> = {};
  for (const [k, t] of Object.entries(resets)) outResets[toCloud(k)] = t;
  const devices = { ...remote.devices, [deviceId]: mySlice };

  // Prune the catalog to keys something still references.
  const referenced = new Set<string>();
  for (const s of Object.values(devices)) {
    s.lib.forEach((k) => referenced.add(k));
    Object.keys(s.play).forEach((k) => referenced.add(k));
  }
  Object.entries(fav).forEach(([k, f]) => f.on && referenced.add(k));
  collections.forEach((c) => c.roms.forEach((k) => referenced.add(toCloud(k))));
  pinned.keys.forEach((k) => referenced.add(toCloud(k)));
  const outGames: Record<string, CloudGameEntry> = {};
  for (const [k, g] of Object.entries(games)) {
    const ck = toCloud(k);
    if (referenced.has(ck)) outGames[ck] = g;
  }

  const doc: CloudLibraryDoc = {
    v: 1,
    devices,
    fav,
    collections: collections.map((c) => {
      const { customCoverPath: _local, ...rest } = c;
      return { ...rest, roms: c.roms.map(toCloud) };
    }),
    colDel: tomb,
    resets: outResets,
    pinned: { keys: pinned.keys.map(toCloud), at: pinned.at },
    games: outGames,
  };

  // Changed? Compare ignoring this device's heartbeat timestamp.
  const prevMine = remote.devices[deviceId];
  const comparable = {
    ...doc,
    devices: { ...devices, [deviceId]: { ...mySlice, updatedAt: prevMine?.updatedAt ?? "" } },
  };
  const docChanged = !input.remote || stableStringify(comparable) !== stableStringify(remote);

  return {
    local: {
      ...local,
      playHistory,
      ownPlay: own,
      recentlyPlayed,
      favorites,
      favoriteTimes: favT,
      collections,
      collectionTombstones: tomb,
      playResets: resets,
      cloud: cache,
    },
    doc,
    pinned,
    docChanged,
  };
}

/** JSON with sorted object keys, so equality doesn't depend on insertion order. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (isObj(v)) {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}
