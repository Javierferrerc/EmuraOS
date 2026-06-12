/** Shared NEXUS UI types. */

/** Home view layout: "hero" = featured banner + carousels; "grid" = plain
 *  responsive grid. (The design also defines a carousel-only and console
 *  nav variant; those are future tweakables.) */
export type NexusLayout = "hero" | "grid";

/** Directional navigation intents shared by keyboard + gamepad. */
export type NavDir = "up" | "down" | "left" | "right" | "activate" | "favorite";

/** Imperative handle the shell uses to drive the home grid's 2D focus.
 *  Returns "escape-up" / "escape-left" when focus tries to leave the content
 *  past its top/left edge, so the shell can hand focus to the platform rail. */
export interface NexusHomeHandle {
  handleAction(dir: NavDir): "ok" | "escape-up" | "escape-left";
}
