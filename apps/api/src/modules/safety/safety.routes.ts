import { userIdParamsSchema, userReportInputSchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { SafetyService } from './safety.service';

export interface SafetyRoutesOptions {
  service: SafetyService;
  resolveUserId: ResolveUserId;
}

export const safetyRoutes: FastifyPluginAsync<SafetyRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  // Settings / Privacy → "Blokeeritud kasutajad".
  app.get('/me/blocks', async (request) => service.listBlocked(request.userId!));

  // PUT/DELETE: idempotent, so a retried tap never fails.
  app.put('/me/blocks/:userId', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
    const { userId } = parseRequest(userIdParamsSchema, request.params, 'params');
    await service.block(request.userId!, userId);
    return reply.code(204).send();
  });

  app.delete('/me/blocks/:userId', async (request, reply) => {
    const { userId } = parseRequest(userIdParamsSchema, request.params, 'params');
    await service.unblock(request.userId!, userId);
    return reply.code(204).send();
  });

  // Every report is manual moderation work: tightly limited like park reports.
  app.post('/users/:userId/reports', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request, reply) => {
    const { userId } = parseRequest(userIdParamsSchema, request.params, 'params');
    const input = parseRequest(userReportInputSchema, request.body, 'body');
    return reply.code(201).send(await service.reportUser(request.userId!, userId, input));
  });
};
