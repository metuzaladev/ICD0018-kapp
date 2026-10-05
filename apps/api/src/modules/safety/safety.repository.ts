import type { BlockedUser, UserReportInput } from '@kapp/shared';
import { and, desc, eq, or, sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { friendships, user, userBlocks, userReports } from '../../db/schema';
import { blockedBetween, firstName } from './block-sql';

/** Data access for blocking and reporting users (Safety / Report or Block, Settings / Privacy). */
export interface SafetyRepository {
  userExists(userId: string): Promise<boolean>;
  isBlockedEitherWay(a: string, b: string): Promise<boolean>;
  /**
   * Blocks and, in the same transaction, deletes any friendship or pending request between the
   * two — so a block can never leave a half-removed relationship behind. Idempotent.
   */
  block(blockerId: string, blockedId: string): Promise<void>;
  /** Idempotent: unblocking someone who is not blocked is fine. */
  unblock(blockerId: string, blockedId: string): Promise<void>;
  listBlocked(blockerId: string): Promise<BlockedUser[]>;
  createReport(input: { reporterId: string; reportedId: string } & UserReportInput): Promise<{ id: string }>;
}

export function createSafetyRepository(db: Db): SafetyRepository {
  return {
    async userExists(userId) {
      const [row] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
      return Boolean(row);
    },

    async isBlockedEitherWay(a, b) {
      const [row] = await db.execute<{ blocked: boolean }>(sql`select ${blockedBetween(sql`${a}`, sql`${b}`)} as blocked`).then((r) => r.rows);
      return Boolean(row?.blocked);
    },

    async block(blockerId, blockedId) {
      await db.transaction(async (tx) => {
        await tx.insert(userBlocks).values({ blockerId, blockedId }).onConflictDoNothing();
        await tx
          .delete(friendships)
          .where(
            or(
              and(eq(friendships.requesterId, blockerId), eq(friendships.addresseeId, blockedId)),
              and(eq(friendships.requesterId, blockedId), eq(friendships.addresseeId, blockerId)),
            ),
          );
      });
    },

    async unblock(blockerId, blockedId) {
      await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
    },

    async listBlocked(blockerId) {
      const rows = await db
        .select({ id: user.id, name: user.name, blockedAt: userBlocks.createdAt })
        .from(userBlocks)
        .innerJoin(user, eq(user.id, userBlocks.blockedId))
        .where(eq(userBlocks.blockerId, blockerId))
        .orderBy(desc(userBlocks.createdAt));
      return rows.map((r) => ({ id: r.id, firstName: firstName(r.name), blockedAt: r.blockedAt.toISOString() }));
    },

    async createReport({ reporterId, reportedId, reason, details }) {
      const [row] = await db.insert(userReports).values({ reporterId, reportedId, reason, details }).returning({ id: userReports.id });
      return { id: row!.id };
    },
  };
}
