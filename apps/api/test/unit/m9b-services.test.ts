import {
  bookingWithRedemptionInputSchema,
  claimInviteInputSchema,
  createPlacePostInputSchema,
  mapPlacesQuerySchema,
  notificationPreferencesInputSchema,
  placePostsQuerySchema,
  redemptionInputSchema,
  redemptionPointsCost,
  type AnyNotification,
} from '@kapp/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BadRequestError, ConflictError, NotFoundError, ServiceUnavailableError, UnauthorizedError } from '../../src/http/errors';
import { CODE_ALPHABET, randomCode } from '../../src/lib/codes';
import { TimeoutError } from '../../src/lib/timeout';
import { RedemptionUnavailableError, type BookingRecord } from '../../src/modules/bookings/bookings.repository';
import { createBookingsService } from '../../src/modules/bookings/bookings.service';
import { createFriendsService } from '../../src/modules/friends/friends.service';
import { createNotifier } from '../../src/modules/notifications/notifier';
import { composePush } from '../../src/modules/notifications/push-messages';
import type { PlacePostRecord } from '../../src/modules/place-posts/place-posts.repository';
import { parseEnumArray } from '../../src/modules/place-posts/place-posts.repository';
import { createPlacePostsService, placePrefix } from '../../src/modules/place-posts/place-posts.service';
import { SETTLE_WINDOW_DAYS } from '../../src/modules/rewards/reward-rules';
import { createRewardsService } from '../../src/modules/rewards/rewards.service';
import type { ProductRecord, RedemptionRecord } from '../../src/modules/shop/shop.repository';
import { createShopService, discountedPrice } from '../../src/modules/shop/shop.service';
import { createReviewsService } from '../../src/modules/reviews/reviews.service';
import { createVisitsService } from '../../src/modules/visits/visits.service';
import {
  makeCameraJpeg,
  makeParkRecord,
  mockBookingsRepository,
  mockDogsRepository,
  mockFriendsRepository,
  mockNotificationsRepository,
  mockPlacePostsRepository,
  mockProvidersRepository,
  mockRepository,
  mockReviewsRepository,
  mockRewardsRepository,
  mockShopRepository,
  mockStorage,
  mockVisitsRepository,
  PARK_ID,
  USER_ID,
} from '../helpers';

afterEach(() => vi.useRealTimers());

const TIMEOUT_MS = 1000;
const NOW = new Date('2026-10-05T07:00:00Z');
const POST_ID = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const PROVIDER_ID = '0b6f6a52-3c1e-4c1b-9a37-2f1e5d4c3b2a';
const PRODUCT_ID = '6b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e';
const REDEMPTION_ID = '7c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f';
const SERVICE_ID = '1c7e7b63-4d2f-4d2c-8b48-3f2e6e5d4c3b';
const DOG_ID = '3e9a9d85-6f4b-4f4e-8d6a-5b4a8a7f6e5d';
const OTHER = 'user_test_2';
const log = () => ({ warn: vi.fn() });
const never = () => new Promise<never>(() => {});

/* ---------------------------------------------------------------- */

