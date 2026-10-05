import {
  notificationIdParamsSchema,
  notificationPreferencesInputSchema,
  notificationsFeedQuerySchema,
  pushTokenInputSchema,
  pushTokenParamsSchema,
  unreadCountQuerySchema,
} from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { NotificationsService } from './notifications.service';

export interface NotificationsRoutesOptions {
  service: NotificationsService;
  resolveUserId: ResolveUserId;
}

export const notificationsRoutes: FastifyPluginAsync<NotificationsRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  // Notifications / Activity, newest first, `before` = id of the last item shown.
  app.get('/me/notifications', async (request) => {
    const query = parseRequest(notificationsFeedQuerySchema, request.query, 'query');
    return service.list(request.userId!, query);
  });

  app.get('/me/notifications/unread-count', async (request) => {
    const { include } = parseRequest(unreadCountQuerySchema, request.query, 'query');
    return service.unreadCount(request.userId!, include === 'rewards');
  });

  // PUT: marking read is idempotent.
  app.put('/me/notifications/:notificationId/read', async (request, reply) => {
    const { notificationId } = parseRequest(notificationIdParamsSchema, request.params, 'params');
    await service.markRead(request.userId!, notificationId);
    return reply.code(204).send();
  });

  app.put('/me/notifications/read-all', async (request, reply) => {
    await service.markAllRead(request.userId!);
    return reply.code(204).send();
  });

  // Settings / Notifications. PUT replaces all switches at once.
  app.get('/me/notification-preferences', async (request) => service.getPreferences(request.userId!));

  app.put('/me/notification-preferences', async (request) => {
    const preferences = parseRequest(notificationPreferencesInputSchema, request.body, 'body');
    return service.setPreferences(request.userId!, preferences);
  });

  // Push tokens: PUT registers (or moves) this device's token; DELETE on sign-out. Both idempotent.
  app.put('/me/push-tokens', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
    const input = parseRequest(pushTokenInputSchema, request.body, 'body');
    await service.registerPushToken(request.userId!, input);
    return reply.code(204).send();
  });

  app.delete('/me/push-tokens/:token', async (request, reply) => {
    const { token } = parseRequest(pushTokenParamsSchema, request.params, 'params');
    await service.unregisterPushToken(request.userId!, token);
    return reply.code(204).send();
  });
};
