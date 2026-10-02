import type { RewardEntry, RewardHistoryPage, RewardReason } from '@kapp/shared';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { rewardBalances, rewardLedger, rewardMilestones } from '../../db/schema';
import { addDays } from '../../lib/calendar';
import { dayOf, REWARD_RULES, TIME_ZONE, type Award, type BadgeStats, type RewardFacts } from './reward-rules';

/** A transaction handle (what `db.transaction` passes to its callback). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

export interface BalanceRow {
  balance: number;
  lifetimeEarned: number;
}

export interface LedgerEntryInput {
  reason: RewardReason;
  sourceId: string;
  delta: number;
  day: string;
}

/**
 * Locks the user's balance row for the rest of the transaction, creating it on first use. Every
 * writer of the ledger calls this first: awards and redemptions of one user therefore run one after
 * another, which is what makes the daily caps and "cannot go below zero" hold under concurrency.
 */
export async function lockBalance(tx: Tx, userId: string): Promise<BalanceRow> {
  await tx.insert(rewardBalances).values({ userId }).onConflictDoNothing();
  const [row] = await tx
    .select({ balance: rewardBalances.balance, lifetimeEarned: rewardBalances.lifetimeEarned })
    .from(rewardBalances)
    .where(eq(rewardBalances.userId, userId))
    .for('update');
  if (!row) throw new Error('Balance row missing after insert');
  return row;
}

/**
 * Appends entries and moves the balance by what was really inserted. An entry whose event is already
 * in the ledger (`reward_ledger_event_uq`) is skipped silently — the same event never pays twice.
 * Must run after `lockBalance` in the same transaction.
 */
export async function appendEntries(tx: Tx, userId: string, entries: LedgerEntryInput[]): Promise<LedgerEntryInput[]> {
  if (entries.length === 0) return [];
  const inserted = await tx
    .insert(rewardLedger)
    .values(entries.map((e) => ({ userId, ...e })))
    .onConflictDoNothing({ target: [rewardLedger.userId, rewardLedger.reason, rewardLedger.sourceId] })
    .returning({ reason: rewardLedger.reason, sourceId: rewardLedger.sourceId, delta: rewardLedger.delta, day: sql<string>`to_char(${rewardLedger.day}, 'YYYY-MM-DD')` });
  const total = inserted.reduce((sum, e) => sum + e.delta, 0);
  // A refund gives spent points back; it was never earned, so it must not move the level.
  const earned = inserted.filter((e) => e.delta > 0 && e.reason !== 'redemption_refund').reduce((sum, e) => sum + e.delta, 0);
  if (inserted.length > 0) {
    // The CHECK (balance >= 0) is the backstop if a caller forgot to check the balance first.
    await tx
      .update(rewardBalances)
      .set({ balance: sql`${rewardBalances.balance} + ${total}`, lifetimeEarned: sql`${rewardBalances.lifetimeEarned} + ${earned}`, updatedAt: new Date() })
      .where(eq(rewardBalances.userId, userId));
  }
  return inserted;
}

export interface SettleResult {
  awarded: LedgerEntryInput[];
  before: BalanceRow;
  after: BalanceRow;
}

export interface RewardsRepository {
  /**
   * In one transaction with the balance row locked: reads the facts since `since`, lets `compute`
   * decide the awards (the pure rules) and appends them. Recomputing is always safe.
   */
  settle(userId: string, since: Date, compute: (facts: RewardFacts) => Award[]): Promise<SettleResult>;
  balance(userId: string): Promise<BalanceRow>;
  /** Distinct Tallinn days with a qualifying check-in since `sinceDay` ("YYYY-MM-DD"). */
  qualifyingDays(userId: string, sinceDay: string): Promise<string[]>;
  badgeStats(userId: string): Promise<BadgeStats>;
  history(userId: string, before: string | undefined, limit: number): Promise<RewardHistoryPage>;
  /** Inserts milestones and returns the keys that were new (notify only those). */
  addMilestones(userId: string, milestones: { kind: 'level' | 'badge'; key: string }[]): Promise<{ kind: 'level' | 'badge'; key: string }[]>;
  /**
   * The inviter of `inviteeId` if that invite is due for payment: the invitee has a qualifying
   * check-in and the inviter has no entry for them yet. Null otherwise.
   */
  inviterDue(inviteeId: string): Promise<string | null>;
}

