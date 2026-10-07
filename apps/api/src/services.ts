import type { Env } from './config/env';
import { createAccountRepository } from './modules/account/account.repository';
import { createAccountService, type AccountAuth, type AccountLog } from './modules/account/account.service';
import { noStorageCleanup, type StorageCleanup } from './modules/account/storage-cleanup';
import { noMailer, type Mailer } from './modules/mail/mailer';
import { noBookingReminders, type BookingReminders } from './modules/bookings/booking-reminders';
import { createBookingsRepository } from './modules/bookings/bookings.repository';
import { createBookingsService } from './modules/bookings/bookings.service';
import { createProvidersRepository } from './modules/providers/providers.repository';
import { createProvidersService } from './modules/providers/providers.service';
import type { Db } from './db/client';
import { createDogsRepository } from './modules/dogs/dogs.repository';
import { createDogsService } from './modules/dogs/dogs.service';
import { createFavoritesRepository } from './modules/favorites/favorites.repository';
import { createFavoritesService } from './modules/favorites/favorites.service';
import { createHealthRecordsRepository } from './modules/health-records/health-records.repository';
import { createHealthRecordsService } from './modules/health-records/health-records.service';
import { createParkActivityRepository } from './modules/park-activity/park-activity.repository';
import { createParkActivityService } from './modules/park-activity/park-activity.service';
import { createParksRepository } from './modules/parks/parks.repository';
import { createParksService } from './modules/parks/parks.service';
import { createPhotosRepository } from './modules/photos/photos.repository';
import { createPhotosService } from './modules/photos/photos.service';
import { createProfileRepository } from './modules/profile/profile.repository';
import { createProfileService } from './modules/profile/profile.service';
import { createReportsRepository } from './modules/reports/reports.repository';
import { createReportsService } from './modules/reports/reports.service';
import { createReviewsRepository } from './modules/reviews/reviews.repository';
import { createReviewsService } from './modules/reviews/reviews.service';
import { createFriendsRepository } from './modules/friends/friends.repository';
import { createFriendsService } from './modules/friends/friends.service';
import { createMessagesRepository } from './modules/messages/messages.repository';
import { createMessagesService } from './modules/messages/messages.service';
import { createNotificationsRepository, createPushTokensRepository } from './modules/notifications/notifications.repository';
import { createNotificationsService } from './modules/notifications/notifications.service';
import { createNotifier, silentLogger, type Logger } from './modules/notifications/notifier';
import type { PushQueue } from './modules/notifications/push-queue';
import { createSafetyRepository } from './modules/safety/safety.repository';
import { createSafetyService } from './modules/safety/safety.service';
import { noRealtime, type RealtimeGateway } from './realtime/socket-gateway';
import { createPlacePostsRepository } from './modules/place-posts/place-posts.repository';
import { createPlacePostsService } from './modules/place-posts/place-posts.service';
import { createRewardsRepository } from './modules/rewards/rewards.repository';
import { createRewardsService } from './modules/rewards/rewards.service';
import { createShopRepository } from './modules/shop/shop.repository';
import { createShopService } from './modules/shop/shop.service';
import { createVisitsRepository } from './modules/visits/visits.repository';
import { createVisitsService } from './modules/visits/visits.service';
import type { ObjectStorage } from './storage/object-storage';
import { createS3Storage } from './storage/s3-storage';
import { noAddressLookup, type AddressLookup } from './modules/search/address-lookup';
import { createSearchRepository } from './modules/search/search.repository';
import { createSearchService } from './modules/search/search.service';

