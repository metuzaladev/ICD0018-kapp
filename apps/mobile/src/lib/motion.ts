/**
 * Motion tokens (docs/14-animatsioonid-ja-ligipaasetavus.md#liikumise-pohimotted).
 *
 * Pure numbers, no Reanimated import, so they are unit-tested and shared by every animated
 * component. The values follow Apple HIG "Motion": brief (under 400 ms), purposeful (shows where
 * something came from or that an action worked) and never blocking input.
 */

/** Durations in milliseconds. */
export const Durations = {
  /** Colour or opacity change of a control (chip selected). */
  quick: 150,
  /** Content entering a screen. */
  standard: 250,
  /** A success mark — the one moment that may draw attention. */
  emphasized: 350,
} as const;

/** Delay between consecutive list rows entering. */
export const STAGGER_MS = 40;

/**
 * Rows after this index enter together: a long list must not take seconds to appear, and rows
 * below the fold are not seen animating anyway.
 */
export const MAX_STAGGERED_ROWS = 6;

/** Scale of a pressed row or button: a hint of depth, not a bounce. */
export const PRESS_SCALE = 0.97;

/** Spring for press feedback: critically damped enough not to wobble. */
export const PRESS_SPRING = { damping: 20, stiffness: 320, mass: 0.6 } as const;

/** Spring for the success mark: one gentle overshoot. */
export const POP_SPRING = { damping: 12, stiffness: 180 } as const;

/** Opacity range of a loading skeleton's pulse. */
export const SKELETON_OPACITY = { from: 0.45, to: 0.9 } as const;

/** Delay for the row at `index` in a staggered list; invalid indexes (negative, NaN) get none. */
export function staggerDelay(index: number): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.min(Math.floor(index), MAX_STAGGERED_ROWS) * STAGGER_MS;
}

/**
 * Duration to use for an animation: zero when the user asked iOS/Android to reduce motion, so
 * the end state appears immediately (WCAG 2.3.3, HIG "Reduce Motion").
 */
export function motionDuration(duration: number, reduceMotion: boolean): number {
  if (reduceMotion || !Number.isFinite(duration) || duration < 0) return 0;
  return duration;
}
