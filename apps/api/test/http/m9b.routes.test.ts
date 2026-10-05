import type { PlacePost, Redemption, RewardsSummary } from '@kapp/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { ConflictError, NotFoundError, UnauthorizedError } from '../../src/http/errors';
import { TimeoutError } from '../../src/lib/timeout';
import { buildTestApp, fakeAuth, USER_ID } from '../helpers';
import { expectApiError } from './expect-api-error';

let ctx: Awaited<ReturnType<typeof buildTestApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

const auth = { authorization: 'Bearer test' };
const POST = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const PROVIDER = '0b6f6a52-3c1e-4c1b-9a37-2f1e5d4c3b2a';
const PRODUCT = '6b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e';
const REDEMPTION = '7c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f';
const UPLOAD_KEY = `uploads/${USER_ID}/00000000-0000-4000-8000-000000000001`;

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
const app = async (config = {}) => (ctx = await buildTestApp({ resolveUserId: fakeAuth }, config));
const req = (method: Method, url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  ctx!.app.inject({ method, url: `/api/v1${url}`, headers: { ...auth, ...headers }, payload: payload as object });
const anon = (method: Method, url: string, payload?: unknown) => ctx!.app.inject({ method, url: `/api/v1${url}`, payload: payload as object });

const post: PlacePost = {
  id: POST,
  author: { id: USER_ID, firstName: 'Kristi' },
  isMine: true,
  name: 'Kohvik Käpajälg',
  category: 'cafe',
  lat: 59.447,
  lng: 24.734,
  address: null,
  amenities: ['water_bowl'],
  body: null,
  photos: [],
  status: 'pending',
  likeCount: 0,
  liked: false,
  saved: false,
  createdAt: '2026-10-05T07:00:00.000Z',
};
const validPost = { name: 'Kohvik Käpajälg', category: 'cafe', lat: 59.447, lng: 24.734, amenities: ['water_bowl'], photoUploadKeys: [UPLOAD_KEY] };
const redemption: Redemption = {
  id: REDEMPTION,
  offerType: 'product',
  provider: { id: PROVIDER, name: 'Hea Kutsu' },
  product: { id: PRODUCT, name: 'Maiused' },
  discountPercent: 15,
  pointsCost: 150,
  code: 'ABCDEFGHJK',
  status: 'active',
  expiresAt: '2026-11-04T07:00:00.000Z',
  bookingId: null,
  createdAt: '2026-10-05T07:00:00.000Z',
};
const page = { items: [post], nextCursor: null };

describe('place posts', () => {
  it('GET /place-posts is public and passes the parsed query and viewer', async () => {
    await app();
    ctx!.placePosts.feed.mockResolvedValue(page);
    const res = await anon('GET', '/place-posts?lat=59.4&lng=24.7&category=cafe');
    expect(res.statusCode).toBe(200);
    expect(ctx!.placePosts.feed).toHaveBeenCalledWith(undefined, expect.objectContaining({ lat: 59.4, lng: 24.7, category: 'cafe', scope: 'all', limit: 20 }));
    await req('GET', '/place-posts?scope=friends');
    expect(ctx!.placePosts.feed).toHaveBeenLastCalledWith(USER_ID, expect.objectContaining({ scope: 'friends' }));
  });

  it.each([
    ['lat without lng', '?lat=59.4', /lat/],
    ['unknown category', '?category=zoo', /category/],
    ['bad scope', '?scope=everyone', /scope/],
    ['bad cursor', '?before=nope', /before/],
    ['limit too large', '?limit=500', /limit/],
  ])('GET /place-posts %s → 400', async (_label, query, message) => {
    await app();
    const res = await anon('GET', `/place-posts${query}`);
    expect(res.statusCode).toBe(400);
    expectApiError(res, message);
  });

  it('friends scope without a session → 401 (from the service)', async () => {
    await app();
    ctx!.placePosts.feed.mockRejectedValue(new UnauthorizedError());
    expect((await anon('GET', '/place-posts?scope=friends')).statusCode).toBe(401);
  });

  it('GET /place-posts/:postId → 200, invalid id 400, hidden/foreign 404', async () => {
    await app();
    ctx!.placePosts.get.mockResolvedValue(post);
    expect((await anon('GET', `/place-posts/${POST}`)).json()).toEqual(post);
    expect((await anon('GET', '/place-posts/123')).statusCode).toBe(400);
    ctx!.placePosts.get.mockRejectedValue(new NotFoundError('errors.placePostNotFound'));
    const missing = await req('GET', `/place-posts/${POST}`, undefined, { 'accept-language': 'en' });
    expect(missing.statusCode).toBe(404);
    expectApiError(missing, 'Post not found');
  });

  it('GET /map/places validates the box and tags', async () => {
    await app();
    ctx!.placePosts.mapPlaces.mockResolvedValue([]);
    expect((await anon('GET', '/map/places?minLat=59.3&maxLat=59.5&minLng=24.6&maxLng=24.9&tags=parks,cafes')).statusCode).toBe(200);
    expect(ctx!.placePosts.mapPlaces).toHaveBeenCalledWith(undefined, expect.objectContaining({ tags: ['parks', 'cafes'] }));
    for (const query of ['minLat=59.3&maxLat=59.5&minLng=24.6', 'minLat=58&maxLat=59.5&minLng=24.6&maxLng=24.9', 'minLat=59.3&maxLat=59.5&minLng=24.6&maxLng=24.9&tags=zoo']) {
      expect((await anon('GET', `/map/places?${query}`)).statusCode).toBe(400);
    }
  });

  it('write routes need a session (401 before validation)', async () => {
    await app();
    for (const [method, url] of [
      ['POST', '/me/place-posts/uploads'],
      ['POST', '/me/place-posts'],
      ['GET', '/me/place-posts'],
      ['GET', '/me/place-posts/saved'],
      ['DELETE', `/me/place-posts/${POST}`],
      ['PUT', `/place-posts/${POST}/like`],
      ['DELETE', `/place-posts/${POST}/like`],
      ['PUT', `/place-posts/${POST}/save`],
      ['DELETE', `/place-posts/${POST}/save`],
      ['POST', `/place-posts/${POST}/reports`],
    ] as [Method, string][]) {
      const res = await anon(method, url, { junk: true });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
      expectApiError(res);
    }
  });

  it('POST /me/place-posts → 201; invalid bodies → 400', async () => {
    await app();
    ctx!.placePosts.create.mockResolvedValue(post);
    const res = await req('POST', '/me/place-posts', validPost);
    expect(res.statusCode).toBe(201);
    expect(ctx!.placePosts.create).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ name: 'Kohvik Käpajälg', body: null, address: null }));

    const bad: [string, unknown, RegExp][] = [
      ['missing body', undefined, /sisu puudub/],
      ['null name', { ...validPost, name: null }, /name/],
      ['number as string', { ...validPost, lat: '59.4' }, /lat/],
      ['unknown field', { ...validPost, status: 'approved' }, /status/],
      ['outside Estonia', { ...validPost, lat: 60.17, lng: 24.94 }, /Eestis/],
      ['unknown amenity', { ...validPost, amenities: ['pool'] }, /amenities/],
      ['six photos', { ...validPost, photoUploadKeys: Array.from({ length: 6 }, (_, i) => `uploads/${USER_ID}/00000000-0000-4000-8000-00000000000${i}`) }, /photoUploadKeys/],
      ['body too long', { ...validPost, body: 'x'.repeat(1001) }, /body/],
    ];
    for (const [label, body, message] of bad) {
      const r = await req('POST', '/me/place-posts', body);
      expect(r.statusCode, label).toBe(400);
      expectApiError(r, message);
    }
  });

  it('POST /me/place-posts: foreign upload → 404; slow database → 503', async () => {
    await app();
    ctx!.placePosts.create.mockRejectedValueOnce(new NotFoundError('errors.uploadNotFound'));
    expect((await req('POST', '/me/place-posts', validPost)).statusCode).toBe(404);
    ctx!.placePosts.create.mockRejectedValueOnce(new TimeoutError('placePosts.create', 1000));
    expect((await req('POST', '/me/place-posts', validPost)).statusCode).toBe(503);
  });

  it('POST /me/place-posts is rate limited: the 11th within an hour → 429', async () => {
    await app({ rateLimitMax: 1000 });
    ctx!.placePosts.create.mockResolvedValue(post);
    for (let i = 0; i < 10; i++) expect((await req('POST', '/me/place-posts', validPost)).statusCode).toBe(201);
    const limited = await req('POST', '/me/place-posts', validPost);
    expect(limited.statusCode).toBe(429);
    expectApiError(limited);
  });

  it('POST /me/place-posts/uploads → 201; wrong type or too large → 400', async () => {
    await app();
    ctx!.placePosts.createUpload.mockResolvedValue({ uploadKey: UPLOAD_KEY, url: 'https://s.test/x', headers: {}, expiresAt: '2026-10-05T07:10:00.000Z' });
    expect((await req('POST', '/me/place-posts/uploads', { contentType: 'image/jpeg', byteSize: 1000 })).statusCode).toBe(201);
    expect((await req('POST', '/me/place-posts/uploads', { contentType: 'image/gif', byteSize: 1000 })).statusCode).toBe(400);
    expect((await req('POST', '/me/place-posts/uploads', { contentType: 'image/jpeg', byteSize: 50 * 1024 * 1024 })).statusCode).toBe(400);
  });

  it('own and saved lists, delete', async () => {
    await app();
    ctx!.placePosts.mine.mockResolvedValue(page);
    ctx!.placePosts.saved.mockResolvedValue(page);
    expect((await req('GET', '/me/place-posts?limit=5')).statusCode).toBe(200);
    expect(ctx!.placePosts.mine).toHaveBeenCalledWith(USER_ID, { limit: 5 });
    expect((await req('GET', `/me/place-posts/saved?before=${POST}`)).statusCode).toBe(200);
    expect((await req('GET', '/me/place-posts/saved?before=x')).statusCode).toBe(400);
    ctx!.placePosts.remove.mockResolvedValueOnce(undefined);
    expect((await req('DELETE', `/me/place-posts/${POST}`)).statusCode).toBe(204);
    ctx!.placePosts.remove.mockRejectedValueOnce(new NotFoundError('errors.placePostNotFound'));
    expect((await req('DELETE', `/me/place-posts/${POST}`)).statusCode).toBe(404);
  });

  it('PUT/DELETE like and save are idempotent pass-throughs; 404 for hidden posts; 400 for bad ids', async () => {
    await app();
    ctx!.placePosts.setLike.mockResolvedValue({ liked: true, saved: false, likeCount: 1 });
    ctx!.placePosts.setSave.mockResolvedValue({ liked: true, saved: true, likeCount: 1 });
    expect((await req('PUT', `/place-posts/${POST}/like`)).json()).toEqual({ liked: true, saved: false, likeCount: 1 });
    await req('DELETE', `/place-posts/${POST}/like`);
    expect(ctx!.placePosts.setLike.mock.calls).toEqual([
      [USER_ID, POST, true],
      [USER_ID, POST, false],
    ]);
    await req('PUT', `/place-posts/${POST}/save`);
    await req('DELETE', `/place-posts/${POST}/save`);
    expect(ctx!.placePosts.setSave.mock.calls.map((c) => c[2])).toEqual([true, false]);
    expect((await req('PUT', '/place-posts/abc/like')).statusCode).toBe(400);
    ctx!.placePosts.setLike.mockRejectedValue(new NotFoundError('errors.placePostNotFound'));
    expect((await req('PUT', `/place-posts/${POST}/like`)).statusCode).toBe(404);
  });

  it('POST reports → 201; "other" needs details; 6th within an hour → 429', async () => {
    await app({ rateLimitMax: 1000 });
    ctx!.placePosts.report.mockResolvedValue({ id: 'r1' });
    expect((await req('POST', `/place-posts/${POST}/reports`, { reason: 'other' })).statusCode).toBe(400);
    for (let i = 0; i < 4; i++) expect((await req('POST', `/place-posts/${POST}/reports`, { reason: 'spam' })).statusCode).toBe(201);
    expect((await req('POST', `/place-posts/${POST}/reports`, { reason: 'spam' })).statusCode).toBe(429);
  });
});

