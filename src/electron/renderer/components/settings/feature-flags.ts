/**
 * Phase 13 feature flag.
 *
 * PR1 keeps this `false` — the app ships identical to `main` for users.
 * Devs can flip it to preview the new Settings shell. PR2's final commit
 * sets it to `true` and then removes the file entirely.
 */
export const NEW_SETTINGS_ENABLED = false;
