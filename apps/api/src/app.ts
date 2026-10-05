import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger } from 'fastify';

import { noAuthYet, type ResolveUserId } from './http/auth';
import { registerErrorHandling } from './http/error-handler';
import { TooManyRequestsError } from './http/errors';
import { authRoutes } from './modules/auth/auth.routes';
import { favoritesRoutes } from './modules/favorites/favorites.routes';
import type { FavoritesService } from './modules/favorites/favorites.service';
import { healthRoutes } from './modules/health/health.routes';
import { parksRoutes } from './modules/parks/parks.routes';
import type { ParksService } from './modules/parks/parks.service';
import { profileRoutes } from './modules/profile/profile.routes';
import type { ProfileService } from './modules/profile/profile.service';

/**
 * Builds the HTTP application from its dependencies. It never creates database connections
 * itself — index.ts (the composition root) does that and tests pass mocks instead.
 */
export interface AppDeps {
  parksService: ParksService;
  profileService: ProfileService;
  favoritesService: FavoritesService;
  checkDatabase: () => Promise<boolean>;
  /** Reads the user id from the session; defaults to "nobody is signed in". */
  resolveUserId?: ResolveUserId;
  /** Better Auth fetch handler; when absent /api/v1/auth/* is not mounted (unit/HTTP tests). */
  authHandler?: (request: Request) => Promise<Response>;
}

export interface AppConfig {
  corsOrigins: string[];
  trustProxy: boolean;
  rateLimitMax: number;
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

export async function buildApp(deps: AppDeps, config: AppConfig = defaultAppConfig) {
  const app = Fastify({
    ...(config.logger ? { loggerInstance: config.logger } : { logger: false }),
    trustProxy: config.trustProxy,
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
  });

  const resolveUserId = deps.resolveUserId ?? noAuthYet;

  await app.register(healthRoutes, { checkDatabase: deps.checkDatabase });
  if (deps.authHandler) {
    await app.register(authRoutes, { prefix: API_PREFIX, handler: deps.authHandler });
  }
  await app.register(profileRoutes, { prefix: API_PREFIX, service: deps.profileService, resolveUserId });
  await app.register(favoritesRoutes, { prefix: API_PREFIX, service: deps.favoritesService, resolveUserId });
  await app.register(parksRoutes, { prefix: API_PREFIX, service: deps.parksService, resolveUserId });

  return app;
}
