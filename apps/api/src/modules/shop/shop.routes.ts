import { productIdParamsSchema, redemptionIdParamsSchema, redemptionInputSchema, shopProductsQuerySchema, shopQuerySchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { ShopService } from './shop.service';

export interface ShopRoutesOptions {
  service: ShopService;
  resolveUserId: ResolveUserId;
}

/**
 * /api/v1/shop (public catalogue, like the service providers) and /api/v1/me/redemptions.
 * Redeeming spends points, so it is limited well below anything a person does by hand.
 */
export const shopRoutes: FastifyPluginAsync<ShopRoutesOptions> = async (app, { service, resolveUserId }) => {
  const signedIn = requireUser(resolveUserId);

  app.get('/shop', async (request) => {
    const query = parseRequest(shopQuerySchema, request.query, 'query');
    return service.overview(query);
  });

  app.get('/shop/products', async (request) => {
    const query = parseRequest(shopProductsQuerySchema, request.query, 'query');
    return service.products(query);
  });

  app.get('/shop/products/:productId', async (request) => {
    const { productId } = parseRequest(productIdParamsSchema, request.params, 'params');
    return service.product(productId);
  });

  // 201 new code; 200 when the idempotency key was already used (the first code, nothing spent twice).
  app.post('/me/redemptions', { preHandler: signedIn, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    const input = parseRequest(redemptionInputSchema, request.body, 'body');
    const { redemption, created } = await service.redeem(request.userId!, input);
    return reply.code(created ? 201 : 200).send(redemption);
  });

  app.get('/me/redemptions', { preHandler: signedIn }, async (request) => service.listRedemptions(request.userId!));

  // An action like booking cancel: the code stays in the list as cancelled. Idempotent.
  app.post(
    '/me/redemptions/:redemptionId/cancel',
    { preHandler: signedIn, config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (request) => {
      const { redemptionId } = parseRequest(redemptionIdParamsSchema, request.params, 'params');
      return service.cancelRedemption(request.userId!, redemptionId);
    },
  );
};
