/**
 * Multi-account session vault. Supabase only persists ONE active session at a
 * time (its `sb-<ref>-auth-token` slot), so signing into a second account on the
 * same machine overwrites the first — and switching back would need a password.
 *
 * This keeps each signed-in account's tokens keyed by user id, so the profile
 * selector can restore any of them WITHOUT re-login (console-style multi-user).
 *
 * Security: refresh tokens live in localStorage — the SAME exposure as
 * Supabase's own `persistSession` default, so no new risk beyond what already
 * ships. Cleared per-account on an explicit "Cerrar sesión".
 */

const KEY = "nx.sessions.v1";

export interface StoredSession {
  access_token: string;
  refresh_token: string;
}

function loadAll(): Record<string, StoredSession> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, StoredSession>;
  } catch {
    return {};
  }
}

function saveAll(map: Record<string, StoredSession>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage full/unavailable — non-fatal */
  }
}

export function rememberSession(userId: string, tokens: StoredSession): void {
  if (!userId || !tokens.access_token || !tokens.refresh_token) return;
  const map = loadAll();
  map[userId] = tokens;
  saveAll(map);
}

export function getRememberedSession(userId: string): StoredSession | null {
  return loadAll()[userId] ?? null;
}

export function forgetSession(userId: string): void {
  const map = loadAll();
  if (map[userId]) {
    delete map[userId];
    saveAll(map);
  }
}

export function hasRememberedSession(userId: string): boolean {
  return !!loadAll()[userId];
}

export function listRememberedUserIds(): string[] {
  return Object.keys(loadAll());
}
