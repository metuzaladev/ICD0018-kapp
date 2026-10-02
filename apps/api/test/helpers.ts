import type { Park, ParkDetail, Profile } from '@kapp/shared';
import sharp from 'sharp';
import { vi } from 'vitest';

import { buildApp, defaultAppConfig, type AppConfig, type AppDeps } from '../src/app';
import type { FavoritesRepository } from '../src/modules/favorites/favorites.repository';
import type { FavoritesService } from '../src/modules/favorites/favorites.service';
import type { ParkDetailRecord, ParkRecord, ParksRepository } from '../src/modules/parks/parks.repository';
import type { ParksService } from '../src/modules/parks/parks.service';
import type { ProfileRepository } from '../src/modules/profile/profile.repository';
import type { ProfileService } from '../src/modules/profile/profile.service';
import type { DogsRepository } from '../src/modules/dogs/dogs.repository';
import type { DogsService } from '../src/modules/dogs/dogs.service';
import type { ReportsService } from '../src/modules/reports/reports.service';
import type { ReviewsRepository } from '../src/modules/reviews/reviews.repository';
import type { ReviewsService } from '../src/modules/reviews/reviews.service';
import type { VisitsRepository } from '../src/modules/visits/visits.repository';
import type { VisitsService } from '../src/modules/visits/visits.service';
import type { HealthRecordsRepository } from '../src/modules/health-records/health-records.repository';
import type { HealthRecordsService } from '../src/modules/health-records/health-records.service';
import type { PhotosRepository } from '../src/modules/photos/photos.repository';
import type { PhotosService } from '../src/modules/photos/photos.service';
import type { FriendsRepository } from '../src/modules/friends/friends.repository';
import type { FriendsService } from '../src/modules/friends/friends.service';
import type { MessagesRepository } from '../src/modules/messages/messages.repository';
import type { MessagesService } from '../src/modules/messages/messages.service';
import type { NotificationsRepository, PushTokensRepository } from '../src/modules/notifications/notifications.repository';
import type { NotificationsService } from '../src/modules/notifications/notifications.service';
import type { SafetyRepository } from '../src/modules/safety/safety.repository';
import type { SafetyService } from '../src/modules/safety/safety.service';
import type { ObjectStorage } from '../src/storage/object-storage';
import type { BookingsRepository } from '../src/modules/bookings/bookings.repository';
import type { BookingsService } from '../src/modules/bookings/bookings.service';
import type { ProvidersRepository } from '../src/modules/providers/providers.repository';
import type { ProvidersService } from '../src/modules/providers/providers.service';

export const PARK_ID = '4ddabe8d-7306-4724-a125-ace7ae3a87b9';
export const USER_ID = 'user_test_1';

export function makeParkRecord(overrides: Partial<ParkRecord> = {}): ParkRecord {
  return {
    id: PARK_ID,
    name: 'Kadrioru koerapark',
    description: null,
    address: 'Kadriorg, Tallinn',
    lat: 59.4389,
    lng: 24.7925,
    fenced: true,
    smallDogArea: true,
    water: true,
    lighting: true,
    status: 'approved',
    ...overrides,
  };
}

export function makePark(overrides: Partial<Park> = {}): Park {
  return { ...makeParkRecord(), ...overrides };
}

export function makeParkDetailRecord(overrides: Partial<ParkDetailRecord> = {}): ParkDetailRecord {
  return { ...makeParkRecord(), ratingAverage: 4.8, reviewCount: 32, ...overrides };
}

export function makeParkDetail(overrides: Partial<ParkDetail> = {}): ParkDetail {
  return { ...makeParkDetailRecord(), ...overrides };
}

export function mockRepository(): { [K in keyof ParksRepository]: ReturnType<typeof vi.fn> } & ParksRepository {
  return {
    findApprovedNearby: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  } as never;
}

export function mockService(): { [K in keyof ParksService]: ReturnType<typeof vi.fn> } & ParksService {
  return {
    listNearby: vi.fn().mockResolvedValue([]),
    getPublicPark: vi.fn().mockResolvedValue(makeParkDetail()),
    suggestPark: vi.fn().mockResolvedValue(makePark({ status: 'pending' })),
  } as never;
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: USER_ID,
    name: 'Kristofer',
    email: 'kristofer@example.com',
    image: null,
    area: 'Tallinn',
    bio: null,
    presenceSharing: 'friends',
    allowFriendRequests: true,
    language: 'et',
    ...overrides,
  };
}

export function mockProfileRepository(): { [K in keyof ProfileRepository]: ReturnType<typeof vi.fn> } & ProfileRepository {
  return { findById: vi.fn(), update: vi.fn() } as never;
}

export function mockProfileService(): { [K in keyof ProfileService]: ReturnType<typeof vi.fn> } & ProfileService {
  return {
    getOwnProfile: vi.fn().mockResolvedValue(makeProfile()),
    updateOwnProfile: vi.fn().mockResolvedValue(makeProfile()),
  } as never;
}

