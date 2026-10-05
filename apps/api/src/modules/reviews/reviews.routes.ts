import { parkIdParamsSchema, reviewInputSchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { optionalUser, requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { ReviewsService } from './reviews.service';

export interface ReviewsRoutesOptions {
  service: ReviewsService;
  resolveUserId: ResolveUserId;
}

export const reviewsRoutes: FastifyPluginAsync<ReviewsRoutesOptions> = async (app, { service, resolveUserId }) => {
  // Public list; a signed-in viewer does not see reviews of people they blocked.
  app.get('/parks/:parkId/reviews', { preHandler: optionalUser(resolveUserId) }, async (request) => {
    const { parkId } = parseRequest(parkIdParamsSchema, request.params, 'params');
    return service.list(parkId, request.userId);
  });

  // PUT .../reviews/mine: "my review of this park" is a single resource, so writing it again
  // replaces it — idempotent, and no client-side "create or update?" decision.
  app.put(
    '/parks/:parkId/reviews/mine',
    { preHandler: requireUser(resolveUserId), config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request) => {
      const { parkId } = parseRequest(parkIdParamsSchema, request.params, 'params');
      const input = parseRequest(reviewInputSchema, request.body, 'body');
      return service.submit(request.userId!, parkId, input);
    },
  );
};
