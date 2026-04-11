import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import {
  applyCitraGamepadProfile,
  readCitraGamepadStatus,
  CITRA_GAMEPAD_PROFILES,
  PS_DUALSHOCK_PROFILE,
} from "../../src/core/citra-gamepad.js";

const TEST_DIR = resolve(import.meta.dirname, "__test_citra_gamepad__");
const CONFIG_PATH = join(TEST_DIR, "qt-config.ini");

/**
 * A minimal qt-config.ini snippet mirroring what Citra writes right
 * after first launch — has a `[Controls]` section but none of the
 * gamepad bindings have been customized (everything marked default).
 */
const FRESH_CONTROLS_SECTION = [
  "[Controls]",
  "profile\\default=true",
  "profile=0",
  "profiles\\1\\name\\default=true",
  "profiles\\1\\name=default",
  "profiles\\1\\button_a\\default=true",
  "profiles\\1\\button_a=\"code:65,engine:keyboard\"",
  "profiles\\1\\button_b\\default=true",
  "profiles\\1\\button_b=\"code:83,engine:keyboard\"",
  "profiles\\1\\motion_device\\default=true",
  "profiles\\1\\motion_device=\"engine:motion_emu,update_period:100,sensitivity:0.01,tilt_clamp:90.0\"",
  "profiles\\1\\touch_device\\default=true",
  "profiles\\1\\touch_device=engine:emu_window",
  "profiles\\1\\udp_input_address\\default=true",
  "profiles\\1\\udp_input_address=127.0.0.1",
  "profiles\\1\\udp_input_port\\default=true",
  "profiles\\1\\udp_input_port=26760",
  "profiles\\size=1",
  "",
].join("\n");

/**
 * Full `[Controls]` section after a successful "Auto-Assign" with a
 * DualShock 4 connected — matches the exact format Citra writes. We
 * use this to verify the apply logic is idempotent against the same
 * bytes Citra would produce, and to test the "already customized"
 * detection path.
 */
const POST_AUTO_ASSIGN_PS: string = (() => {
  const guid = PS_DUALSHOCK_PROFILE.guid;
  const suffix = `engine:sdl,guid:${guid},port:0`;
  const b = PS_DUALSHOCK_PROFILE.buttons;
  const t = PS_DUALSHOCK_PROFILE.triggerAxes;
  const cp = PS_DUALSHOCK_PROFILE.circlePadAxes;
  const cs = PS_DUALSHOCK_PROFILE.cStickAxes;
  return [
    "[Controls]",
    "profile\\default=true",
    "profile=0",
    "profiles\\1\\name\\default=true",
    "profiles\\1\\name=default",
    `profiles\\1\\button_a\\default=false`,
    `profiles\\1\\button_a="button:${b.a},${suffix}"`,
    `profiles\\1\\button_b\\default=false`,
    `profiles\\1\\button_b="button:${b.b},${suffix}"`,
    `profiles\\1\\button_x\\default=false`,
    `profiles\\1\\button_x="button:${b.x},${suffix}"`,
    `profiles\\1\\button_y\\default=false`,
    `profiles\\1\\button_y="button:${b.y},${suffix}"`,
    `profiles\\1\\button_up\\default=false`,
    `profiles\\1\\button_up="button:${b.up},${suffix}"`,
    `profiles\\1\\button_down\\default=false`,
    `profiles\\1\\button_down="button:${b.down},${suffix}"`,
    `profiles\\1\\button_left\\default=false`,
    `profiles\\1\\button_left="button:${b.left},${suffix}"`,
    `profiles\\1\\button_right\\default=false`,
    `profiles\\1\\button_right="button:${b.right},${suffix}"`,
    `profiles\\1\\button_l\\default=false`,
    `profiles\\1\\button_l="button:${b.l},${suffix}"`,
    `profiles\\1\\button_r\\default=false`,
    `profiles\\1\\button_r="button:${b.r},${suffix}"`,
    `profiles\\1\\button_start\\default=false`,
    `profiles\\1\\button_start="button:${b.start},${suffix}"`,
    `profiles\\1\\button_select\\default=false`,
    `profiles\\1\\button_select="button:${b.select},${suffix}"`,
    "profiles\\1\\button_debug\\default=true",
    "profiles\\1\\button_debug=\"code:79,engine:keyboard\"",
    "profiles\\1\\button_gpio14\\default=true",
    "profiles\\1\\button_gpio14=\"code:80,engine:keyboard\"",
    `profiles\\1\\button_zl\\default=false`,
    `profiles\\1\\button_zl="axis:${t.zl},${suffix}"`,
    `profiles\\1\\button_zr\\default=false`,
    `profiles\\1\\button_zr="axis:${t.zr},${suffix}"`,
    `profiles\\1\\button_home\\default=false`,
    `profiles\\1\\button_home="button:${b.home},${suffix}"`,
    "profiles\\1\\button_power\\default=true",
    "profiles\\1\\button_power=\"code:86,engine:keyboard\"",
    `profiles\\1\\circle_pad\\default=false`,
    `profiles\\1\\circle_pad="axis_x:${cp.x},axis_y:${cp.y},${suffix}"`,
    `profiles\\1\\c_stick\\default=false`,
    `profiles\\1\\c_stick="axis_x:${cs.x},axis_y:${cs.y},${suffix}"`,
    "profiles\\1\\motion_device\\default=true",
    "profiles\\1\\motion_device=\"engine:motion_emu,update_period:100,sensitivity:0.01,tilt_clamp:90.0\"",
    "profiles\\1\\touch_device\\default=true",
    "profiles\\1\\touch_device=engine:emu_window",
    "profiles\\1\\use_touch_from_button\\default=true",
    "profiles\\1\\use_touch_from_button=false",
    "profiles\\1\\touch_from_button_map\\default=true",
    "profiles\\1\\touch_from_button_map=0",
    "profiles\\1\\udp_input_address\\default=true",
    "profiles\\1\\udp_input_address=127.0.0.1",
    "profiles\\1\\udp_input_port\\default=true",
    "profiles\\1\\udp_input_port=26760",
    "profiles\\1\\udp_pad_index\\default=true",
    "profiles\\1\\udp_pad_index=0",
    "profiles\\size=1",
    "touch_from_button_maps\\1\\name\\default=true",
    "touch_from_button_maps\\1\\name=default",
    "touch_from_button_maps\\1\\entries\\size=0",
    "touch_from_button_maps\\size=1",
    "",
  ].join("\n");
})();