describe('rewards', () => {
  const summary: RewardsSummary = {
    balance: 25,
    lifetimeEarned: 25,
    level: { id: 'puppy', index: 0, minPoints: 0, next: { id: 'park_friend', minPoints: 200, pointsToGo: 175 }, progress: 0.125 },
    streak: { current: 1, lastDays: Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-0${i + 1}`, active: i === 6 })) },
    badges: [],
    waysToEarn: [],
  };

  it('GET /me/rewards → 200; 401 without a session; 503 when slow', async () => {
    await app();
    ctx!.rewards.summary.mockResolvedValue(summary);
    expect((await req('GET', '/me/rewards')).json()).toEqual(summary);
    expect((await anon('GET', '/me/rewards')).statusCode).toBe(401);
    ctx!.rewards.summary.mockRejectedValue(new TimeoutError('rewards.balance', 1000));
    const slow = await req('GET', '/me/rewards');
    expect(slow.statusCode).toBe(503);
    expectApiError(slow);
  });

  it('GET /me/rewards/history validates the cursor', async () => {
    await app();
    ctx!.rewards.history.mockResolvedValue({ items: [], nextCursor: null });
    expect((await req('GET', `/me/rewards/history?before=${POST}&limit=10`)).statusCode).toBe(200);
    expect(ctx!.rewards.history).toHaveBeenCalledWith(USER_ID, { before: POST, limit: 10 });
    expect((await req('GET', '/me/rewards/history?limit=0')).statusCode).toBe(400);
    expect((await anon('GET', '/me/rewards/history')).statusCode).toBe(401);
  });

  it('there is no route to add points', async () => {
    await app();
    expect((await req('POST', '/me/rewards', { delta: 1000 })).statusCode).toBe(404);
  });
});

describe('shop and redemptions', () => {
  it('catalogue is public', async () => {
    await app();
    ctx!.shop.overview.mockResolvedValue({ categories: [], partners: [], products: [] });
    ctx!.shop.products.mockResolvedValue([]);
    expect((await anon('GET', '/shop?lat=59.4&lng=24.7')).statusCode).toBe(200);
    expect((await anon('GET', '/shop?lat=59.4')).statusCode).toBe(400);
    expect((await anon('GET', '/shop/products?category=treats')).statusCode).toBe(200);
    expect(ctx!.shop.products).toHaveBeenCalledWith({ category: 'treats' });
    expect((await anon('GET', '/shop/products?category=cars')).statusCode).toBe(400);
    ctx!.shop.product.mockRejectedValue(new NotFoundError('errors.productNotFound'));
    expect((await anon('GET', `/shop/products/${PRODUCT}`)).statusCode).toBe(404);
    expect((await anon('GET', '/shop/products/x')).statusCode).toBe(400);
  });

  it('POST /me/redemptions → 201 new, 200 idempotent retry; client cannot set the cost', async () => {
    await app();
    ctx!.shop.redeem.mockResolvedValueOnce({ redemption, created: true }).mockResolvedValueOnce({ redemption, created: false });
    const body = { offerType: 'product', offerId: PRODUCT, idempotencyKey: POST };
    expect((await req('POST', '/me/redemptions', body)).statusCode).toBe(201);
    expect((await req('POST', '/me/redemptions', body)).statusCode).toBe(200);
    expect((await req('POST', '/me/redemptions', { ...body, pointsCost: 1 })).statusCode).toBe(400);
    expect((await req('POST', '/me/redemptions', { offerType: 'gift', offerId: PRODUCT })).statusCode).toBe(400);
    expect((await req('POST', '/me/redemptions', null)).statusCode).toBe(400);
    expect((await anon('POST', '/me/redemptions', body)).statusCode).toBe(401);
  });

  it('POST /me/redemptions: not enough points 409 (translated), unknown offer 404', async () => {
    await app();
    ctx!.shop.redeem.mockRejectedValueOnce(new ConflictError('errors.notEnoughPoints', { cost: 150, balance: 40 }));
    const res = await req('POST', '/me/redemptions', { offerType: 'product', offerId: PRODUCT }, { 'accept-language': 'en' });
    expect(res.statusCode).toBe(409);
    expectApiError(res, 'Not enough paws: 150 needed, you have 40');
    ctx!.shop.redeem.mockRejectedValueOnce(new NotFoundError('errors.offerNotFound'));
    expect((await req('POST', '/me/redemptions', { offerType: 'product', offerId: PRODUCT })).statusCode).toBe(404);
  });

  it('POST /me/redemptions: the 11th within an hour → 429', async () => {
    await app({ rateLimitMax: 1000 });
    ctx!.shop.redeem.mockResolvedValue({ redemption, created: true });
    for (let i = 0; i < 10; i++) await req('POST', '/me/redemptions', { offerType: 'product', offerId: PRODUCT });
    expect((await req('POST', '/me/redemptions', { offerType: 'product', offerId: PRODUCT })).statusCode).toBe(429);
  });

  it('list and cancel', async () => {
    await app();
    ctx!.shop.listRedemptions.mockResolvedValue([redemption]);
    expect((await req('GET', '/me/redemptions')).json()).toEqual([redemption]);
    ctx!.shop.cancelRedemption.mockResolvedValueOnce({ ...redemption, status: 'cancelled' });
    expect((await req('POST', `/me/redemptions/${REDEMPTION}/cancel`)).json().status).toBe('cancelled');
    ctx!.shop.cancelRedemption.mockRejectedValueOnce(new ConflictError('errors.redemptionNotCancellable'));
    expect((await req('POST', `/me/redemptions/${REDEMPTION}/cancel`)).statusCode).toBe(409);
    ctx!.shop.cancelRedemption.mockRejectedValueOnce(new NotFoundError('errors.redemptionNotFound'));
    expect((await req('POST', `/me/redemptions/${REDEMPTION}/cancel`)).statusCode).toBe(404);
    expect((await req('POST', '/me/redemptions/nope/cancel')).statusCode).toBe(400);
  });

  it('POST /me/bookings accepts an optional redemptionId (uuid)', async () => {
    await app();
    ctx!.bookings.create.mockResolvedValue({});
    const body = { serviceId: PROVIDER, startsAt: '2026-10-06T07:00:00.000Z', dogIds: [PRODUCT] };
    expect((await req('POST', '/me/bookings', { ...body, redemptionId: REDEMPTION })).statusCode).toBe(201);
    expect(ctx!.bookings.create).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ redemptionId: REDEMPTION }));
    expect((await req('POST', '/me/bookings', { ...body, redemptionId: 'x' })).statusCode).toBe(400);
    expect((await req('POST', '/me/bookings', body)).statusCode).toBe(201);
  });
});

describe('invites', () => {
  it('GET /me/invite and POST /me/invite/claim', async () => {
    await app();
    ctx!.friends.getInvite.mockResolvedValue({ code: 'ABCDEFGH', points: 25 });
    expect((await req('GET', '/me/invite')).json()).toEqual({ code: 'ABCDEFGH', points: 25 });
    ctx!.friends.claimInvite.mockResolvedValueOnce(undefined);
    expect((await req('POST', '/me/invite/claim', { code: 'abcdefgh' })).statusCode).toBe(204);
    expect(ctx!.friends.claimInvite).toHaveBeenCalledWith(USER_ID, 'ABCDEFGH');
    expect((await req('POST', '/me/invite/claim', { code: '123' })).statusCode).toBe(400);
    expect((await req('POST', '/me/invite/claim', { code: 'ABCDEFGH', extra: 1 })).statusCode).toBe(400);
    ctx!.friends.claimInvite.mockRejectedValueOnce(new ConflictError('errors.inviteTooLate', { days: 14 }));
    expectApiError(await req('POST', '/me/invite/claim', { code: 'ABCDEFGH' }, { 'accept-language': 'ru' }), /14/);
    ctx!.friends.claimInvite.mockRejectedValueOnce(new NotFoundError('errors.inviteNotFound'));
    expect((await req('POST', '/me/invite/claim', { code: 'ABCDEFGH' })).statusCode).toBe(404);
    expect((await anon('GET', '/me/invite')).statusCode).toBe(401);
  });

  it('claiming is rate limited: the 11th within an hour → 429', async () => {
    await app({ rateLimitMax: 1000 });
    ctx!.friends.claimInvite.mockRejectedValue(new NotFoundError('errors.inviteNotFound'));
    for (let i = 0; i < 10; i++) await req('POST', '/me/invite/claim', { code: 'ABCDEFGH' });
    expect((await req('POST', '/me/invite/claim', { code: 'ABCDEFGH' })).statusCode).toBe(429);
  });
});

describe('notifications: opt-in reward types and the rewards preference', () => {
  it('feed and unread count take include=rewards; anything else is 400', async () => {
    await app();
    ctx!.notifications.list.mockResolvedValue({ items: [], nextCursor: null });
    ctx!.notifications.unreadCount.mockResolvedValue({ count: 0 });
    await req('GET', '/me/notifications?include=rewards');
    expect(ctx!.notifications.list).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ include: 'rewards' }));
    await req('GET', '/me/notifications/unread-count?include=rewards');
    expect(ctx!.notifications.unreadCount).toHaveBeenCalledWith(USER_ID, true);
    await req('GET', '/me/notifications/unread-count');
    expect(ctx!.notifications.unreadCount).toHaveBeenLastCalledWith(USER_ID, false);
    expect((await req('GET', '/me/notifications?include=all')).statusCode).toBe(400);
  });

  it('PUT preferences: rewards optional (current app), must be a boolean when sent', async () => {
    await app();
    ctx!.notifications.setPreferences.mockImplementation(async (_u: string, p: object) => ({ rewards: true, ...p }));
    const m6 = { messages: true, friendRequests: true, friendPlans: false, bookings: true };
    expect((await req('PUT', '/me/notification-preferences', m6)).statusCode).toBe(200);
    expect((await req('PUT', '/me/notification-preferences', { ...m6, rewards: false })).json()).toMatchObject({ rewards: false });
    expect((await req('PUT', '/me/notification-preferences', { ...m6, rewards: 'no' })).statusCode).toBe(400);
  });
});
