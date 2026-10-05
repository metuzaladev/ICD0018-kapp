import type { Env } from './config/env';
import type { Db } from './db/client';
import { createDogsRepository } from './modules/dogs/dogs.repository';
import { createDogsService } from './modules/dogs/dogs.service';
import { createFavoritesRepository } from './modules/favorites/favorites.repository';
import { createFavoritesService } from './modules/favorites/favorites.service';
import { createHealthRecordsRepository } from './modules/health-records/health-records.repository';
import { createHealthRecordsService } from './modules/health-records/health-records.service';
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
import { createVisitsRepository } from './modules/visits/visits.repository';
import { createVisitsService } from './modules/visits/visits.service';
import type { ObjectStorage } from './storage/object-storage';
import { createS3Storage } from './storage/s3-storage';

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
  log?: Logger;
}

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
  const friendsService = createFriendsService({ repository: friendsRepository, notifier, timeoutMs });
  return {
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
    profileService: createProfileService({ repository: createProfileRepository(db), timeoutMs }),
    favoritesService: createFavoritesService({ favorites: createFavoritesRepository(db), parks, timeoutMs }),
    dogsService: createDogsService({ repository: dogs, storage, timeoutMs }),
    visitsService: createVisitsService({
      visits: createVisitsRepository(db),
      parks,
      dogs,
      timeoutMs,
      onPlanCreated: (userId, plan) => friendsService.announcePlan(userId, plan),
    }),
    reviewsService: createReviewsService({ reviews: createReviewsRepository(db), parks, timeoutMs }),
    reportsService: createReportsService({ reports: createReportsRepository(db), parks, timeoutMs }),
    photosService: createPhotosService({ photos: createPhotosRepository(db), dogs, storage, timeoutMs }),
    healthRecordsService: createHealthRecordsService({ records: createHealthRecordsRepository(db), dogs, timeoutMs }),
  };
}

export type Services = ReturnType<typeof createServices>;