describe('RewardsService', () => {
  const setup = () => {
    const repository = mockRewardsRepository();
    const notifier = { notify: vi.fn().mockResolvedValue(undefined) };
    const logger = log();
    repository.settle.mockResolvedValue({ awarded: [], before: { balance: 0, lifetimeEarned: 0 }, after: { balance: 0, lifetimeEarned: 0 } });
    repository.badgeStats.mockResolvedValue({ hasEarlyCheckIn: false, distinctParks: 0, approvedPosts: 0, maxCheckInsInOnePark: 0 });
    repository.addMilestones.mockResolvedValue([]);
    repository.inviterDue.mockResolvedValue(null);
    repository.balance.mockResolvedValue({ balance: 0, lifetimeEarned: 0 });
    repository.qualifyingDays.mockResolvedValue([]);
    const service = createRewardsService({ repository, notifier, log: logger, timeoutMs: TIMEOUT_MS, now: () => NOW });
    return { repository, notifier, logger, service };
  };

  it('settles the last two weeks with the pure rules', async () => {
    const { repository, service } = setup();
    await service.settle(USER_ID);
    const [userId, since, compute] = repository.settle.mock.calls[0]!;
    expect(userId).toBe(USER_ID);
    expect((NOW.getTime() - (since as Date).getTime()) / 86_400_000).toBe(SETTLE_WINDOW_DAYS);
    expect(typeof compute).toBe('function');
  });

  it('a level up and newly unlocked badges are notified once (only fresh milestones)', async () => {
    const { repository, notifier, service } = setup();
    repository.settle.mockResolvedValue({ awarded: [{ reason: 'place_post', sourceId: 'x', delta: 15, day: '2026-10-05' }], before: { balance: 190, lifetimeEarned: 190 }, after: { balance: 205, lifetimeEarned: 205 } });
    repository.badgeStats.mockResolvedValue({ hasEarlyCheckIn: true, distinctParks: 1, approvedPosts: 3, maxCheckInsInOnePark: 1 });
    repository.addMilestones.mockResolvedValue([{ kind: 'level', key: 'park_friend' }, { kind: 'badge', key: 'explorer' }]);
    await service.settle(USER_ID);
    expect(repository.addMilestones).toHaveBeenCalledWith(USER_ID, [
      { kind: 'level', key: 'park_friend' },
      { kind: 'badge', key: 'early_bird' },
      { kind: 'badge', key: 'explorer' },
    ]);
    expect(notifier.notify).toHaveBeenCalledTimes(2);
    expect(notifier.notify).toHaveBeenCalledWith({ type: 'reward_level_up', recipientId: USER_ID, actorId: null, data: { levelId: 'park_friend' } });
    expect(notifier.notify).toHaveBeenCalledWith({ type: 'reward_badge', recipientId: USER_ID, actorId: null, data: { badgeId: 'explorer' } });
  });

  it('no level change → no level milestone', async () => {
    const { repository, service } = setup();
    repository.settle.mockResolvedValue({ awarded: [], before: { balance: 10, lifetimeEarned: 10 }, after: { balance: 15, lifetimeEarned: 15 } });
    await service.settle(USER_ID);
    expect(repository.addMilestones).toHaveBeenCalledWith(USER_ID, []);
  });

  it('settles the inviter when the invitee qualified', async () => {
    const { repository, service } = setup();
    repository.inviterDue.mockResolvedValue(OTHER);
    await service.settle(USER_ID);
    expect(repository.settle.mock.calls.map((c) => c[0])).toEqual([USER_ID, OTHER]);
  });

  it('never throws: a failing or hanging repository is only logged (retry-safe)', async () => {
    const { repository, logger, service } = setup();
    repository.settle.mockRejectedValue(new Error('deadlock'));
    await expect(service.settle(USER_ID)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }), 'rewards not settled');

    vi.useFakeTimers();
    repository.settle.mockReturnValue(never());
    const pending = service.settle(USER_ID);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await expect(pending).resolves.toBeUndefined();
    expect(logger.warn.mock.calls.at(-1)![0].err).toBeInstanceOf(TimeoutError);
  });

  it('summary settles first and composes balance, level, streak, badges and ways to earn', async () => {
    const { repository, service } = setup();
    repository.balance.mockResolvedValue({ balance: 120, lifetimeEarned: 260 });
    repository.qualifyingDays.mockResolvedValue(['2026-10-05', '2026-10-04']);
    const summary = await service.summary(USER_ID);
    expect(repository.settle).toHaveBeenCalled();
    expect(summary).toMatchObject({ balance: 120, lifetimeEarned: 260, level: { id: 'park_friend', next: { pointsToGo: 240 } }, streak: { current: 2 } });
    expect(summary.badges).toHaveLength(4);
    expect(summary.waysToEarn.map((w) => w.reason)).toContain('invite');
  });

  it('summary still answers when settling failed; a hanging read is a TimeoutError', async () => {
    const { repository, service } = setup();
    repository.settle.mockRejectedValue(new Error('down'));
    await expect(service.summary(USER_ID)).resolves.toMatchObject({ balance: 0 });
    vi.useFakeTimers();
    repository.settle.mockResolvedValue({ awarded: [], before: { balance: 0, lifetimeEarned: 0 }, after: { balance: 0, lifetimeEarned: 0 } });
    repository.balance.mockReturnValue(never());
    const assertion = expect(service.summary(USER_ID)).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 2);
    await assertion;
  });

  it('history passes the cursor through', async () => {
    const { repository, service } = setup();
    repository.history.mockResolvedValue({ items: [], nextCursor: null });
    await service.history(USER_ID, { before: POST_ID, limit: 10 });
    expect(repository.history).toHaveBeenCalledWith(USER_ID, POST_ID, 10);
  });
});

/* ---------------------------------------------------------------- */

const postRecord = (overrides: Partial<PlacePostRecord> = {}): PlacePostRecord => ({
  id: POST_ID,
  authorId: USER_ID,
  authorName: 'Kristi Kask',
  name: 'Kohvik Käpajälg',
  category: 'cafe',
  lat: 59.447,
  lng: 24.734,
  address: null,
  amenities: ['water_bowl'],
  body: null,
  status: 'approved',
  likeCount: 2,
  liked: false,
  saved: true,
  createdAt: new Date('2026-10-05T07:00:00Z'),
  photos: [{ imageKey: 'places/p/1/full.webp', thumbnailKey: 'places/p/1/thumb.webp' }],
  ...overrides,
});

const postInput = (overrides: object = {}) =>
  createPlacePostInputSchema.parse({ name: 'Kohvik', category: 'cafe', lat: 59.44, lng: 24.75, ...overrides });