/** The S3 storage described by the environment (MinIO locally, R2 in production). */
export function createStorageFromEnv(env: Env): ObjectStorage {
  return createS3Storage({
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
}

/**
 * Wires repositories into services. Shared by the server (index.ts) and the integration tests,
 * so tests run exactly the production object graph — only auth config and mailer differ.
 */
export interface CommunityDeps {
  /** Socket.IO gateway (index.ts) or a no-op. */
  realtime?: RealtimeGateway;
  /** BullMQ push queue; when absent pushes are not sent (seed scripts, some tests). */
  pushQueue?: Pick<PushQueue, 'enqueue'>;
  /** M6 booking reminder queue (BullMQ); when absent no reminders are scheduled. */
  bookingReminders?: BookingReminders;
  log?: Logger;
  /** M10 (docs/17): outgoing email, the deleted account's file cleanup queue, Better Auth for re-auth. */
  mailer?: Mailer;
  storageCleanup?: StorageCleanup;
  accountAuth?: AccountAuth;
  /** Audit log for account deletion (info/error); defaults to silent. */
  accountLog?: AccountLog;
  /** Map search addresses (In-ADS, docs/19); defaults to none so tests never call the network. */
  addressLookup?: AddressLookup;
}

/** Without Better Auth (seed scripts, some tests) no password matches and no confirmation is sent. */
const noAccountAuth: AccountAuth = {
  verifyPassword: async () => false,
  sendVerificationEmail: async () => {
    throw new Error('email verification needs Better Auth (CommunityDeps.accountAuth)');
  },
};
const silentAccountLog: AccountLog = { info: () => {}, error: () => {} };

const noPushQueue: Pick<PushQueue, 'enqueue'> = { enqueue: async () => {} };

export function createServices(db: Db, storage: ObjectStorage, timeoutMs: number, community: CommunityDeps = {}) {
  const parks = createParksRepository(db);
  const dogs = createDogsRepository(db);
  const realtime = community.realtime ?? noRealtime;
  const notificationsRepository = createNotificationsRepository(db);
  const friendsRepository = createFriendsRepository(db);
  const notifier = createNotifier({
    notifications: notificationsRepository,
    realtime,
    pushQueue: community.pushQueue ?? noPushQueue,
    log: community.log ?? silentLogger,
    timeoutMs,
  });
  const log = community.log ?? silentLogger;
  // M9b: Käpad are awarded by other services through `rewardsService.settle` (docs/16).
  const rewardsService = createRewardsService({ repository: createRewardsRepository(db), notifier, log, timeoutMs });
  const friendsService = createFriendsService({ repository: friendsRepository, notifier, rewards: rewardsService, timeoutMs });
  const providers = createProvidersRepository(db);
  const shop = createShopRepository(db);
  return {
    accountService: createAccountService({
      repository: createAccountRepository(db),
      auth: community.accountAuth ?? noAccountAuth,
      storageCleanup: community.storageCleanup ?? noStorageCleanup,
      reminders: community.bookingReminders ?? noBookingReminders,
      mailer: community.mailer ?? noMailer,
      log: community.accountLog ?? silentAccountLog,
      timeoutMs,
    }),
    rewardsService,
    shopService: createShopService({ repository: shop, storage, timeoutMs }),
    placePostsService: createPlacePostsService({ repository: createPlacePostsRepository(db), storage, rewards: rewardsService, notifier, log, timeoutMs }),
    providersService: createProvidersService({ repository: providers, storage, timeoutMs }),
    bookingsService: createBookingsService({
      bookings: createBookingsRepository(db),
      providers,
      dogs,
      redemptions: shop,
      notifier,
      reminders: community.bookingReminders ?? noBookingReminders,
      log,
      timeoutMs,
    }),
    friendsService,
    messagesService: createMessagesService({
      messages: createMessagesRepository(db),
      friends: friendsRepository,
      notifications: notificationsRepository,
      notifier,
      realtime,
      timeoutMs,
    }),
    notificationsService: createNotificationsService({ notifications: notificationsRepository, tokens: createPushTokensRepository(db), timeoutMs }),
    safetyService: createSafetyService({ repository: createSafetyRepository(db), timeoutMs }),
    parksService: createParksService({ repository: parks, timeoutMs }),
    searchService: createSearchService({ repository: createSearchRepository(db), addresses: community.addressLookup ?? noAddressLookup, timeoutMs }),
    parkActivityService: createParkActivityService({ repository: createParkActivityRepository(db), timeoutMs }),
    profileService: createProfileService({ repository: createProfileRepository(db), timeoutMs }),
    favoritesService: createFavoritesService({ favorites: createFavoritesRepository(db), parks, timeoutMs }),
    dogsService: createDogsService({ repository: dogs, storage, timeoutMs }),
    visitsService: createVisitsService({
      visits: createVisitsRepository(db),
      parks,
      dogs,
      timeoutMs,
      onPlanCreated: (userId, plan) => friendsService.announcePlan(userId, plan),
      rewards: rewardsService,
    }),
    reviewsService: createReviewsService({ reviews: createReviewsRepository(db), parks, timeoutMs, rewards: rewardsService }),
    reportsService: createReportsService({ reports: createReportsRepository(db), parks, timeoutMs }),
    photosService: createPhotosService({ photos: createPhotosRepository(db), dogs, storage, timeoutMs }),
    healthRecordsService: createHealthRecordsService({ records: createHealthRecordsRepository(db), dogs, timeoutMs }),
  };
}

export type Services = ReturnType<typeof createServices>;
