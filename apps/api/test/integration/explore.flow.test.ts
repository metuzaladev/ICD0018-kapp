/**
 * M9b end to end with real auth, PostgreSQL/PostGIS and MinIO: place posts with photos (EXIF/GPS
 * stripped) → pending until approved → approval pays +15 once and notifies → feed, distance,
 * friends scope, likes/bookmarks (idempotent), reports, blocks both ways → map pins by tag.
 * Käpad: concurrent settlement pays each event once, daily caps, streak, invite bonus; concurrent
 * redemptions cannot overspend; idempotent redemption; refund; paw discount on a booking (single
 * use, freed by cancelling); the ledger is append-only.
 * Everything happens near Haapsalu so the Tallinn dev seed cannot interfere.
 */
import type { PlacePost, RewardsSummary } from '@kapp/shared';
import sharp from 'sharp';
import { eq, inArray, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db, pool } from '../../src/db/client';
import { checkIns, parks, providerHours, rewardLedger, serviceProviders, services, user } from '../../src/db/schema';
import { localDate } from '../../src/lib/calendar';
import type { PushJob } from '../../src/modules/notifications/push-queue';
import { appendEntries, lockBalance } from '../../src/modules/rewards/rewards.repository';
import { createServices } from '../../src/services';
import { makeCameraJpeg } from '../helpers';
import { buildRealApp, signUpAndGetCookie, testStorage } from './real-app';

const DOMAIN = '@explore-flow.test.invalid';
const RUN = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CENTER = { lat: 58.94, lng: 23.54 };

const pushes: PushJob[] = [];
const pushQueue = { enqueue: async (job: PushJob) => void pushes.push(job) };
const noReminders = { schedule: async () => {}, cancel: async () => {} };

let app: Awaited<ReturnType<typeof buildRealApp>>;
/** The same object graph as the API, for what has no HTTP route (moderation, settle). */
const svc = createServices(db, testStorage, 5000, { pushQueue, bookingReminders: noReminders });

const people = {
  kristi: { cookie: '', id: '' },
  mart: { cookie: '', id: '' },
  liis: { cookie: '', id: '' },
  uus: { cookie: '', id: '' },
};
type Who = keyof typeof people;
const ids = { parks: [] as string[], provider: '', service: '', post: '' };

const api = (who: Who, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, headers: { cookie: people[who].cookie }, payload });

async function balanceOf(userId: string) {
  const { rows } = await db.execute<{ balance: number; lifetime_earned: number; ledger: number }>(sql`
    select b.balance, b.lifetime_earned, (select coalesce(sum(l.delta), 0)::int from reward_ledger l where l.user_id = ${userId}) as ledger
    from reward_balances b where b.user_id = ${userId}`);
  return rows[0] ?? { balance: 0, lifetime_earned: 0, ledger: 0 };
}

/** A finished check-in at a given time (the API only creates "now" check-ins). */
async function pastCheckIn(userId: string, parkId: string, startedAt: Date, minutes: number) {
  await db.insert(checkIns).values({ userId, parkId, startedAt, expiresAt: new Date(startedAt.getTime() + 60 * 60_000), endedAt: new Date(startedAt.getTime() + minutes * 60_000) });
}

/** Points for redemption tests, written the way the server writes them (locked, through the ledger). */
async function grantPoints(userId: string, points: number, source: string) {
  await db.transaction(async (tx) => {
    await lockBalance(tx, userId);
    await appendEntries(tx, userId, [{ reason: 'place_post', sourceId: `test-grant-${source}`, delta: points, day: localDate(new Date(), 'Europe/Tallinn') }]);
  });
}

