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
export function createServices(db: Db, storage: ObjectStorage, timeoutMs: number) {
  const parks = createParksRepository(db);
  const dogs = createDogsRepository(db);
  return {
    parksService: createParksService({ repository: parks, timeoutMs }),
    profileService: createProfileService({ repository: createProfileRepository(db), timeoutMs }),
    favoritesService: createFavoritesService({ favorites: createFavoritesRepository(db), parks, timeoutMs }),
    dogsService: createDogsService({ repository: dogs, storage, timeoutMs }),
    visitsService: createVisitsService({ visits: createVisitsRepository(db), parks, dogs, timeoutMs }),
    reviewsService: createReviewsService({ reviews: createReviewsRepository(db), parks, timeoutMs }),
    reportsService: createReportsService({ reports: createReportsRepository(db), parks, timeoutMs }),
    photosService: createPhotosService({ photos: createPhotosRepository(db), dogs, storage, timeoutMs }),
    healthRecordsService: createHealthRecordsService({ records: createHealthRecordsRepository(db), dogs, timeoutMs }),
  };
}

export type Services = ReturnType<typeof createServices>;
