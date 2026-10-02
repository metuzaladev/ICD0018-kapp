import type { RewardBadgeId, RewardHistoryPage, RewardHistoryQuery, RewardLevelId, RewardsSummary } from '@kapp/shared';

import { addDays } from '../../lib/calendar';
import { withTimeout } from '../../lib/timeout';
import type { Logger, Notifier } from '../notifications/notifier';
import { badgesFor, computeAwards, dayOf, levelFor, SETTLE_WINDOW_DAYS, streakFor, WAYS_TO_EARN } from './reward-rules';
import type { RewardsRepository } from './rewards.repository';

/**
 * Käpad: awarding (server only), the rewards screen and the history.
 *
 * How awarding works: other services call `settle(userId)` after something that may earn points
 * (check-in started or ended, review written, post approved, invite claimed). `settle` recomputes
 * what the user's recent facts entitle them to with the pure rules (reward-rules.ts) and appends
 * whatever is missing, with the balance row locked. Because the ledger's unique key drops an event
 * that is already paid, settling twice — or concurrently, or after a failure — pays exactly once.
 * The rewards screen settles too, so a check-in that simply ran out (no request at its end) is paid
 * the next time the user looks.
 *
 * Why not inside the caller's transaction: an award failing (lock wait, timeout) must never undo the
 * check-in or review that earned it. Recomputation gives the same guarantee — eventually exactly once —
 * without coupling the two.
 */
export interface RewardsService {
  /** Never throws: the action that earned the points has already succeeded. Failures are logged. */
  settle(userId: string): Promise<void>;
  summary(userId: string): Promise<RewardsSummary>;
  history(userId: string, query: RewardHistoryQuery): Promise<RewardHistoryPage>;
}

/** Enough history for a long streak to be counted; older days cannot change "current". */
export const STREAK_LOOKBACK_DAYS = 400;

export function createRewardsService({
  repository,
  notifier,
  log,
  timeoutMs,
  now = () => new Date(),
}: {
  repository: RewardsRepository;
  notifier: Notifier;
  log: Logger;
  timeoutMs: number;
  now?: () => Date;
}): RewardsService {
  const t = <T>(p: Promise<T>, label: string) => withTimeout(p, timeoutMs, label);

  /** Tells the user about a new level or newly unlocked badges — once each (milestones table). */
  async function announce(userId: string, earnedBefore: number, earnedAfter: number) {
    const milestones: { kind: 'level' | 'badge'; key: string }[] = [];
    const before = levelFor(earnedBefore);
    const after = levelFor(earnedAfter);
    if (after.index > before.index) milestones.push({ kind: 'level', key: after.id });
    const badges = badgesFor(await t(repository.badgeStats(userId), 'rewards.badgeStats'));
    for (const badge of badges) if (badge.unlocked) milestones.push({ kind: 'badge', key: badge.id });
    const fresh = await t(repository.addMilestones(userId, milestones), 'rewards.addMilestones');
    for (const m of fresh) {
      await notifier.notify(
        m.kind === 'level'
          ? { type: 'reward_level_up', recipientId: userId, actorId: null, data: { levelId: m.key as RewardLevelId } }
          : { type: 'reward_badge', recipientId: userId, actorId: null, data: { badgeId: m.key as RewardBadgeId } },
      );
    }
  }

  async function settleOnce(userId: string): Promise<boolean> {
    const since = new Date(now().getTime() - SETTLE_WINDOW_DAYS * 86_400_000);
    const result = await t(repository.settle(userId, since, computeAwards), 'rewards.settle');
    await announce(userId, result.before.lifetimeEarned, result.after.lifetimeEarned);
    return result.awarded.length > 0;
  }

  async function settle(userId: string): Promise<void> {
    try {
      await settleOnce(userId);
      // The invite bonus belongs to the inviter but is triggered by the invitee's own check-in.
      const inviter = await t(repository.inviterDue(userId), 'rewards.inviterDue');
      if (inviter) await settleOnce(inviter);
    } catch (error) {
      // Retry-safe: the next settle recomputes the same awards and the ledger key prevents repeats.
      log.warn({ err: error, userId }, 'rewards not settled');
    }
  }

  return {
    settle,

    async summary(userId) {
      await settle(userId);
      const today = dayOf(now());
      const [balance, days, stats] = await Promise.all([
        t(repository.balance(userId), 'rewards.balance'),
        t(repository.qualifyingDays(userId, addDays(today, -STREAK_LOOKBACK_DAYS)), 'rewards.qualifyingDays'),
        t(repository.badgeStats(userId), 'rewards.badgeStats'),
      ]);
      return {
        balance: balance.balance,
        lifetimeEarned: balance.lifetimeEarned,
        level: levelFor(balance.lifetimeEarned),
        streak: streakFor(days, now()),
        badges: badgesFor(stats),
        waysToEarn: WAYS_TO_EARN,
      };
    },

    history: (userId, { before, limit }) => t(repository.history(userId, before, limit), 'rewards.history'),
  };
}
