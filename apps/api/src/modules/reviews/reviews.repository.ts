import type { Review, ReviewInput } from '@kapp/shared';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { checkIns, reviews, user } from '../../db/schema';

/** Data access for park reviews (one per user per park, enforced by a unique index). */
export interface ReviewsRepository {
  hasVisited(userId: string, parkId: string): Promise<boolean>;
  /** Insert or replace the user's review of the park. */
  upsert(userId: string, parkId: string, input: ReviewInput): Promise<Review>;
  /** Newest first; reviews by users the viewer blocked are left out. */
  listForPark(parkId: string, viewerId: string | undefined, limit: number): Promise<Review[]>;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function createReviewsRepository(db: Db): ReviewsRepository {
  return {
    async hasVisited(userId, parkId) {
      const [row] = await db
        .select({ id: checkIns.id })
        .from(checkIns)
        .where(and(eq(checkIns.userId, userId), eq(checkIns.parkId, parkId)))
        .limit(1);
      return Boolean(row);
    },

    async upsert(userId, parkId, { rating, body }) {
      const [row] = await db
        .insert(reviews)
        .values({ userId, parkId, rating, body })
        .onConflictDoUpdate({ target: [reviews.userId, reviews.parkId], set: { rating, body, updatedAt: new Date() } })
        .returning({ id: reviews.id, rating: reviews.rating, body: reviews.body, createdAt: reviews.createdAt });
      const [author] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
      return {
        id: row!.id,
        authorFirstName: firstName(author?.name ?? ''),
        rating: row!.rating,
        body: row!.body,
        createdAt: row!.createdAt.toISOString(),
      };
    },

    async listForPark(parkId, viewerId, limit) {
      const notBlocked = viewerId
        ? sql`not exists (select 1 from user_blocks b where b.blocker_id = ${viewerId} and b.blocked_id = ${reviews.userId})`
        : sql`true`;
      const rows = await db
        .select({ id: reviews.id, name: user.name, rating: reviews.rating, body: reviews.body, createdAt: reviews.createdAt })
        .from(reviews)
        .innerJoin(user, eq(user.id, reviews.userId))
        .where(and(eq(reviews.parkId, parkId), notBlocked))
        .orderBy(desc(reviews.createdAt))
        .limit(limit);
      return rows.map((r) => ({
        id: r.id,
        authorFirstName: firstName(r.name),
        rating: r.rating,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
      }));
    },
  };
}