beforeAll(async () => {
  app = await buildRealApp(undefined, { pushQueue, bookingReminders: noReminders });
  for (const who of Object.keys(people) as Who[]) {
    people[who].cookie = await signUpAndGetCookie(app, `${who}-${RUN}${DOMAIN}`);
    people[who].id = (await api(who, 'GET', '/me')).json().id;
  }
  await db.update(user).set({ language: 'en' }).where(eq(user.id, people.kristi.id));
  // Accounts older than the invite window, except "uus" (new).
  await db
    .update(user)
    .set({ createdAt: new Date(Date.now() - 60 * DAY) })
    .where(inArray(user.id, [people.kristi.id, people.mart.id, people.liis.id]));

  const created = await db
    .insert(parks)
    .values(
      [0, 1, 2, 3, 4].map((i) => ({ name: `IT Haapsalu park ${i} ${RUN}`, location: { x: CENTER.lng + i * 0.002, y: CENTER.lat }, status: 'approved' as const })),
    )
    .returning({ id: parks.id });
  ids.parks = created.map((p) => p.id);

  const [provider] = await db
    .insert(serviceProviders)
    .values({ name: `IT Haapsalu partner ${RUN}`, category: 'grooming', area: 'Haapsalu', location: { x: CENTER.lng + 0.01, y: CENTER.lat }, pawDiscountPercent: 15 })
    .returning({ id: serviceProviders.id });
  ids.provider = provider!.id;
  await db.insert(providerHours).values([1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ providerId: ids.provider, weekday, opensAt: '08:00', closesAt: '20:00' })));
  const [service] = await db.insert(services).values({ providerId: ids.provider, name: 'Wash', durationMinutes: 60, priceCents: 4000 }).returning({ id: services.id });
  ids.service = service!.id;
});

afterAll(async () => {
  if (ids.provider) {
    await db.execute(sql`delete from bookings where provider_id = ${ids.provider}`);
    await db.delete(serviceProviders).where(eq(serviceProviders.id, ids.provider));
  }
  // Deleting the users cascades through the append-only ledger (allowed only as a cascade).
  await db.delete(user).where(like(user.email, `%${DOMAIN}`));
  if (ids.parks.length > 0) await db.delete(parks).where(inArray(parks.id, ids.parks));
  await app.close();
  await pool.end();
});

