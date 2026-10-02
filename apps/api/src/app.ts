import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';

import { noAuthYet, type ResolveUserId } from './http/auth';
import { registerErrorHandling } from './http/error-handler';
import { TooManyRequestsError } from './http/errors';
import { authRoutes } from './modules/auth/auth.routes';
import { bookingsRoutes } from './modules/bookings/bookings.routes';
import type { BookingsService } from './modules/bookings/bookings.service';
import { providersRoutes } from './modules/providers/providers.routes';
import type { ProvidersService } from './modules/providers/providers.service';
import { dogsRoutes } from './modules/dogs/dogs.routes';
import type { DogsService } from './modules/dogs/dogs.service';
import { favoritesRoutes } from './modules/favorites/favorites.routes';
import type { FavoritesService } from './modules/favorites/favorites.service';
import { healthRoutes } from './modules/health/health.routes';
import { healthRecordsRoutes } from './modules/health-records/health-records.routes';
import type { HealthRecordsService } from './modules/health-records/health-records.service';
import { parksRoutes } from './modules/parks/parks.routes';
import type { ParksService } from './modules/parks/parks.service';
import { photosRoutes } from './modules/photos/photos.routes';
import type { PhotosService } from './modules/photos/photos.service';
import { profileRoutes } from './modules/profile/profile.routes';
import type { ProfileService } from './modules/profile/profile.service';
import { reportsRoutes } from './modules/reports/reports.routes';
import type { ReportsService } from './modules/reports/reports.service';
import { reviewsRoutes } from './modules/reviews/reviews.routes';
import type { ReviewsService } from './modules/reviews/reviews.service';
import { friendsRoutes } from './modules/friends/friends.routes';
import type { FriendsService } from './modules/friends/friends.service';
import { messagesRoutes } from './modules/messages/messages.routes';
import type { MessagesService } from './modules/messages/messages.service';
import { notificationsRoutes } from './modules/notifications/notifications.routes';
import type { NotificationsService } from './modules/notifications/notifications.service';
import { safetyRoutes } from './modules/safety/safety.routes';
import type { SafetyService } from './modules/safety/safety.service';
import type { SocketGateway } from './realtime/socket-gateway';
import { visitsRoutes } from './modules/visits/visits.routes';
import type { VisitsService } from './modules/visits/visits.service';

/**
 * Builds the HTTP application from its dependencies. It never creates database connections
 * itself — index.ts (the composition root) does that and tests pass mocks instead.
 */
export interface AppDeps {
  parksService: ParksService;
  profileService: ProfileService;
  favoritesService: FavoritesService;
  dogsService: DogsService;
  visitsService: VisitsService;
  reviewsService: ReviewsService;
  reportsService: ReportsService;
  photosService: PhotosService;
  healthRecordsService: HealthRecordsService;
  friendsService: FriendsService;
  messagesService: MessagesService;
  notificationsService: NotificationsService;
  safetyService: SafetyService;
  providersService: ProvidersService;
  bookingsService: BookingsService;
  /** Socket.IO gateway attached to this app's HTTP server (M5); absent in HTTP tests. */
  realtime?: SocketGateway;
  checkDatabase: () => Promise<boolean>;
  /** Reads the user id from the session; defaults to "nobody is signed in". */
  resolveUserId?: ResolveUserId;
  /** Better Auth fetch handler; when absent /api/v1/auth/* is not mounted (unit/HTTP tests). */
  authHandler?: (request: Request) => Promise<Response>;
}

export interface AppConfig {
  corsOrigins: string[];
  /** Fastify trustProxy: boolean, hop count or trusted proxy addresses (env TRUST_PROXY). */
  trustProxy: boolean | number | string[];
  rateLimitMax: number;
  /**
   * Shared rate-limit counters for several instances (RATE_LIMIT_STORE=redis). Absent = in-memory
   * counters per process, which is right for one instance and for tests.
   */
  rateLimitRedis?: Redis;
  bodyLimitBytes: number;
  /** false in tests; the composition root passes a configured pino instance. */
  logger: false | FastifyBaseLogger;
}

