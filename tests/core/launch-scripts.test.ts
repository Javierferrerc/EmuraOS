import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { EventEmitter } from "node:events";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  runPreLaunchScript,
  runPostLaunchScript,
  type LaunchScriptEnv,
} from "../../src/core/launch-scripts.js";

// Mock child_process.spawn so we never spawn a real process — we only
// assert on the interpreter/args/env it was invoked with and drive the
// fake child's lifecycle ourselves.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const TEST_DIR = resolve(import.meta.dirname, "__test_launch_scripts__");

/** A spawn() stand-in: an EventEmitter with the kill/unref surface the
 *  module touches. */
function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    unref: ReturnType<typeof vi.fn>;
  };
  child.kill = vi.fn();
  child.unref = vi.fn();
  return child;
}

const ENV: LaunchScriptEnv = {
  systemId: "gamecube",
  romPath: "C:\\roms\\gc\\zelda.iso",
  title: "zelda.iso",
  emulatorId: "dolphin",
};

/** Create a real file so existsSync() inside the module passes. */
function makeScript(name: string): string {
  const p = join(TEST_DIR, name);
  writeFileSync(p, "echo hi");
  return p;
}

describe("launch-scripts", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => makeFakeChild());
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    vi.useRealTimers();
  });

  describe("runPreLaunchScript", () => {
    it("no-ops without spawning for an empty or whitespace path", async () => {
      await runPreLaunchScript(undefined, ENV);
      await runPreLaunchScript("", ENV);
      await runPreLaunchScript("   ", ENV);
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it("no-ops without spawning when the file does not exist", async () => {
      await runPreLaunchScript(join(TEST_DIR, "missing.ps1"), ENV);
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it("resolves once the child exits and passes the EMURA_* env bundle", async () => {
      const script = makeScript("hook.sh");
      const child = makeFakeChild();
      spawnMock.mockImplementation(() => child);

      const promise = runPreLaunchScript(script, ENV);
      // Emit exit on the next tick so the .on("exit") listener is attached.
      await Promise.resolve();
      child.emit("exit", 0);
      await promise;

      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [, , opts] = spawnMock.mock.calls[0];
      expect(opts.env.EMURA_SYSTEM).toBe("gamecube");
      expect(opts.env.EMURA_ROM_PATH).toBe("C:\\roms\\gc\\zelda.iso");
      expect(opts.env.EMURA_TITLE).toBe("zelda.iso");
      expect(opts.env.EMURA_EMULATOR_ID).toBe("dolphin");
      // Pre-launch never carries an exit code.
      expect(opts.env.EMURA_EXIT_CODE).toBeUndefined();
    });

    it("picks the right interpreter per extension", async () => {
      const cases: Array<[string, string, (args: string[]) => boolean]> = [
        ["hook.ps1", "powershell.exe", (a) => a.includes("-File")],
        ["hook.bat", "cmd.exe", (a) => a[0] === "/c"],
        ["hook.cmd", "cmd.exe", (a) => a[0] === "/c"],
        ["hook.sh", "sh", (a) => a.length === 1],
      ];
      for (const [name, exe, argsCheck] of cases) {
        spawnMock.mockReset();
        const child = makeFakeChild();
        spawnMock.mockImplementation(() => child);
        const script = makeScript(name);
        const promise = runPreLaunchScript(script, ENV);
        await Promise.resolve();
        child.emit("exit", 0);
        await promise;
        const [calledExe, calledArgs] = spawnMock.mock.calls[0];
        expect(calledExe).toBe(exe);
        expect(argsCheck(calledArgs as string[])).toBe(true);
      }
    });

    it("executes an extension-less / exe path directly", async () => {
      const script = makeScript("hook.exe");
      const child = makeFakeChild();
      spawnMock.mockImplementation(() => child);
      const promise = runPreLaunchScript(script, ENV);
      await Promise.resolve();
      child.emit("exit", 0);
      await promise;
      const [calledExe, calledArgs] = spawnMock.mock.calls[0];
      expect(calledExe).toBe(script);
      expect(calledArgs).toEqual([]);
    });

    it("kills the child and resolves after the 5s timeout", async () => {
      vi.useFakeTimers();
      const script = makeScript("hang.sh");
      const child = makeFakeChild();
      spawnMock.mockImplementation(() => child);

      let settled = false;
      const promise = runPreLaunchScript(script, ENV).then(() => {
        settled = true;
      });

      // Before the timeout fires nothing should have resolved or killed.
      await vi.advanceTimersByTimeAsync(4999);
      expect(child.kill).not.toHaveBeenCalled();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await promise;
      expect(child.kill).toHaveBeenCalledTimes(1);
      expect(settled).toBe(true);
    });

    it("resolves (never throws) when the child emits an error", async () => {
      const script = makeScript("broken.sh");
      const child = makeFakeChild();
      spawnMock.mockImplementation(() => child);
      const promise = runPreLaunchScript(script, ENV);
      await Promise.resolve();
      child.emit("error", new Error("ENOENT"));
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe("runPostLaunchScript", () => {
    it("no-ops without spawning for empty or missing paths", () => {
      runPostLaunchScript(undefined, ENV);
      runPostLaunchScript("", ENV);
      runPostLaunchScript(join(TEST_DIR, "missing.sh"), ENV);
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it("spawns detached, unrefs, and forwards EMURA_EXIT_CODE", () => {
      const script = makeScript("post.sh");
      const child = makeFakeChild();
      spawnMock.mockImplementation(() => child);

      runPostLaunchScript(script, { ...ENV, exitCode: 3 });

      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [, , opts] = spawnMock.mock.calls[0];
      expect(opts.detached).toBe(true);
      expect(opts.env.EMURA_EXIT_CODE).toBe("3");
      expect(child.unref).toHaveBeenCalledTimes(1);
    });

    it("omits EMURA_EXIT_CODE when the exit code is null", () => {
      const script = makeScript("post-null.sh");
      const child = makeFakeChild();
      spawnMock.mockImplementation(() => child);

      runPostLaunchScript(script, { ...ENV, exitCode: null });

      const [, , opts] = spawnMock.mock.calls[0];
      expect(opts.env.EMURA_EXIT_CODE).toBeUndefined();
    });
  });
});
