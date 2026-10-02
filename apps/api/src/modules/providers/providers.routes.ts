import { providerIdParamsSchema, providersQuerySchema, serviceIdParamsSchema, slotsQuerySchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { parseRequest } from '../../http/validate';
import type { ProvidersService } from './providers.service';

export interface ProvidersRoutesOptions {
  service: ProvidersService;
}

/**
 * The catalogue is public like parks: it contains businesses' own data and free times, nothing
 * about any user (which times are taken never says by whom). Booking itself needs a session.
 */
export const providersRoutes: FastifyPluginAsync<ProvidersRoutesOptions> = async (app, { service }) => {
  app.get('/service-providers', async (request) => {
    const query = parseRequest(providersQuerySchema, request.query, 'query');
    return service.list(query);
  });

  app.get('/service-providers/:providerId', async (request) => {
    const { providerId } = parseRequest(providerIdParamsSchema, request.params, 'params');
    return service.getProvider(providerId);
  });

  // Free start times of one service ("Booking / Select Time").
  app.get('/services/:serviceId/slots', async (request) => {
    const { serviceId } = parseRequest(serviceIdParamsSchema, request.params, 'params');
    const query = parseRequest(slotsQuerySchema, request.query, 'query');
    return service.listSlots(serviceId, query);
  });
};
