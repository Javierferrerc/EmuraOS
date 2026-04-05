import type { ComponentType } from "react";
import type { AppConfig } from "../../../core/types";

/**
 * Phase 13 schema-driven settings types.
 *
 * Each Settings row is a plain data object — not bespoke JSX — so that the
 * same schema can drive the Settings shell, the first-run wizard, and the
 * eventual prerequisite cards without duplication.
 *
 * `SettingsContext` is the host environment passed to every row's `get` /
 * `set` / `run` closure. PR1 exposes only `config` + `updateConfig`; PR2
 * extends it with readiness, downloads, virtual keyboard, etc.
 */

export type SettingValue = string | number | boolean;

export interface SettingsContext {
  config: AppConfig | null;
  updateConfig: (partial: Partial<AppConfig>) => Promise<void>;
  // PR2 will extend this with: readinessReport, driveEmulators,
  // downloadEmulator, detectEmulators, openCemuKeysModal, virtualKeyboard,
  // refreshScan, startFetchingCovers, startScraping, etc.
}

interface BaseSetting {
  /** Stable identifier — used for focus restore and React keys. */
  id: string;
  label: string;
  description?: string;
  hidden?: boolean;
  disabled?: boolean | ((ctx: SettingsContext) => boolean);
}

export interface ToggleSetting extends BaseSetting {
  kind: "toggle";
  get: (ctx: SettingsContext) => boolean;
  set: (value: boolean, ctx: SettingsContext) => Promise<void> | void;
}

export interface DropdownOption<V extends SettingValue = string> {
  value: V;
  label: string;
}

export interface DropdownSetting<V extends SettingValue = string>
  extends BaseSetting {
  kind: "dropdown";
  options: Array<DropdownOption<V>>;
  get: (ctx: SettingsContext) => V;
  set: (value: V, ctx: SettingsContext) => Promise<void> | void;
}

export interface SliderSetting extends BaseSetting {
  kind: "slider";
  min: number;
  max: number;
  step?: number;
  get: (ctx: SettingsContext) => number;
  set: (value: number, ctx: SettingsContext) => Promise<void> | void;
}

export interface ButtonSetting extends BaseSetting {
  kind: "button";
  variant?: "primary" | "danger" | "ghost";
  confirmLabel?: string;
  run: (ctx: SettingsContext) => Promise<void> | void;
  /** Optional status string shown next to the button (e.g. "Saved!"). */
  status?: (ctx: SettingsContext) => string | null;
}

export interface InfoSetting extends BaseSetting {
  kind: "info";
  value: (ctx: SettingsContext) => string;
  tone?: "default" | "good" | "warn" | "bad";
}

export interface FolderSetting extends BaseSetting {
  kind: "folder";
  get: (ctx: SettingsContext) => string;
  set: (value: string, ctx: SettingsContext) => Promise<void> | void;
}

export interface PathSetting extends BaseSetting {
  kind: "path";
  get: (ctx: SettingsContext) => string;
  set: (value: string, ctx: SettingsContext) => Promise<void> | void;
  /** When true, renders as a password-style masked input. */
  secret?: boolean;
}

export type Setting =
  | ToggleSetting
  | DropdownSetting
  | SliderSetting
  | ButtonSetting
  | InfoSetting
  | FolderSetting
  | PathSetting;

export interface SettingsGroup {
  id: string;
  title?: string;
  description?: string;
  collapsible?: boolean;
  rows: Setting[];
}

export interface SettingsTab {
  id: string;
  label: string;
  groups: SettingsGroup[];
}

export interface SettingsSection {
  id: string;
  path: string;
  label: string;
  icon?: string;
  /**
   * A section can be a simple list of groups, a tabbed view, or a custom
   * component (escape hatch used by Emuladores in PR2). Exactly one of
   * `groups`, `tabs`, or `customComponent` should be set.
   */
  tabs?: SettingsTab[];
  groups?: SettingsGroup[];
  customComponent?: ComponentType<{ ctx: SettingsContext }>;
}

export function isDisabled(
  setting: BaseSetting,
  ctx: SettingsContext
): boolean {
  if (typeof setting.disabled === "function") return setting.disabled(ctx);
  return Boolean(setting.disabled);
}