/** A finished check-in (ended, or ran out) that lasted at least the minimum — SQL twin of isQualifyingCheckIn. */
const qualifyingCheckIn = (alias: string) =>
  sql.raw(
    `(${alias}.ended_at is not null or ${alias}.expires_at <= now())
     and coalesce(${alias}.ended_at, ${alias}.expires_at) - ${alias}.started_at >= interval '${REWARD_RULES.checkIn.minMinutes} minutes'`,
  );
const tallinnDay = (column: string) => sql.raw(`to_char((${column} at time zone '${TIME_ZONE}')::date, 'YYYY-MM-DD')`);

async function readFacts(ex: Executor, userId: string, since: Date): Promise<RewardFacts> {
  // One extra day back, so the first day of the window can see whether it continues a streak.
  const checkInsSince = new Date(since.getTime() - 86_400_000);
  const [checkIns, plans, reviews, posts, invitees, existing] = await Promise.all([
    ex.execute<{ id: string; park_id: string; started_at: Date; ended_at: Date }>(sql`
      select c.id, c.park_id, c.started_at, coalesce(c.ended_at, c.expires_at) as ended_at
      from check_ins c
      where c.user_id = ${userId} and c.started_at >= ${checkInsSince}
        and (c.ended_at is not null or c.expires_at <= now())`),
    ex.execute<{ id: string; park_id: string; starts_at: Date; ends_at: Date; created_at: Date }>(sql`
      select p.id, p.park_id, p.starts_at, p.ends_at, p.created_at
      from planned_visits p
      where p.user_id = ${userId} and p.starts_at >= ${since} and p.ends_at <= now()`),
    ex.execute<{ park_id: string; created_at: Date }>(sql`select r.park_id, r.created_at from reviews r where r.user_id = ${userId}`),
    ex.execute<{ id: string; moderated_at: Date }>(sql`
      select pp.id, pp.moderated_at from place_posts pp where pp.author_id = ${userId} and pp.status = 'approved'`),
    ex.execute<{ invitee_id: string; qualified_at: Date }>(sql`
      select r.invitee_id, min(coalesce(c.ended_at, c.expires_at)) as qualified_at
      from referrals r
      join check_ins c on c.user_id = r.invitee_id and ${qualifyingCheckIn('c')}
      where r.inviter_id = ${userId}
      group by r.invitee_id`),
    // Window-bound reasons only need recent entries (caps, streaks); once-ever reasons need all.
    ex.execute<{ reason: RewardReason; source_id: string; day: string }>(sql`
      select l.reason, l.source_id, to_char(l.day, 'YYYY-MM-DD') as day
      from reward_ledger l
      where l.user_id = ${userId} and l.delta > 0
        and (l.reason in ('review', 'place_post', 'invite') or l.day >= ${addDays(dayOf(checkInsSince), -1)}::date)`),
  ]);
  return {
    checkIns: checkIns.rows.map((r) => ({ id: r.id, parkId: r.park_id, startedAt: new Date(r.started_at), endedAt: new Date(r.ended_at) })),
    plans: plans.rows.map((r) => ({ id: r.id, parkId: r.park_id, startsAt: new Date(r.starts_at), endsAt: new Date(r.ends_at), createdAt: new Date(r.created_at) })),
    reviews: reviews.rows.map((r) => ({ parkId: r.park_id, createdAt: new Date(r.created_at) })),
    approvedPosts: posts.rows.map((r) => ({ id: r.id, approvedAt: new Date(r.moderated_at) })),
    qualifiedInvitees: invitees.rows.map((r) => ({ inviteeId: r.invitee_id, qualifiedAt: new Date(r.qualified_at) })),
    existing: existing.rows.map((r) => ({ reason: r.reason, sourceId: r.source_id, day: r.day })),
  };
}

