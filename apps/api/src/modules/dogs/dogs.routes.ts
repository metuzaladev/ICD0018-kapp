import { dogIdParamsSchema, dogInputSchema, updateDogInputSchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { DogsService } from './dogs.service';

export interface DogsRoutesOptions {
  service: DogsService;
  resolveUserId: ResolveUserId;
}

/** /api/v1/me/dogs — under /me: a user only ever manages their own dogs. */
export const dogsRoutes: FastifyPluginAsync<DogsRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  app.get('/me/dogs', async (request) => service.list(request.userId!));

  app.post('/me/dogs', async (request, reply) => {
    const input = parseRequest(dogInputSchema, request.body, 'body');
    return reply.code(201).send(await service.create(request.userId!, input));
  });

  app.patch('/me/dogs/:dogId', async (request) => {
    const { dogId } = parseRequest(dogIdParamsSchema, request.params, 'params');
    const patch = parseRequest(updateDogInputSchema, request.body, 'body');
    return service.update(request.userId!, dogId, patch);
  });

  app.delete('/me/dogs/:dogId', async (request, reply) => {
    const { dogId } = parseRequest(dogIdParamsSchema, request.params, 'params');
    await service.remove(request.userId!, dogId);
    return reply.code(204).send();
  });
};