describe('PlacePostsService', () => {
  const setup = () => {
    const repository = mockPlacePostsRepository();
    const { storage, objects } = mockStorage();
    const rewards = { settle: vi.fn().mockResolvedValue(undefined) };
    const notifier = { notify: vi.fn().mockResolvedValue(undefined) };
    const logger = log();
    repository.findVisible.mockResolvedValue(postRecord());
    repository.create.mockResolvedValue(undefined);
    const service = createPlacePostsService({ repository, storage, rewards, notifier, log: logger, timeoutMs: TIMEOUT_MS });
    return { repository, storage, objects, rewards, notifier, logger, service };
  };
  const uploadKey = `uploads/${USER_ID}/00000000-0000-4000-8000-000000000001`;

  it('maps a record: first name only, signed photo URLs, rounded distance, isMine', async () => {
    const { repository, service } = setup();
    repository.findVisible.mockResolvedValue(postRecord({ distanceKm: 1.2345 }));
    const post = await service.get(OTHER, POST_ID);
    expect(post).toMatchObject({ author: { id: USER_ID, firstName: 'Kristi' }, isMine: false, distanceKm: 1.2, saved: true, likeCount: 2 });
    expect(post.photos[0]!.url).toContain('signed=get');
    expect((await service.get(USER_ID, POST_ID)).isMine).toBe(true);
  });

  it('get: not visible → 404', async () => {
    const { repository, service } = setup();
    repository.findVisible.mockResolvedValue(null);
    await expect(service.get(undefined, POST_ID)).rejects.toMatchObject({ statusCode: 404, key: 'errors.placePostNotFound' });
  });

  it('create: re-encodes photos to WebP, stores them under the post, deletes the raw upload', async () => {
    const { repository, objects, service } = setup();
    objects.set(uploadKey, { body: await makeCameraJpeg(800, 600), contentType: 'image/jpeg' });
    await service.create(USER_ID, postInput({ photoUploadKeys: [uploadKey], amenities: ['terrace'] }));
    const input = repository.create.mock.calls[0]![0];
    expect(input).toMatchObject({ authorId: USER_ID, name: 'Kohvik', amenities: ['terrace'], photos: [{ position: 0 }] });
    expect(input.photos[0].imageKey).toMatch(new RegExp(`^places/${input.id}/[0-9a-f-]+/full\\.webp$`));
    expect(objects.get(input.photos[0].imageKey)?.contentType).toBe('image/webp');
    expect(objects.has(uploadKey)).toBe(false);
  });

  it('create: someone else’s upload key → 404 before touching storage', async () => {
    const { storage, service } = setup();
    await expect(service.create(USER_ID, postInput({ photoUploadKeys: [`uploads/${OTHER}/00000000-0000-4000-8000-000000000001`] }))).rejects.toBeInstanceOf(NotFoundError);
    expect(storage.stat).not.toHaveBeenCalled();
  });

  it('create: missing upload → 404; not an image → 400 and the upload is removed', async () => {
    const { objects, service } = setup();
    await expect(service.create(USER_ID, postInput({ photoUploadKeys: [uploadKey] }))).rejects.toMatchObject({ key: 'errors.uploadNotFound' });
    objects.set(uploadKey, { body: Buffer.from('not an image'), contentType: 'image/jpeg' });
    await expect(service.create(USER_ID, postInput({ photoUploadKeys: [uploadKey] }))).rejects.toMatchObject({ statusCode: 400, key: 'errors.notAnImage' });
    expect(objects.has(uploadKey)).toBe(false);
  });

  it('create: a failing insert removes the objects already written', async () => {
    const { repository, storage, objects, service } = setup();
    objects.set(uploadKey, { body: await makeCameraJpeg(400, 300), contentType: 'image/jpeg' });
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(service.create(USER_ID, postInput({ photoUploadKeys: [uploadKey] }))).rejects.toThrow('db down');
    expect(storage.removePrefix).toHaveBeenCalledWith(expect.stringMatching(/^places\/.+\/$/));
    expect([...objects.keys()].some((k) => k.startsWith('places/'))).toBe(false);
  });

  it('create: a storage outage is 503', async () => {
    const { storage, service } = setup();
    storage.stat.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.create(USER_ID, postInput({ photoUploadKeys: [uploadKey] }))).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('createUpload: a presigned PUT under the user’s own prefix', async () => {
    const { service } = setup();
    const upload = await service.createUpload(USER_ID, { contentType: 'image/jpeg', byteSize: 1000 });
    expect(upload.uploadKey.startsWith(`uploads/${USER_ID}/`)).toBe(true);
  });

  it('feed: friends scope needs a session; origin and filters reach the repository', async () => {
    const { repository, service } = setup();
    repository.feed.mockResolvedValue({ records: [postRecord()], nextCursor: POST_ID });
    await expect(service.feed(undefined, placePostsQuerySchema.parse({ scope: 'friends' }))).rejects.toBeInstanceOf(UnauthorizedError);
    const page = await service.feed(USER_ID, placePostsQuerySchema.parse({ lat: '59.4', lng: '24.7', category: 'cafe', scope: 'friends' }));
    expect(repository.feed).toHaveBeenCalledWith(USER_ID, { origin: { lat: 59.4, lng: 24.7 }, radiusKm: 15, category: 'cafe', friendsOnly: true, before: undefined, limit: 20 });
    expect(page.nextCursor).toBe(POST_ID);
  });

  it('remove: only the author (404 otherwise); objects removed after the row', async () => {
    const { repository, storage, service } = setup();
    repository.remove.mockResolvedValueOnce(null);
    await expect(service.remove(OTHER, POST_ID)).rejects.toBeInstanceOf(NotFoundError);
    repository.remove.mockResolvedValueOnce({ id: POST_ID });
    await service.remove(USER_ID, POST_ID);
    expect(storage.removePrefix).toHaveBeenCalledWith(placePrefix(POST_ID));
  });

  it('like/save: invisible post → 404; otherwise the new state', async () => {
    const { repository, service } = setup();
    repository.reactions.mockResolvedValue({ liked: true, saved: false, likeCount: 3 });
    expect(await service.setLike(OTHER, POST_ID, true)).toEqual({ liked: true, saved: false, likeCount: 3 });
    expect(repository.setLike).toHaveBeenCalledWith(OTHER, POST_ID, true);
    await service.setSave(OTHER, POST_ID, false);
    expect(repository.setSave).toHaveBeenCalledWith(OTHER, POST_ID, false);
    repository.findVisible.mockResolvedValue(null);
    await expect(service.setLike(OTHER, POST_ID, true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('report: own post → 400; others pass through', async () => {
    const { repository, service } = setup();
    await expect(service.report(USER_ID, POST_ID, { reason: 'spam', details: null })).rejects.toBeInstanceOf(BadRequestError);
    repository.report.mockResolvedValue({ id: 'r1' });
    expect(await service.report(OTHER, POST_ID, { reason: 'spam', details: null })).toEqual({ id: 'r1' });
  });

  it('moderate: approving settles the author’s points and notifies once; repeats and rejections do not', async () => {
    const { repository, rewards, notifier, service } = setup();
    repository.moderate.mockResolvedValueOnce({ authorId: USER_ID, name: 'Kohvik', status: 'approved', changed: true });
    expect(await service.moderate(POST_ID, 'approve')).toEqual({ status: 'approved', changed: true });
    expect(rewards.settle).toHaveBeenCalledWith(USER_ID);
    expect(notifier.notify).toHaveBeenCalledWith({ type: 'place_post_approved', recipientId: USER_ID, actorId: null, data: { postId: POST_ID, placeName: 'Kohvik', points: '15' } });

    repository.moderate.mockResolvedValueOnce({ authorId: USER_ID, name: 'Kohvik', status: 'approved', changed: false });
    expect(await service.moderate(POST_ID, 'reject')).toEqual({ status: 'approved', changed: false });
    repository.moderate.mockResolvedValueOnce({ authorId: USER_ID, name: 'Kohvik', status: 'rejected', changed: true });
    await service.moderate(POST_ID, 'reject');
    expect(rewards.settle).toHaveBeenCalledTimes(1);
    expect(notifier.notify).toHaveBeenCalledTimes(1);

    repository.moderate.mockResolvedValueOnce(null);
    await expect(service.moderate(POST_ID, 'approve')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a hanging repository becomes a TimeoutError (→ 503)', async () => {
    const { repository, service } = setup();
    vi.useFakeTimers();
    repository.mapPlaces.mockReturnValue(never());
    const assertion = expect(service.mapPlaces(undefined, mapPlacesQuerySchema.parse({ minLat: '59', maxLat: '59.5', minLng: '24', maxLng: '24.5' }))).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await assertion;
  });

  it('parseEnumArray reads Postgres enum array literals', () => {
    expect(parseEnumArray('{terrace,shade}')).toEqual(['terrace', 'shade']);
    expect(parseEnumArray('{}')).toEqual([]);
    expect(parseEnumArray(null)).toEqual([]);
    expect(parseEnumArray(['a'])).toEqual(['a']);
  });
});

/* ---------------------------------------------------------------- */

const product = (overrides: Partial<ProductRecord> = {}): ProductRecord => ({
  id: PRODUCT_ID,
  name: 'Treeningmaiused',
  description: null,
  category: 'treats',
  priceCents: 699,
  discountPercent: 15,
  imageKey: null,
  provider: { id: PROVIDER_ID, name: 'Hea Kutsu', area: 'Nõmme' },
  ...overrides,
});

const redemption = (overrides: Partial<RedemptionRecord> = {}): RedemptionRecord => ({
  id: REDEMPTION_ID,
  userId: USER_ID,
  offerType: 'product',
  provider: { id: PROVIDER_ID, name: 'Hea Kutsu' },
  product: { id: PRODUCT_ID, name: 'Treeningmaiused' },
  discountPercent: 15,
  pointsCost: 150,
  code: 'ABCDEFGHJK',
  status: 'active',
  expiresAt: new Date('2026-11-04T07:00:00Z'),
  bookingId: null,
  createdAt: NOW,
  ...overrides,
});

describe('ShopService', () => {
  const setup = () => {
    const repository = mockShopRepository();
    const { storage } = mockStorage();
    repository.findProduct.mockResolvedValue(product());
    repository.findPartner.mockResolvedValue({ id: PROVIDER_ID, name: 'Käpakoda', pawDiscountPercent: 10 });
    repository.findOwn.mockResolvedValue(redemption());
    repository.redeem.mockResolvedValue({ status: 'created', id: REDEMPTION_ID });
    const service = createShopService({ repository, storage, timeoutMs: TIMEOUT_MS, now: () => NOW });
    return { repository, storage, service };
  };

  it('prices: −15% costs 150 Käpad; the discounted price is rounded to whole cents', async () => {
    expect(redemptionPointsCost(15)).toBe(150);
    expect(discountedPrice(699, 15)).toBe(594);
    const { service } = setup();
    expect(await service.product(PRODUCT_ID)).toMatchObject({ discountedPriceCents: 594, pointsCost: 150, imageUrl: null });
  });

  it('product image keys are signed; unknown product → 404', async () => {
    const { repository, service } = setup();
    repository.findProduct.mockResolvedValueOnce(product({ imageKey: 'products/x.webp' }));
    expect((await service.product(PRODUCT_ID)).imageUrl).toContain('signed=get');
    repository.findProduct.mockResolvedValueOnce(null);
    await expect(service.product(PRODUCT_ID)).rejects.toMatchObject({ key: 'errors.productNotFound' });
  });

  it('redeem: the server decides cost and expiry from the offer; created → flag', async () => {
    const { repository, service } = setup();
    const { redemption: r, created } = await service.redeem(USER_ID, { offerType: 'booking', offerId: PROVIDER_ID });
    expect(created).toBe(true);
    expect(r.status).toBe('active');
    const input = repository.redeem.mock.calls[0]![0];
    expect(input).toMatchObject({ userId: USER_ID, offerType: 'booking', providerId: PROVIDER_ID, productId: null, discountPercent: 10, pointsCost: 100, idempotencyKey: null });
    expect(input.code).toMatch(/^[A-Z2-9]{10}$/);
    expect(input.expiresAt.getTime() - NOW.getTime()).toBe(30 * 86_400_000);
  });

  it('redeem: not enough points → 409 with cost and balance; unknown offer → 404', async () => {
    const { repository, service } = setup();
    repository.redeem.mockResolvedValueOnce({ status: 'insufficient', balance: 40 });
    await expect(service.redeem(USER_ID, { offerType: 'product', offerId: PRODUCT_ID })).rejects.toMatchObject({ statusCode: 409, key: 'errors.notEnoughPoints', params: { cost: 150, balance: 40 } });
    repository.findProduct.mockResolvedValueOnce(null);
    await expect(service.redeem(USER_ID, { offerType: 'product', offerId: PRODUCT_ID })).rejects.toMatchObject({ key: 'errors.offerNotFound' });
    repository.findPartner.mockResolvedValueOnce(null);
    await expect(service.redeem(USER_ID, { offerType: 'booking', offerId: PROVIDER_ID })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('redeem: an idempotent retry returns the first one (created false)', async () => {
    const { repository, service } = setup();
    repository.redeem.mockResolvedValueOnce({ status: 'existing', id: REDEMPTION_ID });
    expect((await service.redeem(USER_ID, { offerType: 'product', offerId: PRODUCT_ID, idempotencyKey: POST_ID })).created).toBe(false);
  });

  it('redeem: retries once on a code collision; the balance CHECK backstop is a 409', async () => {
    const { repository, service } = setup();
    const collision = Object.assign(new Error('dup'), { code: '23505', constraint: 'redemptions_code_unique' });
    repository.redeem.mockRejectedValueOnce(collision);
    await service.redeem(USER_ID, { offerType: 'product', offerId: PRODUCT_ID });
    expect(repository.redeem).toHaveBeenCalledTimes(2);
    repository.redeem.mockRejectedValueOnce(Object.assign(new Error('check'), { code: '23514', constraint: 'reward_balances_nonnegative' }));
    await expect(service.redeem(USER_ID, { offerType: 'product', offerId: PRODUCT_ID })).rejects.toBeInstanceOf(ConflictError);
  });

  it('expired is derived from an active code past its expiry', async () => {
    const { repository, service } = setup();
    repository.listOwn.mockResolvedValue([redemption({ expiresAt: new Date(NOW.getTime() - 1) }), redemption({ status: 'used' })]);
    expect((await service.listRedemptions(USER_ID)).map((r) => r.status)).toEqual(['expired', 'used']);
  });

  it('cancel: refund result mapping (404, 409, idempotent)', async () => {
    const { repository, service } = setup();
    repository.cancel.mockResolvedValueOnce('not-found');
    await expect(service.cancelRedemption(USER_ID, REDEMPTION_ID)).rejects.toBeInstanceOf(NotFoundError);
    repository.cancel.mockResolvedValueOnce('not-cancellable');
    await expect(service.cancelRedemption(USER_ID, REDEMPTION_ID)).rejects.toMatchObject({ key: 'errors.redemptionNotCancellable' });
    repository.cancel.mockResolvedValueOnce('already-cancelled');
    repository.findOwn.mockResolvedValueOnce(redemption({ status: 'cancelled' }));
    expect((await service.cancelRedemption(USER_ID, REDEMPTION_ID)).status).toBe('cancelled');
  });

  it('overview: categories, partners with points cost and distance, featured products', async () => {
    const { repository, service } = setup();
    repository.categories.mockResolvedValue([{ id: 'treats', productCount: 2 }]);
    repository.partners.mockResolvedValue([
      { id: PROVIDER_ID, name: 'Käpakoda', category: 'grooming', tagline: null, area: 'Kadriorg', lat: 59.4, lng: 24.7, photoKey: null, ratingAverage: null, ratingCount: 0, priceFromCents: 1200, pawDiscountPercent: 15, distanceKm: 1.26 },
    ]);
    repository.products.mockResolvedValue([product()]);
    const shop = await service.overview({ lat: 59.4, lng: 24.7 });
    expect(repository.partners).toHaveBeenCalledWith({ lat: 59.4, lng: 24.7 }, 20);
    expect(shop.partners[0]).toMatchObject({ pointsCost: 150, distanceKm: 1.3, photoUrl: null });
    expect(shop.products).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------- */

describe('FriendsService invites', () => {
  const setup = (createdAt = new Date(NOW.getTime() - 86_400_000)) => {
    const repository = mockFriendsRepository();
    const notifier = { notify: vi.fn().mockResolvedValue(undefined) };
    const rewards = { settle: vi.fn().mockResolvedValue(undefined) };
    repository.findInviter.mockResolvedValue({ id: OTHER, allowFriendRequests: true });
    repository.accountCreatedAt.mockResolvedValue(createdAt);
    repository.createReferral.mockResolvedValue(undefined);
    repository.findTarget.mockResolvedValue({ id: OTHER, allowFriendRequests: true });
    repository.findFriendship.mockResolvedValue(null);
    repository.createRequest.mockResolvedValue(undefined);
    const service = createFriendsService({ repository, notifier, rewards, timeoutMs: TIMEOUT_MS, now: () => NOW });
    return { repository, notifier, rewards, service };
  };

  it('getInvite returns the stored code and the bonus; retries a code collision once', async () => {
    const { repository, service } = setup();
    repository.inviteCode.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505', constraint: 'invite_codes_code_unique' })).mockResolvedValueOnce('ABCDEFGH');
    expect(await service.getInvite(USER_ID)).toEqual({ code: 'ABCDEFGH', points: 25 });
  });

  it('claim: records the referral, asks the inviter to be friends and settles', async () => {
    const { repository, notifier, rewards, service } = setup();
    await service.claimInvite(USER_ID, 'ABCDEFGH');
    expect(repository.createReferral).toHaveBeenCalledWith(USER_ID, OTHER);
    expect(repository.createRequest).toHaveBeenCalledWith(USER_ID, OTHER);
    expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'friend_request', recipientId: OTHER }));
    expect(rewards.settle).toHaveBeenCalledWith(USER_ID);
  });

  it('claim still succeeds when the inviter does not accept friend requests', async () => {
    const { repository, service } = setup();
    repository.findTarget.mockResolvedValue({ id: OTHER, allowFriendRequests: false });
    await expect(service.claimInvite(USER_ID, 'ABCDEFGH')).resolves.toBeUndefined();
    expect(repository.createRequest).not.toHaveBeenCalled();
  });

  it('claim errors: unknown/blocked 404, own code 400, old account 409, second claim 409', async () => {
    let s = setup();
    s.repository.findInviter.mockResolvedValue(null);
    await expect(s.service.claimInvite(USER_ID, 'ABCDEFGH')).rejects.toMatchObject({ statusCode: 404, key: 'errors.inviteNotFound' });
    s = setup();
    s.repository.findInviter.mockResolvedValue({ id: USER_ID, allowFriendRequests: true });
    await expect(s.service.claimInvite(USER_ID, 'ABCDEFGH')).rejects.toMatchObject({ statusCode: 400 });
    s = setup(new Date(NOW.getTime() - 15 * 86_400_000));
    await expect(s.service.claimInvite(USER_ID, 'ABCDEFGH')).rejects.toMatchObject({ statusCode: 409, key: 'errors.inviteTooLate', params: { days: 14 } });
    s = setup();
    s.repository.createReferral.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(s.service.claimInvite(USER_ID, 'ABCDEFGH')).rejects.toMatchObject({ key: 'errors.inviteAlreadyClaimed' });
    expect(s.rewards.settle).not.toHaveBeenCalled();
  });

  it('codes use the unambiguous alphabet', () => {
    const code = randomCode(1000);
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    expect(code).not.toMatch(/[01OIL]/);
  });
});

/* ---------------------------------------------------------------- */

describe('BookingsService with a paw discount', () => {
  const SLOT_START = new Date('2026-10-06T07:00:00Z');
  const record = (overrides: Partial<BookingRecord> = {}): BookingRecord => ({
    id: 'b1',
    userId: USER_ID,
    status: 'confirmed',
    startsAt: SLOT_START,
    endsAt: new Date('2026-10-06T08:00:00Z'),
    note: null,
    priceCents: 4000,
    priceIsFrom: false,
    cancelledAt: null,
    createdAt: NOW,
    provider: { id: PROVIDER_ID, name: 'Käpakoda', category: 'grooming', area: 'Kadriorg', address: null, timeZone: 'Europe/Tallinn' },
    service: { id: SERVICE_ID, name: 'Pesu', durationMinutes: 60 },
    dogs: [{ id: DOG_ID, name: 'Freddy' }],
    discount: { redemptionId: REDEMPTION_ID, discountPercent: 15, discountedPriceCents: 3400 },
    ...overrides,
  });
  const setup = () => {
    const bookings = mockBookingsRepository();
    const providers = mockProvidersRepository();
    const dogs = mockDogsRepository();
    const redemptions = { findOwn: vi.fn().mockResolvedValue(redemption({ offerType: 'booking', product: null })) };
    providers.findService.mockResolvedValue({
      id: SERVICE_ID,
      name: 'Pesu',
      description: null,
      durationMinutes: 60,
      priceCents: 4000,
      priceIsFrom: false,
      provider: record().provider,
    });
    providers.findFreeSlots.mockResolvedValue([{ day: '2026-10-06', startsAt: SLOT_START, endsAt: new Date('2026-10-06T08:00:00Z') }]);
    dogs.ownedIds.mockResolvedValue([DOG_ID]);
    bookings.create.mockResolvedValue(record());
    const service = createBookingsService({
      bookings,
      providers,
      dogs,
      redemptions,
      notifier: { notify: vi.fn() },
      reminders: { schedule: vi.fn().mockResolvedValue(undefined), cancel: vi.fn() },
      log: log(),
      timeoutMs: TIMEOUT_MS,
      now: () => NOW,
    });
    return { bookings, redemptions, service };
  };
  const input = bookingWithRedemptionInputSchema.parse({ serviceId: SERVICE_ID, startsAt: SLOT_START.toISOString(), dogIds: [DOG_ID], redemptionId: REDEMPTION_ID });

  it('passes the code to the atomic insert and returns the discount', async () => {
    const { bookings, service } = setup();
    const booking = await service.create(USER_ID, input);
    expect(bookings.create).toHaveBeenCalledWith(expect.objectContaining({ redemptionId: REDEMPTION_ID }));
    expect(booking.discount).toEqual({ redemptionId: REDEMPTION_ID, discountPercent: 15, discountedPriceCents: 3400 });
  });

  it.each([
    ['used', { status: 'used' as const }],
    ['another provider', { provider: { id: 'other', name: 'x' } }],
    ['a product code', { offerType: 'product' as const }],
    ['expired', { expiresAt: new Date(NOW.getTime() - 1) }],
  ])('a %s code → 409 before inserting', async (_label, overrides) => {
    const { bookings, redemptions, service } = setup();
    redemptions.findOwn.mockResolvedValue(redemption({ offerType: 'booking', ...overrides }));
    await expect(service.create(USER_ID, input)).rejects.toMatchObject({ statusCode: 409, key: 'errors.redemptionUnavailable' });
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it('someone else’s or a missing code → 404; a race lost in SQL → 409', async () => {
    const { bookings, redemptions, service } = setup();
    redemptions.findOwn.mockResolvedValueOnce(null);
    await expect(service.create(USER_ID, input)).rejects.toMatchObject({ key: 'errors.redemptionNotFound' });
    bookings.create.mockRejectedValueOnce(new RedemptionUnavailableError());
    await expect(service.create(USER_ID, input)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('without a code nothing changes for M6 clients (discount null)', async () => {
    const { bookings, service } = setup();
    bookings.create.mockResolvedValue(record({ discount: null }));
    const booking = await service.create(USER_ID, { ...input, redemptionId: undefined });
    expect(bookings.create.mock.calls[0]![0]).not.toHaveProperty('redemptionId');
    expect(booking.discount).toBeNull();
  });
});

/* ---------------------------------------------------------------- */

describe('reward hooks in visits and reviews', () => {
  it('check-in start and end settle Käpad; an already finished visit does not', async () => {
    const visits = mockVisitsRepository();
    const parks = mockRepository();
    const dogs = mockDogsRepository();
    const rewards = { settle: vi.fn().mockResolvedValue(undefined) };
    parks.findById.mockResolvedValue(makeParkRecord());
    dogs.ownedIds.mockResolvedValue([DOG_ID]);
    visits.createCheckIn.mockResolvedValue({ id: 'c1' });
    const service = createVisitsService({ visits, parks, dogs, timeoutMs: TIMEOUT_MS, rewards });
    await service.checkIn(USER_ID, { parkId: PARK_ID, dogIds: [DOG_ID], durationMinutes: 60 });
    visits.endCheckIn.mockResolvedValueOnce('ended').mockResolvedValueOnce('closed');
    await service.endCheckIn(USER_ID, 'c1');
    await service.endCheckIn(USER_ID, 'c1');
    expect(rewards.settle).toHaveBeenCalledTimes(2);
  });

  it('a review settles Käpad after it is saved', async () => {
    const reviews = mockReviewsRepository();
    const parks = mockRepository();
    const rewards = { settle: vi.fn().mockResolvedValue(undefined) };
    parks.findById.mockResolvedValue(makeParkRecord());
    reviews.hasVisited.mockResolvedValue(true);
    reviews.upsert.mockResolvedValue({ id: 'r1' });
    await createReviewsService({ reviews, parks, timeoutMs: TIMEOUT_MS, rewards }).submit(USER_ID, PARK_ID, { rating: 5, body: null });
    expect(rewards.settle).toHaveBeenCalledWith(USER_ID);
  });
});

/* ---------------------------------------------------------------- */

describe('notifier and push texts for rewards', () => {
  const rewardNotification = (type: AnyNotification['type'], data: AnyNotification['data']): AnyNotification => ({
    id: '8d4e5f6a-7b8c-4d9e-9f0a-2b3c4d5e6f7a',
    type,
    actor: null,
    data,
    readAt: null,
    createdAt: NOW.toISOString(),
  });
  const setup = (rewardsOn: boolean, language: 'et' | 'en' | 'ru' = 'en') => {
    const notifications = mockNotificationsRepository();
    notifications.create.mockImplementation(async ({ type, data }: { type: AnyNotification['type']; data: AnyNotification['data'] }) => rewardNotification(type, data));
    notifications.pushContext.mockResolvedValue({ language, preferences: { messages: true, friendRequests: true, friendPlans: true, bookings: true, rewards: rewardsOn } });
    const realtime = { emitToUsers: vi.fn() };
    const pushQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    return { notifications, realtime, pushQueue, notifier: createNotifier({ notifications, realtime, pushQueue, log: log(), timeoutMs: TIMEOUT_MS }) };
  };

  it('reward types: feed row and push (rewards preference), no realtime event for the current app', async () => {
    const { notifications, realtime, pushQueue, notifier } = setup(true);
    await notifier.notify({ type: 'place_post_approved', recipientId: USER_ID, actorId: null, data: { postId: POST_ID, placeName: 'Kohvik', points: '15' } });
    expect(notifications.create).toHaveBeenCalled();
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
    expect(pushQueue.enqueue).toHaveBeenCalledWith({
      userId: USER_ID,
      language: 'en',
      title: 'Your recommendation is live',
      body: 'Kohvik · +15 paws',
      data: { type: 'place_post_approved', notificationId: expect.any(String), postId: POST_ID },
    });
  });

  it('the rewards switch off stops the push only', async () => {
    const { notifications, pushQueue, notifier } = setup(false);
    await notifier.notify({ type: 'reward_badge', recipientId: USER_ID, actorId: null, data: { badgeId: 'explorer' } });
    expect(notifications.create).toHaveBeenCalled();
    expect(pushQueue.enqueue).not.toHaveBeenCalled();
  });

  it('push texts name the level and badge in the recipient’s language', () => {
    expect(composePush('et', 'reward_level_up', '', { levelId: 'park_friend' })).toEqual({ title: 'Uus tase!', body: 'Sinu uus tase: Pargisõber' });
    expect(composePush('ru', 'reward_badge', '', { badgeId: 'early_bird' }).body).toBe('Вы открыли значок «Ранняя пташка»');
    expect(composePush('en', 'reward_level_up', '', {}).body).toBe('Your new level: ');
  });
});

/* ---------------------------------------------------------------- */

describe('M9b schemas', () => {
  it('place post: Estonia only, unique amenities, ≤ 5 photos, strict', () => {
    expect(createPlacePostInputSchema.safeParse({ name: 'Kohvik', category: 'cafe', lat: 60.17, lng: 24.94 }).success).toBe(false);
    expect(createPlacePostInputSchema.safeParse({ name: 'Kohvik', category: 'cafe', lat: 59.4, lng: 24.7, amenities: ['shade', 'shade'] }).success).toBe(false);
    const keys = Array.from({ length: 6 }, (_, i) => `uploads/${USER_ID}/00000000-0000-4000-8000-00000000000${i}`);
    expect(createPlacePostInputSchema.safeParse({ name: 'Kohvik', category: 'cafe', lat: 59.4, lng: 24.7, photoUploadKeys: keys }).success).toBe(false);
    expect(createPlacePostInputSchema.safeParse({ name: 'Kohvik', category: 'cafe', lat: 59.4, lng: 24.7, status: 'approved' }).success).toBe(false);
    expect(createPlacePostInputSchema.parse({ name: ' Kohvik ', category: 'cafe', lat: 59.4, lng: 24.7, body: '' })).toMatchObject({ name: 'Kohvik', body: null, amenities: [], photoUploadKeys: [] });
  });

  it('map box: ordered, at most one degree, known tags', () => {
    expect(mapPlacesQuerySchema.safeParse({ minLat: '59.5', maxLat: '59.4', minLng: '24', maxLng: '24.5' }).success).toBe(false);
    expect(mapPlacesQuerySchema.safeParse({ minLat: '58', maxLat: '59.5', minLng: '24', maxLng: '24.5' }).success).toBe(false);
    expect(mapPlacesQuerySchema.safeParse({ minLat: '59', maxLat: '59.5', minLng: '24', maxLng: '24.5', tags: 'cafes,zoo' }).success).toBe(false);
    expect(mapPlacesQuerySchema.parse({ minLat: '59', maxLat: '59.5', minLng: '24', maxLng: '24.5', tags: 'cafes,parks,cafes' }).tags).toEqual(['cafes', 'parks']);
  });

  it('redemption, invite, preferences', () => {
    expect(redemptionInputSchema.safeParse({ offerType: 'booking', offerId: PROVIDER_ID, pointsCost: 1 }).success).toBe(false);
    expect(claimInviteInputSchema.parse({ code: ' abcdefgh ' }).code).toBe('ABCDEFGH');
    expect(claimInviteInputSchema.safeParse({ code: 'ABCDEFG0' }).success).toBe(false);
    expect(notificationPreferencesInputSchema.safeParse({ messages: true, friendRequests: true, friendPlans: true, bookings: true }).success).toBe(true);
    expect(notificationPreferencesInputSchema.safeParse({ messages: true, friendRequests: true, friendPlans: true, bookings: true, rewards: null }).success).toBe(false);
  });
});