export const defaultAppConfig: AppConfig = {
  corsOrigins: [],
  trustProxy: false,
  rateLimitMax: 120,
  bodyLimitBytes: 64 * 1024,
  logger: false,
};

/** Public API version prefix — lets old app builds keep working when v2 ships. */
export const API_PREFIX = '/api/v1';

const trustFirstHops = (hops: number) => (_address: string, hop: number) => hop < hops;

export async function buildApp(deps: AppDeps, config: AppConfig = defaultAppConfig) {
  const app = Fastify({
    ...(config.logger ? { loggerInstance: config.logger } : { logger: false }),
    // A hop count becomes "trust the first n hops" — what Fastify does for numbers at runtime,
    // spelled out because its types only list boolean/string/function.
    trustProxy: typeof config.trustProxy === 'number' ? trustFirstHops(config.trustProxy) : config.trustProxy,
    bodyLimit: config.bodyLimitBytes,
    // Drops connections that send their request too slowly (slowloris protection).
    requestTimeout: 15_000,
  });

  registerErrorHandling(app);
  // The API speaks JSON only. Fastify also parses text/plain by default, which would let a
  // plain string reach validation; removing it makes other media types fail early with 415.
  app.removeContentTypeParser('text/plain');

  await app.register(helmet);
  // Native apps send no Origin header, so CORS only matters for browsers; deny them unless listed.
  await app.register(cors, { origin: config.corsOrigins.length > 0 ? config.corsOrigins : false });
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    errorResponseBuilder: () => new TooManyRequestsError(),
    ...(config.rateLimitRedis
      ? {
          redis: config.rateLimitRedis,
          nameSpace: 'kapp:rate-limit:',
          // Fail open: a Redis outage must not make every request fail (lib/redis-clients.ts).
          skipOnError: true,
        }
      : {}),
  });

  const resolveUserId = deps.resolveUserId ?? noAuthYet;

  await app.register(healthRoutes, { checkDatabase: deps.checkDatabase });
  if (deps.authHandler) {
    await app.register(authRoutes, { prefix: API_PREFIX, handler: deps.authHandler });
  }
  await app.register(profileRoutes, { prefix: API_PREFIX, service: deps.profileService, resolveUserId });
  await app.register(favoritesRoutes, { prefix: API_PREFIX, service: deps.favoritesService, resolveUserId });
  await app.register(dogsRoutes, { prefix: API_PREFIX, service: deps.dogsService, resolveUserId });
  await app.register(photosRoutes, { prefix: API_PREFIX, service: deps.photosService, resolveUserId });
  await app.register(healthRecordsRoutes, { prefix: API_PREFIX, service: deps.healthRecordsService, resolveUserId });
  await app.register(visitsRoutes, { prefix: API_PREFIX, service: deps.visitsService, resolveUserId });
  await app.register(reviewsRoutes, { prefix: API_PREFIX, service: deps.reviewsService, resolveUserId });
  await app.register(reportsRoutes, { prefix: API_PREFIX, service: deps.reportsService, resolveUserId });
  await app.register(parksRoutes, { prefix: API_PREFIX, service: deps.parksService, resolveUserId });
  await app.register(friendsRoutes, { prefix: API_PREFIX, service: deps.friendsService, resolveUserId });
  await app.register(messagesRoutes, { prefix: API_PREFIX, service: deps.messagesService, resolveUserId });
  await app.register(notificationsRoutes, { prefix: API_PREFIX, service: deps.notificationsService, resolveUserId });
  await app.register(safetyRoutes, { prefix: API_PREFIX, service: deps.safetyService, resolveUserId });
  await app.register(providersRoutes, { prefix: API_PREFIX, service: deps.providersService });
  await app.register(bookingsRoutes, { prefix: API_PREFIX, service: deps.bookingsService, resolveUserId });

  if (deps.realtime) {
    const realtime = deps.realtime;
    realtime.attach(app.server, { resolveUserId, corsOrigins: config.corsOrigins, log: config.logger || undefined });
    app.addHook('onClose', async () => realtime.close());
  }

  return app;
}
