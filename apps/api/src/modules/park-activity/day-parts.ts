import { DAY_PART_START_HOUR, DAY_PARTS, type DayPart, type ParkActivity } from '@kapp/shared';

import { addDays, localDate } from '../../lib/calendar';

/**
 * Pure rules for "Lemmikparkides täna" (M11, docs/18): today's parts of day in Europe/Tallinn as
 * instants, and planned visits bucketed into them. No database, no clock — unit-tested across
 * midnight and both daylight-saving changes.
 */

export const TIME_ZONE = 'Europe/Tallinn';

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (Tallinn: +2 h winter, +3 h summer). */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  let format = offsetFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    offsetFormatters.set(timeZone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(instant).map((p) => [p.type, p.value]));
  const wallAsUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `timeZone` shows `date` `hour`:00. Two passes settle the
 * offset when the guess falls on the other side of a DST change. Only whole hours 0, 12 and 17 are
 * asked for here, none of which is skipped or repeated in Tallinn (changes happen at 03:00/04:00).
 */
export function zonedHourToInstant(date: string, hour: number, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, hour);
  let instant = wall - zoneOffsetMs(new Date(wall), timeZone);
  instant = wall - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

export type DayPartWindow = { part: DayPart; start: Date; end: Date };

/**
 * Today's three parts as half-open intervals [start, end): hommik 00–12, päev 12–17, õhtu 17–24.
 * "Today" is the Tallinn calendar day of `now`; the evening ends at the next local midnight, so a
 * 23- or 25-hour DST day is still one day.
 */
export function dayPartWindows(now: Date, timeZone = TIME_ZONE): { date: string; windows: DayPartWindow[] } {
  const date = localDate(now, timeZone);
  const next = addDays(date, 1);
  const windows = DAY_PARTS.map((part, i) => {
    const nextPart = DAY_PARTS[i + 1];
    return {
      part,
      start: zonedHourToInstant(date, DAY_PART_START_HOUR[part], timeZone),
      end: nextPart ? zonedHourToInstant(date, DAY_PART_START_HOUR[nextPart], timeZone) : zonedHourToInstant(next, 0, timeZone),
    };
  });
  return { date, windows };
}

/**
 * One planned visit as the repository returns it — already filtered by presence sharing and blocks.
 * `userId` is only used to count a person once; `friendName` is set only for accepted friends.
 */
export type PlanFact = { parkId: string; userId: string; startsAt: Date; endsAt: Date; friendName: string | null };

/** At most this many friends are named per park; the rest are in the counts. */
export const MAX_NAMED_FRIENDS = 5;

/**
 * Counts, per part of today, the people with a plan overlapping that part and not yet over. A plan
 * across a boundary (16.30–17.30) counts in both parts — each number answers "who is there in the
 * afternoon / evening". A part that has already ended is always 0.
 */
export function bucketPlans(plans: readonly PlanFact[], windows: readonly DayPartWindow[], now: Date): Pick<ParkActivity, 'planned' | 'friends'> {
  const planned = { morning: 0, day: 0, evening: 0 } satisfies Record<DayPart, number>;
  const friends: ParkActivity['friends'] = [];
  const namedFriends = new Set<string>();
  for (const { part, start, end } of windows) {
    if (end <= now) continue;
    const people = new Set<string>();
    for (const plan of plans) {
      if (plan.startsAt >= end || plan.endsAt <= start || plan.endsAt <= now) continue;
      people.add(plan.userId);
      if (plan.friendName !== null && !namedFriends.has(plan.userId) && friends.length < MAX_NAMED_FRIENDS) {
        namedFriends.add(plan.userId);
        friends.push({ firstName: plan.friendName, part });
      }
    }
    planned[part] = people.size;
  }
  return { planned, friends };
}
