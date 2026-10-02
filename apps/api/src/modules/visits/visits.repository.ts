import type { ActiveCheckIn, ParkVisitors, PlannedVisit, PlannedVisitInput, VisitHistoryItem } from '@kapp/shared';
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { checkInDogs, checkIns, dogs, parks, plannedVisits, user } from '../../db/schema';

/**
 * Data access for check-ins, visitors, visit history and planned visits.
 * Visibility rules for "who is in the park" live in SQL here so hidden people never leave the
 * database; the service decides everything else.
 */
export interface VisitsRepository {
  /** Closes the user's open check-in (if any) and opens a new one, atomically. */
  createCheckIn(input: { userId: string; parkId: string; dogIds: string[]; durationMinutes: number }): Promise<ActiveCheckIn>;
  findActive(userId: string): Promise<ActiveCheckIn | null>;
  /** 'ended' now, 'closed' if it was already over (idempotent), 'not-found' if not the user's. */
  endCheckIn(userId: string, checkInId: string): Promise<'ended' | 'closed' | 'not-found'>;
  listVisitors(parkId: string, viewerId: string): Promise<ParkVisitors>;
  history(userId: string, limit: number): Promise<VisitHistoryItem[]>;
  createPlan(userId: string, input: PlannedVisitInput): Promise<PlannedVisit>;
  listUpcomingPlans(userId: string): Promise<PlannedVisit[]>;
  deletePlan(userId: string, planId: string): Promise<boolean>;
}

/** Active = not ended and not expired. Expiry is enforced at read time, so no cleanup job is required. */
const isActive = and(isNull(checkIns.endedAt), gt(checkIns.expiresAt, sql`now()`));

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

async function dogsByCheckIn(db: Db, checkInIds: string[]) {
  if (checkInIds.length === 0) return new Map<string, { id: string; name: string; breed: string | null }[]>();
  const rows = await db
    .select({ checkInId: checkInDogs.checkInId, id: dogs.id, name: dogs.name, breed: dogs.breed })
    .from(checkInDogs)
    .innerJoin(dogs, eq(dogs.id, checkInDogs.dogId))
    .where(inArray(checkInDogs.checkInId, checkInIds))
    .orderBy(asc(dogs.name));
  const map = new Map<string, { id: string; name: string; breed: string | null }[]>();
  for (const { checkInId, ...dog } of rows) map.set(checkInId, [...(map.get(checkInId) ?? []), dog]);
  return map;
}

