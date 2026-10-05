import { describe, expect, it } from 'vitest';

import {
  badgesFor,
  checkInSourceId,
  computeAwards,
  dayOf,
  isQualifyingCheckIn,
  levelFor,
  REWARD_RULES,
  streakFor,
  type CheckInFact,
  type RewardFacts,
} from '../../src/modules/rewards/reward-rules';

const PARK = ['p0', 'p1', 'p2', 'p3', 'p4'];
const MIN = 60_000;

const checkIn = (id: string, parkId: string, startIso: string, minutes: number): CheckInFact => {
  const startedAt = new Date(startIso);
  return { id, parkId, startedAt, endedAt: new Date(startedAt.getTime() + minutes * MIN) };
};

const facts = (overrides: Partial<RewardFacts> = {}): RewardFacts => ({
  checkIns: [],
  plans: [],
  reviews: [],
  approvedPosts: [],
  qualifiedInvitees: [],
  existing: [],
  ...overrides,
});

describe('Tallinn days', () => {
  it('a day ends at midnight Tallinn time, not UTC (summer, UTC+3)', () => {
    expect(dayOf(new Date('2026-10-05T20:59:00Z'))).toBe('2026-10-05');
    expect(dayOf(new Date('2026-10-05T21:01:00Z'))).toBe('2026-10-06');
  });

  it('and in winter (UTC+2)', () => {
    expect(dayOf(new Date('2026-12-01T21:59:00Z'))).toBe('2026-12-01');
    expect(dayOf(new Date('2026-12-01T22:01:00Z'))).toBe('2026-12-02');
  });

  it('the 25-hour DST day (25 Oct 2026) is one day', () => {
    // 00:30 EEST and 23:30 EET are both 25 October.
    expect(dayOf(new Date('2026-10-24T21:30:00Z'))).toBe('2026-10-25');
    expect(dayOf(new Date('2026-10-25T21:30:00Z'))).toBe('2026-10-25');
    expect(dayOf(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-26');
  });
});

describe('qualifying check-ins', () => {
  it('needs at least 20 minutes', () => {
    expect(isQualifyingCheckIn(checkIn('a', 'p', '2026-10-05T07:00:00Z', 19.99))).toBe(false);
    expect(isQualifyingCheckIn(checkIn('a', 'p', '2026-10-05T07:00:00Z', 20))).toBe(true);
    expect(isQualifyingCheckIn(checkIn('a', 'p', '2026-10-05T07:00:00Z', -5))).toBe(false);
  });
});

describe('computeAwards: check-ins', () => {
  it('pays +5 per park per day, at most 3 per day, oldest first; short visits pay nothing', () => {
    const awards = computeAwards(
      facts({
        checkIns: [
          checkIn('c4', PARK[3]!, '2026-10-05T12:00:00Z', 30),
          checkIn('c1', PARK[0]!, '2026-10-05T07:00:00Z', 30),
          checkIn('c1b', PARK[0]!, '2026-10-05T08:00:00Z', 30), // same park, same day
          checkIn('c2', PARK[1]!, '2026-10-05T09:00:00Z', 30),
          checkIn('short', PARK[4]!, '2026-10-05T06:00:00Z', 10),
          checkIn('c3', PARK[2]!, '2026-10-05T10:00:00Z', 30),
        ],
      }),
    );
    const checkIns = awards.filter((a) => a.reason === 'check_in');
    expect(checkIns.map((a) => a.sourceId)).toEqual([checkInSourceId('p0', '2026-10-05'), checkInSourceId('p1', '2026-10-05'), checkInSourceId('p2', '2026-10-05')]);
    expect(checkIns.every((a) => a.delta === REWARD_RULES.checkIn.points && a.day === '2026-10-05')).toBe(true);
  });

  it('caps count what is already paid (recomputing never exceeds them)', () => {
    const existing = [
      { reason: 'check_in' as const, sourceId: checkInSourceId('p0', '2026-10-05'), day: '2026-10-05' },
      { reason: 'check_in' as const, sourceId: checkInSourceId('p1', '2026-10-05'), day: '2026-10-05' },
    ];
    const awards = computeAwards(
      facts({
        existing,
        checkIns: [checkIn('a', 'p0', '2026-10-05T07:00:00Z', 30), checkIn('b', 'p2', '2026-10-05T09:00:00Z', 30), checkIn('c', 'p3', '2026-10-05T10:00:00Z', 30)],
      }),
    );
    expect(awards.filter((a) => a.reason === 'check_in').map((a) => a.sourceId)).toEqual([checkInSourceId('p2', '2026-10-05')]);
  });

  it('is idempotent: the awards of a run, fed back as existing, give nothing new', () => {
    const input = facts({
      checkIns: [checkIn('a', 'p0', '2026-10-05T07:00:00Z', 30), checkIn('b', 'p0', '2026-10-06T07:00:00Z', 30)],
      reviews: [{ parkId: 'p0', createdAt: new Date('2026-10-05T08:00:00Z') }],
    });
    const first = computeAwards(input);
    expect(first.length).toBeGreaterThan(0);
    expect(computeAwards({ ...input, existing: first.map(({ reason, sourceId, day }) => ({ reason, sourceId, day })) })).toEqual([]);
  });

  it('a check-in after 21:00 UTC counts for the next Tallinn day (own cap)', () => {
    const awards = computeAwards(
      facts({
        checkIns: [
          checkIn('a', 'p0', '2026-10-05T07:00:00Z', 30),
          checkIn('b', 'p1', '2026-10-05T08:00:00Z', 30),
          checkIn('c', 'p2', '2026-10-05T09:00:00Z', 30),
          checkIn('late', 'p3', '2026-10-05T21:10:00Z', 30), // 00:10 on the 6th in Tallinn
        ],
      }),
    );
    expect(awards.filter((a) => a.reason === 'check_in').map((a) => a.day)).toEqual(['2026-10-05', '2026-10-05', '2026-10-05', '2026-10-06']);
  });
});

describe('computeAwards: streaks', () => {
  it('pays for each day that continues a streak, also across the DST change', () => {
    const awards = computeAwards(
      facts({
        checkIns: [
          checkIn('a', 'p0', '2026-10-24T07:00:00Z', 25),
          checkIn('b', 'p0', '2026-10-25T08:00:00Z', 25),
          checkIn('c', 'p0', '2026-10-26T08:00:00Z', 25),
          checkIn('gap', 'p0', '2026-10-28T08:00:00Z', 25),
        ],
      }),
    );
    expect(awards.filter((a) => a.reason === 'streak').map((a) => a.sourceId)).toEqual(['2026-10-25', '2026-10-26']);
  });

  it('a short visit does not keep a streak alive', () => {
    const awards = computeAwards(facts({ checkIns: [checkIn('a', 'p0', '2026-10-05T07:00:00Z', 30), checkIn('b', 'p0', '2026-10-06T07:00:00Z', 5)] }));
    expect(awards.some((a) => a.reason === 'streak')).toBe(false);
  });
});

describe('computeAwards: plans, reviews, posts, invites', () => {
  const plan = { id: 'plan1', parkId: 'p0', startsAt: new Date('2026-10-05T14:00:00Z'), endsAt: new Date('2026-10-05T15:00:00Z'), createdAt: new Date('2026-10-04T10:00:00Z') };

  it('a plan is honoured by a qualifying check-in in the same park around the planned time', () => {
    expect(computeAwards(facts({ plans: [plan], checkIns: [checkIn('a', 'p0', '2026-10-05T13:40:00Z', 30)] })).filter((a) => a.reason === 'plan_honoured')).toEqual([
      { reason: 'plan_honoured', sourceId: 'plan1', delta: 5, day: '2026-10-05' },
    ]);
  });

  it.each([
    ['another park', checkIn('a', 'p1', '2026-10-05T14:10:00Z', 30)],
    ['too early', checkIn('a', 'p0', '2026-10-05T13:20:00Z', 30)],
    ['after the plan', checkIn('a', 'p0', '2026-10-05T15:10:00Z', 30)],
    ['too short', checkIn('a', 'p0', '2026-10-05T14:10:00Z', 10)],
  ])('not honoured: %s', (_label, visit) => {
    expect(computeAwards(facts({ plans: [plan], checkIns: [visit] })).some((a) => a.reason === 'plan_honoured')).toBe(false);
  });

  it('a plan written after the check-in started does not count; at most one plan per day', () => {
    const late = { ...plan, createdAt: new Date('2026-10-05T14:30:00Z') };
    expect(computeAwards(facts({ plans: [late], checkIns: [checkIn('a', 'p0', '2026-10-05T14:10:00Z', 30)] })).some((a) => a.reason === 'plan_honoured')).toBe(false);
    const second = { ...plan, id: 'plan2', startsAt: new Date('2026-10-05T16:00:00Z'), endsAt: new Date('2026-10-05T17:00:00Z') };
    const awards = computeAwards(facts({ plans: [plan, second], checkIns: [checkIn('a', 'p0', '2026-10-05T14:10:00Z', 30), checkIn('b', 'p0', '2026-10-05T16:10:00Z', 30)] }));
    expect(awards.filter((a) => a.reason === 'plan_honoured').map((a) => a.sourceId)).toEqual(['plan1']);
  });

  it('first review per park, approved posts, qualified invitees (max 10)', () => {
    const invitees = Array.from({ length: 12 }, (_, i) => ({ inviteeId: `u${i}`, qualifiedAt: new Date(Date.UTC(2026, 9, 1, i)) }));
    const awards = computeAwards(
      facts({
        reviews: [{ parkId: 'p0', createdAt: new Date('2026-10-05T07:00:00Z') }],
        approvedPosts: [{ id: 'post1', approvedAt: new Date('2026-10-05T07:00:00Z') }],
        qualifiedInvitees: invitees,
        existing: [
          { reason: 'review', sourceId: 'p1', day: '2026-01-01' },
          { reason: 'invite', sourceId: 'old', day: '2026-01-01' },
        ],
      }),
    );
    expect(awards.filter((a) => a.reason === 'review')).toEqual([{ reason: 'review', sourceId: 'p0', delta: 5, day: '2026-10-05' }]);
    expect(awards.filter((a) => a.reason === 'place_post')).toEqual([{ reason: 'place_post', sourceId: 'post1', delta: 15, day: '2026-10-05' }]);
    const paidInvites = awards.filter((a) => a.reason === 'invite');
    expect(paidInvites).toHaveLength(9); // 1 already paid + 9 = the cap of 10
    expect(paidInvites[0]).toMatchObject({ sourceId: 'u0', delta: 25 });
  });

  it('empty facts give nothing', () => {
    expect(computeAwards(facts())).toEqual([]);
  });
});

describe('levels', () => {
  it.each([
    [0, 'puppy', 0, 'park_friend', 200, 0],
    [100, 'puppy', 0, 'park_friend', 100, 0.5],
    [199, 'puppy', 0, 'park_friend', 1, 0.995],
    [200, 'park_friend', 1, 'park_legend', 300, 0],
    [499, 'park_friend', 1, 'park_legend', 1, 0.997],
    [500, 'park_legend', 2, 'pack_leader', 500, 0],
  ])('%i points → %s', (points, id, index, nextId, toGo, progress) => {
    expect(levelFor(points)).toEqual({ id, index, minPoints: [0, 200, 500][index], next: { id: nextId, minPoints: points + toGo, pointsToGo: toGo }, progress });
  });

  it('the top level has no next and full progress; negative or fractional input is clamped', () => {
    expect(levelFor(5000)).toMatchObject({ id: 'pack_leader', next: null, progress: 1 });
    expect(levelFor(-10)).toMatchObject({ id: 'puppy', progress: 0 });
    expect(levelFor(Number.NaN)).toMatchObject({ id: 'puppy', progress: 0 });
  });
});

describe('streakFor', () => {
  const now = new Date('2026-10-05T07:00:00Z'); // 10.00 on 5 Oct in Tallinn

  it('counts back from today, or from yesterday when today has no visit yet', () => {
    expect(streakFor(['2026-10-05', '2026-10-04', '2026-10-03', '2026-10-01'], now).current).toBe(3);
    expect(streakFor(['2026-10-04', '2026-10-03'], now).current).toBe(2);
    expect(streakFor(['2026-10-03'], now).current).toBe(0);
    expect(streakFor([], now).current).toBe(0);
  });

  it('lists the last 7 days oldest first, ending today', () => {
    const { lastDays } = streakFor(['2026-10-05', '2026-09-29', '2026-09-28'], now);
    expect(lastDays.map((d) => d.date)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
    expect(lastDays.map((d) => d.active)).toEqual([true, false, false, false, false, false, true]);
  });

  it('uses the Tallinn date of "now" (late evening UTC is already tomorrow)', () => {
    expect(streakFor(['2026-10-06'], new Date('2026-10-05T21:30:00Z')).current).toBe(1);
  });

  it('a streak through the DST change is unbroken', () => {
    expect(streakFor(['2026-10-24', '2026-10-25', '2026-10-26'], new Date('2026-10-26T10:00:00Z')).current).toBe(3);
  });
});

describe('badges', () => {
  it('reports progress capped at the target and unlocks at it', () => {
    const badges = badgesFor({ hasEarlyCheckIn: true, distinctParks: 4, approvedPosts: 5, maxCheckInsInOnePark: 20 });
    expect(badges).toEqual([
      { id: 'early_bird', unlocked: true, progress: 1, target: 1 },
      { id: 'ten_parks', unlocked: false, progress: 4, target: 10 },
      { id: 'explorer', unlocked: true, progress: 3, target: 3 },
      { id: 'kadriorg_legend', unlocked: true, progress: 20, target: 20 },
    ]);
  });

  it('nothing done → all locked at 0', () => {
    expect(badgesFor({ hasEarlyCheckIn: false, distinctParks: 0, approvedPosts: 0, maxCheckInsInOnePark: 0 }).every((b) => !b.unlocked && b.progress === 0)).toBe(true);
  });
});
