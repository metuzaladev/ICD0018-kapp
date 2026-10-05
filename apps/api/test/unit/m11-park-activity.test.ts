import { parkActivityQuerySchema } from '@kapp/shared';
import { describe, expect, it } from 'vitest';

import { TimeoutError } from '../../src/lib/timeout';
import { bucketPlans, dayPartWindows, MAX_NAMED_FRIENDS, zonedHourToInstant, type PlanFact } from '../../src/modules/park-activity/day-parts';
import { createParkActivityService } from '../../src/modules/park-activity/park-activity.service';
import { mockParkActivityRepository, PARK_ID } from '../helpers';

const iso = (d: Date) => d.toISOString();
const OTHER_PARK = '7f1c1e0a-3b2d-4c5e-9f00-112233445566';

describe('zonedHourToInstant (Europe/Tallinn)', () => {
  it('winter is UTC+2, summer UTC+3', () => {
    expect(iso(zonedHourToInstant('2026-01-15', 12, 'Europe/Tallinn'))).toBe('2026-01-15T10:00:00.000Z');
    expect(iso(zonedHourToInstant('2026-07-15', 12, 'Europe/Tallinn'))).toBe('2026-07-15T09:00:00.000Z');
  });

  it('local midnight before and after the spring-forward night (29 Mar 2026, 03:00 → 04:00)', () => {
    expect(iso(zonedHourToInstant('2026-03-29', 0, 'Europe/Tallinn'))).toBe('2026-03-28T22:00:00.000Z');
    expect(iso(zonedHourToInstant('2026-03-29', 12, 'Europe/Tallinn'))).toBe('2026-03-29T09:00:00.000Z');
    expect(iso(zonedHourToInstant('2026-03-30', 0, 'Europe/Tallinn'))).toBe('2026-03-29T21:00:00.000Z');
  });

  it('local midnight around the fall-back night (25 Oct 2026, 04:00 → 03:00)', () => {
    expect(iso(zonedHourToInstant('2026-10-25', 0, 'Europe/Tallinn'))).toBe('2026-10-24T21:00:00.000Z');
    expect(iso(zonedHourToInstant('2026-10-25', 17, 'Europe/Tallinn'))).toBe('2026-10-25T15:00:00.000Z');
    expect(iso(zonedHourToInstant('2026-10-26', 0, 'Europe/Tallinn'))).toBe('2026-10-25T22:00:00.000Z');
  });
});

describe('dayPartWindows', () => {
  it('splits a normal day into 00–12, 12–17, 17–24 local time', () => {
    const { date, windows } = dayPartWindows(new Date('2026-10-05T08:00:00Z'));
    expect(date).toBe('2026-10-05');
    expect(windows.map((w) => [w.part, iso(w.start), iso(w.end)])).toEqual([
      ['morning', '2026-10-04T21:00:00.000Z', '2026-10-05T09:00:00.000Z'],
      ['day', '2026-10-05T09:00:00.000Z', '2026-10-05T14:00:00.000Z'],
      ['evening', '2026-10-05T14:00:00.000Z', '2026-10-05T21:00:00.000Z'],
    ]);
  });

  it('uses the Tallinn date, not the UTC date, just after local midnight', () => {
    // 22:30 UTC on the 5th is 01:30 on the 6th in Tallinn (summer time).
    expect(dayPartWindows(new Date('2026-10-05T22:30:00Z')).date).toBe('2026-10-06');
    // 21:30 UTC on 31 Dec is 23:30 in Tallinn (winter time): still the old year.
    expect(dayPartWindows(new Date('2026-12-31T21:30:00Z')).date).toBe('2026-12-31');
  });

  it('the spring-forward day is 23 hours long and the morning is one hour shorter', () => {
    const { windows } = dayPartWindows(new Date('2026-03-29T12:00:00Z'));
    const hours = (w: { start: Date; end: Date }) => (w.end.getTime() - w.start.getTime()) / 3_600_000;
    expect(windows.map(hours)).toEqual([11, 5, 7]);
  });

  it('the fall-back day is 25 hours long and the morning one hour longer', () => {
    const { windows } = dayPartWindows(new Date('2026-10-25T12:00:00Z'));
    expect(windows.map((w) => (w.end.getTime() - w.start.getTime()) / 3_600_000)).toEqual([13, 5, 7]);
  });
});

