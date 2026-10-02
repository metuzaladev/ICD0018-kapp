import { REWARD_BADGE_IDS, REWARD_LEVEL_IDS, REWARD_REASONS } from '@kapp/shared';
import { describe, expect, it } from 'vitest';

import en from '@/i18n/locales/en.json';
import et from '@/i18n/locales/et.json';
import ru from '@/i18n/locales/ru.json';
import {
  BADGE_ICON,
  badgeNameKey,
  badgeProgress,
  levelNameKey,
  levelNumber,
  pointsFor,
  REASON_ICON,
  reasonTitleKey,
  streakDays,
  weekdayLetterIn,
} from '@/lib/rewards';

const lookup = (table: unknown, key: string) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], table);

describe('level names', () => {
  it('maps every server level id to a name in all three languages', () => {
    for (const id of REWARD_LEVEL_IDS) {
      for (const table of [et, en, ru]) expect(typeof lookup(table, levelNameKey(id))).toBe('string');
    }
    expect(lookup(et, levelNameKey('park_friend'))).toBe('Pargisõber');
  });

  it('shows the 0-based server index as "tase 1…"', () => {
    expect(levelNumber(0)).toBe(1);
    expect(levelNumber(3)).toBe(4);
    expect(levelNumber(-1)).toBe(1);
  });

  it('names every badge and ledger reason, with an icon', () => {
    for (const id of REWARD_BADGE_IDS) {
      expect(BADGE_ICON[id]).toBeTruthy();
      for (const table of [et, en, ru]) expect(typeof lookup(table, badgeNameKey(id))).toBe('string');
    }
    for (const reason of REWARD_REASONS) {
      expect(REASON_ICON[reason]).toBeTruthy();
      for (const table of [et, en, ru]) expect(typeof lookup(table, reasonTitleKey(reason))).toBe('string');
    }
  });
});

describe('streak days', () => {
  const lastDays = [
    { date: '2026-09-26', active: true },
    { date: '2026-09-27', active: true },
    { date: '2026-09-28', active: false },
    { date: '2026-09-29', active: true },
    { date: '2026-09-30', active: true },
    { date: '2026-10-01', active: true },
    { date: '2026-10-02', active: false },
  ];

  it('keeps the server order (oldest first) and marks only the last day as today', () => {
    const days = streakDays(lastDays, (d) => d.slice(-2));
    expect(days.map((d) => d.letter)).toEqual(['26', '27', '28', '29', '30', '01', '02']);
    expect(days.filter((d) => d.isToday).map((d) => d.date)).toEqual(['2026-10-02']);
    expect(days.map((d) => d.active)).toEqual(lastDays.map((d) => d.active));
  });

  it('gives Estonian one-letter weekdays without shifting the calendar day by time zone', () => {
    const letter = weekdayLetterIn('et-EE');
    // 2026-09-28 is a Monday (esmaspäev), 2026-10-04 a Sunday (pühapäev).
    expect(letter('2026-09-28')).toBe('E');
    expect(letter('2026-10-04')).toBe('P');
  });
});

describe('amounts from the server', () => {
  it('reads the points for a reason from waysToEarn, null when missing', () => {
    const summary = { waysToEarn: [{ reason: 'place_post' as const, points: 15, dailyLimit: null }] };
    expect(pointsFor(summary, 'place_post')).toBe(15);
    expect(pointsFor(summary, 'invite')).toBeNull();
    expect(pointsFor(undefined, 'place_post')).toBeNull();
  });

  it('clamps badge progress to 0…1 and fills unlocked badges', () => {
    expect(badgeProgress({ unlocked: false, progress: 3, target: 10 })).toBeCloseTo(0.3);
    expect(badgeProgress({ unlocked: false, progress: 12, target: 10 })).toBe(1);
    expect(badgeProgress({ unlocked: true, progress: 0, target: 10 })).toBe(1);
    expect(badgeProgress({ unlocked: false, progress: 1, target: 0 })).toBe(0);
  });
});
