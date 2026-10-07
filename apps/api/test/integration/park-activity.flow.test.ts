/**
 * M11 "Lemmikparkides täna" end to end with real auth and PostgreSQL: GET /parks/activity counts
 * today's plans by part of day under the presence-privacy rules (docs/12 → M11) — everyone counted,
 * friends-only counted for friends, "nobody" never, blocks both ways, own plans not counted, names
 * only for friends — plus the live dog counter. Parks are near Viljandi so no seed data interferes.
 */
import type { DayPart, ParkActivityResponse } from '@kapp/shared';
import { inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db, pool } from '../../src/db/client';
import { checkInDogs, checkIns, dogs, friendships, parks, plannedVisits, user, userBlocks } from '../../src/db/schema';
import { dayPartWindows } from '../../src/modules/park-activity/day-parts';
import { buildRealApp, signUpAndGetCookie } from './real-app';

const DOMAIN = '@park-activity-flow.test.invalid';
const RUN = Date.now();
let app: Awaited<ReturnType<typeof buildRealApp>>;
let cookie = '';
let viewerId = '';
const parkIds = { a: '', b: '', pending: '' };

const get = (url: string) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie } });

// A plan from now to 20 minutes from now (or to the end of the Tallinn day), and the part it is in.
const now = new Date();
const { windows } = dayPartWindows(now);
const current = windows.find((w) => w.start <= now && now < w.end)!;
const planStart = new Date(now.getTime() + 60_000);
const planEnd = new Date(Math.min(now.getTime() + 20 * 60_000, windows[2]!.end.getTime()));
const part: DayPart = current.part;
// Plans need at least a minute of today left; skip in the last two minutes before Tallinn midnight.
const tooLate = windows[2]!.end.getTime() - now.getTime() < 2 * 60_000;

async function seedUser(key: string, presence: 'everyone' | 'friends' | 'nobody') {
  const id = `${key}-${RUN}`;
  await db.insert(user).values({ id, name: `${key[0]!.toUpperCase()}${key.slice(1)} Perenimi`, email: `${id}${DOMAIN}`, presenceSharing: presence });
  return id;
}

async function plan(userId: string, parkId: string, startsAt = planStart, endsAt = planEnd) {
  await db.insert(plannedVisits).values({ userId, parkId, startsAt, endsAt });
}

beforeAll(async () => {
  app = await buildRealApp();
  cookie = await signUpAndGetCookie(app, `viewer-${RUN}${DOMAIN}`);
  viewerId = (await get('/me')).json().id;
  const created = await db
    .insert(parks)
    .values([
      { name: 'IT Viljandi A', location: { x: 25.59, y: 58.36 }, status: 'approved' },
      { name: 'IT Viljandi B', location: { x: 25.6, y: 58.361 }, status: 'approved' },
      { name: 'IT Viljandi ootel', location: { x: 25.61, y: 58.362 }, status: 'pending' },
    ])
    .returning({ id: parks.id, name: parks.name });
  parkIds.a = created.find((p) => p.name === 'IT Viljandi A')!.id;
  parkIds.b = created.find((p) => p.name === 'IT Viljandi B')!.id;
  parkIds.pending = created.find((p) => p.name === 'IT Viljandi ootel')!.id;
  if (tooLate) return;

  const everyone = await seedUser('everyone', 'everyone');
  const friend = await seedUser('mari', 'friends');
  const stranger = await seedUser('stranger', 'friends');
  const hiddenFriend = await seedUser('hidden', 'nobody');
  const blocker = await seedUser('blocker', 'everyone');
  const blockedByMe = await seedUser('blocked', 'everyone');
  await db.insert(friendships).values([
    { requesterId: viewerId, addresseeId: friend, status: 'accepted' },
    { requesterId: hiddenFriend, addresseeId: viewerId, status: 'accepted' },
  ]);
  await db.insert(userBlocks).values([
    { blockerId: blocker, blockedId: viewerId },
    { blockerId: viewerId, blockedId: blockedByMe },
  ]);

  // Park A: everyone + friend count; stranger (friends-only), "nobody", both blocks and my own plan do not.
  for (const id of [everyone, friend, stranger, hiddenFriend, blocker, blockedByMe, viewerId]) await plan(id, parkIds.a);
  // A second plan by the same person counts once.
  await plan(everyone, parkIds.a);
  // A plan that is already over today and one tomorrow do not count.
  await plan(everyone, parkIds.b, new Date(now.getTime() - 30 * 60_000), new Date(now.getTime() - 60_000));
  await plan(everyone, parkIds.b, new Date(windows[2]!.end.getTime() + 60 * 60_000), new Date(windows[2]!.end.getTime() + 2 * 60 * 60_000));
  // Pending park: never answered.
  await plan(everyone, parkIds.pending);

  // Dogs in park B now (the public counter, hidden owners included like on the map).
  const [dog] = await db.insert(dogs).values({ ownerId: hiddenFriend, name: 'Muki' }).returning({ id: dogs.id });
  const [ci] = await db
    .insert(checkIns)
    .values({ userId: hiddenFriend, parkId: parkIds.b, expiresAt: new Date(Date.now() + 3_600_000) })
    .returning({ id: checkIns.id });
  await db.insert(checkInDogs).values({ checkInId: ci!.id, dogId: dog!.id });
});

afterAll(async () => {
  await db.delete(parks).where(inArray(parks.id, Object.values(parkIds).filter(Boolean)));
  await db.delete(user).where(like(user.email, `%${DOMAIN}`));
  await app.close();
  await pool.end();
});

describe.skipIf(tooLate)('GET /parks/activity', () => {
  it('counts visible plans per part of day and names only friends', async () => {
    const res = await get(`/parks/activity?ids=${parkIds.b},${parkIds.a},${parkIds.pending}`);
    expect(res.statusCode).toBe(200);
    const body = res.json<ParkActivityResponse>();
    // Requested order, pending park left out.
    expect(body.parks.map((p) => p.id)).toEqual([parkIds.b, parkIds.a]);
    const a = body.parks[1]!;
    expect(a.name).toBe('IT Viljandi A');
    expect(a.activeDogs).toBe(0);
    expect(a.planned[part]).toBe(2);
    expect(Object.values(a.planned).reduce((s, n) => s + n, 0)).toBeGreaterThanOrEqual(2);
    expect(a.friends).toEqual([{ firstName: 'Mari', part }]);
    // No ids or other names anywhere in the answer.
    expect(JSON.stringify(body)).not.toMatch(/everyone-|stranger|Hidden|Blocker|Blocked|user_/i);
  });

  it('past and tomorrow plans do not count; the live dog counter includes hidden owners', async () => {
    const res = await get(`/parks/activity?ids=${parkIds.b}`);
    const b = res.json<ParkActivityResponse>().parks[0]!;
    expect(b.planned).toEqual({ morning: 0, day: 0, evening: 0 });
    expect(b.activeDogs).toBe(1);
    expect(b.friends).toEqual([]);
  });

  it('only the pending park → empty list, not 404', async () => {
    const res = await get(`/parks/activity?ids=${parkIds.pending}`);
    expect(res.statusCode).toBe(200);
    expect(res.json<ParkActivityResponse>().parks).toEqual([]);
  });

  it('401 without a session', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/parks/activity?ids=${parkIds.a}` });
    expect(res.statusCode).toBe(401);
  });
});