describe('place posts', () => {
  it('creates a pending post with a re-encoded photo that only the author sees', async () => {
    const jpeg = await makeCameraJpeg(1200, 900);
    const upload = await api('kristi', 'POST', '/me/place-posts/uploads', { contentType: 'image/jpeg', byteSize: jpeg.length });
    expect(upload.statusCode).toBe(201);
    const { uploadKey, url, headers } = upload.json();
    const put = await fetch(url, { method: 'PUT', headers, body: new Uint8Array(jpeg) });
    expect(put.status).toBe(200);

    const res = await api('kristi', 'POST', '/me/place-posts', {
      name: `IT Kohvik ${RUN}`,
      category: 'cafe',
      lat: CENTER.lat,
      lng: CENTER.lng + 0.001,
      amenities: ['dogs_inside', 'water_bowl'],
      body: 'Koerad on oodatud.',
      photoUploadKeys: [uploadKey],
    });
    expect(res.statusCode).toBe(201);
    const post = res.json() as PlacePost;
    ids.post = post.id;
    expect(post).toMatchObject({ status: 'pending', isMine: true, amenities: ['dogs_inside', 'water_bowl'], likeCount: 0 });
    expect(post.photos).toHaveLength(1);
    const photo = await sharp(Buffer.from(await (await fetch(post.photos[0]!.url)).arrayBuffer())).metadata();
    expect(photo.format).toBe('webp');
    expect(photo.exif).toBeUndefined();
    // The raw upload (with GPS) is gone.
    expect(await testStorage.stat(uploadKey)).toBeNull();

    expect((await api('mart', 'GET', `/place-posts/${post.id}`)).statusCode).toBe(404);
    const own = (await api('kristi', 'GET', `/place-posts?lat=${CENTER.lat}&lng=${CENTER.lng}&radiusKm=5`)).json();
    expect(own.items.map((p: PlacePost) => p.id)).toContain(post.id);
    const others = (await api('mart', 'GET', `/place-posts?lat=${CENTER.lat}&lng=${CENTER.lng}&radiusKm=5`)).json();
    expect(others.items.map((p: PlacePost) => p.id)).not.toContain(post.id);
  });

  it('rejects places outside Estonia and foreign upload keys', async () => {
    const outside = await api('kristi', 'POST', '/me/place-posts', { name: 'Helsinki', category: 'cafe', lat: 60.17, lng: 24.94 });
    expect(outside.statusCode).toBe(400);
    const foreign = await api('mart', 'POST', '/me/place-posts', {
      name: 'Võõras',
      category: 'cafe',
      lat: CENTER.lat,
      lng: CENTER.lng,
      photoUploadKeys: [`uploads/${people.kristi.id}/00000000-0000-4000-8000-000000000000`],
    });
    expect(foreign.statusCode).toBe(404);
  });

  it('approval pays the author +15 once and notifies in their language (rewards preference)', async () => {
    pushes.length = 0;
    const [first, second] = await Promise.all([svc.placePostsService.moderate(ids.post, 'approve'), svc.placePostsService.moderate(ids.post, 'approve')]);
    expect([first.changed, second.changed].sort()).toEqual([false, true]);
    const { rows } = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from reward_ledger where user_id = ${people.kristi.id} and reason = 'place_post' and source_id = ${ids.post}`,
    );
    expect(rows[0]!.n).toBe(1);
    expect(await balanceOf(people.kristi.id)).toMatchObject({ balance: 15, lifetime_earned: 15, ledger: 15 });

    const approved = pushes.find((p) => p.data.type === 'place_post_approved');
    expect(approved).toMatchObject({ language: 'en', title: 'Your recommendation is live', data: { postId: ids.post } });
    // Opt-in: the current app does not get reward rows unless it asks for them.
    const plain = (await api('kristi', 'GET', '/me/notifications')).json();
    expect(plain.items.some((n: { type: string }) => n.type === 'place_post_approved')).toBe(false);
    const withRewards = (await api('kristi', 'GET', '/me/notifications?include=rewards')).json();
    expect(withRewards.items.some((n: { type: string }) => n.type === 'place_post_approved')).toBe(true);
    expect((await api('kristi', 'GET', '/me/notifications/unread-count')).json().count).toBe(0);
    expect((await api('kristi', 'GET', '/me/notifications/unread-count?include=rewards')).json().count).toBeGreaterThan(0);

    // Preference off → feed row but no push.
    expect((await api('mart', 'PUT', '/me/notification-preferences', { messages: true, friendRequests: true, friendPlans: true, bookings: true })).json()).toMatchObject({ rewards: true });
    expect((await api('mart', 'PUT', '/me/notification-preferences', { messages: true, friendRequests: true, friendPlans: true, bookings: true, rewards: false })).json()).toMatchObject({ rewards: false });
    expect((await api('mart', 'PUT', '/me/notification-preferences', { messages: true, friendRequests: true, friendPlans: true, bookings: true })).json()).toMatchObject({ rewards: false });
  });

  it('shows the approved post to others with distance; friends scope needs a friendship', async () => {
    const feed = (await api('mart', 'GET', `/place-posts?lat=${CENTER.lat}&lng=${CENTER.lng}&radiusKm=5&category=cafe`)).json();
    const mine = feed.items.find((p: PlacePost) => p.id === ids.post);
    expect(mine).toMatchObject({ isMine: false, author: { firstName: 'Testija' }, status: 'approved' });
    expect(mine.distanceKm).toBeGreaterThanOrEqual(0);
    expect((await api('mart', 'GET', `/place-posts?lat=${CENTER.lat}&lng=${CENTER.lng}&radiusKm=5&category=park`)).json().items.map((p: PlacePost) => p.id)).not.toContain(ids.post);
    expect((await api('mart', 'GET', '/place-posts?scope=friends')).json().items.map((p: PlacePost) => p.id)).not.toContain(ids.post);
    expect((await app.inject({ method: 'GET', url: '/api/v1/place-posts?scope=friends' })).statusCode).toBe(401);

    await api('mart', 'POST', '/me/friend-requests', { userId: people.kristi.id });
    await api('kristi', 'POST', `/me/friend-requests/${people.mart.id}/accept`);
    expect((await api('mart', 'GET', '/place-posts?scope=friends')).json().items.map((p: PlacePost) => p.id)).toContain(ids.post);
    // Anonymous visitors see approved posts too.
    expect((await app.inject({ method: 'GET', url: `/api/v1/place-posts/${ids.post}` })).statusCode).toBe(200);
  });

  it('likes and bookmarks are idempotent; reports are once per person', async () => {
    expect((await api('mart', 'PUT', `/place-posts/${ids.post}/like`)).json()).toMatchObject({ liked: true, likeCount: 1 });
    expect((await api('mart', 'PUT', `/place-posts/${ids.post}/like`)).json()).toMatchObject({ liked: true, likeCount: 1 });
    expect((await api('kristi', 'PUT', `/place-posts/${ids.post}/like`)).json()).toMatchObject({ likeCount: 2 });
    expect((await api('mart', 'DELETE', `/place-posts/${ids.post}/like`)).json()).toMatchObject({ liked: false, likeCount: 1 });
    expect((await api('mart', 'DELETE', `/place-posts/${ids.post}/like`)).json()).toMatchObject({ liked: false, likeCount: 1 });
    expect((await api('mart', 'PUT', `/place-posts/${ids.post}/save`)).json()).toMatchObject({ saved: true });
    expect((await api('mart', 'GET', '/me/place-posts/saved')).json().items.map((p: PlacePost) => p.id)).toEqual([ids.post]);

    const first = await api('mart', 'POST', `/place-posts/${ids.post}/reports`, { reason: 'wrong_info' });
    expect(first.statusCode).toBe(201);
    const again = await api('mart', 'POST', `/place-posts/${ids.post}/reports`, { reason: 'spam' });
    expect(again.json().id).toBe(first.json().id);
    expect((await api('kristi', 'POST', `/place-posts/${ids.post}/reports`, { reason: 'spam' })).statusCode).toBe(400);
  });

  it('map pins: parks, posts and providers inside the box, filterable by tag', async () => {
    const box = `minLat=${CENTER.lat - 0.05}&maxLat=${CENTER.lat + 0.05}&minLng=${CENTER.lng - 0.05}&maxLng=${CENTER.lng + 0.05}`;
    const all = (await api('mart', 'GET', `/map/places?${box}`)).json() as { id: string; kind: string; tag: string }[];
    expect(all.find((p) => p.id === ids.post)).toMatchObject({ kind: 'post', tag: 'cafes' });
    expect(all.find((p) => p.id === ids.parks[0])).toMatchObject({ kind: 'park', tag: 'parks' });
    expect(all.find((p) => p.id === ids.provider)).toMatchObject({ kind: 'provider', tag: 'services' });
    const cafes = (await api('mart', 'GET', `/map/places?${box}&tags=cafes`)).json() as { tag: string }[];
    expect(cafes.every((p) => p.tag === 'cafes')).toBe(true);
    expect((await api('mart', 'GET', `/map/places?minLat=58&maxLat=60&minLng=23&maxLng=25`)).statusCode).toBe(400);
  });

  it('blocks hide posts both ways (feed, detail, map, reactions)', async () => {
    expect((await api('liis', 'PUT', `/me/blocks/${people.kristi.id}`)).statusCode).toBe(204);
    const box = `minLat=${CENTER.lat - 0.05}&maxLat=${CENTER.lat + 0.05}&minLng=${CENTER.lng - 0.05}&maxLng=${CENTER.lng + 0.05}`;
    for (const viewer of ['liis'] as const) {
      expect((await api(viewer, 'GET', `/place-posts?lat=${CENTER.lat}&lng=${CENTER.lng}`)).json().items.map((p: PlacePost) => p.id)).not.toContain(ids.post);
      expect((await api(viewer, 'GET', `/place-posts/${ids.post}`)).statusCode).toBe(404);
      expect((await api(viewer, 'PUT', `/place-posts/${ids.post}/like`)).statusCode).toBe(404);
      expect(((await api(viewer, 'GET', `/map/places?${box}`)).json() as { id: string }[]).map((p) => p.id)).not.toContain(ids.post);
    }
    // The other direction: a post by the blocker is hidden from the blocked author too.
    const liisPost = await svc.placePostsService.create(people.liis.id, {
      name: `IT Liisi rand ${RUN}`,
      category: 'beach',
      lat: CENTER.lat,
      lng: CENTER.lng,
      address: null,
      amenities: [],
      body: null,
      photoUploadKeys: [],
    });
    await svc.placePostsService.moderate(liisPost.id, 'approve');
    expect((await api('kristi', 'GET', `/place-posts/${liisPost.id}`)).statusCode).toBe(404);
    expect((await api('mart', 'GET', `/place-posts/${liisPost.id}`)).statusCode).toBe(200);
    await api('liis', 'DELETE', `/me/blocks/${people.kristi.id}`);
  });
});

describe('Käpad', () => {
  it('pays check-ins with caps, streaks and plans; concurrent settles pay once', async () => {
    const userId = people.mart.id;
    // Three days ago 10:00 Tallinn-ish: four qualifying check-ins in four parks + one too short.
    const base = new Date(Date.now() - 3 * DAY);
    base.setUTCHours(7, 0, 0, 0);
    for (let i = 0; i < 4; i++) await pastCheckIn(userId, ids.parks[i]!, new Date(base.getTime() + i * HOUR), 30);
    await pastCheckIn(userId, ids.parks[4]!, new Date(base.getTime() + 5 * HOUR), 10);
    // A second check-in in park 0 the same day pays nothing more (one per park per day).
    await pastCheckIn(userId, ids.parks[0]!, new Date(base.getTime() + 6 * HOUR), 40);
    // The next day: continues the streak.
    await pastCheckIn(userId, ids.parks[0]!, new Date(base.getTime() + DAY), 25);

    await Promise.all(Array.from({ length: 8 }, () => svc.rewardsService.settle(userId)));
    const { rows } = await db.execute<{ reason: string; n: number }>(
      sql`select reason, count(*)::int as n from reward_ledger where user_id = ${userId} group by reason order by reason`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.reason, r.n]))).toEqual({ check_in: 4, streak: 1 });
    // 3 (cap) + 1 next day = 4 check-ins × 5 + streak 5 = 25.
    expect(await balanceOf(userId)).toMatchObject({ balance: 25, lifetime_earned: 25, ledger: 25 });

    const summary = (await api('mart', 'GET', '/me/rewards')).json() as RewardsSummary;
    expect(summary).toMatchObject({ balance: 25, lifetimeEarned: 25, level: { id: 'puppy', next: { id: 'park_friend', pointsToGo: 175 } } });
    expect(summary.streak.lastDays).toHaveLength(7);
    expect(summary.badges.find((b) => b.id === 'ten_parks')).toMatchObject({ progress: 4, target: 10, unlocked: false });
    expect(summary.waysToEarn.find((w) => w.reason === 'check_in')).toMatchObject({ points: 5, dailyLimit: 3 });

    const history = (await api('mart', 'GET', '/me/rewards/history?limit=2')).json();
    expect(history.items).toHaveLength(2);
    expect(history.nextCursor).not.toBeNull();
  });

  it('the first review of a park pays once', async () => {
    const res = await api('mart', 'PUT', `/parks/${ids.parks[1]}/reviews/mine`, { rating: 5 });
    expect(res.statusCode).toBe(200);
    await api('mart', 'PUT', `/parks/${ids.parks[1]}/reviews/mine`, { rating: 4, body: 'Muudetud' });
    const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from reward_ledger where user_id = ${people.mart.id} and reason = 'review'`);
    expect(rows[0]!.n).toBe(1);
  });

  it('invite: a new user claims a code once; the inviter is paid after the invitee checks in', async () => {
    const invite = (await api('kristi', 'GET', '/me/invite')).json();
    expect(invite.code).toMatch(/^[A-Z2-9]{8}$/);
    expect((await api('kristi', 'GET', '/me/invite')).json().code).toBe(invite.code);
    expect((await api('kristi', 'POST', '/me/invite/claim', { code: invite.code })).statusCode).toBe(400);
    expect((await api('mart', 'POST', '/me/invite/claim', { code: invite.code })).statusCode).toBe(409); // too old
    expect((await api('uus', 'POST', '/me/invite/claim', { code: 'ZZZZZZZZ' })).statusCode).toBe(404);
    expect((await api('uus', 'POST', '/me/invite/claim', { code: invite.code.toLowerCase() })).statusCode).toBe(204);
    expect((await api('uus', 'POST', '/me/invite/claim', { code: invite.code })).statusCode).toBe(409);
    const requests = (await api('kristi', 'GET', '/me/friend-requests')).json();
    expect(JSON.stringify(requests)).toContain(people.uus.id);

    const before = (await balanceOf(people.kristi.id)).balance;
    await pastCheckIn(people.uus.id, ids.parks[2]!, new Date(Date.now() - 2 * HOUR), 30);
    await svc.rewardsService.settle(people.uus.id);
    expect((await balanceOf(people.kristi.id)).balance).toBe(before + 25);
    await svc.rewardsService.settle(people.uus.id);
    expect((await balanceOf(people.kristi.id)).balance).toBe(before + 25);
  });

  it('concurrent redemptions cannot overspend; idempotent retry; refund keeps the level', async () => {
    const userId = people.liis.id;
    // Liis already has +15 for her approved post; top up to exactly one redemption's worth.
    const start = await balanceOf(userId);
    expect(start.balance).toBe(15);
    await grantPoints(userId, 150 - start.balance, 'liis');
    const attempts = await Promise.all(Array.from({ length: 5 }, () => api('liis', 'POST', '/me/redemptions', { offerType: 'booking', offerId: ids.provider })));
    expect(attempts.map((r) => r.statusCode).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await balanceOf(userId)).toMatchObject({ balance: 0, lifetime_earned: 150, ledger: 0 });
    const redemption = attempts.find((r) => r.statusCode === 201)!.json();
    expect(redemption).toMatchObject({ offerType: 'booking', discountPercent: 15, pointsCost: 150, status: 'active' });
    expect(redemption.code).toMatch(/^[A-Z2-9]{10}$/);

    const refunded = await api('liis', 'POST', `/me/redemptions/${redemption.id}/cancel`);
    expect(refunded.json()).toMatchObject({ status: 'cancelled' });
    expect((await api('liis', 'POST', `/me/redemptions/${redemption.id}/cancel`)).statusCode).toBe(200);
    expect(await balanceOf(userId)).toMatchObject({ balance: 150, lifetime_earned: 150, ledger: 150 });
    expect((await api('mart', 'POST', `/me/redemptions/${redemption.id}/cancel`)).statusCode).toBe(404);

    const key = crypto.randomUUID();
    const first = await api('liis', 'POST', '/me/redemptions', { offerType: 'booking', offerId: ids.provider, idempotencyKey: key });
    const retry = await api('liis', 'POST', '/me/redemptions', { offerType: 'booking', offerId: ids.provider, idempotencyKey: key });
    expect([first.statusCode, retry.statusCode]).toEqual([201, 200]);
    expect(retry.json().id).toBe(first.json().id);
    expect((await balanceOf(userId)).balance).toBe(0);
  });

  it('a paw discount applies to one booking; cancelling the booking frees the code', async () => {
    const [code] = (await api('liis', 'GET', '/me/redemptions')).json().filter((r: { status: string }) => r.status === 'active');
    const dog = (await api('liis', 'POST', '/me/dogs', { name: 'Muki' })).json();
    const slots = (await api('liis', 'GET', `/services/${ids.service}/slots?days=3`)).json();
    const [a, b] = slots.days[1].slots;
    const booked = await api('liis', 'POST', '/me/bookings', { serviceId: ids.service, startsAt: a.startsAt, dogIds: [dog.id], redemptionId: code.id });
    expect(booked.statusCode).toBe(201);
    expect(booked.json()).toMatchObject({ priceCents: 4000, discount: { redemptionId: code.id, discountPercent: 15, discountedPriceCents: 3400 } });
    expect((await api('liis', 'GET', '/me/redemptions')).json().find((r: { id: string }) => r.id === code.id)).toMatchObject({ status: 'used', bookingId: booked.json().id });
    // Single use; and a used code cannot be refunded.
    const second = await api('liis', 'POST', '/me/bookings', { serviceId: ids.service, startsAt: b.startsAt, dogIds: [dog.id], redemptionId: code.id });
    expect(second.statusCode).toBe(409);
    expect((await api('liis', 'POST', `/me/redemptions/${code.id}/cancel`)).statusCode).toBe(409);
    // Someone else's code is not found.
    expect((await api('mart', 'POST', '/me/bookings', { serviceId: ids.service, startsAt: b.startsAt, dogIds: [dog.id], redemptionId: code.id })).statusCode).toBe(404);

    await api('liis', 'POST', `/me/bookings/${booked.json().id}/cancel`);
    expect((await api('liis', 'GET', '/me/redemptions')).json().find((r: { id: string }) => r.id === code.id)).toMatchObject({ status: 'active', bookingId: null });
  });

  it('the ledger is append-only and the balance cannot go negative', async () => {
    await expect(db.execute(sql`update reward_ledger set delta = 1000 where user_id = ${people.mart.id}`)).rejects.toThrow();
    await expect(db.delete(rewardLedger).where(eq(rewardLedger.userId, people.mart.id))).rejects.toThrow();
    await expect(db.execute(sql`update reward_balances set balance = -1 where user_id = ${people.mart.id}`)).rejects.toThrow();
  });
});
