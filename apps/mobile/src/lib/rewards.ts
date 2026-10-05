import type { RewardBadgeId, RewardLevelId, RewardReason, RewardsSummary } from '@kapp/shared';

import type { IconName } from '@/components/icon-sources';

/**
 * Pure helpers for the Käpad screen (docs/16-avasta-ja-kapad.md). Amounts, levels and limits always
 * come from the server (GET /me/rewards); this file only maps ids to i18n keys and icons.
 * Unit-tested in test/rewards.test.ts.
 */

/** i18n key of a level name ("Pargisõber"); the server sends only the id. */
export function levelNameKey(id: RewardLevelId) {
  return `rewards.levels.${id}` as const;
}

/** "Tase 2": the server's index is 0-based. */
export function levelNumber(index: number): number {
  return Math.max(0, Math.floor(index)) + 1;
}

export function badgeNameKey(id: RewardBadgeId) {
  return `rewards.badges.${id}.name` as const;
}

export function badgeBodyKey(id: RewardBadgeId) {
  return `rewards.badges.${id}.body` as const;
}

export const BADGE_ICON: Record<RewardBadgeId, IconName> = {
  early_bird: 'sun',
  ten_parks: 'trees',
  explorer: 'compass',
  kadriorg_legend: 'trophy',
};

/** "Kuidas teenida" and history rows: icon + i18n key per ledger reason. */
export const REASON_ICON: Record<RewardReason, IconName> = {
  check_in: 'map-pin',
  streak: 'flame',
  plan_honoured: 'calendar',
  review: 'star',
  place_post: 'sparkles',
  invite: 'users',
  redemption: 'ticket',
  redemption_refund: 'gift',
};

export function reasonTitleKey(reason: RewardReason) {
  return `rewards.reasons.${reason}.title` as const;
}

export function reasonBodyKey(reason: RewardReason) {
  return `rewards.reasons.${reason}.body` as const;
}

/** The points one approved recommendation earns, from the server's rule table (null if missing). */
export function pointsFor(summary: Pick<RewardsSummary, 'waysToEarn'> | undefined, reason: RewardReason): number | null {
  return summary?.waysToEarn.find((w) => w.reason === reason)?.points ?? null;
}

/** Badge progress 0…1 for the progress bar (the server caps `progress` at `target` once unlocked). */
export function badgeProgress(badge: { unlocked: boolean; progress: number; target: number }): number {
  if (badge.unlocked) return 1;
  if (!(badge.target > 0)) return 0;
  return Math.min(1, Math.max(0, badge.progress / badge.target));
}

export type StreakDay = { date: string; active: boolean; isToday: boolean; letter: string };

/**
 * The streak card's seven paws (Figma "Streak Tile"): oldest first, the last is today. `weekdayLetter`
 * gets the calendar date ("2026-10-02") and returns its one-letter weekday in the app language
 * (Intl `weekday: 'narrow'`, et: E T K N R L P); injected so the logic is testable without Intl data.
 */
export function streakDays(lastDays: readonly { date: string; active: boolean }[], weekdayLetter: (isoDate: string) => string): StreakDay[] {
  return lastDays.map((day, i) => ({ ...day, isToday: i === lastDays.length - 1, letter: weekdayLetter(day.date) }));
}

/**
 * One-letter weekday of a calendar date. The date is a Tallinn calendar day without a time, so it is
 * read and formatted in UTC: no time zone can shift it to the neighbouring day.
 */
export function weekdayLetterIn(localeTag: string) {
  const format = new Intl.DateTimeFormat(localeTag, { weekday: 'narrow', timeZone: 'UTC' });
  return (isoDate: string) => format.format(new Date(`${isoDate}T12:00:00Z`)).toLocaleUpperCase(localeTag);
}
