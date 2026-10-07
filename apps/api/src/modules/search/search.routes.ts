import { searchQuerySchema } from '@kapp/shared';
import type { FastifyPluginAsync } from 'fastify';

import { optionalUser, type ResolveUserId } from '../../http/auth';
import { parseRequest } from '../../http/validate';
import type { SearchService } from './search.service';

export interface SearchRoutesOptions {
  service: SearchService;
  resolveUserId: ResolveUserId;
}

/**
 * Type-ahead sends a request per pause in typing (the app debounces ~250 ms), so the limit is
 * generous for a person but stops a script from relaying our In-ADS access (docs/19).
 */
const searchLimit = { rateLimit: { max: 120, timeWindow: '1 minute' } };

/**
 * GET /api/v1/search?q=…&lat=…&lng=… — suggestions for the Kaart search field (docs/19). Public like
 * the map itself; with a session, community picks from blocked people are left out.
 */
export const searchRoutes: FastifyPluginAsync<SearchRoutesOptions> = async (app, { service, resolveUserId }) => {
  app.get('/search', { preHandler: optionalUser(resolveUserId), config: searchLimit }, async (request) => {
    const query = parseRequest(searchQuerySchema, request.query, 'query');
    return service.search(request.userId, query);
  });
};