describe("citra-gamepad", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // ── Profile registry ──────────────────────────────────────────────

  it("exposes the ps-dualshock profile in the registry", () => {
    expect(CITRA_GAMEPAD_PROFILES["ps-dualshock"]).toBe(PS_DUALSHOCK_PROFILE);
    expect(PS_DUALSHOCK_PROFILE.guid).toBe(
      "03008fe54c050000c405000000016800"
    );
  });

  // ── applyCitraGamepadProfile ──────────────────────────────────────

  it("returns error when the config file does not exist", () => {
    const result = applyCitraGamepadProfile(CONFIG_PATH, PS_DUALSHOCK_PROFILE);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("writes all gamepad bindings into a fresh [Controls] section", () => {
    const input =
      "[UI]\n" +
      "fullscreen=false\n" +
      "\n" +
      FRESH_CONTROLS_SECTION;
    writeFileSync(CONFIG_PATH, input, "utf-8");

    const result = applyCitraGamepadProfile(CONFIG_PATH, PS_DUALSHOCK_PROFILE);
    expect(result.success).toBe(true);

    const written = readFileSync(CONFIG_PATH, "utf-8");

    // Our key bindings should now use engine:sdl with the PS GUID.
    expect(written).toContain(
      `profiles\\1\\button_a="button:1,engine:sdl,guid:03008fe54c050000c405000000016800,port:0"`
    );
    expect(written).toContain(`profiles\\1\\button_a\\default=false`);
    expect(written).toContain(
      `profiles\\1\\button_b="button:0,engine:sdl,guid:03008fe54c050000c405000000016800,port:0"`
    );
    // Triggers as axes
    expect(written).toContain(
      `profiles\\1\\button_zl="axis:4,engine:sdl,guid:03008fe54c050000c405000000016800,port:0"`
    );
    expect(written).toContain(
      `profiles\\1\\button_zr="axis:5,engine:sdl,guid:03008fe54c050000c405000000016800,port:0"`
    );
    // Analog sticks
    expect(written).toContain(
      `profiles\\1\\circle_pad="axis_x:0,axis_y:1,engine:sdl,guid:03008fe54c050000c405000000016800,port:0"`
    );
    expect(written).toContain(
      `profiles\\1\\c_stick="axis_x:2,axis_y:3,engine:sdl,guid:03008fe54c050000c405000000016800,port:0"`
    );

    // UNRELATED keys must be preserved verbatim.
    expect(written).toContain(
      "profiles\\1\\motion_device=\"engine:motion_emu,update_period:100,sensitivity:0.01,tilt_clamp:90.0\""
    );
    expect(written).toContain("profiles\\1\\touch_device=engine:emu_window");
    expect(written).toContain("profiles\\1\\udp_input_address=127.0.0.1");
    expect(written).toContain("profiles\\1\\udp_input_port=26760");

    // Other sections untouched.
    expect(written).toContain("[UI]");
    expect(written).toContain("fullscreen=false");
  });

  it("replaces keys in place when [Controls] already has bindings", () => {
    // Pre-seed with stale Xbox-style bindings the user might have had.
    const staleGuid = "030000005e040000130b000011050000"; // fake Xbox GUID
    const stale = [
      "[Controls]",
      "profile\\default=true",
      "profile=0",
      "profiles\\1\\name\\default=true",
      "profiles\\1\\name=default",
      "profiles\\1\\button_a\\default=false",
      `profiles\\1\\button_a="button:0,engine:sdl,guid:${staleGuid},port:0"`,
      "profiles\\1\\button_b\\default=false",
      `profiles\\1\\button_b="button:1,engine:sdl,guid:${staleGuid},port:0"`,
      "profiles\\1\\motion_device\\default=true",
      "profiles\\1\\motion_device=\"engine:motion_emu,update_period:100,sensitivity:0.01,tilt_clamp:90.0\"",
      "profiles\\size=1",
      "",
    ].join("\n");
    writeFileSync(CONFIG_PATH, stale, "utf-8");

    const result = applyCitraGamepadProfile(CONFIG_PATH, PS_DUALSHOCK_PROFILE);
    expect(result.success).toBe(true);
    // button_a changed (value differs), button_b changed, plus all inserted.
    expect(result.linesReplaced).toBeGreaterThan(0);
    expect(result.linesInserted).toBeGreaterThan(0);

    const written = readFileSync(CONFIG_PATH, "utf-8");
    // Old Xbox GUID is gone.
    expect(written).not.toContain(staleGuid);
    // New PS GUID is present on every replaced line.
    expect(written).toContain(
      `profiles\\1\\button_a="button:1,engine:sdl,guid:03008fe54c050000c405000000016800,port:0"`
    );
    // Unrelated motion_device line was NOT touched.
    expect(written).toContain(
      "profiles\\1\\motion_device=\"engine:motion_emu,update_period:100,sensitivity:0.01,tilt_clamp:90.0\""
    );
  });

  it("creates a fresh [Controls] section when none exists", () => {
    const input = "[UI]\nfullscreen=false\n";
    writeFileSync(CONFIG_PATH, input, "utf-8");

    const result = applyCitraGamepadProfile(CONFIG_PATH, PS_DUALSHOCK_PROFILE);
    expect(result.success).toBe(true);
    expect(result.linesInserted).toBeGreaterThan(0);

    const written = readFileSync(CONFIG_PATH, "utf-8");
    expect(written).toContain("[UI]");
    expect(written).toContain("fullscreen=false");
    expect(written).toContain("[Controls]");
    expect(written).toContain(`profiles\\1\\button_a="button:1,engine:sdl`);
  });

  it("is idempotent — second apply produces identical bytes", () => {
    writeFileSync(CONFIG_PATH, FRESH_CONTROLS_SECTION, "utf-8");

    const first = applyCitraGamepadProfile(CONFIG_PATH, PS_DUALSHOCK_PROFILE);
    expect(first.success).toBe(true);
    const firstBytes = readFileSync(CONFIG_PATH, "utf-8");

    const second = applyCitraGamepadProfile(CONFIG_PATH, PS_DUALSHOCK_PROFILE);
    expect(second.success).toBe(true);
    expect(second.linesReplaced).toBe(0);
    expect(second.linesInserted).toBe(0);
    const secondBytes = readFileSync(CONFIG_PATH, "utf-8");

    expect(secondBytes).toBe(firstBytes);
  });

  it("is idempotent against an exact post-Auto-Assign file", () => {
    // Simulate the state the user would have after manually running
    // Emulation → Configure → Controls → Auto-Assign. Applying our
    // profile on top of that should produce zero writes.
    writeFileSync(CONFIG_PATH, POST_AUTO_ASSIGN_PS, "utf-8");
    const result = applyCitraGamepadProfile(CONFIG_PATH, PS_DUALSHOCK_PROFILE);
    expect(result.success).toBe(true);
    expect(result.linesReplaced).toBe(0);
    expect(result.linesInserted).toBe(0);

    const written = readFileSync(CONFIG_PATH, "utf-8");
    expect(written).toBe(POST_AUTO_ASSIGN_PS);
  });

  it("preserves CRLF line endings", () => {
    const crlfInput = "[UI]\r\nfullscreen=false\r\n\r\n[Controls]\r\nprofile=0\r\n";
    writeFileSync(CONFIG_PATH, crlfInput, "utf-8");

    const result = applyCitraGamepadProfile(CONFIG_PATH, PS_DUALSHOCK_PROFILE);
    expect(result.success).toBe(true);

    const written = readFileSync(CONFIG_PATH, "utf-8");
    // Every line should still be terminated with \r\n, not \n.
    expect(written).toContain("\r\n");
    expect(written).not.toMatch(/[^\r]\n/);
  });

  it("leaves keyboard-only defaults (button_debug/gpio14/power) untouched", () => {
    const input = [
      "[Controls]",
      "profile\\default=true",
      "profile=0",
      "profiles\\1\\button_debug\\default=true",
      "profiles\\1\\button_debug=\"code:79,engine:keyboard\"",
      "profiles\\1\\button_gpio14\\default=true",
      "profiles\\1\\button_gpio14=\"code:80,engine:keyboard\"",
      "profiles\\1\\button_power\\default=true",
      "profiles\\1\\button_power=\"code:86,engine:keyboard\"",
      "profiles\\size=1",
      "",
    ].join("\n");
    writeFileSync(CONFIG_PATH, input, "utf-8");

    applyCitraGamepadProfile(CONFIG_PATH, PS_DUALSHOCK_PROFILE);

    const written = readFileSync(CONFIG_PATH, "utf-8");
    expect(written).toContain("profiles\\1\\button_debug\\default=true");
    expect(written).toContain(
      "profiles\\1\\button_debug=\"code:79,engine:keyboard\""
    );
    expect(written).toContain(
      "profiles\\1\\button_gpio14=\"code:80,engine:keyboard\""
    );
    expect(written).toContain(
      "profiles\\1\\button_power=\"code:86,engine:keyboard\""
    );
  });

  // ── readCitraGamepadStatus ────────────────────────────────────────

  it("reports configExists=false when file is missing", () => {
    const status = readCitraGamepadStatus(CONFIG_PATH);
    expect(status.configExists).toBe(false);
    expect(status.hasControlsSection).toBe(false);
    expect(status.hasCustomGamepad).toBe(false);
    expect(status.currentGuid).toBe(null);
  });

  it("reports hasControlsSection=false when no [Controls] exists", () => {
    writeFileSync(CONFIG_PATH, "[UI]\nfullscreen=false\n", "utf-8");
    const status = readCitraGamepadStatus(CONFIG_PATH);
    expect(status.configExists).toBe(true);
    expect(status.hasControlsSection).toBe(false);
    expect(status.hasCustomGamepad).toBe(false);
  });

  it("reports hasCustomGamepad=false for a fresh (keyboard-only) section", () => {
    writeFileSync(CONFIG_PATH, FRESH_CONTROLS_SECTION, "utf-8");
    const status = readCitraGamepadStatus(CONFIG_PATH);
    expect(status.configExists).toBe(true);
    expect(status.hasControlsSection).toBe(true);
    expect(status.hasCustomGamepad).toBe(false);
    expect(status.currentGuid).toBe(null);
  });

  it("reports hasCustomGamepad=true and extracts the GUID after Auto-Assign", () => {
    writeFileSync(CONFIG_PATH, POST_AUTO_ASSIGN_PS, "utf-8");
    const status = readCitraGamepadStatus(CONFIG_PATH);
    expect(status.configExists).toBe(true);
    expect(status.hasControlsSection).toBe(true);
    expect(status.hasCustomGamepad).toBe(true);
    expect(status.currentGuid).toBe("03008fe54c050000c405000000016800");
  });

  it("ignores default=true bindings when detecting custom gamepad", () => {
    // Edge case: a binding value with engine:sdl but default=true should
    // NOT count as custom — Citra ignores the value when default is true.
    const input = [
      "[Controls]",
      "profile\\default=true",
      "profile=0",
      "profiles\\1\\button_a\\default=true",
      `profiles\\1\\button_a="button:0,engine:sdl,guid:deadbeefdeadbeefdeadbeefdeadbeef,port:0"`,
      "profiles\\size=1",
      "",
    ].join("\n");
    writeFileSync(CONFIG_PATH, input, "utf-8");

    const status = readCitraGamepadStatus(CONFIG_PATH);
    expect(status.hasCustomGamepad).toBe(false);
    expect(status.currentGuid).toBe(null);
  });
});
