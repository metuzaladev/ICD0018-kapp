import { parkIdParamsSchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { FavoritesService } from './favorites.service';

export interface FavoritesRoutesOptions {
  service: FavoritesService;
  resolveUserId: ResolveUserId;
}

/**
 * /api/v1/me/favorites — under /me because favourites are private to the user.
 * PUT/DELETE (not POST) because both are idempotent: double taps and retries are harmless.
 */
export const favoritesRoutes: FastifyPluginAsync<FavoritesRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  app.get('/me/favorites', async (request) => service.list(request.userId!));

  app.put('/me/favorites/:parkId', async (request, reply) => {
    const { parkId } = parseRequest(parkIdParamsSchema, request.params, 'params');
    await service.add(request.userId!, parkId);
    return reply.code(204).send();
  });

  app.delete('/me/favorites/:parkId', async (request, reply) => {
    const { parkId } = parseRequest(parkIdParamsSchema, request.params, 'params');
    await service.remove(request.userId!, parkId);
    return reply.code(204).send();
  });
};
