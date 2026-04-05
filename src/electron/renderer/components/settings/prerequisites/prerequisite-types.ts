import type { SettingsContext } from "../../../schemas/settings-schema-types";

export type PrerequisiteSeverity = "error" | "warning" | "ok";

export interface PrerequisiteCheckResult {
  severity: PrerequisiteSeverity;
  detail?: string;
}

export interface Prerequisite {
  id: string;
  emulatorId: string;
  title: string;
  description: string;
  legalNote?: string;
  check: (ctx: SettingsContext) => Promise<PrerequisiteCheckResult>;
  actionLabel?: string;
  action?: (ctx: SettingsContext) => void | Promise<void>;
  docsUrl?: string;
}
