import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { isWindows } from "./platform.js";

/**
 * Pre/post launch wrapper script runner.
 *
 * Users point Settings → Avanzado → "Scripts de lanzamiento" at any
 * shell/PowerShell file. We spawn it with a curated env-var bundle that
 * lets the script know which game is about to launch and exit cleanly
 * without colluding with the emulator's stdin/stdout.
 *
 * Pre-launch runs synchronously with a hard 5s timeout — the criterion
 * from PHASE 22 — so a hanging script can't lock the launcher. Post-launch
 * is fire-and-forget; its exit code never bubbles back to the user.
 */

export interface LaunchScriptEnv {
  systemId: string;
  romPath: string;
  title: string;
  emulatorId: string;
  /** Only present on post-launch invocations. */
  exitCode?: number | null;
}

function buildEnv(env: LaunchScriptEnv): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {
    ...process.env,
    EMURA_SYSTEM: env.systemId,
    EMURA_ROM_PATH: env.romPath,
    EMURA_TITLE: env.title,
    EMURA_EMULATOR_ID: env.emulatorId,
  };
  if (env.exitCode !== undefined && env.exitCode !== null) {
    base.EMURA_EXIT_CODE = String(env.exitCode);
  }
  return base;
}

/** Pick an interpreter + args for the given script path, per OS.
 *  - .ps1 → powershell.exe on Windows, pwsh (PowerShell Core) elsewhere
 *  - .bat/.cmd → cmd.exe on Windows only (null elsewhere — not runnable)
 *  - .sh → sh everywhere (Git Bash provides it on Windows)
 *  - anything else executes directly (the user may point us at a binary).
 *  Returns null when the script type cannot run on this OS; callers log
 *  and skip instead of spawning something that would fail confusingly. */
export function resolveInterpreter(
  scriptPath: string,
  platform: NodeJS.Platform = process.platform
): { exe: string; args: string[] } | null {
  const ext = path.extname(scriptPath).toLowerCase();
  if (ext === ".ps1") {
    return {
      exe: isWindows(platform) ? "powershell.exe" : "pwsh",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    };
  }
  if (ext === ".bat" || ext === ".cmd") {
    if (!isWindows(platform)) return null;
    return { exe: "cmd.exe", args: ["/c", scriptPath] };
  }
  if (ext === ".sh") {
    return { exe: "sh", args: [scriptPath] };
  }
  return { exe: scriptPath, args: [] };
}

const PRE_LAUNCH_TIMEOUT_MS = 5000;

/** Run a pre-launch script and wait for it (or its 5s timeout). Errors
 *  are logged but never thrown — a broken pre-launch hook should not
 *  block the user from playing. */
export async function runPreLaunchScript(
  scriptPath: string | undefined,
  env: LaunchScriptEnv
): Promise<void> {
  if (!scriptPath || !scriptPath.trim()) return;
  if (!existsSync(scriptPath)) {
    console.warn(
      "[launch-scripts] pre-launch script not found:",
      scriptPath
    );
    return;
  }
  const interpreter = resolveInterpreter(scriptPath);
  if (!interpreter) {
    console.warn(
      "[launch-scripts] pre-launch script type not runnable on this OS:",
      scriptPath
    );
    return;
  }
  const { exe, args } = interpreter;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      const child = spawn(exe, args, {
        env: buildEnv(env),
        stdio: "ignore",
        shell: false,
      });
      const timer = setTimeout(() => {
        console.warn(
          `[launch-scripts] pre-launch script timed out after ${PRE_LAUNCH_TIMEOUT_MS}ms, killing`
        );
        try {
          child.kill();
        } catch {
          /* swallow */
        }
        finish();
      }, PRE_LAUNCH_TIMEOUT_MS);
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          console.warn(
            "[launch-scripts] pre-launch script exited with code",
            code
          );
        }
        finish();
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        console.warn("[launch-scripts] pre-launch script error:", err);
        finish();
      });
    } catch (err) {
      console.warn("[launch-scripts] failed to spawn pre-launch script:", err);
      finish();
    }
  });
}

/** Fire-and-forget post-launch script. Detached + stdio ignored so the
 *  launcher can exit independently. */
export function runPostLaunchScript(
  scriptPath: string | undefined,
  env: LaunchScriptEnv
): void {
  if (!scriptPath || !scriptPath.trim()) return;
  if (!existsSync(scriptPath)) {
    console.warn(
      "[launch-scripts] post-launch script not found:",
      scriptPath
    );
    return;
  }
  const interpreter = resolveInterpreter(scriptPath);
  if (!interpreter) {
    console.warn(
      "[launch-scripts] post-launch script type not runnable on this OS:",
      scriptPath
    );
    return;
  }
  const { exe, args } = interpreter;
  try {
    const child = spawn(exe, args, {
      env: buildEnv(env),
      detached: true,
      stdio: "ignore",
      shell: false,
    });
    child.unref();
  } catch (err) {
    console.warn("[launch-scripts] failed to spawn post-launch script:", err);
  }
}