const entryColumns = {
  id: rewardLedger.id,
  reason: rewardLedger.reason,
  delta: rewardLedger.delta,
  day: sql<string>`to_char(${rewardLedger.day}, 'YYYY-MM-DD')`,
  createdAt: rewardLedger.createdAt,
};

export function createRewardsRepository(db: Db): RewardsRepository {
  return {
    settle(userId, since, compute) {
      return db.transaction(async (tx) => {
        const before = await lockBalance(tx, userId);
        // Facts are read after taking the lock, so two concurrent settles see each other's entries.
        const facts = await readFacts(tx, userId, since);
        const awarded = await appendEntries(tx, userId, compute(facts));
        const gained = awarded.reduce((sum, e) => sum + e.delta, 0);
        return { awarded, before, after: { balance: before.balance + gained, lifetimeEarned: before.lifetimeEarned + gained } };
      });
    },

    async balance(userId) {
      const [row] = await db
        .select({ balance: rewardBalances.balance, lifetimeEarned: rewardBalances.lifetimeEarned })
        .from(rewardBalances)
        .where(eq(rewardBalances.userId, userId));
      return row ?? { balance: 0, lifetimeEarned: 0 };
    },

    async qualifyingDays(userId, sinceDay) {
      const { rows } = await db.execute<{ day: string }>(sql`
        select distinct ${tallinnDay('c.started_at')} as day
        from check_ins c
        where c.user_id = ${userId} and ${qualifyingCheckIn('c')}
          and (c.started_at at time zone ${TIME_ZONE})::date >= ${sinceDay}::date`);
      return rows.map((r) => r.day);
    },

    async badgeStats(userId) {
      const { rows } = await db.execute<{ early: boolean; parks: number; posts: number; max_in_park: number }>(sql`
        with q as (
          select c.park_id, c.started_at from check_ins c where c.user_id = ${userId} and ${qualifyingCheckIn('c')}
        )
        select
          exists (select 1 from q where extract(hour from q.started_at at time zone ${TIME_ZONE}) < 8) as early,
          (select count(distinct q.park_id)::int from q) as parks,
          (select count(*)::int from place_posts pp where pp.author_id = ${userId} and pp.status = 'approved') as posts,
          coalesce((select max(n)::int from (select count(*) as n from q group by q.park_id) per_park), 0) as max_in_park`);
      const r = rows[0];
      return {
        hasEarlyCheckIn: Boolean(r?.early),
        distinctParks: r?.parks ?? 0,
        approvedPosts: r?.posts ?? 0,
        maxCheckInsInOnePark: r?.max_in_park ?? 0,
      };
    },

    async history(userId, before, limit) {
      const cursor = before
        ? sql`(${rewardLedger.createdAt}, ${rewardLedger.id}) < (select l2.created_at, l2.id from reward_ledger l2 where l2.id = ${before} and l2.user_id = ${userId})`
        : sql`true`;
      const rows = await db
        .select(entryColumns)
        .from(rewardLedger)
        .where(and(eq(rewardLedger.userId, userId), cursor))
        .orderBy(desc(rewardLedger.createdAt), desc(rewardLedger.id))
        .limit(limit + 1);
      const items: RewardEntry[] = rows.slice(0, limit).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
      return { items, nextCursor: rows.length > limit ? items[items.length - 1]!.id : null };
    },

    async addMilestones(userId, milestones) {
      if (milestones.length === 0) return [];
      const rows = await db
        .insert(rewardMilestones)
        .values(milestones.map((m) => ({ userId, ...m })))
        .onConflictDoNothing()
        .returning({ kind: rewardMilestones.kind, key: rewardMilestones.key });
      return rows as { kind: 'level' | 'badge'; key: string }[];
    },

    async inviterDue(inviteeId) {
      const { rows } = await db.execute<{ inviter_id: string }>(sql`
        select r.inviter_id from referrals r
        where r.invitee_id = ${inviteeId}
          and exists (select 1 from check_ins c where c.user_id = r.invitee_id and ${qualifyingCheckIn('c')})
          and not exists (select 1 from reward_ledger l where l.user_id = r.inviter_id and l.reason = 'invite' and l.source_id = r.invitee_id)`);
      return rows[0]?.inviter_id ?? null;
    },
  };
}
