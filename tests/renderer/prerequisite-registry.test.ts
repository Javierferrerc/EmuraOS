import { describe, it, expect } from "vitest";
import {
  PREREQUISITES,
  getPrerequisitesForEmulator,
} from "../../src/electron/renderer/components/settings/prerequisites/registry";

describe("prerequisite registry", () => {
  it("exports at least one prerequisite", () => {
    expect(PREREQUISITES.length).toBeGreaterThan(0);
  });

  it("every prerequisite has required fields", () => {
    for (const p of PREREQUISITES) {
      expect(p.id).toBeTruthy();
      expect(p.emulatorId).toBeTruthy();
      expect(p.title).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(typeof p.check).toBe("function");
    }
  });

  it("getPrerequisitesForEmulator returns cemu prerequisites", () => {
    const cemuPrereqs = getPrerequisitesForEmulator("cemu");
    expect(cemuPrereqs.length).toBeGreaterThanOrEqual(1);
    expect(cemuPrereqs[0].id).toBe("wiiu-cemu-keys");
  });

  it("getPrerequisitesForEmulator returns empty for unknown emulator", () => {
    const prereqs = getPrerequisitesForEmulator("nonexistent");
    expect(prereqs).toEqual([]);
  });
});
