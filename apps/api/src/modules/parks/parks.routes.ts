import { createParkInputSchema, nearbyParksQuerySchema, parkIdParamsSchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { optionalUser, requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { ParksService } from './parks.service';

export interface ParksRoutesOptions {
  service: ParksService;
  resolveUserId: ResolveUserId;
}

/**
 * HTTP layer for parks: parse/validate → call service → choose status code. Nothing else.
 * Mounted under /api/v1 (see app.ts), so paths here are relative.
 */
export const parksRoutes: FastifyPluginAsync<ParksRoutesOptions> = async (app, { service, resolveUserId }) => {
  // GET /api/v1/parks/nearby?lat=59.44&lng=24.79&radiusKm=5&water=true
  app.get('/parks/nearby', async (request) => {
    const query = parseRequest(nearbyParksQuerySchema, request.query, 'query');
    return service.listNearby(query);
  });

  // GET /api/v1/parks/:parkId — public; signed-in users additionally get `isFavorite`.
  app.get('/parks/:parkId', { preHandler: optionalUser(resolveUserId) }, async (request) => {
    const { parkId } = parseRequest(parkIdParamsSchema, request.params, 'params');
    return service.getPublicPark(parkId, request.userId);
  });

  // POST /api/v1/parks — "Lisa koerapark"; signed-in users only, created as pending.
  app.post(
    '/parks',
    {
      preHandler: requireUser(resolveUserId),
      // Stricter than the global limit: writes create moderation work.
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const input = parseRequest(createParkInputSchema, request.body, 'body');
      const park = await service.suggestPark(request.userId!, input);
      return reply.code(201).header('location', `/api/v1/parks/${park.id}`).send(park);
    },
  );
};
