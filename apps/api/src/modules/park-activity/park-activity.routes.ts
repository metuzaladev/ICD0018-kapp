import { parkActivityQuerySchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { ParkActivityService } from './park-activity.service';

export interface ParkActivityRoutesOptions {
  service: ParkActivityService;
  resolveUserId: ResolveUserId;
}

/**
 * GET /api/v1/parks/activity?ids=… (M11, docs/18). Why `?ids=` and not /me/favorites/activity:
 * Home asks for the user's favourites, or the two nearest parks when there are none, and the app
 * already has both lists cached — one endpoint serves both without a second favourites read on the
 * server. It needs a session because what is counted depends on the viewer's friendships and blocks.
 * Read-only and cheap (two indexed queries for ≤ 10 parks), so the global rate limit applies.
 */
export const parkActivityRoutes: FastifyPluginAsync<ParkActivityRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  app.get('/parks/activity', async (request) => {
    const { ids } = parseRequest(parkActivityQuerySchema, request.query, 'query');
    return service.today(request.userId!, ids);
  });
};
