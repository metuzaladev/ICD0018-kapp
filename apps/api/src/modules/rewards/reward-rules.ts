import type { RewardBadgeId, RewardLevel, RewardLevelId, RewardReason, RewardsSummary } from '@kapp/shared';

import { addDays, localDate } from '../../lib/calendar';

/**
 * Käpad earning rules — the single place where amounts and limits live (docs/16-avasta-ja-kapad.md).
 * Everything here is a pure function of facts read from the database, so the rules are unit-tested
 * without a database and the same facts always give the same awards (which is what makes awarding
 * retry-safe: the service can recompute at any time and the ledger's unique key drops repeats).
 *
 * Why these rules (anti-cheat):
 * - Points come only from things the server itself observed (check-ins, plans, reviews, approved
 *   posts, an invitee's own check-in). The app never sends a points amount.
 * - A check-in only counts once it is over and lasted at least 20 minutes: a quick "check in, check
 *   out" loop earns nothing, and the cap (1 per park, 3 per day) bounds what a script can farm.
 * - Reviews pay once per park (not per edit); posts pay on approval, after a human looked at them.
 * - Invites pay when the invitee has a qualifying check-in of their own, not on sign-up, so fake
 *   accounts are worthless unless they really go to a park; and at most 10 invites pay.
 */

export const TIME_ZONE = 'Europe/Tallinn';

export const REWARD_RULES = {
  checkIn: { points: 5, minMinutes: 20, perParkPerDay: 1, perDay: 3 },
  /** A planned visit honoured by a qualifying check-in in the same park around the planned time. */
  planHonoured: { points: 5, perDay: 1, earlyMinutes: 30 },
  placePost: { points: 15 },
  review: { points: 5 },
  invite: { points: 25, maxRewarded: 10, claimWindowDays: 14 },
  /** For every day that continues a streak (a qualifying check-in today and yesterday). */
  streak: { points: 5 },
} as const;

/**
 * Awards are computed for facts of the last two weeks only. That bounds each recomputation, and every
 * fact is settled long before it falls out of the window (check-ins and the rewards screen settle).
 */
export const SETTLE_WINDOW_DAYS = 14;

const LEVELS: readonly { id: RewardLevelId; minPoints: number }[] = [
  { id: 'puppy', minPoints: 0 },
  { id: 'park_friend', minPoints: 200 },
  { id: 'park_legend', minPoints: 500 },
  { id: 'pack_leader', minPoints: 1000 },
];

const BADGE_TARGETS: Record<RewardBadgeId, number> = {
  /** A qualifying check-in that started before 08:00 Tallinn time. */
  early_bird: 1,
  /** Distinct parks with a qualifying check-in. */
  ten_parks: 10,
  /** Approved place posts. */
  explorer: 3,
  /** Qualifying check-ins in one and the same park (named after Kadriorg in Figma). */
  kadriorg_legend: 20,
};
export const WAYS_TO_EARN: RewardsSummary['waysToEarn'] = [
  { reason: 'check_in', points: REWARD_RULES.checkIn.points, dailyLimit: REWARD_RULES.checkIn.perDay },
  { reason: 'streak', points: REWARD_RULES.streak.points, dailyLimit: 1 },
  { reason: 'plan_honoured', points: REWARD_RULES.planHonoured.points, dailyLimit: REWARD_RULES.planHonoured.perDay },
  { reason: 'review', points: REWARD_RULES.review.points, dailyLimit: null },
  { reason: 'place_post', points: REWARD_RULES.placePost.points, dailyLimit: null },
  { reason: 'invite', points: REWARD_RULES.invite.points, dailyLimit: null },
];

/* ---------- facts ---------- */

export interface CheckInFact {
  id: string;
  parkId: string;
  startedAt: Date;
  /** When it actually ended: ended_at, or expires_at for one that ran out. Only finished ones are facts. */
  endedAt: Date;
}

export interface PlanFact {
  id: string;
  parkId: string;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
}

export interface ExistingEntry {
  reason: RewardReason;
  sourceId: string;
  /** "2026-10-02" (Tallinn). */
  day: string;
}

export interface RewardFacts {
  /** Finished check-ins inside the settle window (any length; the rules filter). */
  checkIns: CheckInFact[];
  /** Plans inside the window that have ended. */
  plans: PlanFact[];
  /** The user's reviews (one per park). */
  reviews: { parkId: string; createdAt: Date }[];
  approvedPosts: { id: string; approvedAt: Date }[];
  /** People this user invited who have a qualifying check-in, with the first one's end time. */
  qualifiedInvitees: { inviteeId: string; qualifiedAt: Date }[];
  /** Earning entries already in the ledger (all time for reviews/posts/invites, window for the rest). */
  existing: ExistingEntry[];
}

export interface Award {
  reason: RewardReason;
  sourceId: string;
  delta: number;
  day: string;
}

const minutes = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 60_000;

export function isQualifyingCheckIn(c: Pick<CheckInFact, 'startedAt' | 'endedAt'>): boolean {
  return minutes(c.startedAt, c.endedAt) >= REWARD_RULES.checkIn.minMinutes;
}

export const dayOf = (instant: Date) => localDate(instant, TIME_ZONE);

/** Source id of a check-in award: one park, one Tallinn day — the per-park cap is the unique key. */
export const checkInSourceId = (parkId: string, day: string) => `${parkId}:${day}`;

/**
 * Everything the facts entitle the user to that is not in the ledger yet. Caps count what is
 * already paid, so recomputing after a partial failure never exceeds them.
 */