export function mockFavoritesRepository(): { [K in keyof FavoritesRepository]: ReturnType<typeof vi.fn> } & FavoritesRepository {
  return { add: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined), listParks: vi.fn() } as never;
}

export function mockFavoritesService(): { [K in keyof FavoritesService]: ReturnType<typeof vi.fn> } & FavoritesService {
  return {
    list: vi.fn().mockResolvedValue([makePark()]),
    add: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  } as never;
}

/** Every method of T replaced by a vi.fn(), still typed as T for the code under test. */
export type Mocked<T> = { [K in keyof T]: ReturnType<typeof vi.fn> } & T;
export function mockAll<T>(keys: (keyof T)[]): Mocked<T> {
  return Object.fromEntries(keys.map((k) => [k, vi.fn()])) as never;
}

export const mockDogsRepository = () =>
  mockAll<DogsRepository>(['listByOwner', 'findOwned', 'countByOwner', 'create', 'update', 'remove', 'ownedIds', 'setProfilePhoto']);
export const mockPhotosRepository = () => mockAll<PhotosRepository>(['countByDog', 'listByDog', 'create', 'remove']);
export const mockHealthRecordsRepository = () =>
  mockAll<HealthRecordsRepository>(['listByDog', 'findById', 'create', 'update', 'remove', 'findReminders']);

/**
 * In-memory stand-in for the S3 storage: objects live in a Map, signed URLs are fake but valid
 * URLs. Every method is a vi.fn() so tests can make one call fail or hang.
 */
export function mockStorage(objects = new Map<string, { body: Buffer; contentType: string }>()) {
  const storage: Mocked<ObjectStorage> = {
    createUploadUrl: vi.fn(async (key: string, file: { contentType: string }, ttl: number) => ({
      url: `https://storage.test/${key}?signed=put`,
      headers: { 'Content-Type': file.contentType },
      expiresAt: new Date(Date.now() + ttl * 1000),
    })),
    createDownloadUrl: vi.fn(async (key: string) => `https://storage.test/${key}?signed=get`),
    stat: vi.fn(async (key: string) => {
      const o = objects.get(key);
      return o ? { byteSize: o.body.length, contentType: o.contentType } : null;
    }),
    read: vi.fn(async (key: string) => objects.get(key)?.body ?? null),
    write: vi.fn(async (key: string, body: Buffer, contentType: string) => {
      objects.set(key, { body, contentType });
    }),
    remove: vi.fn(async (keys: string[]) => {
      for (const k of keys) objects.delete(k);
    }),
    removePrefix: vi.fn(async (prefix: string) => {
      for (const k of [...objects.keys()]) if (k.startsWith(prefix)) objects.delete(k);
    }),
  } as never;
  return { storage, objects };
}
export const mockVisitsRepository = () =>
  mockAll<VisitsRepository>(['createCheckIn', 'findActive', 'endCheckIn', 'listVisitors', 'history', 'createPlan', 'listUpcomingPlans', 'deletePlan']);
export const mockReviewsRepository = () => mockAll<ReviewsRepository>(['hasVisited', 'upsert', 'listForPark']);

/** Where the fixture photo claims to have been taken (Kadriorg, Tallinn). */
export const FIXTURE_GPS = { GPSLatitudeRef: 'N', GPSLatitude: '59/1 26/1 18/1', GPSLongitudeRef: 'E', GPSLongitude: '24/1 47/1 33/1' };

/**
 * A real JPEG like a phone camera makes: EXIF with camera model, GPS position and orientation 6
 * ("rotate 90° clockwise to display"), so tests can prove both stripping and auto-orientation.
 */
export function makeCameraJpeg(width = 2400, height = 1800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#c8643c' } })
    .jpeg({ quality: 80 })
    // sharp writes its own Orientation tag, so it is set here and the rest of EXIF merged in.
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Make: 'TestPhone', Model: 'Kapp 1' }, IFD3: FIXTURE_GPS })
    .toBuffer();
}

