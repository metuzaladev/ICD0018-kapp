import type { Db } from './db/client';
import { createDogsRepository } from './modules/dogs/dogs.repository';
import { createDogsService } from './modules/dogs/dogs.service';
import { createFavoritesRepository } from './modules/favorites/favorites.repository';
import { createFavoritesService } from './modules/favorites/favorites.service';
import { createParksRepository } from './modules/parks/parks.repository';
import { createParksService } from './modules/parks/parks.service';
import { createProfileRepository } from './modules/profile/profile.repository';
import { createProfileService } from './modules/profile/profile.service';
import { createReportsRepository } from './modules/reports/reports.repository';
import { createReportsService } from './modules/reports/reports.service';
import { createReviewsRepository } from './modules/reviews/reviews.repository';
import { createReviewsService } from './modules/reviews/reviews.service';
import { createVisitsRepository } from './modules/visits/visits.repository';
import { createVisitsService } from './modules/visits/visits.service';

/**
 * Wires repositories into services. Shared by the server (index.ts) and the integration tests,
 * so tests run exactly the production object graph — only auth config and mailer differ.
 */
export function createServices(db: Db, timeoutMs: number) {
  const parks = createParksRepository(db);
  const dogs = createDogsRepository(db);
  return {
    parksService: createParksService({ repository: parks, timeoutMs }),
    profileService: createProfileService({ repository: createProfileRepository(db), timeoutMs }),
    favoritesService: createFavoritesService({ favorites: createFavoritesRepository(db), parks, timeoutMs }),
    dogsService: createDogsService({ repository: dogs, timeoutMs }),
    visitsService: createVisitsService({ visits: createVisitsRepository(db), parks, dogs, timeoutMs }),
    reviewsService: createReviewsService({ reviews: createReviewsRepository(db), parks, timeoutMs }),
    reportsService: createReportsService({ reports: createReportsRepository(db), parks, timeoutMs }),
  };
}

export type Services = ReturnType<typeof createServices>;
