import { friendRequestInputSchema, userIdParamsSchema, userSearchQuerySchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { FriendsService } from './friends.service';

export interface FriendsRoutesOptions {
  service: FriendsService;
  resolveUserId: ResolveUserId;
}

/** Community / Friends, Friend Profile and the friends' plans card on Home. All need a session. */
export const friendsRoutes: FastifyPluginAsync<FriendsRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  app.get('/me/friends', async (request) => service.listFriends(request.userId!));

  app.get('/me/friends/plans', async (request) => service.friendPlans(request.userId!));

  // Unfriend. Idempotent: 204 also when there was nothing to remove.
  app.delete('/me/friends/:userId', async (request, reply) => {
    const { userId } = parseRequest(userIdParamsSchema, request.params, 'params');
    await service.removeFriend(request.userId!, userId);
    return reply.code(204).send();
  });

  app.get('/me/friend-requests', async (request) => service.listRequests(request.userId!));

  // 201 for a new request, 200 when it already existed or the other side had asked first (accepted).
  app.post('/me/friend-requests', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
    const { userId } = parseRequest(friendRequestInputSchema, request.body, 'body');
    const { result, created } = await service.sendRequest(request.userId!, userId);
    return reply.code(created ? 201 : 200).send(result);
  });

  app.post('/me/friend-requests/:userId/accept', async (request, reply) => {
    const { userId } = parseRequest(userIdParamsSchema, request.params, 'params');
    await service.acceptRequest(request.userId!, userId);
    return reply.code(204).send();
  });

  // Decline (incoming) or cancel (outgoing). Idempotent.
  app.delete('/me/friend-requests/:userId', async (request, reply) => {
    const { userId } = parseRequest(userIdParamsSchema, request.params, 'params');
    await service.deleteRequest(request.userId!, userId);
    return reply.code(204).send();
  });

  // Finding people: first name, area and dog names only; blocked pairs never appear.
  app.get('/users/search', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request) => {
    const { q } = parseRequest(userSearchQuerySchema, request.query, 'query');
    return service.search(request.userId!, q);
  });

  app.get('/users/:userId', async (request) => {
    const { userId } = parseRequest(userIdParamsSchema, request.params, 'params');
    return service.getProfile(request.userId!, userId);
  });
};
