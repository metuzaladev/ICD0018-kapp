import * as Haptics from 'expo-haptics';

/**
 * The only place that plays haptics (docs/14-animatsioonid-ja-ligipaasetavus.md#haptika).
 *
 * Why one module: the app speaks a small, consistent haptic vocabulary (Apple HIG "Playing
 * haptics": use the system patterns for their documented meaning, never as decoration). Screens
 * call a reason, not a pattern, so "success" always feels the same and a reviewer can see every
 * kind of call site in one table.
 *
 * | Reason      | Pattern                 | Call sites                                                |
 * |-------------|-------------------------|-----------------------------------------------------------|
 * | `selection` | selectionAsync          | Chips, segmented scopes, rating stars, favourite toggle   |
 * | `success`   | notification Success    | Check-in, booking confirmed, review saved                 |
 * | `warning`   | notification Warning    | Just before a destructive confirmation (delete, cancel)   |
 * | `error`     | notification Error      | A submit the server rejected                              |
 *
 * Haptics are feedback, never information: everything they signal is also visible and announced
 * by VoiceOver. A failure (no Taptic Engine, Low Power Mode, web without vibration) is ignored —
 * the action itself has already happened.
 */
export type HapticReason = 'selection' | 'success' | 'warning' | 'error';

const PLAY: Record<HapticReason, () => Promise<void>> = {
  selection: () => Haptics.selectionAsync(),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};

/** Plays the pattern for `reason`; never throws and never rejects (fire and forget). */
export function haptic(reason: HapticReason): void {
  const play = PLAY[reason];
  if (!play) return;
  try {
    play().catch(() => undefined);
  } catch {
    // The native module can throw synchronously when it is missing (an old development build).
  }
}
