import { conversationIdParamsSchema, messageInputSchema, messagesQuerySchema, startConversationInputSchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { MessagesService } from './messages.service';

export interface MessagesRoutesOptions {
  service: MessagesService;
  resolveUserId: ResolveUserId;
}

/** Messages / Inbox and Messages / Conversation. Realtime delivery is in src/realtime. */
export const messagesRoutes: FastifyPluginAsync<MessagesRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  app.get('/me/conversations', async (request) => service.listConversations(request.userId!));

  // Get-or-create the 1:1 conversation with a friend ("Saada sõnum"). Safe to repeat.
  app.post('/me/conversations', async (request) => {
    const { userId } = parseRequest(startConversationInputSchema, request.body, 'body');
    return service.startConversation(request.userId!, userId);
  });

  app.get('/me/conversations/:conversationId', async (request) => {
    const { conversationId } = parseRequest(conversationIdParamsSchema, request.params, 'params');
    return service.getConversation(request.userId!, conversationId);
  });

  app.get('/me/conversations/:conversationId/messages', async (request) => {
    const { conversationId } = parseRequest(conversationIdParamsSchema, request.params, 'params');
    const query = parseRequest(messagesQuerySchema, request.query, 'query');
    return service.listMessages(request.userId!, conversationId, query);
  });

  // 30 per minute is plenty for a person typing and stops a script from flooding a friend.
  app.post(
    '/me/conversations/:conversationId/messages',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { conversationId } = parseRequest(conversationIdParamsSchema, request.params, 'params');
      const { body } = parseRequest(messageInputSchema, request.body, 'body');
      return reply.code(201).send(await service.sendMessage(request.userId!, conversationId, body));
    },
  );

  // Idempotent: "read up to now".
  app.put('/me/conversations/:conversationId/read', async (request, reply) => {
    const { conversationId } = parseRequest(conversationIdParamsSchema, request.params, 'params');
    await service.markRead(request.userId!, conversationId);
    return reply.code(204).send();
  });
};
