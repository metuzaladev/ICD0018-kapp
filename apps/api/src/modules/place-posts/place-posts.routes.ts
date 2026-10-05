import {
  createPhotoUploadInputSchema,
  createPlacePostInputSchema,
  mapPlacesQuerySchema,
  placePostIdParamsSchema,
  placePostReportInputSchema,
  placePostsQuerySchema,
  savedPlacePostsQuerySchema,
} from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { optionalUser, requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { PlacePostsService } from './place-posts.service';

export interface PlacePostsRoutesOptions {
  service: PlacePostsService;
  resolveUserId: ResolveUserId;
}

/** Each post is moderation work and up to five image decodes. */
const createLimit = { rateLimit: { max: 10, timeWindow: '1 hour' } };
/** Each upload URL lets the client write 10 MB; five per post plus retries. */
const uploadLimit = { rateLimit: { max: 40, timeWindow: '1 hour' } };
/** Likes/bookmarks are cheap and idempotent, but a script toggling them all day is not a person. */
const reactionLimit = { rateLimit: { max: 300, timeWindow: '1 hour' } };
/** Every report is manual moderation work (same as park and user reports). */
const reportLimit = { rateLimit: { max: 5, timeWindow: '1 hour' } };

/**
 * /api/v1/place-posts (public feed and detail, signed-in viewers get likes, own pending posts and
 * block filtering), /api/v1/me/place-posts (write, own, saved) and /api/v1/map/places (pins).
 */
export const placePostsRoutes: FastifyPluginAsync<PlacePostsRoutesOptions> = async (app, { service, resolveUserId }) => {
  const signedIn = requireUser(resolveUserId);
  const maybeSignedIn = optionalUser(resolveUserId);

  app.get('/place-posts', { preHandler: maybeSignedIn }, async (request) => {
    const query = parseRequest(placePostsQuerySchema, request.query, 'query');
    return service.feed(request.userId, query);
  });

  app.get('/place-posts/:postId', { preHandler: maybeSignedIn }, async (request) => {
    const { postId } = parseRequest(placePostIdParamsSchema, request.params, 'params');
    return service.get(request.userId, postId);
  });

  app.get('/map/places', { preHandler: maybeSignedIn }, async (request) => {
    const query = parseRequest(mapPlacesQuerySchema, request.query, 'query');
    return service.mapPlaces(request.userId, query);
  });

  // Step 1 of "Soovita kohta": a presigned PUT per photo (same flow as dog photos).
  app.post('/me/place-posts/uploads', { preHandler: signedIn, config: uploadLimit }, async (request, reply) => {
    const input = parseRequest(createPhotoUploadInputSchema, request.body, 'body');
    return reply.code(201).send(await service.createUpload(request.userId!, input));
  });

  app.post('/me/place-posts', { preHandler: signedIn, config: createLimit }, async (request, reply) => {
    const input = parseRequest(createPlacePostInputSchema, request.body, 'body');
    return reply.code(201).send(await service.create(request.userId!, input));
  });

  app.get('/me/place-posts', { preHandler: signedIn }, async (request) => {
    const query = parseRequest(savedPlacePostsQuerySchema, request.query, 'query');
    return service.mine(request.userId!, query);
  });

  app.get('/me/place-posts/saved', { preHandler: signedIn }, async (request) => {
    const query = parseRequest(savedPlacePostsQuerySchema, request.query, 'query');
    return service.saved(request.userId!, query);
  });

  app.delete('/me/place-posts/:postId', { preHandler: signedIn }, async (request, reply) => {
    const { postId } = parseRequest(placePostIdParamsSchema, request.params, 'params');
    await service.remove(request.userId!, postId);
    return reply.code(204).send();
  });

  // PUT/DELETE: idempotent reactions; the answer is the new state.
  for (const [path, set] of [
    ['like', (userId: string, postId: string, on: boolean) => service.setLike(userId, postId, on)],
    ['save', (userId: string, postId: string, on: boolean) => service.setSave(userId, postId, on)],
  ] as const) {
    app.put(`/place-posts/:postId/${path}`, { preHandler: signedIn, config: reactionLimit }, async (request) => {
      const { postId } = parseRequest(placePostIdParamsSchema, request.params, 'params');
      return set(request.userId!, postId, true);
    });
    app.delete(`/place-posts/:postId/${path}`, { preHandler: signedIn, config: reactionLimit }, async (request) => {
      const { postId } = parseRequest(placePostIdParamsSchema, request.params, 'params');
      return set(request.userId!, postId, false);
    });
  }

  app.post('/place-posts/:postId/reports', { preHandler: signedIn, config: reportLimit }, async (request, reply) => {
    const { postId } = parseRequest(placePostIdParamsSchema, request.params, 'params');
    const input = parseRequest(placePostReportInputSchema, request.body, 'body');
    return reply.code(201).send(await service.report(request.userId!, postId, input));
  });
};
