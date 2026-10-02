import type { Friend, FriendPlan, FriendRequests, PersonSummary, Relation, UserProfile, UserSearchResult } from '@kapp/shared';
import { and, eq, or, sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { friendships } from '../../db/schema';
import { blockedBetween, firstName } from '../safety/block-sql';

export interface FriendshipRow {
  requesterId: string;
  addresseeId: string;
  status: 'pending' | 'accepted';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Data access for friendships, people search, public profiles and friends' plans.
 * Everything that shows another person filters out blocked pairs (either direction) in SQL, so a
 * blocked user's data never leaves the database.
 */
export interface FriendsRepository {
  /** The other user if they exist and nobody has blocked anybody; otherwise null (→ 404). */
  findTarget(viewerId: string, userId: string): Promise<{ id: string; allowFriendRequests: boolean } | null>;
  findFriendship(a: string, b: string): Promise<FriendshipRow | null>;
  createRequest(requesterId: string, addresseeId: string): Promise<void>;
  /** pending → accepted for exactly this direction; false if there was no such pending request. */
  accept(requesterId: string, addresseeId: string): Promise<boolean>;
  /** Deletes the pair's row of the given status, in either direction. Idempotent. */
  remove(a: string, b: string, status: 'pending' | 'accepted'): Promise<void>;
  listFriends(userId: string): Promise<Friend[]>;
  listRequests(userId: string): Promise<FriendRequests>;
  search(viewerId: string, query: string, limit: number): Promise<UserSearchResult[]>;
  profile(viewerId: string, userId: string): Promise<UserProfile | null>;
  /** Friends who should hear about the user's plan: none when the user shares presence with nobody. */
  planAudience(userId: string): Promise<string[]>;
  /** Accepted friends' plans that end after now and start within `hours`, soonest first. */
  friendPlans(userId: string, hours: number): Promise<FriendPlan[]>;
}

/** Dog names of the user row aliased `u`. */
const dogNames = sql`coalesce((select array_agg(d.name order by d.name) from dogs d where d.owner_id = u.id), '{}')`;

/** Relation of `u` to the viewer, from the viewer's point of view. */
const relationOf = (viewerId: string) => sql`coalesce((
  select case
    when f.status = 'accepted' then 'friend'
    when f.requester_id = ${viewerId} then 'outgoing'
    else 'incoming' end
  from friendships f
  where (f.requester_id = ${viewerId} and f.addressee_id = u.id) or (f.requester_id = u.id and f.addressee_id = ${viewerId})
  limit 1
), 'none')`;

const notBlockedWith = (viewerId: string) => sql`not ${blockedBetween(sql`${viewerId}`, sql.raw('u.id'))}`;

/** `%`, `_` and `\` are LIKE wildcards; a search for "50%" must match the text, not everything. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

type PersonRow = { id: string; name: string; area: string | null; dog_names: string[] };
const toPerson = (r: PersonRow): PersonSummary => ({ id: r.id, firstName: firstName(r.name), area: r.area, dogNames: r.dog_names ?? [] });
const iso = (d: Date | string) => new Date(d).toISOString();

export function createFriendsRepository(db: Db): FriendsRepository {
  const pair = (a: string, b: string) =>
    or(
      and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
      and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
    );

  return {
    async findTarget(viewerId, userId) {
      const { rows } = await db.execute<{ id: string; allow_friend_requests: boolean }>(sql`
        select u.id, u.allow_friend_requests from "user" u
        where u.id = ${userId} and ${notBlockedWith(viewerId)}`);
      const row = rows[0];
      return row ? { id: row.id, allowFriendRequests: row.allow_friend_requests } : null;
    },

    async findFriendship(a, b) {
      const [row] = await db
        .select({
          requesterId: friendships.requesterId,
          addresseeId: friendships.addresseeId,
          status: friendships.status,
          createdAt: friendships.createdAt,
          updatedAt: friendships.updatedAt,
        })
        .from(friendships)
        .where(pair(a, b))
        .limit(1);
      return row ?? null;
    },

    async createRequest(requesterId, addresseeId) {
      await db.insert(friendships).values({ requesterId, addresseeId, status: 'pending' });
    },

    async accept(requesterId, addresseeId) {
      const rows = await db
        .update(friendships)
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId), eq(friendships.status, 'pending')))
        .returning({ requesterId: friendships.requesterId });
      return rows.length > 0;
    },

    async remove(a, b, status) {
      await db.delete(friendships).where(and(pair(a, b), eq(friendships.status, status)));
    },

    async listFriends(userId) {
      // `updated_at` of an accepted row is the moment it was accepted ("sõbrad alates …").
      const { rows } = await db.execute<PersonRow & { since: Date }>(sql`
        select u.id, u.name, u.area, ${dogNames} as dog_names, f.updated_at as since
        from friendships f
        join "user" u on u.id = case when f.requester_id = ${userId} then f.addressee_id else f.requester_id end
        where f.status = 'accepted' and (f.requester_id = ${userId} or f.addressee_id = ${userId})
          and ${notBlockedWith(userId)}
        order by u.name`);
      return rows.map((r) => ({ ...toPerson(r), since: iso(r.since) }));
    },

    async listRequests(userId) {
      const { rows } = await db.execute<PersonRow & { created_at: Date; incoming: boolean }>(sql`
        select u.id, u.name, u.area, ${dogNames} as dog_names, f.created_at, (f.addressee_id = ${userId}) as incoming
        from friendships f
        join "user" u on u.id = case when f.requester_id = ${userId} then f.addressee_id else f.requester_id end
        where f.status = 'pending' and (f.requester_id = ${userId} or f.addressee_id = ${userId})
          and ${notBlockedWith(userId)}
        order by f.created_at desc`);
      const toRequest = (r: (typeof rows)[number]) => ({ user: toPerson(r), createdAt: iso(r.created_at) });
      return { incoming: rows.filter((r) => r.incoming).map(toRequest), outgoing: rows.filter((r) => !r.incoming).map(toRequest) };
    },

    async search(viewerId, query, limit) {
      const pattern = `%${escapeLike(query)}%`;
      // Owner name or any dog name; a match on the first name ranks before a dog-name-only match.
      const { rows } = await db.execute<PersonRow & { relation: Relation; allow_friend_requests: boolean }>(sql`
        select u.id, u.name, u.area, ${dogNames} as dog_names, ${relationOf(viewerId)} as relation, u.allow_friend_requests
        from "user" u
        where u.id <> ${viewerId}
          and (u.name ilike ${pattern} or exists (select 1 from dogs d where d.owner_id = u.id and d.name ilike ${pattern}))
          and ${notBlockedWith(viewerId)}
        order by (u.name ilike ${pattern}) desc, u.name
        limit ${limit}`);
      return rows.map((r) => ({ ...toPerson(r), relation: r.relation, acceptsRequests: r.allow_friend_requests }));
    },

    async profile(viewerId, userId) {
      const { rows } = await db.execute<{
        id: string;
        name: string;
        area: string | null;
        bio: string | null;
        relation: Relation;
        allow_friend_requests: boolean;
        friends_since: Date | null;
      }>(sql`
        select u.id, u.name, u.area, u.bio, ${relationOf(viewerId)} as relation, u.allow_friend_requests,
          (select f.updated_at from friendships f where f.status = 'accepted'
             and ((f.requester_id = ${viewerId} and f.addressee_id = u.id) or (f.requester_id = u.id and f.addressee_id = ${viewerId}))) as friends_since
        from "user" u
        where u.id = ${userId} and ${notBlockedWith(viewerId)}`);
      const row = rows[0];
      if (!row) return null;
      const isFriend = row.relation === 'friend' || row.id === viewerId;
      const { rows: dogs } = await db.execute<{ id: string; name: string; breed: string | null; birth_date: string | null; temperament: string | null }>(sql`
        select d.id, d.name, d.breed, d.birth_date::text as birth_date, d.temperament from dogs d where d.owner_id = ${userId} order by d.name`);
      return {
        id: row.id,
        firstName: firstName(row.name),
        area: row.area,
        // Bio and dog details are for friends ("Profiil nähtav pargisõpradele"); strangers see names.
        bio: isFriend ? row.bio : null,
        relation: row.relation,
        friendsSince: row.friends_since ? iso(row.friends_since) : null,
        acceptsRequests: row.allow_friend_requests,
        dogs: dogs.map((d) => ({
          id: d.id,
          name: d.name,
          breed: d.breed,
          birthDate: isFriend ? d.birth_date : null,
          temperament: isFriend ? d.temperament : null,
        })),
      };
    },

    async planAudience(userId) {
      const { rows } = await db.execute<{ id: string }>(sql`
        select case when f.requester_id = ${userId} then f.addressee_id else f.requester_id end as id
        from friendships f
        join "user" me on me.id = ${userId}
        where f.status = 'accepted' and (f.requester_id = ${userId} or f.addressee_id = ${userId})
          and me.presence_sharing <> 'nobody'`);
      return rows.map((r) => r.id);
    },

    async friendPlans(userId, hours) {
      // A friend who shares presence with nobody does not want their future location shown either.
      const { rows } = await db.execute<{
        id: string;
        friend_id: string;
        friend_name: string;
        park_id: string;
        park_name: string;
        starts_at: Date;
        ends_at: Date;
        note: string | null;
      }>(sql`
        select pv.id, u.id as friend_id, u.name as friend_name, p.id as park_id, p.name as park_name,
               pv.starts_at, pv.ends_at, pv.note
        from friendships f
        join "user" u on u.id = case when f.requester_id = ${userId} then f.addressee_id else f.requester_id end
        join planned_visits pv on pv.user_id = u.id
        join parks p on p.id = pv.park_id and p.status = 'approved'
        where f.status = 'accepted' and (f.requester_id = ${userId} or f.addressee_id = ${userId})
          and u.presence_sharing <> 'nobody'
          and ${notBlockedWith(userId)}
          and pv.ends_at > now() and pv.starts_at < now() + make_interval(hours => ${hours})
        order by pv.starts_at
        limit 20`);
      return rows.map((r) => ({
        id: r.id,
        friend: { id: r.friend_id, firstName: firstName(r.friend_name) },
        park: { id: r.park_id, name: r.park_name },
        startsAt: iso(r.starts_at),
        endsAt: iso(r.ends_at),
        note: r.note,
      }));
    },
  };
}
