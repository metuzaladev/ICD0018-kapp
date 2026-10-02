import { bookingIdParamsSchema, bookingsQuerySchema, bookingWithRedemptionInputSchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { BookingsService } from './bookings.service';

export interface BookingsRoutesOptions {
  service: BookingsService;
  resolveUserId: ResolveUserId;
}

/** "Minu broneeringud": always the signed-in user's own (`/me`), so no other user can be addressed. */
export const bookingsRoutes: FastifyPluginAsync<BookingsRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.addHook('preHandler', requireUser(resolveUserId));

  // Stricter than the global limit: each booking blocks a provider's time, so a script must not be
  // able to fill a calendar. 20 per hour is far above what a person books.
  app.post('/me/bookings', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
    const input = parseRequest(bookingWithRedemptionInputSchema, request.body, 'body');
    return reply.code(201).send(await service.create(request.userId!, input));
  });

  app.get('/me/bookings', async (request) => {
    const query = parseRequest(bookingsQuerySchema, request.query, 'query');
    return service.list(request.userId!, query);
  });

  app.get('/me/bookings/:bookingId', async (request) => {
    const { bookingId } = parseRequest(bookingIdParamsSchema, request.params, 'params');
    return service.get(request.userId!, bookingId);
  });

  // An action, not DELETE: the booking stays in "Varasemad" as cancelled (like ending a check-in).
  // Idempotent — a repeated tap answers 200 with the same cancelled booking.
  app.post('/me/bookings/:bookingId/cancel', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request) => {
    const { bookingId } = parseRequest(bookingIdParamsSchema, request.params, 'params');
    return service.cancel(request.userId!, bookingId);
  });
};