/** App with mocked dependencies — no database, no network. */
export async function buildTestApp(deps: Partial<AppDeps> = {}, config: Partial<AppConfig> = {}) {
  const service = (deps.parksService as ReturnType<typeof mockService> | undefined) ?? mockService();
  const profile = (deps.profileService as ReturnType<typeof mockProfileService> | undefined) ?? mockProfileService();
  const favorites = (deps.favoritesService as ReturnType<typeof mockFavoritesService> | undefined) ?? mockFavoritesService();
  const dogs = (deps.dogsService as Mocked<DogsService> | undefined) ?? mockAll<DogsService>(['list', 'create', 'update', 'remove']);
  const visits =
    (deps.visitsService as Mocked<VisitsService> | undefined) ??
    mockAll<VisitsService>(['checkIn', 'getActive', 'endCheckIn', 'listVisitors', 'history', 'planVisit', 'listPlans', 'cancelPlan']);
  const reviews = (deps.reviewsService as Mocked<ReviewsService> | undefined) ?? mockAll<ReviewsService>(['submit', 'list']);
  const reports = (deps.reportsService as Mocked<ReportsService> | undefined) ?? mockAll<ReportsService>(['reportPark']);
  const photos =
    (deps.photosService as Mocked<PhotosService> | undefined) ??
    mockAll<PhotosService>(['createUpload', 'addPhoto', 'list', 'remove', 'setProfilePhoto']);
  const health =
    (deps.healthRecordsService as Mocked<HealthRecordsService> | undefined) ??
    mockAll<HealthRecordsService>(['list', 'create', 'update', 'remove', 'reminders']);
  const friends =
    (deps.friendsService as Mocked<FriendsService> | undefined) ??
    mockAll<FriendsService>([
      'sendRequest',
      'acceptRequest',
      'deleteRequest',
      'removeFriend',
      'listFriends',
      'listRequests',
      'search',
      'getProfile',
      'friendPlans',
      'announcePlan',
    ]);
  const messages =
    (deps.messagesService as Mocked<MessagesService> | undefined) ??
    mockAll<MessagesService>(['startConversation', 'listConversations', 'getConversation', 'listMessages', 'sendMessage', 'markRead']);
  const notifications =
    (deps.notificationsService as Mocked<NotificationsService> | undefined) ??
    mockAll<NotificationsService>([
      'list',
      'unreadCount',
      'markRead',
      'markAllRead',
      'getPreferences',
      'setPreferences',
      'registerPushToken',
      'unregisterPushToken',
    ]);
  const safety = (deps.safetyService as Mocked<SafetyService> | undefined) ?? mockAll<SafetyService>(['block', 'unblock', 'listBlocked', 'reportUser']);
  const providers = (deps.providersService as Mocked<ProvidersService> | undefined) ?? mockAll<ProvidersService>(['list', 'getProvider', 'listSlots']);
  const bookings =
    (deps.bookingsService as Mocked<BookingsService> | undefined) ?? mockAll<BookingsService>(['create', 'list', 'get', 'cancel', 'sendReminder']);
  const app = await buildApp(
    {
      friendsService: friends,
      messagesService: messages,
      notificationsService: notifications,
      safetyService: safety,
      providersService: providers,
      bookingsService: bookings,
      parksService: service,
      profileService: profile,
      favoritesService: favorites,
      dogsService: dogs,
      visitsService: visits,
      reviewsService: reviews,
      reportsService: reports,
      photosService: photos,
      healthRecordsService: health,
      checkDatabase: deps.checkDatabase ?? (async () => true),
      resolveUserId: deps.resolveUserId,
      authHandler: deps.authHandler,
      realtime: deps.realtime,
    },
    { ...defaultAppConfig, ...config },
  );
  return { app, service, profile, favorites, dogs, visits, reviews, reports, photos, health, friends, messages, notifications, safety, providers, bookings };
}

/** Resolver that treats `Authorization: Bearer test` as USER_ID — stands in for Better Auth. */
export const fakeAuth: AppDeps['resolveUserId'] = async (request) =>
  request.headers.authorization === 'Bearer test' ? USER_ID : null;

export const mockFriendsRepository = () =>
  mockAll<FriendsRepository>([
    'findTarget',
    'findFriendship',
    'createRequest',
    'accept',
    'remove',
    'listFriends',
    'listRequests',
    'search',
    'profile',
    'planAudience',
    'friendPlans',
  ]);
export const mockMessagesRepository = () =>
  mockAll<MessagesRepository>(['findOrCreateDirect', 'findMembership', 'listConversations', 'listMessages', 'createMessage', 'markRead']);
export const mockNotificationsRepository = () =>
  mockAll<NotificationsRepository>([
    'create',
    'upsertMessageNotification',
    'list',
    'unreadCount',
    'markRead',
    'markAllRead',
    'markConversationRead',
    'getPreferences',
    'setPreferences',
    'pushContext',
  ]);
export const mockPushTokensRepository = () => mockAll<PushTokensRepository>(['upsert', 'remove', 'listForUser', 'removeTokens']);
export const mockSafetyRepository = () =>
  mockAll<SafetyRepository>(['userExists', 'isBlockedEitherWay', 'block', 'unblock', 'listBlocked', 'createReport']);
export const mockProvidersRepository = () => mockAll<ProvidersRepository>(['list', 'findById', 'findService', 'findFreeSlots']);
export const mockBookingsRepository = () =>
  mockAll<BookingsRepository>(['create', 'findOwn', 'findById', 'listUpcoming', 'listPast', 'cancel']);