describe('bucketPlans', () => {
  const { windows } = dayPartWindows(new Date('2026-10-05T06:00:00Z')); // 09:00 Tallinn
  const now = new Date('2026-10-05T06:00:00Z');
  const plan = (userId: string, from: string, to: string, friendName: string | null = null): PlanFact => ({
    parkId: PARK_ID,
    userId,
    // Local Tallinn times on 5 Oct 2026 (UTC+3).
    startsAt: new Date(`2026-10-05T${from}:00+03:00`),
    endsAt: new Date(`2026-10-05T${to}:00+03:00`),
    friendName,
  });

  it('counts each plan in every part it overlaps', () => {
    const result = bucketPlans([plan('a', '10:00', '11:00'), plan('b', '16:30', '17:30'), plan('c', '18:00', '19:00')], windows, now);
    expect(result.planned).toEqual({ morning: 1, day: 1, evening: 2 });
  });

  it('boundaries are half-open: a plan ending at 12.00 is morning only, one starting at 17.00 evening only', () => {
    const result = bucketPlans([plan('a', '11:00', '12:00'), plan('b', '17:00', '18:00')], windows, now);
    expect(result.planned).toEqual({ morning: 1, day: 0, evening: 1 });
  });

  it('counts a person once per part even with two plans', () => {
    const result = bucketPlans([plan('a', '17:00', '18:00'), plan('a', '19:00', '20:00')], windows, now);
    expect(result.planned.evening).toBe(1);
  });

  it('ignores plans that are already over and parts that have ended', () => {
    const afternoon = new Date('2026-10-05T13:00:00Z'); // 16:00 Tallinn
    const result = bucketPlans([plan('a', '08:00', '09:00'), plan('b', '15:00', '16:30'), plan('c', '18:00', '19:00')], windows, afternoon);
    expect(result.planned).toEqual({ morning: 0, day: 1, evening: 1 });
  });

  it('a plan past midnight still counts for this evening', () => {
    const late: PlanFact = { ...plan('a', '23:00', '23:30'), endsAt: new Date('2026-10-06T00:30:00+03:00') };
    expect(bucketPlans([late], windows, now).planned.evening).toBe(1);
  });

  it('names friends once, with the first part they come in, and only friends', () => {
    const result = bucketPlans(
      [plan('a', '10:00', '11:00', 'Mari'), plan('a', '18:00', '19:00', 'Mari'), plan('b', '18:00', '19:00'), plan('c', '18:30', '19:30', 'Jaan')],
      windows,
      now,
    );
    expect(result.friends).toEqual([
      { firstName: 'Mari', part: 'morning' },
      { firstName: 'Jaan', part: 'evening' },
    ]);
  });

  it(`names at most ${MAX_NAMED_FRIENDS} friends`, () => {
    const many = Array.from({ length: 8 }, (_, i) => plan(`f${i}`, '18:00', '19:00', `Sõber${i}`));
    const result = bucketPlans(many, windows, now);
    expect(result.friends).toHaveLength(MAX_NAMED_FRIENDS);
    expect(result.planned.evening).toBe(8);
  });
});

describe('parkActivityQuerySchema', () => {
  it('accepts 1–10 uuids, drops duplicates and keeps the order', () => {
    expect(parkActivityQuerySchema.parse({ ids: `${OTHER_PARK},${PARK_ID},${OTHER_PARK}` }).ids).toEqual([OTHER_PARK, PARK_ID]);
  });

  it.each([[''], ['not-a-uuid'], [Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`).join(',')]])(
    'rejects %j',
    (ids) => {
      expect(parkActivityQuerySchema.safeParse({ ids }).success).toBe(false);
    },
  );

  it('rejects a missing ids parameter', () => {
    expect(parkActivityQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe('ParkActivityService', () => {
  const now = () => new Date('2026-10-05T06:00:00Z');

  it('returns public parks in the requested order with their buckets; unknown ids are left out', async () => {
    const repository = mockParkActivityRepository();
    repository.findPublicParks.mockResolvedValue([
      { id: PARK_ID, name: 'Kadrioru koertepark', activeDogs: 3 },
      { id: OTHER_PARK, name: 'Lasnamäe koertepark', activeDogs: 0 },
    ]);
    repository.visiblePlans.mockResolvedValue([
      { parkId: OTHER_PARK, userId: 'u1', startsAt: new Date('2026-10-05T15:00:00Z'), endsAt: new Date('2026-10-05T16:00:00Z'), friendName: 'Mari' },
    ]);
    const service = createParkActivityService({ repository, timeoutMs: 1000, now });
    const missing = '11111111-1111-4111-8111-111111111111';
    const result = await service.today('viewer', [OTHER_PARK, missing, PARK_ID]);
    expect(result.date).toBe('2026-10-05');
    expect(result.parks).toEqual([
      { id: OTHER_PARK, name: 'Lasnamäe koertepark', activeDogs: 0, planned: { morning: 0, day: 0, evening: 1 }, friends: [{ firstName: 'Mari', part: 'evening' }] },
      { id: PARK_ID, name: 'Kadrioru koertepark', activeDogs: 3, planned: { morning: 0, day: 0, evening: 0 }, friends: [] },
    ]);
    // The plan query covers the whole Tallinn day and only the public parks.
    expect(repository.visiblePlans).toHaveBeenCalledWith('viewer', [PARK_ID, OTHER_PARK], new Date('2026-10-04T21:00:00Z'), new Date('2026-10-05T21:00:00Z'));
  });

  it('skips the plan query when no requested park is public', async () => {
    const repository = mockParkActivityRepository();
    repository.findPublicParks.mockResolvedValue([]);
    const result = await createParkActivityService({ repository, timeoutMs: 1000, now }).today('viewer', [PARK_ID]);
    expect(result.parks).toEqual([]);
    expect(repository.visiblePlans).not.toHaveBeenCalled();
  });

  it('times out with TimeoutError (→ 503)', async () => {
    const repository = mockParkActivityRepository();
    repository.findPublicParks.mockReturnValue(new Promise(() => {}));
    await expect(createParkActivityService({ repository, timeoutMs: 5, now }).today('viewer', [PARK_ID])).rejects.toBeInstanceOf(TimeoutError);
  });
});
