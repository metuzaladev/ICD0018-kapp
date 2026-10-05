import { sql, type SQL } from 'drizzle-orm';

/**
 * SQL building blocks for "nobody has blocked anybody" (M5). Blocking in either direction hides
 * two people from each other everywhere, so every social query uses the same predicate.
 *
 * Arguments are SQL fragments, usually a bound user id (`sql`${viewerId}``) or an explicitly
 * qualified column (`sql.raw('"user"."id"')`). Qualify columns by hand: inside a correlated
 * subquery Drizzle may print a bare `"id"`, which Postgres would bind to the inner table (docs/06).
 */
export function blockedBetween(a: SQL, b: SQL): SQL {
  return sql`exists (
    select 1 from user_blocks ub
    where (ub.blocker_id = ${a} and ub.blocked_id = ${b})
       or (ub.blocker_id = ${b} and ub.blocked_id = ${a})
  )`;
}

export function notBlockedBetween(a: SQL, b: SQL): SQL {
  return sql`not ${blockedBetween(a, b)}`;
}

/** Accepted friendship between two users, in whichever direction it was requested. */
export function friendsBetween(a: SQL, b: SQL): SQL {
  return sql`exists (
    select 1 from friendships fr
    where fr.status = 'accepted'
      and ((fr.requester_id = ${a} and fr.addressee_id = ${b})
        or (fr.requester_id = ${b} and fr.addressee_id = ${a}))
  )`;
}

/** First name only — the same rule as park visitors and reviews: enough to recognise a park friend. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
