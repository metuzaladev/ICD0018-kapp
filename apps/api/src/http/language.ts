import { parseAcceptLanguage, type Language } from '@kapp/shared';
import type { FastifyRequest } from 'fastify';

/**
 * Language of the user-facing texts in a response, from the Accept-Language header the app sends
 * with every request (et default, en, ru). Only error messages are translated; data is not.
 */
export function requestLanguage(request: Pick<FastifyRequest, 'headers'>): Language {
  return parseAcceptLanguage(request.headers['accept-language']);
}