export function computeAwards(facts: RewardFacts): Award[] {
  const awards: Award[] = [];
  const paid = new Set(facts.existing.map((e) => `${e.reason}|${e.sourceId}`));
  const perDay = new Map<string, number>();
  const bump = (reason: RewardReason, day: string) => perDay.set(`${reason}|${day}`, (perDay.get(`${reason}|${day}`) ?? 0) + 1);
  const countOn = (reason: RewardReason, day: string) => perDay.get(`${reason}|${day}`) ?? 0;
  for (const e of facts.existing) bump(e.reason, e.day);

  const give = (reason: RewardReason, sourceId: string, delta: number, day: string) => {
    paid.add(`${reason}|${sourceId}`);
    bump(reason, day);
    awards.push({ reason, sourceId, delta, day });
  };

  // Check-ins: oldest first, so the first three of a day are the ones that pay.
  const qualifying = facts.checkIns.filter(isQualifyingCheckIn).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  for (const c of qualifying) {
    const day = dayOf(c.startedAt);
    const sourceId = checkInSourceId(c.parkId, day);
    if (paid.has(`check_in|${sourceId}`)) continue;
    if (countOn('check_in', day) >= REWARD_RULES.checkIn.perDay) continue;
    give('check_in', sourceId, REWARD_RULES.checkIn.points, day);
  }

  // Plans: honoured by a qualifying check-in in the same park that started between 30 min before the
  // plan and its end — and after the plan was made, so a plan cannot be written after the fact.
  const plans = [...facts.plans].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  for (const plan of plans) {
    if (paid.has(`plan_honoured|${plan.id}`)) continue;
    const day = dayOf(plan.startsAt);
    if (countOn('plan_honoured', day) >= REWARD_RULES.planHonoured.perDay) continue;
    const windowStart = plan.startsAt.getTime() - REWARD_RULES.planHonoured.earlyMinutes * 60_000;
    const honoured = qualifying.some(
      (c) =>
        c.parkId === plan.parkId &&
        c.startedAt.getTime() >= windowStart &&
        c.startedAt.getTime() <= plan.endsAt.getTime() &&
        c.startedAt.getTime() >= plan.createdAt.getTime(),
    );
    if (honoured) give('plan_honoured', plan.id, REWARD_RULES.planHonoured.points, day);
  }

  // First review per park: the park is the source, so re-writing or re-creating a review pays nothing.
  for (const r of facts.reviews) {
    if (!paid.has(`review|${r.parkId}`)) give('review', r.parkId, REWARD_RULES.review.points, dayOf(r.createdAt));
  }

  for (const p of facts.approvedPosts) {
    if (!paid.has(`place_post|${p.id}`)) give('place_post', p.id, REWARD_RULES.placePost.points, dayOf(p.approvedAt));
  }

  let invitesPaid = facts.existing.filter((e) => e.reason === 'invite').length;
  const invitees = [...facts.qualifiedInvitees].sort((a, b) => a.qualifiedAt.getTime() - b.qualifiedAt.getTime());
  for (const i of invitees) {
    if (paid.has(`invite|${i.inviteeId}`)) continue;
    if (invitesPaid >= REWARD_RULES.invite.maxRewarded) break;
    give('invite', i.inviteeId, REWARD_RULES.invite.points, dayOf(i.qualifiedAt));
    invitesPaid++;
  }

  // Streak bonus: a qualifying day whose previous day also qualified.
  const days = new Set(qualifying.map((c) => dayOf(c.startedAt)));
  for (const day of [...days].sort()) {
    if (days.has(addDays(day, -1)) && !paid.has(`streak|${day}`)) give('streak', day, REWARD_RULES.streak.points, day);
  }

  return awards;
}

/* ---------- levels, streaks, badges ---------- */

export function levelFor(lifetimeEarned: number): RewardLevel {
  const earned = Number.isFinite(lifetimeEarned) ? Math.max(0, Math.floor(lifetimeEarned)) : 0;
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (earned >= LEVELS[i]!.minPoints) index = i;
  const current = LEVELS[index]!;
  const next = LEVELS[index + 1];
  if (!next) return { id: current.id, index, minPoints: current.minPoints, next: null, progress: 1 };
  const progress = (earned - current.minPoints) / (next.minPoints - current.minPoints);
  return {
    id: current.id,
    index,
    minPoints: current.minPoints,
    next: { id: next.id, minPoints: next.minPoints, pointsToGo: next.minPoints - earned },
    progress: Math.round(progress * 1000) / 1000,
  };
}

/**
 * Consecutive qualifying Tallinn days ending today — or yesterday, so a streak is not shown as lost
 * in the morning before today's walk. `days` are "YYYY-MM-DD" strings.
 */
export function streakFor(days: Iterable<string>, now: Date): RewardsSummary['streak'] {
  const set = new Set(days);
  const today = dayOf(now);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const lastDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, active: set.has(date) };
  });
  return { current, lastDays };
}

export interface BadgeStats {
  hasEarlyCheckIn: boolean;
  distinctParks: number;
  approvedPosts: number;
  maxCheckInsInOnePark: number;
}

export function badgesFor(stats: BadgeStats): RewardsSummary['badges'] {
  const progress: Record<RewardBadgeId, number> = {
    early_bird: stats.hasEarlyCheckIn ? 1 : 0,
    ten_parks: stats.distinctParks,
    explorer: stats.approvedPosts,
    kadriorg_legend: stats.maxCheckInsInOnePark,
  };
  return (Object.keys(BADGE_TARGETS) as RewardBadgeId[]).map((id) => {
    const target = BADGE_TARGETS[id];
    const value = Math.max(0, Math.floor(progress[id]));
    return { id, unlocked: value >= target, progress: Math.min(value, target), target };
  });
}
