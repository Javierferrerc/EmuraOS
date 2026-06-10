import { logSecurityEvent } from "./security-logger.js";

/**
 * RetroAchievements client covering the three calls the launcher needs:
 *
 *   1. login(user, password)      → derives the long-lived emulator token
 *      (dorequest.php?r=login2). The token is what RetroArch/Dolphin/etc.
 *      store as `cheevos_token`; we never persist the password.
 *   2. resolveGameId(md5)         → maps a locally-computed ROM hash to an
 *      RA game id (dorequest.php?r=gameid). 0 / null means "not in the DB".
 *   3. getGameProgress(...)       → the web API call that powers the
 *      achievements panel (API_GetGameInfoAndUserProgress.php), authed with
 *      the user's Web API key.
 *
 * login + resolveGameId go through the public `dorequest.php` connect API
 * (the same one emulators use). getGameProgress uses the v1 web API host.
 * Both are wrapped in the shared retry/rate-limit helper.
 */

const CONNECT_BASE = "https://retroachievements.org/dorequest.php";
const WEB_API_BASE = "https://retroachievements.org/API";
const MEDIA_BASE = "https://media.retroachievements.org";
const RATE_LIMIT_MS = 300;

export interface RaLoginResult {
  success: boolean;
  username?: string;
  token?: string;
  error?: string;
}

export interface RaAchievement {
  id: number;
  title: string;
  description: string;
  points: number;
  /** Badge image URL (earned art). Locked art is the same id + "_lock". */
  badgeUrl: string;
  badgeUrlLocked: string;
  /** ISO-ish date string from RA, or null when the user hasn't earned it. */
  dateEarned: string | null;
  dateEarnedHardcore: string | null;
}

export interface RaGameProgress {
  gameId: number;
  title: string;
  consoleName: string;
  iconUrl: string | null;
  numAchievements: number;
  numAwarded: number;
  numAwardedHardcore: number;
  userCompletion: string;
  achievements: RaAchievement[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read a field from a legacy PascalCase / modern camelCase response without
 *  caring which casing the endpoint used. */
function pick<T>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
  }
  return undefined;
}

export class RetroAchievementsClient {
  private lastRequestAt = 0;

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const wait = this.lastRequestAt + RATE_LIMIT_MS - now;
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
  }

  /** Fetch with retry on 429/5xx (3 attempts, 1s/2s backoff). Network errors
   *  retry too; the final failure is rethrown. */
  private async fetchWithRetry(url: string): Promise<Response> {
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.rateLimit();
      try {
        const res = await fetch(url);
        if (res.ok) return res;
        if (res.status === 401 || res.status === 403) {
          logSecurityEvent({
            type: "AUTH_FAILURE",
            detail: `RetroAchievements API returned ${res.status}`,
            severity: "error",
          });
          return res; // auth errors are terminal — let the caller read body
        }
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`HTTP ${res.status}`);
          if (attempt < maxAttempts - 1) {
            await sleep(1000 * Math.pow(2, attempt));
            continue;
          }
        }
        return res;
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts - 1) {
          await sleep(1000 * Math.pow(2, attempt));
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * Exchange username + password for the account token used by emulators.
   * Never store the password — only the returned token. A wrong password
   * comes back as `{ success: false }` from RA, surfaced as a clean error.
   */
  async login(username: string, password: string): Promise<RaLoginResult> {
    const url =
      `${CONNECT_BASE}?r=login2` +
      `&u=${encodeURIComponent(username)}` +
      `&p=${encodeURIComponent(password)}`;
    try {
      const res = await this.fetchWithRetry(url);
      const data = (await res.json()) as Record<string, unknown>;
      const ok = pick<boolean>(data, "Success", "success");
      if (!ok) {
        const error =
          pick<string>(data, "Error", "error") ?? "Credenciales inválidas";
        return { success: false, error };
      }
      return {
        success: true,
        username: pick<string>(data, "User", "user") ?? username,
        token: pick<string>(data, "Token", "token"),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Resolve a ROM MD5 hash to an RA game id via the connect API. Returns
   * null when the hash isn't in the database (RA replies with GameID 0).
   */
  async resolveGameId(md5Hash: string): Promise<number | null> {
    const url = `${CONNECT_BASE}?r=gameid&m=${encodeURIComponent(md5Hash)}`;
    const res = await this.fetchWithRetry(url);
    const data = (await res.json()) as Record<string, unknown>;
    if (!pick<boolean>(data, "Success", "success")) return null;
    const id = Number(pick(data, "GameID", "gameId") ?? 0);
    return id > 0 ? id : null;
  }

  /**
   * Fetch the user's achievement progress for a game via the v1 web API.
   * Returns null on auth failure or unknown game so the UI can show a hint
   * instead of throwing.
   */
  async getGameProgress(
    username: string,
    webApiKey: string,
    gameId: number
  ): Promise<RaGameProgress | null> {
    const url =
      `${WEB_API_BASE}/API_GetGameInfoAndUserProgress.php` +
      `?y=${encodeURIComponent(webApiKey)}` +
      `&u=${encodeURIComponent(username)}` +
      `&g=${gameId}`;
    const res = await this.fetchWithRetry(url);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;

    const rawAch =
      pick<Record<string, Record<string, unknown>>>(
        data,
        "Achievements",
        "achievements"
      ) ?? {};
    const achievements: RaAchievement[] = Object.values(rawAch).map((a) => {
      const badge = String(pick(a, "BadgeName", "badgeName") ?? "");
      return {
        id: Number(pick(a, "ID", "id") ?? 0),
        title: String(pick(a, "Title", "title") ?? ""),
        description: String(pick(a, "Description", "description") ?? ""),
        points: Number(pick(a, "Points", "points") ?? 0),
        badgeUrl: `${MEDIA_BASE}/Badge/${badge}.png`,
        badgeUrlLocked: `${MEDIA_BASE}/Badge/${badge}_lock.png`,
        dateEarned: pick<string>(a, "DateEarned", "dateEarned") ?? null,
        dateEarnedHardcore:
          pick<string>(a, "DateEarnedHardcore", "dateEarnedHardcore") ?? null,
      };
    });
    // RA returns achievements keyed by id with a DisplayOrder; sort by points
    // then id for a stable, sensible default ordering.
    achievements.sort((x, y) => x.points - y.points || x.id - y.id);

    const icon = pick<string>(data, "ImageIcon", "imageIcon");
    return {
      gameId,
      title: String(pick(data, "Title", "title") ?? ""),
      consoleName: String(pick(data, "ConsoleName", "consoleName") ?? ""),
      iconUrl: icon ? `${MEDIA_BASE}${icon}` : null,
      numAchievements: Number(
        pick(data, "NumAchievements", "numAchievements") ?? achievements.length
      ),
      numAwarded: Number(
        pick(data, "NumAwardedToUser", "numAwardedToUser") ?? 0
      ),
      numAwardedHardcore: Number(
        pick(
          data,
          "NumAwardedToUserHardcore",
          "numAwardedToUserHardcore"
        ) ?? 0
      ),
      userCompletion: String(
        pick(data, "UserCompletion", "userCompletion") ?? "0%"
      ),
      achievements,
    };
  }
}
