import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

export interface SecurityEvent {
  type:
    | "IPC_VALIDATION_FAILURE"
    | "PATH_TRAVERSAL_BLOCKED"
    | "URL_SCHEME_BLOCKED"
    | "RATE_LIMIT_HIT"
    | "AUTH_FAILURE";
  channel?: string;
  detail?: string;
  severity: "warn" | "error" | "info";
}

let logsDir: string | null = null;

/**
 * Set the directory where security.log is written.
 * Called once from the Electron main process with app.getPath("logs").
 */
export function setSecurityLogDir(dir: string): void {
  logsDir = dir;
}

export function logSecurityEvent(event: SecurityEvent): void {
  const entry = {
    timestamp: new Date().toISOString(),
    ...event,
  };

  console.warn(`[SECURITY] ${JSON.stringify(entry)}`);

  if (logsDir) {
    try {
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }
      const logPath = join(logsDir, "security.log");
      appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8");
    } catch {
      // Logging should never crash the app
    }
  }
}
