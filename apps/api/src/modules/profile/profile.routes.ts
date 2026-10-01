import { updateProfileInputSchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { ProfileService } from './profile.service';

export interface ProfileRoutesOptions {
  service: ProfileService;
  resolveUserId: ResolveUserId;
}

/**
 * /api/v1/me — "me" instead of /users/:id so a client can never address another user's profile;
 * the id always comes from the session.
 */
export const profileRoutes: FastifyPluginAsync<ProfileRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  app.get('/me', async (request) => service.getOwnProfile(request.userId!));

  app.patch('/me', async (request) => {
    const patch = parseRequest(updateProfileInputSchema, request.body, 'body');
    return service.updateOwnProfile(request.userId!, patch);
  });
};
