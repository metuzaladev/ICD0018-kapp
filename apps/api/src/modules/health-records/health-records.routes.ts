import { dogIdParamsSchema, healthRecordInputSchema, healthRecordParamsSchema, updateHealthRecordInputSchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { HealthRecordsService } from './health-records.service';

export interface HealthRecordsRoutesOptions {
  service: HealthRecordsService;
  resolveUserId: ResolveUserId;
}

/**
 * /api/v1/me/dogs/:dogId/health-records and /api/v1/me/health-reminders — owner only, under /me.
 * (Not modules/health: that name is taken by the GET /health liveness probe.)
 */
export const healthRecordsRoutes: FastifyPluginAsync<HealthRecordsRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  app.get('/me/dogs/:dogId/health-records', async (request) => {
    const { dogId } = parseRequest(dogIdParamsSchema, request.params, 'params');
    return service.list(request.userId!, dogId);
  });

  app.post('/me/dogs/:dogId/health-records', async (request, reply) => {
    const { dogId } = parseRequest(dogIdParamsSchema, request.params, 'params');
    const input = parseRequest(healthRecordInputSchema, request.body, 'body');
    return reply.code(201).send(await service.create(request.userId!, dogId, input));
  });

  app.patch('/me/dogs/:dogId/health-records/:recordId', async (request) => {
    const { dogId, recordId } = parseRequest(healthRecordParamsSchema, request.params, 'params');
    const patch = parseRequest(updateHealthRecordInputSchema, request.body, 'body');
    return service.update(request.userId!, dogId, recordId, patch);
  });

  app.delete('/me/dogs/:dogId/health-records/:recordId', async (request, reply) => {
    const { dogId, recordId } = parseRequest(healthRecordParamsSchema, request.params, 'params');
    await service.remove(request.userId!, dogId, recordId);
    return reply.code(204).send();
  });

  app.get('/me/health-reminders', async (request) => service.reminders(request.userId!));
};
