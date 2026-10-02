import { rewardHistoryQuerySchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { RewardsService } from './rewards.service';

export interface RewardsRoutesOptions {
  service: RewardsService;
  resolveUserId: ResolveUserId;
}

/**
 * /api/v1/me/rewards — read-only. There is deliberately no endpoint that adds points: they are
 * awarded by the server from what it observed (docs/16-avasta-ja-kapad.md).
 */
export const rewardsRoutes: FastifyPluginAsync<RewardsRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  // Settles first (a few queries), so it is rate limited a little below the global limit.
  app.get('/me/rewards', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request) => service.summary(request.userId!));

  app.get('/me/rewards/history', async (request) => {
    const query = parseRequest(rewardHistoryQuerySchema, request.query, 'query');
    return service.history(request.userId!, query);
  });
};