export function createVisitsRepository(db: Db): VisitsRepository {
  async function findActive(userId: string): Promise<ActiveCheckIn | null> {
    const [row] = await db
      .select({
        id: checkIns.id,
        parkId: parks.id,
        parkName: parks.name,
        startedAt: checkIns.startedAt,
        expiresAt: checkIns.expiresAt,
      })
      .from(checkIns)
      .innerJoin(parks, eq(parks.id, checkIns.parkId))
      .where(and(eq(checkIns.userId, userId), isActive))
      .limit(1);
    if (!row) return null;
    const dogMap = await dogsByCheckIn(db, [row.id]);
    return {
      id: row.id,
      park: { id: row.parkId, name: row.parkName },
      dogs: dogMap.get(row.id) ?? [],
      startedAt: row.startedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  async function listUpcomingPlans(userId: string): Promise<PlannedVisit[]> {
    const rows = await db
      .select({
        id: plannedVisits.id,
        parkId: parks.id,
        parkName: parks.name,
        startsAt: plannedVisits.startsAt,
        endsAt: plannedVisits.endsAt,
        note: plannedVisits.note,
      })
      .from(plannedVisits)
      .innerJoin(parks, eq(parks.id, plannedVisits.parkId))
      .where(and(eq(plannedVisits.userId, userId), gt(plannedVisits.endsAt, sql`now()`)))
      .orderBy(asc(plannedVisits.startsAt))
      .limit(50);
    return rows.map((r) => ({
      id: r.id,
      park: { id: r.parkId, name: r.parkName },
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      note: r.note,
    }));
  }

  return {
    async createCheckIn({ userId, parkId, dogIds, durationMinutes }) {
      const id = await db.transaction(async (tx) => {
        // Close any open check-in first; an expired one is closed at its expiry time, not "now".
        await tx
          .update(checkIns)
          .set({ endedAt: sql`least(now(), ${checkIns.expiresAt})` })
          .where(and(eq(checkIns.userId, userId), isNull(checkIns.endedAt)));
        const [created] = await tx
          .insert(checkIns)
          .values({ userId, parkId, expiresAt: sql`now() + make_interval(mins => ${durationMinutes})` })
          .returning({ id: checkIns.id });
        await tx.insert(checkInDogs).values(dogIds.map((dogId) => ({ checkInId: created!.id, dogId })));
        return created!.id;
      });
      const active = await findActive(userId);
      if (!active || active.id !== id) throw new Error('Check-in not readable after insert');
      return active;
    },

    findActive,

    async endCheckIn(userId, checkInId) {
      const ended = await db
        .update(checkIns)
        .set({ endedAt: sql`now()` })
        .where(and(eq(checkIns.id, checkInId), eq(checkIns.userId, userId), isActive))
        .returning({ id: checkIns.id });
      if (ended.length > 0) return 'ended';
      const [own] = await db
        .select({ id: checkIns.id })
        .from(checkIns)
        .where(and(eq(checkIns.id, checkInId), eq(checkIns.userId, userId)))
        .limit(1);
      return own ? 'closed' : 'not-found';
    },

    async listVisitors(parkId, viewerId) {
      // Visible if it is the viewer, or the owner shares with everyone, or with friends and the
      // viewer is an accepted friend — and nobody has blocked anybody.
      const visible = sql<boolean>`(
        ${checkIns.userId} = ${viewerId}
        or (
          not exists (
            select 1 from user_blocks b
            where (b.blocker_id = ${checkIns.userId} and b.blocked_id = ${viewerId})
               or (b.blocker_id = ${viewerId} and b.blocked_id = ${checkIns.userId})
          )
          and (
            ${user.presenceSharing} = 'everyone'
            or (${user.presenceSharing} = 'friends' and exists (
              select 1 from friendships f
              where f.status = 'accepted'
                and ((f.requester_id = ${checkIns.userId} and f.addressee_id = ${viewerId})
                  or (f.requester_id = ${viewerId} and f.addressee_id = ${checkIns.userId}))
            ))
          )
        )
      )`;
      const rows = await db
        .select({
          id: checkIns.id,
          userId: checkIns.userId,
          ownerName: user.name,
          expiresAt: checkIns.expiresAt,
          visible,
          dogCount: sql<number>`(select count(*)::int from check_in_dogs cid where cid.check_in_id = ${sql.raw('"check_ins"."id"')})`,
        })
        .from(checkIns)
        .innerJoin(user, eq(user.id, checkIns.userId))
        .where(and(eq(checkIns.parkId, parkId), isActive))
        .orderBy(asc(checkIns.startedAt));

      const shown = rows.filter((r) => r.visible);
      const dogMap = await dogsByCheckIn(db, shown.map((r) => r.id));
      return {
        visitors: shown.map((r) => ({
          checkInId: r.id,
          userId: r.userId,
          isMe: r.userId === viewerId,
          ownerFirstName: firstName(r.ownerName),
          dogs: dogMap.get(r.id) ?? [],
          until: r.expiresAt.toISOString(),
        })),
        hiddenDogs: rows.filter((r) => !r.visible).reduce((sum, r) => sum + r.dogCount, 0),
      };
    },

    async history(userId, limit) {
      const endedAt = sql<Date>`coalesce(${checkIns.endedAt}, ${checkIns.expiresAt})`.mapWith(checkIns.expiresAt);
      const rows = await db
        .select({
          id: checkIns.id,
          parkId: parks.id,
          parkName: parks.name,
          startedAt: checkIns.startedAt,
          endedAt,
          hasReview: sql<boolean>`exists (select 1 from reviews r where r.user_id = ${userId} and r.park_id = ${sql.raw('"parks"."id"')})`,
        })
        .from(checkIns)
        .innerJoin(parks, eq(parks.id, checkIns.parkId))
        .where(and(eq(checkIns.userId, userId), or(sql`${checkIns.endedAt} is not null`, sql`${checkIns.expiresAt} <= now()`)))
        .orderBy(desc(checkIns.startedAt))
        .limit(limit);
      const dogMap = await dogsByCheckIn(db, rows.map((r) => r.id));
      return rows.map((r) => ({
        id: r.id,
        park: { id: r.parkId, name: r.parkName },
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt.toISOString(),
        durationMinutes: Math.max(0, Math.round((r.endedAt.getTime() - r.startedAt.getTime()) / 60_000)),
        dogs: dogMap.get(r.id) ?? [],
        hasReview: Boolean(r.hasReview),
      }));
    },

    async createPlan(userId, { parkId, startsAt, endsAt, note }) {
      const [row] = await db
        .insert(plannedVisits)
        .values({ userId, parkId, startsAt: new Date(startsAt), endsAt: new Date(endsAt), note })
        .returning({ id: plannedVisits.id });
      const plans = await listUpcomingPlans(userId);
      const plan = plans.find((p) => p.id === row!.id);
      if (!plan) throw new Error('Plan not readable after insert');
      return plan;
    },

    listUpcomingPlans,

    async deletePlan(userId, planId) {
      const deleted = await db
        .delete(plannedVisits)
        .where(and(eq(plannedVisits.id, planId), eq(plannedVisits.userId, userId)))
        .returning({ id: plannedVisits.id });
      return deleted.length > 0;
    },
  };
}
