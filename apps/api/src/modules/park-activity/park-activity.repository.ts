import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { firstName, friendsBetween, notBlockedBetween } from '../safety/block-sql';
import type { PlanFact } from './day-parts';

export type ParkNow = { id: string; name: string; activeDogs: number };

/**
 * Data access for "Lemmikparkides täna" (M11, docs/18). The presence-privacy rule is SQL here, so a
 * plan the viewer may not see never leaves the database (same approach as park visitors, docs/09).
 */
export interface ParkActivityRepository {
  /** Public (approved) parks among `ids` with the live dog counter; unknown or hidden ids are absent. */
  findPublicParks(ids: string[]): Promise<ParkNow[]>;
  /**
   * Other people's plans in these parks that overlap [from, to) and end after now, soonest first.
   * Counted only when the owner shares presence with everyone, or with friends and the viewer is an
   * accepted friend; never "nobody"; never across a block in either direction. The name is returned
   * only for accepted friends.
   */
  visiblePlans(viewerId: string, parkIds: string[], from: Date, to: Date): Promise<PlanFact[]>;
}

/** Upper bound on rows read per request: ten parks × the busiest realistic day. */
const PLAN_ROW_LIMIT = 1000;

export function createParkActivityRepository(db: Db): ParkActivityRepository {
  return {
    async findPublicParks(ids) {
      const { rows } = await db.execute<{ id: string; name: string; active_dogs: number }>(sql`
        select p.id, p.name,
          (select count(*)::int from check_in_dogs cid
             join check_ins ci on ci.id = cid.check_in_id
            where ci.park_id = p.id and ci.ended_at is null and ci.expires_at > now()) as active_dogs
        from parks p
        where p.id in ${ids} and p.status = 'approved'`);
      return rows.map((r) => ({ id: r.id, name: r.name, activeDogs: Number(r.active_dogs) }));
    },

    async visiblePlans(viewerId, parkIds, from, to) {
      const viewer = sql`${viewerId}`;
      const owner = sql.raw('u.id');
      const { rows } = await db.execute<{
        park_id: string;
        user_id: string;
        starts_at: Date | string;
        ends_at: Date | string;
        friend_name: string | null;
      }>(sql`
        select pv.park_id, pv.user_id, pv.starts_at, pv.ends_at,
               case when ${friendsBetween(viewer, owner)} then u.name end as friend_name
        from planned_visits pv
        join "user" u on u.id = pv.user_id
        where pv.park_id in ${parkIds}
          and pv.user_id <> ${viewerId}
          and pv.starts_at < ${to.toISOString()}::timestamptz
          and pv.ends_at > greatest(${from.toISOString()}::timestamptz, now())
          and u.presence_sharing <> 'nobody'
          and (u.presence_sharing = 'everyone' or ${friendsBetween(viewer, owner)})
          and ${notBlockedBetween(viewer, owner)}
        order by pv.starts_at, pv.id
        limit ${PLAN_ROW_LIMIT}`);
      return rows.map((r) => ({
        parkId: r.park_id,
        userId: r.user_id,
        startsAt: new Date(r.starts_at),
        endsAt: new Date(r.ends_at),
        // The SQL reads a name only for accepted friends; first name only, like park visitors.
        friendName: r.friend_name === null ? null : firstName(r.friend_name),
      }));
    },
  };
}
