import {
  addDogPhotoInputSchema,
  createPhotoUploadInputSchema,
  dogIdParamsSchema,
  dogPhotoParamsSchema,
  setProfilePhotoInputSchema,
} from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { PhotosService } from './photos.service';

export interface PhotosRoutesOptions {
  service: PhotosService;
  resolveUserId: ResolveUserId;
}

/**
 * Stricter than the global limit: each upload URL lets the client write up to 10 MB to storage,
 * and each processed photo costs CPU (decode + two encodes). 60/h still covers adding a whole album.
 */
const photoWriteLimit = { rateLimit: { max: 60, timeWindow: '1 hour' } };

/** /api/v1/me/dogs/:dogId/photos — photos of the user's own dogs; images go directly to storage. */
export const photosRoutes: FastifyPluginAsync<PhotosRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  // Step 1: a presigned PUT for one file of the declared type and size.
  app.post('/me/dogs/:dogId/photos/uploads', { config: photoWriteLimit }, async (request, reply) => {
    const { dogId } = parseRequest(dogIdParamsSchema, request.params, 'params');
    const input = parseRequest(createPhotoUploadInputSchema, request.body, 'body');
    return reply.code(201).send(await service.createUpload(request.userId!, dogId, input));
  });

  // Step 3 (after the client uploaded): validate, strip metadata, store, create the photo.
  app.post('/me/dogs/:dogId/photos', { config: photoWriteLimit }, async (request, reply) => {
    const { dogId } = parseRequest(dogIdParamsSchema, request.params, 'params');
    const input = parseRequest(addDogPhotoInputSchema, request.body, 'body');
    return reply.code(201).send(await service.addPhoto(request.userId!, dogId, input));
  });

  app.get('/me/dogs/:dogId/photos', async (request) => {
    const { dogId } = parseRequest(dogIdParamsSchema, request.params, 'params');
    return service.list(request.userId!, dogId);
  });

  app.delete('/me/dogs/:dogId/photos/:photoId', async (request, reply) => {
    const { dogId, photoId } = parseRequest(dogPhotoParamsSchema, request.params, 'params');
    await service.remove(request.userId!, dogId, photoId);
    return reply.code(204).send();
  });

  // PUT: setting the same profile photo twice is harmless (idempotent); null removes it.
  app.put('/me/dogs/:dogId/profile-photo', async (request) => {
    const { dogId } = parseRequest(dogIdParamsSchema, request.params, 'params');
    const { photoId } = parseRequest(setProfilePhotoInputSchema, request.body, 'body');
    return service.setProfilePhoto(request.userId!, dogId, photoId);
  });
};
